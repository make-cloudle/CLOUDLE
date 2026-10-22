"use client";

import type { BucketKind } from "@/entities/eco-bucket/types";
import type { BucketMessage } from "@/entities/talk/types";
import { type DictKey, useT } from "@/shared/lib/i18n";
import { IconExternal, IconLeaf } from "@/shared/ui/icons";
import { cx } from "@/shared/ui/primitives";

const KIND_TONE: Record<BucketKind, string> = {
  result: "bg-sky-soft text-sky-deep",
  reuse: "bg-mint/70 text-mint-deep",
  repair: "bg-yellow/80 text-[#8a6416] dark:text-yellow-100",
  disposal: "bg-lavender/80 text-[#5b4fb0] dark:text-violet-200",
  basic_info: "bg-surface-2 text-ink-2",
};

/** 채팅방에 공유된 에코 버킷 — 일반 말풍선보다 크게, Cloud Lab 결과처럼 보여 준다 */
export function BucketCard({ message, onSave }: { message: BucketMessage; onSave: () => void }) {
  const t = useT();
  const b = message.bucket;
  return (
    <article className="w-[min(440px,86vw)] overflow-hidden rounded-[22px] bg-surface text-ink shadow-float ring-1 ring-line">
      <div className="bg-gradient-to-br from-mint/70 to-sky-soft px-5 pt-4 pb-3 dark:from-mint/40 dark:to-sky-soft">
        <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-mint-deep"><IconLeaf size={14} /> ECO BUCKET</p>
        <h3 className="mt-1 text-[20px] leading-tight font-extrabold tracking-tight">{b.title}</h3>
        <span className={cx("mt-2 inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold", KIND_TONE[b.kind])}>
          {b.kind === "result" ? t("summary") : t(b.kind as DictKey)}
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{b.text}</p>
        {b.sources.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 border-t border-dashed border-line-strong pt-3">
            {b.sources.map((s) => (
              <li key={s.title} className="truncate text-[12px]">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-deep hover:underline">{s.title} <IconExternal size={10} /></a>
                ) : <span className="text-ink-3">{s.title}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-3">{t("bucket_from_lab")}</span>
          <button type="button" onClick={onSave} className="h-8 rounded-full bg-surface-2 px-3 text-[12px] font-semibold text-ink-2 hover:text-ink">{t("bucket_add")}</button>
        </div>
      </div>
    </article>
  );
}
