"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { charImg } from "@/entities/mascot/characters";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LANGS, type Lang, useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { IconMoon, IconSun } from "@/shared/ui/icons";
import { buttonClass, cx } from "@/shared/ui/primitives";

const NAV = [
  { href: "/", key: "nav_earth" },
  { href: "/bin", key: "nav_loop" },
  { href: "/vs", key: "nav_vs" },
  { href: "/detective", key: "nav_detective" },
  { href: "/book", key: "nav_book" },
] as const;

export function Header() {
  const t = useT();
  const path = usePathname();
  const { lang, theme, setLang, setTheme } = usePrefs();

  useEffect(() => {
    const dom = document.documentElement.dataset.theme;
    if ((dom === "light" || dom === "dark") && dom !== usePrefs.getState().theme) {
      if (!localStorage.getItem("cloudle-prefs")) setTheme(dom);
      else document.documentElement.dataset.theme = usePrefs.getState().theme;
    }
    document.documentElement.lang = usePrefs.getState().lang;
  }, [setTheme]);

  return (
    <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
          <img {...charImg("cloud-default")} alt="" className="h-7 w-auto" />
          CLOUDLE
        </Link>
        <nav aria-label="primary" className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}
              className={cx("rounded-full px-4 py-2 text-sm font-medium transition-colors",
                path === n.href ? "bg-surface text-ink shadow-soft" : "text-ink-2 hover:text-ink")}>
              {t(n.key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <label className="sr-only" htmlFor="lang">Language</label>
          <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}
            className="h-9 cursor-pointer rounded-full bg-surface px-3 text-[13px] font-medium shadow-soft ring-1 ring-line">
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? t("theme_light") : t("theme_dark")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-2 shadow-soft ring-1 ring-line hover:text-ink">
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <span className="hidden sm:block"><Link href="/bin" className={cx(buttonClass("primary", "sm"), "h-9 whitespace-nowrap")}>{t("cta_start")}</Link></span>
        </div>
      </div>
      <nav aria-label="primary mobile" className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}
            className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium",
              path === n.href ? "bg-accent text-accent-ink" : "bg-surface text-ink-2 ring-1 ring-line")}>
            {t(n.key)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
