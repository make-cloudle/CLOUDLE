"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { getItems, type ItemRef } from "@/shared/api/client";
import { type DictKey, useT } from "@/shared/lib/i18n";
import { type Paper, useLoop } from "@/features/cloud-lab/model";
import { usePrefs } from "@/shared/lib/prefs";
import { AttachmentBar, type AttachedPhoto } from "@/features/cloud-lab/Attachments";
import { IconX } from "@/shared/ui/icons";
import { cx, Tag } from "@/shared/ui/primitives";

export const PURPOSES: Paper["purpose"][] = ["all", "repair", "reuse", "resell", "disposal"];
export const REGIONS = ["대한민국", "서울", "경기", "부산", "제주", "기타 지역"];

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-h-10 grid-cols-[64px_1fr] items-center gap-2">
      <span className="text-xs font-semibold text-ink-3">{label}</span>
      {children}
    </label>
  );
}

/** 세로로 긴 줄노트. 글은 줄 위에, 사진은 글 아래에, 첨부 버튼은 맨 아래에 있다. */
export function PaperInput({ disabled }: { disabled?: boolean }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const { paper, setPaper } = useLoop();
  const [items, setItems] = useState<ItemRef[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getItems().then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);

  const onProduct = (v: string) => {
    const hit = items.find((i) => Object.values(i.names).some((n) => n === v.trim()));
    setPaper({ product_name: v, item_id: hit?.item_id ?? "", category: hit?.category ?? "" });
  };

  const onPhoto = (p: AttachedPhoto) => {
    const cur = useLoop.getState().paper;
    const hit = p.vision?.item_id ? items.find((i) => i.item_id === p.vision!.item_id) : undefined;
    setPaper({
      photos: [...cur.photos, { id: p.id, url: p.url, name: p.name, labels: p.labels }],
      ...(hit && !cur.product_name ? { product_name: hit.names[lang], item_id: hit.item_id, category: hit.category } : {}),
      ...(p.vision?.condition && !cur.condition ? { condition: p.vision.condition } : {}),
    });
  };

  return (
    <div className={cx("paper flex min-h-[560px] flex-col px-5 pt-7 pb-4 pl-14", disabled && "pointer-events-none opacity-60")}>
      <p className="mb-1 text-[11px] font-bold tracking-[0.14em] text-ink-3">CLOUDLE NOTE</p>
      <input list="cloudle-items" value={paper.product_name} onChange={(e) => onProduct(e.target.value)}
        placeholder={t("product_ph")} aria-label={t("product")} className="paper-field text-[22px] font-extrabold tracking-tight" />
      <datalist id="cloudle-items">{items.map((i) => <option key={i.item_id} value={i.names[lang]} />)}</datalist>
      <Line label={t("condition")}>
        <input value={paper.condition} onChange={(e) => setPaper({ condition: e.target.value })} placeholder={t("condition_ph")} className="paper-field" />
      </Line>
      <Line label={t("region")}>
        <select value={paper.region} onChange={(e) => setPaper({ region: e.target.value })} className="paper-field h-10 cursor-pointer">
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </Line>
      <Line label={t("purpose")}>
        <div role="radiogroup" aria-label={t("purpose")} className="flex flex-wrap gap-1.5 py-1">
          {PURPOSES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={paper.purpose === p} onClick={() => setPaper({ purpose: p })}
              className={cx("h-7 rounded-full px-3 text-xs font-semibold transition-colors",
                paper.purpose === p ? "bg-accent text-accent-ink" : "bg-surface/70 text-ink-2 ring-1 ring-line hover:text-ink")}>
              {t(`p_${p}` as DictKey)}
            </button>
          ))}
        </div>
      </Line>
      <textarea value={paper.note} onChange={(e) => setPaper({ note: e.target.value })} placeholder={t("note_ph")} rows={5}
        className="paper-field flex-1" aria-label="note" />
      {paper.photos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {paper.photos.map((p, i) => (
            <li key={p.id} className={cx("relative w-28 rounded-sm bg-surface p-1.5 pb-5 shadow-soft", i % 2 ? "rotate-2" : "-rotate-2")}>
              <img src={p.url} alt={p.name} className="aspect-square w-full rounded-sm object-cover" />
              {p.labels.length > 0 && <p className="mt-1 truncate text-[11px] text-ink-2">{p.labels.join(", ")}</p>}
              <button type="button" onClick={() => setPaper({ photos: paper.photos.filter((x) => x.id !== p.id) })} aria-label={t("remove")}
                className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink-2 shadow-soft hover:text-ink">
                <IconX size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {paper.docs.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{paper.docs.map((d) => <Tag key={d.name} tone="sky">{d.name}</Tag>)}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-dashed border-line-strong pt-2">
        <AttachmentBar photoLimitReached={paper.photos.length >= 3} onPhoto={onPhoto}
          onDoc={(d) => setPaper({ docs: [...useLoop.getState().paper.docs, d] })} onError={setNotice} />
      </div>
      {notice && <p className="mt-1 text-xs text-ink-3" role="status">{notice}</p>}
    </div>
  );
}
