"use client";

import { useEffect, useMemo, useState } from "react";
import { Cited } from "@/entities/evidence/Evidence";
import { CloudMascot } from "@/entities/mascot/characters";
import { TrendChart } from "@/features/compare/TrendChart";
import { useDiscoveries } from "@/features/discovery/model";
import type { CountryFeature } from "@/features/globe/GlobeView";
import { type Answer, askCountry, type CountryBriefing, getCountry, getSeries, type Series } from "@/shared/api/client";
import { useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { Alert, Button, Card, Overline, Segmented, Tag } from "@/shared/ui/primitives";

type Side = { feature: CountryFeature | null; brief?: CountryBriefing; series: Partial<Record<"pm25" | "forest", Series>>; answer?: Answer };
const EMPTY: Side = { feature: null, series: {} };
const COLORS = ["var(--series-a)", "var(--series-b)"];

/** Planet VS: 두 나라의 지표 · 연도별 변화(타임머신) · 차이의 배경(RAG) */
export default function VsPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const save = useDiscoveries((s) => s.add);
  const [features, setFeatures] = useState<CountryFeature[]>([]);
  const [sides, setSides] = useState<[Side, Side]>([EMPTY, EMPTY]);
  const [inputs, setInputs] = useState(["대한민국", ""]);
  const [indicator, setIndicator] = useState<"pm25" | "forest">("pm25");
  const [year, setYear] = useState<number | undefined>();
  const [asking, setAsking] = useState(false);


  const choose = async (i: 0 | 1, f: CountryFeature) => {
    const iso = f.properties.iso3;
    setSides((s) => { const n = [...s] as [Side, Side]; n[i] = { feature: f, series: {} }; return n; });
    // 지표마다 도착하는 대로 반영 (느린 상세 브리핑이 차트를 막지 않게)
    const patch = (p: Partial<Side>) => setSides((s) => {
      const n = [...s] as [Side, Side];
      if (n[i].feature?.properties.iso3 === iso) n[i] = { ...n[i], ...p, series: { ...n[i].series, ...(p.series ?? {}) } };
      return n;
    });
    getSeries(iso, "pm25").then((pm25) => patch({ series: { pm25 } })).catch(() => undefined);
    getSeries(iso, "forest").then((forest) => patch({ series: { forest } })).catch(() => undefined);
    getCountry(iso, lang, true).then((brief) => patch({ brief })).catch(() => undefined);
  };

  useEffect(() => {
    fetch("/countries.geojson").then((r) => r.json()).then((d) => {
      setFeatures(d.features);
      const kor = (d.features as CountryFeature[]).find((f) => f.properties.iso3 === "KOR");
      if (kor) choose(0, kor);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onInput = (i: 0 | 1, v: string) => {
    setInputs((x) => { const n = [...x]; n[i] = v; return n; });
    const hit = features.find((f) => [f.properties.ko, f.properties.en, f.properties.ja, f.properties.zh].some((n) => n === v.trim()));
    if (hit) choose(i, hit);
  };

  const trend = useMemo(() => sides.filter((s) => s.feature && s.series[indicator]?.points?.length).map((s) => ({
    name: s.feature!.properties[lang], color: COLORS[sides.indexOf(s)], points: s.series[indicator]!.points!,
  })), [sides, indicator, lang]);
  const years = trend.flatMap((s) => s.points.map((p) => p.year));
  const minY = years.length ? Math.min(...years) : 2000, maxY = years.length ? Math.max(...years) : 2023;
  const at = (s: Side, k: "pm25" | "forest") => {
    const pts = s.series[k]?.points ?? [];
    return (year ? pts.find((p) => p.year === year) : pts[pts.length - 1]) ?? undefined;
  };

  const explain = async () => {
    if (!sides[0].feature || !sides[1].feature) return;
    setAsking(true);
    const topic = indicator === "pm25" ? "air" : "help";
    const res = await Promise.all(sides.map((s) => askCountry(s.feature!.properties.iso3, topic, lang).catch(() => undefined)));
    setSides((s) => [{ ...s[0], answer: res[0]?.answer }, { ...s[1], answer: res[1]?.answer }]);
    setAsking(false);
    const names = sides.map((s) => s.feature!.properties[lang]).join(" vs ");
    const srcs = res.flatMap((r) => r?.answer.sources ?? []).map((x) => ({ title: x.title, url: x.url }));
    if (srcs.length) save({ kind: "compare", title: `${names} · ${indicator === "pm25" ? "PM2.5" : t("forest")}`, summary: res.map((r) => r?.answer.answer ?? "").join(" / "), sources: srcs });
  };

  const ready = sides[0].feature && sides[1].feature;
  return (
    <div className="flex flex-col gap-6 pt-8 lg:pt-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Overline>Planet VS · Earth Time Machine</Overline>
          <h1 className="mt-1 text-[36px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[48px]">{t("vs_title")}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">{t("vs_desc")}</p>
        </div>
        <CloudMascot mood={asking ? "thinking" : ready ? "curious" : "idle"} className="hidden h-20 w-24 sm:block" />
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <label key={i} className="flex items-center gap-3 rounded-[20px] bg-surface p-3 shadow-soft">
            <i className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i] }} />
            <input list="vs-countries" value={inputs[i]} onChange={(e) => onInput(i as 0 | 1, e.target.value)}
              placeholder={t(i ? "pick_b" : "pick_a")} className="h-9 w-full bg-transparent text-[15px] font-semibold outline-none" />
          </label>
        ))}
        <datalist id="vs-countries">{features.map((f) => <option key={f.properties.iso3} value={f.properties[lang]} />)}</datalist>
      </div>

      {ready && (
        <>
          {/* 지표 나란히 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { label: t("air_annual"), unit: "µg/m³", v: (s: Side) => at(s, "pm25")?.value, year: (s: Side) => at(s, "pm25")?.year, warn: true },
              { label: t("forest"), unit: "%", v: (s: Side) => at(s, "forest")?.value, year: (s: Side) => at(s, "forest")?.year, warn: false },
              { label: t("population"), unit: "", v: (s: Side) => s.brief?.population.value, year: (s: Side) => s.brief?.population.year, warn: false },
            ].map((m) => {
              const vals = sides.map(m.v);
              const max = Math.max(...vals.map((x) => x ?? 0)) || 1;
              return (
                <Card key={m.label}>
                  <p className="text-[13px] font-semibold text-ink-2">{m.label}</p>
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {sides.map((s, i) => (
                      <li key={i}>
                        <div className="flex items-baseline justify-between text-[13px]">
                          <span>{s.feature!.properties[lang]}</span>
                          <span className="font-bold tabular-nums">
                            {vals[i] != null ? new Intl.NumberFormat(lang).format(vals[i]!) : t("unavailable")} <span className="text-xs font-normal text-ink-3">{m.unit}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${((vals[i] ?? 0) / max) * 100}%`, background: COLORS[i] }} />
                        </div>
                        {m.year(s) && <p className="mt-0.5 text-[11px] text-ink-3">{t("base_year")} {m.year(s)} · World Bank</p>}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>

          {/* 타임머신 */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[15px] font-extrabold">{t("timeline")}</p>
              <Segmented label="indicator" value={indicator} onChange={(v) => { setIndicator(v); setYear(undefined); }}
                options={[{ value: "pm25", label: "PM2.5" }, { value: "forest", label: t("forest") }]} />
            </div>
            <div className="mt-3">
              {trend.length ? (
                <TrendChart series={trend} unit={indicator === "pm25" ? "µg/m³" : "%"} year={year} label={`${t("timeline")} ${indicator}`} />
              ) : <Alert tone="info">{t("data_unavailable")}</Alert>}
            </div>
            {trend.length > 0 && (
              <label className="mt-3 flex items-center gap-3 text-[13px]">
                <span className="w-12 font-bold tabular-nums">{year ?? maxY}</span>
                <input type="range" min={minY} max={maxY} value={year ?? maxY} onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full accent-[var(--sky-deep)]" aria-label="year" />
              </label>
            )}
            <p className="mt-2 text-[11px] text-ink-3">World Bank WDI · CC BY 4.0 · {t("statistic")}</p>
          </Card>

          {/* 차이의 배경 (RAG) */}
          <div className="flex flex-col gap-3">
            <Button variant="primary" className="self-start" onClick={explain} loading={asking}>{t("why_diff")}</Button>
            {sides.some((s) => s.answer) && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {sides.map((s, i) => (
                  <Card key={i} className="anim-pop">
                    <p className="flex items-center gap-2 text-[13px] font-bold"><i className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />{s.feature!.properties[lang]}</p>
                    <p className="mt-2 text-[14px] leading-relaxed"><Cited text={s.answer?.answer} onCite={() => undefined} /></p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.answer?.sources.map((x) => <a key={x.n} href={x.url} target="_blank" rel="noreferrer"><Tag tone="sky">[{x.n}] {x.title}</Tag></a>)}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
