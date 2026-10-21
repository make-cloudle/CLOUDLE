"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang } from "./i18n";

export type Theme = "light" | "dark";

type Prefs = {
  lang: Lang;
  theme: Theme;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
};

/** 언어·테마는 브라우저에만 저장한다 (개인정보 아님). */
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      lang: "ko",
      theme: "light",
      setLang: (lang) => {
        document.documentElement.lang = lang;
        set({ lang });
      },
      setTheme: (theme) => {
        document.documentElement.dataset.theme = theme;
        set({ theme });
      },
    }),
    { name: "cloudle-prefs" },
  ),
);

/** 첫 페인트 전에 테마·언어를 적용하는 인라인 스크립트 (깜빡임 방지). */
export const PREFS_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem("cloudle-prefs")||"null");var s=p&&p.state;var t=s&&s.theme;if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;if(s&&s.lang)document.documentElement.lang=s.lang}catch(e){}})()`;
