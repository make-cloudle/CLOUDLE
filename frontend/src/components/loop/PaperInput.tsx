"use client";

import { useEffect, useRef, useState } from "react";
import { getItems, type ItemRef } from "@/lib/api";
import { type DictKey, useT } from "@/lib/i18n";
import { type Paper, useLoop } from "@/lib/loop";
import { usePrefs } from "@/lib/prefs";
import { IconImage, IconX } from "../ui/icons";
import { Tag, cx } from "../ui/primitives";

export const PURPOSES: Paper["purpose"][] = ["all", "repair", "reuse", "disposal"];
export const REGIONS = ["대한민국", "서울", "경기", "부산", "기타 지역"];

/** 줄노트 종이 입력창. 글은 줄 위에, 사진은 글 아래에 붙는다. */
export function PaperInput({ disabled, toolbar }: { disabled?: boolean; toolbar?: React.ReactNode }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const { paper, setPaper } = useLoop();
  const [items, setItems] = useState<ItemRef[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getItems().then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);

  // 목록의 이름과 정확히 같으면 품목 ID를 연결한다 (자유 입력도 허용)
  const onProduct = (v: string) => {
    const hit = items.find((i) => Object.values(i.names).some((n) => n === v.trim()));
    setPaper({ product_name: v, item_id: hit?.item_id ?? "", category: hit?.category ?? "" });
  };

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const next = [...paper.photos];
    for (const f of Array.from(files).slice(0, 3 - next.length)) {
      if (!f.type.startsWith("image/") || f.size > 5 * 1024 * 1024) continue;
      next.push({ id: crypto.randomUUID(), url: URL.createObjectURL(f), name: f.name, labels: [] });
    }
    setPaper({ photos: next });
  };

  return (
    <div className={cx("paper px-5 pt-6 pb-4 pl-12 sm:pl-14", disabled && "pointer-events-none opacity-60")}>
      <p className="eyebrow mb-1">CLOUDLE NOTE</p>
      <label className="flex items-baseline gap-3">
        <span className="w-14 shrink-0 text-xs font-semibold text-ink-3">{t("product")}</span>
        <input
          list="cloudle-items"
          value={paper.product_name}
          onChange={(e) => onProduct(e.target.value)}
          placeholder={t("product_ph")}
          className="paper-field text-xl font-bold"
          aria-label={t("product")}
        />
      </label>
      <datalist id="cloudle-items">
        {items.map((i) => <option key={i.item_id} value={i.names[lang]} />)}
      </datalist>
      <label className="flex items-baseline gap-3">
        <span className="w-14 shrink-0 text-xs font-semibold text-ink-3">{t("condition")}</span>
        <input
          value={paper.condition}
          onChange={(e) => setPaper({ condition: e.target.value })}
          placeholder={t("condition_ph")}
          className="paper-field"
          aria-label={t("condition")}
        />
      </label>
      <label className="flex items-center gap-3" style={{ minHeight: 36 }}>
        <span className="w-14 shrink-0 text-xs font-semibold text-ink-3">{t("region")}</span>
        <select
          value={paper.region}
          onChange={(e) => setPaper({ region: e.target.value })}
          className="paper-field h-9 cursor-pointer"
          aria-label={t("region")}
        >
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ minHeight: 36 }}>
        <span className="w-14 shrink-0 text-xs font-semibold text-ink-3">{t("purpose")}</span>
        <div role="radiogroup" aria-label={t("purpose")} className="flex flex-wrap gap-1.5">
          {PURPOSES.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={paper.purpose === p}
              onClick={() => setPaper({ purpose: p })}
              className={cx(
                "h-7 rounded-sm border px-2.5 text-xs transition-colors",
                paper.purpose === p ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2 hover:text-ink",
              )}
            >
              {t(`p_${p}` as DictKey)}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={paper.note}
        onChange={(e) => setPaper({ note: e.target.value })}
        placeholder={t("note_ph")}
        rows={2}
        className="paper-field mt-0.5"
        aria-label="note"
      />

      {/* 사진: 글 아래에 붙는다 */}
      {paper.photos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {paper.photos.map((p, i) => (
            <li key={p.id} className={cx("relative w-28 border border-line-strong bg-surface p-1.5 pb-5", i % 2 ? "rotate-1" : "-rotate-1")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" />
              {p.labels.length > 0 && <p className="mt-1 truncate text-[11px] text-ink-2">{p.labels.join(", ")}</p>}
              <button
                onClick={() => setPaper({ photos: paper.photos.filter((x) => x.id !== p.id) })}
                aria-label={t("remove")}
                className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-2 hover:text-ink"
              >
                <IconX size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {paper.docs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {paper.docs.map((d) => <Tag key={d.name} tone="sky">{d.name}</Tag>)}
        </div>
      )}

      {/* 하단 도구 막대 */}
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-dashed border-line-strong pt-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <IconImage size={16} /> {t("attach_image")}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
          onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
        {toolbar}
      </div>
    </div>
  );
}
