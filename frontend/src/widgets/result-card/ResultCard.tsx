"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/shared/api/client";
import { Cited, SourceList } from "@/entities/evidence/Evidence";
import { type DictKey, fill, useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { Alert, Card, Overline } from "@/shared/ui/primitives";

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
        <h2 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[36px]">{fill(t("result_title"), { name: result.item.names[lang] })}</h2>
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
