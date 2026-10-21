"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CloudMascot } from "@/entities/mascot/characters";
import { IconArrow, IconSearch } from "@/shared/ui/icons";
import { Alert, Button, Chip, Input, Overline, Tag } from "@/shared/ui/primitives";
import { ApiError, getItems, type ItemRef, searchItems, type SearchResult } from "@/shared/api/client";
import { type Lang, useT } from "@/shared/lib/i18n";
import { EMPTY_PAPER, useLoop } from "@/features/cloud-lab/model";
import { usePrefs } from "@/shared/lib/prefs";

const EXAMPLES: Record<Lang, string[]> = {
  ko: ["배터리가 들어 있는 소형 전자제품 중 별도 수거가 필요한 품목", "유해하거나 화재 위험이 있는 물건", "대형 가구"],
  en: ["small electronics with batteries that need separate collection", "hazardous items", "large furniture"],
  ja: ["電池入りの小型家電で別回収が必要なもの", "有害・火災の危険がある物", "大型家具"],
  zh: ["含电池且需单独回收的小型电子产品", "有害或有火灾风险的物品", "大型家具"],
};
const ALL = { ko: "전체", en: "All", ja: "すべて", zh: "全部" };

/** 품목 탐색 (F2011): 분류·속성으로 둘러보기 + 자연어 조건 검색 → 카드 → 클라우드 빈으로 */
export default function ExplorePage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const router = useRouter();
  const [catalog, setCatalog] = useState<{ categories: Record<string, Record<Lang, string>>; items: ItemRef[] } | null>(null);
  const [category, setCategory] = useState("all");
  const [battery, setBattery] = useState(false);
  const [query, setQuery] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getItems().then(setCatalog).catch(() => setError(t("error_generic"))); }, [t]);

  const run = async (q: string) => {
    if (!q.trim()) { setRes(null); return; }
    setQuery(q); setBusy(true); setError("");
    try { setRes(await searchItems(q)); }
    catch (e) { setError(e instanceof ApiError && e.code === "rate_limited" ? t("rate_limited") : t("error_generic")); }
    finally { setBusy(false); }
  };

  const browse = useMemo(() => (catalog?.items ?? []).filter((i) =>
    (category === "all" || i.category === category) && (!battery || i.has_battery)), [catalog, category, battery]);
  const list: (ItemRef & { reason?: string })[] = res ? res.items : browse;

  const analyzeItem = (it: ItemRef) => {
    useLoop.getState().resetAll();
    useLoop.getState().setPaper({ ...EMPTY_PAPER, product_name: it.names[lang], item_id: it.item_id, category: it.category });
    router.push("/bin");
  };

  return (
    <div className="flex flex-col gap-6 pt-8 lg:pt-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Overline>Item Explorer</Overline>
          <h1 className="mt-1 text-[36px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[48px]">{t("explore_title")}</h1>
        </div>
        <CloudMascot mood={busy ? "thinking" : res ? "presenting" : "curious"} className="hidden h-20 w-24 sm:block" />
      </header>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(query); }}>
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setRes(null); }}
            placeholder={t("explore_ph")} className="h-12 pl-11" aria-label={t("search")} />
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy}>{t("search")}</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES[lang].map((ex) => <Chip key={ex} active={query === ex && !!res} onClick={() => run(ex)}>{ex}</Chip>)}
      </div>

      {!res && catalog && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>{ALL[lang]}</Chip>
          {Object.entries(catalog.categories).map(([k, v]) => <Chip key={k} active={category === k} onClick={() => setCategory(k)}>{v[lang]}</Chip>)}
          <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
          <Chip active={battery} onClick={() => setBattery((b) => !b)}>{t("battery")}</Chip>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {res && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
          {t("conditions")}: {res.conditions.length ? res.conditions.map((c) => <Tag key={c} tone="sky">{c}</Tag>) : "—"}
          <span className="text-xs text-ink-3">· {res.engine} · {res.items.length}</span>
        </p>
      )}
      {list.length === 0 && (res || catalog) ? <p className="text-ink-3">{t("no_match")}</p> : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((it) => (
            <li key={it.item_id}>
              <button onClick={() => analyzeItem(it)}
                className="group flex h-full w-full flex-col gap-2 rounded-[24px] bg-surface p-5 text-left shadow-soft transition-transform hover:-translate-y-1">
                <span className="text-[11px] font-semibold text-ink-3">{catalog?.categories[it.category]?.[lang] ?? it.category}</span>
                <span className="text-lg font-bold tracking-tight">{it.names[lang]}</span>
                <span className="flex flex-wrap gap-1.5">
                  <Tag tone="mint">{it.recycling_category}</Tag>
                  {it.has_battery && <Tag tone="warn">{t("battery")}</Tag>}
                </span>
                {it.reason && <span className="text-[13px] text-ink-2">{it.reason}</span>}
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[13px] font-semibold text-sky-deep">
                  {t("analyze_this")} <IconArrow size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
