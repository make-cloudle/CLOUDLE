"use client";

import { useState } from "react";
import type { AnalysisResult, Evidence } from "@/lib/api";
import { type DictKey, useT } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { IconExternal } from "../ui/icons";
import { Alert, Card, Overline, Tag, cx } from "../ui/primitives";

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
        className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-accent px-1 align-[2px] text-[11px] font-semibold text-accent hover:bg-accent hover:text-accent-ink"
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
    <ol className="flex flex-col divide-y divide-line border-y border-line">
      {sources.map((s) => (
        <li key={s.n} id={`${idPrefix}-${s.n}`} className={cx("py-3 transition-colors", active === s.n && "bg-accent-soft")}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-accent text-[11px] font-semibold text-accent">{s.n}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={s.kind === "wikipedia" ? "sky" : s.kind === "user_upload" ? "warn" : "neutral"}>{s.kind_label}</Tag>
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

const SECTIONS: DictKey[] = ["basic_info", "reuse", "repair", "disposal"];

export function ResultCard({ result }: { result: AnalysisResult }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const [active, setActive] = useState<number | null>(null);
  const a = result.answer;
  const cite = (n: number) => {
    setActive(n);
    document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Overline>{result.item.item_id} · {result.item.recycling_category}</Overline>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{result.item.names[lang]}</h2>
        <p className="mt-1 text-xs text-ink-3">
          {result.engine === "llm" ? "LLM" : "offline"} · {result.timings.total}s
        </p>
      </div>
      {result.engine === "offline" && <Alert tone="info">{t("offline")}</Alert>}
      {a.safety && <Alert tone="warn">{t("safety")}</Alert>}

      {/* 벤토 그리드 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <Card className="md:col-span-6">
          <Overline className="mb-1">{t("summary")}</Overline>
          <p className="text-lg leading-relaxed"><Cited text={a.summary} onCite={cite} /></p>
        </Card>
        {SECTIONS.map((k) => (
          <Card key={k} className="md:col-span-3">
            <Overline className="mb-1">{t(k)}</Overline>
            <p className="text-sm leading-relaxed"><Cited text={a[k as keyof typeof a] as string} onCite={cite} /></p>
          </Card>
        ))}
        <Card className="md:col-span-4">
          <Overline className="mb-2">{t("next_actions")}</Overline>
          <ol className="flex flex-col gap-2">
            {a.next_actions?.map((x, i) => (
              <li key={i} className="grid grid-cols-[24px_1fr] text-sm leading-relaxed">
                <span className="text-ink-3 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span><Cited text={x} onCite={cite} /></span>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="md:col-span-2">
          <Overline className="mb-2">{t("uncertain")}</Overline>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
            {(a.uncertainties?.length ? a.uncertainties : ["—"]).map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </Card>
      </div>

      <section>
        <Overline className="mb-2">{t("sources")}</Overline>
        <SourceList sources={a.sources} active={active} />
      </section>
    </div>
  );
}
