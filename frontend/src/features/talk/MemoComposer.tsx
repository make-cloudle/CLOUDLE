"use client";

import { useState } from "react";
import type { Memo, Purpose } from "@/entities/talk/types";
import { type DictKey, useT } from "@/shared/lib/i18n";
import { Button, cx } from "@/shared/ui/primitives";

const PURPOSES: Purpose[] = ["all", "repair", "reuse", "resell", "disposal"];

/** 내 CLOUDLE NOTE를 방에 공유하기 전에 확인·수정하는 작은 메모장 */
export function MemoComposer({ initial, onShare, onCancel, busy }: {
  initial: Memo;
  onShare: (m: Memo) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const [m, setM] = useState<Memo>(initial);
  const empty = !m.product_name.trim() && !m.note.trim();
  const field = "paper-field w-full text-[14px]";

  return (
    <div className="paper anim-pop flex flex-col gap-1 px-4 pt-5 pb-3 pl-12">
      <p className="text-[11px] font-bold tracking-[0.14em] text-ink-3">CLOUDLE MEMO</p>
      <input value={m.product_name} maxLength={60} onChange={(e) => setM({ ...m, product_name: e.target.value })}
        placeholder={t("product_ph")} aria-label={t("product")} className={cx(field, "text-[18px] font-extrabold")} />
      <input value={m.condition} maxLength={120} onChange={(e) => setM({ ...m, condition: e.target.value })}
        placeholder={t("condition_ph")} aria-label={t("condition")} className={field} />
      <div role="radiogroup" aria-label={t("purpose")} className="flex flex-wrap gap-1.5 py-1">
        {PURPOSES.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={m.purpose === p} onClick={() => setM({ ...m, purpose: p })}
            className={cx("h-7 rounded-full px-3 text-xs font-semibold", m.purpose === p ? "bg-accent text-accent-ink" : "bg-surface/70 text-ink-2 ring-1 ring-line")}>
            {t(`p_${p}` as DictKey)}
          </button>
        ))}
      </div>
      <textarea value={m.note} maxLength={800} rows={3} onChange={(e) => setM({ ...m, note: e.target.value })}
        placeholder={t("note_ph")} aria-label="note" className={field} />
      {empty && <p className="text-xs text-ink-3">{t("talk_note_empty")}</p>}
      <div className="mt-1 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>{t("talk_cancel")}</Button>
        <Button size="sm" variant="primary" disabled={empty} loading={busy} onClick={() => onShare(m)}>{t("talk_share")}</Button>
      </div>
    </div>
  );
}
