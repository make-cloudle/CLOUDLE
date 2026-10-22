"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { EarthBuddy } from "@/entities/mascot/characters";
import { type DiscoveryKind, useDiscoveries } from "@/features/discovery/model";
import { useEcoBucket } from "@/features/eco-bucket/model";
import { type DictKey, useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { IconExternal, IconLeaf, IconX } from "@/shared/ui/icons";
import { buttonClass, Button, Chip, Overline, Tag } from "@/shared/ui/primitives";

// compare는 국가 비교 기능을 없애며 새로 쌓이지 않는다 (예전 기록은 목록에서 계속 보인다)
const KINDS: DiscoveryKind[] = ["country", "analysis", "talk"];
const TONE = { country: "sky", analysis: "mint", fact: "yellow", compare: "lavender", talk: "yellow" } as const;
const noop = () => () => {};

/** Discovery Book: RAG로 알아낸 사실 · 출처 · 탐험한 나라가 자동으로 쌓인다. */
export default function BookPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const { items, remove, clear } = useDiscoveries();
  const bucket = useEcoBucket();
  const [kind, setKind] = useState<DiscoveryKind | "all">("all");
  const hydrated = useSyncExternalStore(noop, () => true, () => false); // 저장소는 브라우저에만 있다
  const list = useMemo(() => items.filter((d) => kind === "all" || d.kind === kind), [items, kind]);
  const countries = useMemo(() => [...new Map(items.filter((d) => d.country).map((d) => [d.country!.iso3, d.country!.name])).values()], [items]);

  return (
    <div className="flex flex-col gap-6 pt-8 lg:pt-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Overline>Discovery Book</Overline>
          <h1 className="mt-1 text-[36px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[48px]">{t("book_title")}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">{t("book_desc")}</p>
        </div>
        <EarthBuddy className="h-24 w-24 shrink-0" mood={items.length ? "love" : undefined} />
      </header>

      {hydrated && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={kind === "all"} onClick={() => setKind("all")}>All · {items.length}</Chip>
            {KINDS.map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{t(`k_${k}` as DictKey)} · {items.filter((d) => d.kind === k).length}</Chip>)}
            {items.length > 0 && <Button variant="ghost" size="sm" className="ml-auto" onClick={clear}>{t("book_clear")}</Button>}
          </div>
          {countries.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
              {t("explored")}: {countries.map((c) => <Tag key={c} tone="sky">{c}</Tag>)}
            </p>
          )}

          {/* 에코 버킷: Cloud Lab에서 담은 좋은 결과·방법 (구름 광장에서 공유 가능) */}
          <section aria-labelledby="eco-bucket" className="rounded-[24px] bg-surface p-5 shadow-soft">
            <h2 id="eco-bucket" className="flex items-center gap-2 text-[15px] font-extrabold"><IconLeaf size={16} /> {t("bucket_title")} · {bucket.items.length}</h2>
            <p className="mt-1 text-[13px] text-ink-2">{t("bucket_desc")}</p>
            {bucket.items.length === 0 ? <p className="mt-3 text-[13px] text-ink-3">{t("bucket_empty")}</p> : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {bucket.items.map((b) => (
                  <li key={b.id} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-mint/60 pr-1.5 pl-3 text-[13px] font-semibold text-mint-deep">
                    {b.title}
                    <button onClick={() => bucket.remove(b.id)} aria-label={t("remove")} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-surface/60"><IconX size={11} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {list.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-[24px] bg-surface p-6 shadow-soft">
              <p className="text-ink-2">{t("book_empty")}</p>
              <Link href="/" className={buttonClass("sky", "md")}>{t("nav_earth")}</Link>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {list.map((d) => (
                <li key={d.id} className="relative flex flex-col gap-2 rounded-[24px] bg-surface p-5 shadow-soft anim-pop">
                  <div className="flex items-center justify-between">
                    <Tag tone={TONE[d.kind]}>{t(`k_${d.kind}` as DictKey)}</Tag>
                    <span className="text-[11px] text-ink-3">{new Date(d.createdAt).toLocaleDateString(lang)}</span>
                  </div>
                  <p className="text-[16px] font-bold tracking-tight">{d.title}</p>
                  <p className="line-clamp-4 text-[13px] leading-relaxed text-ink-2">{d.summary}</p>
                  <ul className="mt-auto flex flex-col gap-1 pt-1">
                    {d.sources.slice(0, 3).map((s) => (
                      <li key={s.title} className="truncate text-[12px]">
                        {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-deep hover:underline">{s.title} <IconExternal size={10} /></a>
                          : <span className="text-ink-3">{s.title}</span>}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => remove(d.id)} aria-label={t("remove")} className="absolute right-3 bottom-3 text-ink-3 hover:text-ink">
                    <IconX size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
