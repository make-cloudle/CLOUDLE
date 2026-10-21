"use client";

import Link from "next/link";
import { useT } from "@/shared/lib/i18n";

export function Footer() {
  const t = useT();
  return (
    <footer className="mx-auto mt-10 flex max-w-[1320px] flex-col gap-3 px-4 py-10 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <p><b className="text-ink-2">CLOUDLE</b> · Explore the Earth. Uncover the Truth.</p>
      <nav aria-label={t("footer_more")} className="flex flex-wrap gap-4">
        <Link href="/explore" className="hover:text-ink">{t("nav_explore")}</Link>
        <Link href="/about" className="hover:text-ink">{t("nav_about")}</Link>
        <span>World Bank · NASA EONET · Wikipedia (CC BY-SA)</span>
      </nav>
    </footer>
  );
}
