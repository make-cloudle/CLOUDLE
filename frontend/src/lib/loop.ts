"use client";

import { create } from "zustand";
import type { AnalysisResult, ProgressEvent } from "./api";

/** 종이에 담기는 구조화 정보 (C02). 종이 그림은 이 상태를 시각화할 뿐이다. */
export type Paper = {
  product_name: string;
  item_id: string;
  category: string;
  condition: string;
  region: string;
  purpose: "all" | "repair" | "reuse" | "disposal";
  note: string;
  photos: { id: string; url: string; name: string; labels: string[] }[];
  docs: { name: string; chunks: number }[];
};

export type Phase =
  | "write" // 종이 작성
  | "crumple" // 구기는 중
  | "ball" // 종이공 완성 → 드래그
  | "dropped" // 쓰레기통 투입 → 확인
  | "analyzing"
  | "ready" // 결과 구름 형성
  | "opened" // 구름 열림 → 결과 카드
  | "error";

export type CloudMood =
  | "idle" | "country" | "thinking" | "retrieving" | "generating" | "complete" | "error";

export const EMPTY_PAPER: Paper = {
  product_name: "", item_id: "", category: "", condition: "", region: "대한민국",
  purpose: "all", note: "", photos: [], docs: [],
};

type LoopState = {
  paper: Paper;
  phase: Phase;
  progress: ProgressEvent[];
  result: AnalysisResult | null;
  error: { code: string; message: string; extra?: Record<string, unknown> } | null;
  setPaper: (patch: Partial<Paper>) => void;
  setPhase: (p: Phase) => void;
  pushProgress: (e: ProgressEvent) => void;
  setResult: (r: AnalysisResult | null) => void;
  setError: (e: LoopState["error"]) => void;
  resetFlow: () => void; // 종이 내용은 유지
  resetAll: () => void;
};

export const useLoop = create<LoopState>((set) => ({
  paper: EMPTY_PAPER,
  phase: "write",
  progress: [],
  result: null,
  error: null,
  setPaper: (patch) => set((s) => ({ paper: { ...s.paper, ...patch } })),
  setPhase: (phase) => set({ phase }),
  pushProgress: (e) => set((s) => ({ progress: [...s.progress, e] })),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error }),
  resetFlow: () => set({ phase: "write", progress: [], result: null, error: null }),
  resetAll: () => set({ paper: EMPTY_PAPER, phase: "write", progress: [], result: null, error: null }),
}));

export const paperHasContent = (p: Paper) => p.product_name.trim().length > 0 || p.item_id !== "";

/** 진행 이벤트 → 구름 표정 (가짜 로딩이 아니라 서버 단계와 연결). */
export function moodFor(phase: Phase, progress: ProgressEvent[]): CloudMood {
  if (phase === "error") return "error";
  if (phase === "ready" || phase === "opened") return "complete";
  if (phase !== "analyzing") return "idle";
  const last = progress.at(-1)?.step ?? "";
  if (["retrieve"].includes(last)) return "retrieving";
  if (["generate_done"].includes(last)) return "generating";
  if (["collect", "select", "index", "collect_done", "select_done", "index_done"].includes(last)) return "retrieving";
  return "thinking";
}
