"use client";

import { useState } from "react";
import type { BucketKind } from "@/entities/eco-bucket/types";
import { useEcoBucket } from "@/features/eco-bucket/model";
import type { AnalysisResult } from "@/shared/api/client";
import { Cited, SourceList } from "@/entities/evidence/Evidence";
import { type DictKey, fill, useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { IconCheck, IconLeaf } from "@/shared/ui/icons";
import { Alert, Card, cx, Overline } from "@/shared/ui/primitives";

const SECTIONS: DictKey[] = ["basic_info", "reuse", "repair", "disposal"];

export function ResultCard({ result }: { result: AnalysisResult }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const [active, setActive] = useState<number | null>(null);
  const a = result.answer;
  const bucket = useEcoBucket();
  const name = result.item.names[lang];
  // 에코 버킷: 결과 전체 또는 마음에 든 방법 하나를 담는다
  const titleOf = (k: BucketKind) => (k === "result" ? name : `${name} · ${t(k as DictKey)}`);
  const put = (k: BucketKind, text?: string) => {
    if (!text) return;
    bucket.add({ title: titleOf(k), item: name, kind: k, text, sources: a.sources.slice(0, 3).map((s) => ({ title: s.title, url: s.url })) });
  };
  const saveBtn = (k: BucketKind, text?: string, big?: boolean) => {
    const saved = bucket.items.some((x) => x.title === titleOf(k));
    return (
      <button type="button" onClick={() => put(k, text)} disabled={!text} aria-pressed={saved}
        className={cx("inline-flex shrink-0 items-center gap-1 rounded-full font-semibold transition-colors disabled:opacity-40",
          big ? "h-9 px-3.5 text-[13px]" : "h-7 px-2.5 text-[11px]",
          saved ? "bg-mint/70 text-mint-deep" : "bg-surface-2 text-ink-2 hover:text-ink")}>
        {saved ? <IconCheck size={big ? 15 : 12} /> : <IconLeaf size={big ? 15 : 12} />}
        {saved ? t("bucket_saved") : big ? t("bucket_add") : t("bucket_add_short")}
      </button>
    );
  };
  const cite = (n: number) => {
    setActive(n);
    document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Overline>{result.item.item_id} · {result.item.recycling_category}</Overline>
        <h2 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[36px]">{fill(t("result_title"), { name: result.item.names[lang] })}</h2>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-3">{result.engine === "llm" ? "LLM" : "offline"} · {result.timings.total}s</p>
          {saveBtn("result", a.summary, true)}
        </div>
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
            <div className="mb-1 flex items-center justify-between gap-2"><Overline>{t(k)}</Overline>{saveBtn(k as BucketKind, a[k as keyof typeof a] as string)}</div>
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
