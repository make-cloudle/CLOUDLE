"use client";

import { useState } from "react";
import { Cited, SourceList } from "@/entities/evidence/Evidence";
import { CloudMascot, type CloudMood } from "@/entities/mascot/characters";
import { useDiscoveries } from "@/features/discovery/model";
import { ApiError, factcheck, type FactResult, type Verdict } from "@/shared/api/client";
import { type DictKey, useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { Alert, Button, Card, Chip, cx, Overline } from "@/shared/ui/primitives";

const EXAMPLES = ["종이컵은 종이니까 종이류로 버리면 된다", "보조배터리는 일반쓰레기로 버려도 안전하다", "형광등은 깨서 버려도 괜찮다"];
const TONE: Record<Verdict, { cls: string; mood: CloudMood }> = {
  supported: { cls: "bg-mint/60 text-mint-deep", mood: "happy" },
  refuted: { cls: "bg-warn-soft text-warn", mood: "concerned" },
  mixed: { cls: "bg-yellow/70 text-[#8a6416]", mood: "curious" },
  insufficient: { cls: "bg-surface-2 text-ink-2", mood: "thinking" },
};

/** Eco Detective: 환경 주장 → 문서 수집 → 근거로 검토 */
export default function DetectivePage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const save = useDiscoveries((s) => s.add);
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<FactResult | null>(null);
  const [error, setError] = useState("");

  const run = async (c: string) => {
    if (c.trim().length < 4 || busy) return;
    setClaim(c); setBusy(true); setError(""); setRes(null);
    try {
      const r = await factcheck(c, lang);
      setRes(r);
      if (r.answer.sources.length) save({ kind: "fact", title: c, summary: `${t(`v_${r.verdict}` as DictKey)} · ${r.answer.summary ?? ""}`, sources: r.answer.sources.map((x) => ({ title: x.title, url: x.url })) });
    } catch (e) {
      setError(e instanceof ApiError && e.code === "rate_limited" ? t("rate_limited") : t("error_generic"));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-6 pt-8 lg:pt-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Overline>Eco Detective</Overline>
          <h1 className="mt-1 text-[36px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[48px]">{t("det_title")}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">{t("det_desc")}</p>
        </div>
        <CloudMascot mood={busy ? "thinking" : res ? TONE[res.verdict].mood : "curious"} className="h-20 w-24 shrink-0" />
      </header>

      <form className="paper flex flex-col gap-2 px-5 pt-6 pb-4 pl-14" onSubmit={(e) => { e.preventDefault(); run(claim); }}>
        <textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={3} maxLength={300}
          placeholder={t("claim_ph")} aria-label={t("claim_ph")} className="paper-field text-[17px] font-semibold" />
        <div className="flex justify-end border-t border-dashed border-line-strong pt-2">
          <Button type="submit" variant="primary" loading={busy} disabled={claim.trim().length < 4}>{t("check")}</Button>
        </div>
      </form>
      <div className="flex flex-wrap gap-2">{EXAMPLES.map((e) => <Chip key={e} onClick={() => run(e)}>{e}</Chip>)}</div>

      {error && <Alert tone="error">{error}</Alert>}
      {res && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card className="anim-pop lg:col-span-7">
            <span className={cx("inline-flex rounded-full px-3 py-1 text-[13px] font-bold", TONE[res.verdict].cls)}>{t(`v_${res.verdict}` as DictKey)}</span>
            <p className="mt-3 text-[16px] leading-relaxed font-medium"><Cited text={res.answer.summary} onCite={(n) => document.getElementById(`fact-src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} /></p>
            {!!res.answer.points?.length && (
              <ul className="mt-3 flex flex-col gap-2 text-[14px] text-ink-2">
                {res.answer.points.map((p, i) => <li key={i} className="rounded-2xl bg-surface-2 px-3 py-2"><Cited text={p} onCite={(n) => document.getElementById(`fact-src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} /></li>)}
              </ul>
            )}
            {!!res.answer.uncertainties?.length && <p className="mt-3 text-xs text-ink-3">{res.answer.uncertainties.join(" / ")}</p>}
            {res.answer.sources.length > 0 && <p className="mt-2 text-xs font-semibold text-mint-deep">✓ {t("saved")}</p>}
          </Card>
          <div className="lg:col-span-5">
            <Overline className="mb-2">{t("sources")}</Overline>
            <SourceList sources={res.answer.sources} active={null} idPrefix="fact-src" />
          </div>
        </div>
      )}
      <p className="text-xs text-ink-3">{t("token_note")}</p>
    </div>
  );
}
