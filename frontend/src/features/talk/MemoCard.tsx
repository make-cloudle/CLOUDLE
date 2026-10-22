"use client";

import type { MemoMessage } from "@/entities/talk/types";
import { type DictKey, fill, useT } from "@/shared/lib/i18n";
import { IconNote } from "@/shared/ui/icons";
import { Button, Tag } from "@/shared/ui/primitives";

/** 채팅 안의 CLOUDLE MEMO 카드. Cloud Lab 노트와 같은 필드라 그대로 옮겨 쓸 수 있다. */
export function MemoCard({ message, onApply, onOpen, onSave }: {
  message: MemoMessage;
  onApply: () => void;
  onOpen: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const { memo } = message;
  const label = message.source === "summary"
    ? fill(t(message.engine === "llm" ? "talk_memo_ai" : "talk_memo_offline"), { n: String(message.basedOn ?? "") })
    : `${message.author.nickname}${t("talk_memo_shared")}`;

  return (
    <div className="w-[min(320px,78vw)] rounded-[18px] bg-paper p-4 text-ink shadow-soft ring-1 ring-line">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-ink-3"><IconNote size={14} /> CLOUDLE MEMO</p>
        <Tag tone={message.source === "summary" ? "lavender" : "sky"}>{label}</Tag>
      </div>
      {memo.product_name && <p className="mt-2 text-[18px] font-extrabold tracking-tight">{memo.product_name}</p>}
      <dl className="mt-1 grid grid-cols-[52px_1fr] gap-x-2 gap-y-0.5 text-[13px]">
        {memo.condition && <><dt className="text-ink-3">{t("condition")}</dt><dd>{memo.condition}</dd></>}
        <dt className="text-ink-3">{t("region")}</dt><dd>{memo.region}</dd>
        <dt className="text-ink-3">{t("purpose")}</dt><dd>{t(`p_${memo.purpose}` as DictKey)}</dd>
      </dl>
      {memo.note && <p className="mt-2 border-t border-dashed border-line-strong pt-2 text-[13px] leading-relaxed whitespace-pre-wrap">{memo.note}</p>}
      {message.source === "summary" && <p className="mt-2 text-[11px] text-ink-3">{t("talk_unverified")}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" onClick={onOpen}>{t("talk_memo_open")}</Button>
        <Button size="sm" onClick={onApply}>{t("talk_memo_apply")}</Button>
        <Button size="sm" variant="ghost" onClick={onSave}>{t("talk_memo_save")}</Button>
      </div>
    </div>
  );
}
