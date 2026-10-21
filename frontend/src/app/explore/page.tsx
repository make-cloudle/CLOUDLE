"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconArrow, IconSearch } from "@/components/ui/icons";
import { Alert, Button, Card, Input, Overline, Tag, cx } from "@/components/ui/primitives";
import { ApiError, searchItems, type SearchResult } from "@/lib/api";
import { type Lang, useT } from "@/lib/i18n";
import { EMPTY_PAPER, useLoop } from "@/lib/loop";
import { usePrefs } from "@/lib/prefs";

const EXAMPLES: Record<Lang, string[]> = {
  ko: ["배터리가 들어 있는 소형 전자제품 중 별도 수거가 필요한 품목", "유해하거나 화재 위험이 있는 물건", "대형 가구"],
  en: ["small electronics with batteries that need separate collection", "hazardous items", "large furniture"],
  ja: ["電池入りの小型家電で別回収が必要なもの", "有害・火災の危険がある物", "大型家具"],
  zh: ["含电池且需单独回收的小型电子产品", "有害或有火灾风险的物品", "大型家具"],
};

/** 조건 기반 품목 탐색 (F2011): RAG 메타데이터 검색 → 조건 재선별 → 카드 → 분석으로 이동 */
export default function ExplorePage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    setBusy(true);
    setError("");
    try {
      setRes(await searchItems(q));
    } catch (e) {
      setError(e instanceof ApiError && e.code === "rate_limited" ? t("rate_limited") : t("error_generic"));
    } finally {
      setBusy(false);
    }
  };

  const analyzeItem = (it: SearchResult["items"][number]) => {
    useLoop.getState().resetAll();
    useLoop.getState().setPaper({ ...EMPTY_PAPER, product_name: it.names[lang], item_id: it.item_id, category: it.category });
    router.push("/loop");
  };

  return (
    <div className="flex flex-col gap-6 pt-8">
      <header>
        <Overline>03 · Explore</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{t("explore_title")}</h1>
      </header>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(query); }}>
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("explore_ph")} className="h-11 pl-9" aria-label={t("search")} />
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy}>{t("search")}</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES[lang].map((ex) => (
          <button key={ex} onClick={() => run(ex)}
            className={cx("h-8 rounded-md border px-3 text-sm", query === ex ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2 hover:text-ink")}>
            {ex}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {res && (
        <>
          <p className="text-sm text-ink-2">
            {t("conditions")}: {res.conditions.length ? res.conditions.map((c) => <Tag key={c} tone="accent">{c}</Tag>) : "—"}
            <span className="ml-2 text-xs text-ink-3">{res.engine}</span>
          </p>
          {res.items.length === 0 ? (
            <p className="text-ink-3">{t("no_match")}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {res.items.map((it) => (
                <li key={it.item_id}>
                  <Card className="flex h-full flex-col gap-2">
                    <Overline>{it.item_id}</Overline>
                    <h2 className="text-lg font-semibold">{it.names[lang]}</h2>
                    <div className="flex flex-wrap gap-1.5">
                      <Tag>{it.recycling_category}</Tag>
                      {it.has_battery && <Tag tone="warn">{t("battery")}</Tag>}
                    </div>
                    {it.reason && <p className="text-sm text-ink-2">{it.reason}</p>}
                    <Button size="sm" className="mt-auto self-start" onClick={() => analyzeItem(it)}>
                      {t("analyze_this")} <IconArrow size={14} />
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
