"use client";

import { useState } from "react";
import type { Evidence } from "@/shared/api/client";
import { IconExternal } from "@/shared/ui/icons";
import { cx, Tag } from "@/shared/ui/primitives";

/* 근거(Evidence) 엔티티: 답변 속 [근거 n] 번호와 원문 출처 목록 */
const CITE = /\[근거\s*(\d+)\]/g;

/** "[근거 n]"을 눌러서 원문으로 이동하는 번호 버튼으로 바꾼다 (F2008). */
export function Cited({ text, onCite }: { text?: string; onCite: (n: number) => void }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    parts.push(text.slice(last, m.index));
    const n = Number(m[1]);
    parts.push(
      <button
        key={`${m.index}-${n}`}
        onClick={() => onCite(n)}
        className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sky-soft px-1.5 align-[2px] text-[11px] font-bold text-sky-deep hover:bg-sky hover:text-[#0f2a44]"
        aria-label={`source ${n}`}
      >
        {n}
      </button>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function SourceList({ sources, active, idPrefix = "src" }: {
  sources: Evidence[]; active: number | null; idPrefix?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ol className="flex flex-col gap-2">
      {sources.map((s) => (
        <li key={s.n} id={`${idPrefix}-${s.n}`} className={cx("rounded-2xl bg-surface-2 p-3 transition-colors", active === s.n && "ring-2 ring-sky")}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-soft text-[11px] font-bold text-sky-deep">{s.n}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={s.kind === "wikipedia" ? "sky" : s.kind === "user_upload" ? "yellow" : s.kind === "guide" ? "mint" : "lavender"}>{s.kind_label}</Tag>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline">
                    {s.title} <IconExternal size={12} />
                  </a>
                ) : (
                  <span className="text-sm font-medium">{s.title}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-3">{s.license}</p>
              <button onClick={() => setOpen(open === s.n ? null : s.n)} className="mt-1 text-xs text-ink-2 underline-offset-2 hover:underline">
                {open === s.n ? "−" : "+"} excerpt
              </button>
              {open === s.n && <p className="mt-1 text-sm whitespace-pre-wrap text-ink-2">{s.text.slice(0, 900)}</p>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

