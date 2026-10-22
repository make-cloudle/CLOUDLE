"use client";

import type { Lang } from "@/shared/lib/i18n";

/** 게이트웨이 주소. 지정이 없으면 지금 연 페이지와 같은 호스트의 :4000 (휴대폰에서 LAN IP로 열어도 동작). */
export function apiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE) return process.env.NEXT_PUBLIC_API_BASE;
  if (typeof window === "undefined") return "http://localhost:4000";
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
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

export type EnvEvent = { title: string; category: string; date: string; url: string; lat: number; lng: number };

export type CountryBriefing = {
  country: { iso3: string; iso2: string; names: Record<Lang, string> };
  air_annual: Stat;
  air_realtime: Stat;
  population: Stat;
  waste: Stat;
  events: Stat & { items?: EnvEvent[] };
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
/** 나라를 누르면 핵심 지표만 (detail=true면 인구·관련 문서까지) */
export const getCountry = (iso3: string, lang: Lang, detail = false) =>
  request<CountryBriefing>(`/api/country/${iso3}?lang=${lang}${detail ? "&detail=true" : ""}`);

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
    res = await fetch(`${apiBase()}/api/analyze`, {
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

/* ── Phase 4: 채팅 · 업로드 · 사진 인식 · 조건 탐색 ───────────────── */
export type ChatMessage = { role: "user" | "assistant"; content: string; citations?: number[]; sources?: Evidence[] };

export const chat = (item_id: string, question: string, lang: Lang) =>
  request<{ answer: Answer; evidence: Evidence[]; engine: string; history: ChatMessage[] }>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id, question, lang }),
  });

export const chatHistory = (item_id: string) =>
  request<{ history: ChatMessage[] }>(`/api/chat/${encodeURIComponent(item_id)}`);

function form(file: Blob, name: string) {
  const fd = new FormData();
  fd.append("file", file, name);
  return fd;
}

/** 문서는 이 세션의 근거로만 색인된다. */
export const uploadDoc = (file: File) =>
  request<{ name: string; chunks: number }>("/api/upload", { method: "POST", body: form(file, file.name) });

export type VisionResult = { available: boolean; labels: string[]; item_id: string | null; condition?: string; message: string };

/** 이미지는 서버에 저장되지 않고 인식에만 쓰인다. */
export const identifyImage = (file: Blob, name: string) =>
  request<VisionResult>("/api/vision", { method: "POST", body: form(file, name) });

export type SearchResult = {
  conditions: string[];
  engine: string;
  items: (ItemRef & { reason: string })[];
};

export const searchItems = (query: string) =>
  request<SearchResult>("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

export type CountryTopic = "air" | "waste" | "help";

/** 질문 칩 → 국가 문서를 수집·검색해 근거 번호가 달린 답을 받는다. */
export const askCountry = (iso3: string, topic: CountryTopic, lang: Lang) =>
  request<{ answer: Answer; engine: string; question: string }>(`/api/country/${iso3}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, lang }),
  });

/* ── Earth SOS · 타임머신 · 팩트체크 ─────────────────────────────────── */
export type SosData = {
  pm25: { status: string; values: Record<string, { value: number; year: string }>; unit: string; source: string };
  events: { status: string; items: EnvEvent[]; days: number; source: string };
};
export const getSos = () => request<SosData>("/api/sos");

export type Series = Stat & { indicator?: string; points?: { year: number; value: number }[] };
export const getSeries = (iso3: string, indicator: "pm25" | "population" | "forest") =>
  request<Series>(`/api/country/${iso3}/series?indicator=${indicator}`);
