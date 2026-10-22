"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BucketEntry, BucketItem } from "@/entities/eco-bucket/types";

/** 에코 버킷 (이 브라우저에만 저장, 로그인 없음). 같은 제목은 최신 것으로 갱신한다. */
type State = {
  items: BucketItem[];
  add: (e: BucketEntry) => void;
  remove: (id: string) => void;
  has: (title: string) => boolean;
};

const strip = (s: string) => s.replace(/\[근거\s*\d+\]/g, "").replace(/\s+/g, " ").trim();

export const useEcoBucket = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      add: (e) =>
        set((s) => ({
          items: [
            { ...e, text: strip(e.text).slice(0, 1200), sources: e.sources.slice(0, 3), id: crypto.randomUUID(), createdAt: Date.now() },
            ...s.items.filter((x) => x.title !== e.title),
          ].slice(0, 50),
        })),
      remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
      has: (title) => get().items.some((x) => x.title === title),
    }),
    { name: "cloudle-eco-bucket" },
  ),
);
