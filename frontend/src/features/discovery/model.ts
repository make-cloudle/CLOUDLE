"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 발견 노트: RAG로 알아낸 사실과 출처를 자동 저장한다 (이 브라우저에만, 로그인 없음). */
/** fact: 예전 Eco Detective 기록(읽기 전용 호환) · talk: 구름 광장 메모 (대화 요약, 검증 전) */
export type DiscoveryKind = "analysis" | "country" | "fact" | "compare" | "talk";

export type Discovery = {
  id: string;
  kind: DiscoveryKind;
  title: string;
  summary: string;
  sources: { title: string; url: string }[];
  country?: { iso3: string; name: string };
  createdAt: number;
};

type State = {
  items: Discovery[];
  add: (d: Omit<Discovery, "id" | "createdAt">) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const strip = (s: string) => s.replace(/\[근거\s*\d+\]/g, "").replace(/\s+/g, " ").trim();

export const useDiscoveries = create<State>()(
  persist(
    (set) => ({
      items: [],
      add: (d) =>
        set((s) => {
          // 같은 제목은 최신 것으로 갱신 (중복 저장 방지)
          const rest = s.items.filter((x) => !(x.kind === d.kind && x.title === d.title));
          const entry = { ...d, summary: strip(d.summary).slice(0, 280), id: crypto.randomUUID(), createdAt: Date.now() };
          return { items: [entry, ...rest].slice(0, 100) };
        }),
      remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: "cloudle-discoveries" },
  ),
);
