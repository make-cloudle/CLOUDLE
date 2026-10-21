"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LANGS, type Lang, useT } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { IconMoon, IconSun } from "./ui/icons";
import { cx } from "./ui/primitives";

const NAV = [
  { href: "/", key: "nav_earth" },
  { href: "/loop", key: "nav_loop" },
  { href: "/explore", key: "nav_explore" },
  { href: "/design", key: "nav_design" },
] as const;

export function Header() {
  const t = useT();
  const path = usePathname();
  const { lang, theme, setLang, setTheme } = usePrefs();

  // 저장된 테마가 없으면 부트 스크립트가 고른 시스템 테마를 상태에 반영한다.
  useEffect(() => {
    const dom = document.documentElement.dataset.theme;
    if ((dom === "light" || dom === "dark") && dom !== usePrefs.getState().theme) {
      if (!localStorage.getItem("cloudle-prefs")) setTheme(dom);
      else document.documentElement.dataset.theme = usePrefs.getState().theme;
    }
    document.documentElement.lang = usePrefs.getState().lang;
  }, [setTheme]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full border-[1.5px] border-ink bg-sky-soft" />
          CLOUDLE
        </Link>
        <nav aria-label="primary" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path === n.href ? "page" : undefined}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                path === n.href ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {t(n.key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="lang">Language</label>
          <select
            id="lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm"
          >
            {Object.entries(LANGS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? t("theme_light") : t("theme_dark")}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-surface text-ink-2 hover:text-ink"
          >
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>
      </div>
      {/* 모바일: 가로 스크롤 탭 (왼쪽 정렬) */}
      <nav aria-label="primary mobile" className="flex gap-1 overflow-x-auto border-t border-line px-4 py-1.5 md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={path === n.href ? "page" : undefined}
            className={cx(
              "shrink-0 rounded-md px-3 py-1 text-sm",
              path === n.href ? "bg-surface-2 font-semibold text-ink" : "text-ink-2",
            )}
          >
            {t(n.key)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
