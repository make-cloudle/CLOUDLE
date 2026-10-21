"use client";

import type { Lang } from "./i18n";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

/** 비회원 세션 ID (C01). 브라우저에만 저장되고 서버는 24시간 후 기록을 지운다. */
export function sessionId(): string {
  try {
    let id = localStorage.getItem("cloudle-sid");
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem("cloudle-sid", id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "X-Session-Id": sessionId(), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError("network", "network");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const d = body.detail ?? body;
    throw new ApiError(d.code ?? String(res.status), d.message ?? res.statusText, d);
  }
  return res.json();
}

/* ── 타입 ──────────────────────────────────────────────────────────── */
export type Stat = {
  status: "ok" | "unavailable";
  reason?: string;
  kind?: "annual_statistic" | "realtime" | "event_log";
  value?: number;
  unit?: string;
  year?: string;
  measured_at?: string;
  source?: string;
  license?: string;
  url?: string;
  total_tons_per_year?: number;
  kg_per_capita_day?: number | null;
};

export type CountryBriefing = {
  country: { iso3: string; iso2: string; names: Record<Lang, string> };
  air_annual: Stat;
  air_realtime: Stat;
  population: Stat;
  waste: Stat;
  events: Stat & { items?: { title: string; category: string; date: string; url: string }[] };
  related: { title: string; extract: string; url: string; license: string }[];
};

export type Evidence = {
  n: number;
  kind: string;
  kind_label: string;
  title: string;
  url: string;
  text: string;
  license: string;
  score: number;
};

export type Answer = {
  summary?: string;
  basic_info?: string;
  reuse?: string;
  repair?: string;
  disposal?: string;
  next_actions?: string[];
  uncertainties?: string[];
  answer?: string;
  citations: number[];
  sources: Evidence[];
  safety?: boolean;
};

export type ItemRef = {
  item_id: string;
  names: Record<Lang, string>;
  category: string;
  recycling_category: string;
  has_battery: boolean;
  hazardous?: boolean;
};

export type AnalysisResult = {
  item: ItemRef;
  answer: Answer;
  evidence: Evidence[];
  engine: "llm" | "offline";
  offline: boolean;
  timings: Record<string, number>;
};

export type PaperPayload = {
  product_name: string;
  item_id?: string;
  category?: string;
  condition: string;
  region: string;
  purpose: string;
  note: string;
  lang: Lang;
  image_labels: string[];
};

export type ProgressEvent = { step: string; message?: string; [k: string]: unknown };

/* ── 엔드포인트 ────────────────────────────────────────────────────── */
export const getCountry = (iso3: string, lang: Lang) =>
  request<CountryBriefing>(`/api/country/${iso3}?lang=${lang}`);

export const getItems = () =>
  request<{ categories: Record<string, Record<Lang, string>>; items: ItemRef[] }>("/api/items");

/** 분석 실행: 서버가 보내는 실제 진행 이벤트(SSE)를 그대로 전달한다. */
export async function analyze(
  paper: PaperPayload,
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": sessionId() },
      body: JSON.stringify({ paper }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("network", "network");
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    const d = body.detail ?? body;
    throw new ApiError(d.code ?? String(res.status), d.message ?? "error", d);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "{}");
      if (event === "progress") onProgress(data);
      else if (event === "result") return data as AnalysisResult;
      else if (event === "error") throw new ApiError(data.code, data.message, data);
    }
  }
  throw new ApiError("incomplete", "stream ended");
}
