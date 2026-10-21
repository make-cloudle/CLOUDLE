"use client";

import type { CountryBriefing as Data, Stat } from "@/shared/api/client";
import { type Lang, useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { IconExternal } from "@/shared/ui/icons";
import { cx, Tag } from "@/shared/ui/primitives";

const fmt = (n: number, lang: Lang) => new Intl.NumberFormat(lang).format(n);

/** 지표 1개: 값 · 단위 · 출처 · 기준연도/관측시각 · 범위 · 가용 상태를 항상 함께 보여준다. */
function Metric({ label, stat, value, unit, warn, coverage }: {
  label: string; stat: Stat; value?: string; unit?: string; warn?: boolean; coverage: string;
}) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const ok = stat.status === "ok";
  return (
    <div className={cx("rounded-2xl p-3.5", ok ? (warn ? "bg-warn-soft" : "bg-surface-2") : "bg-surface-2/60")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-2">{label}</p>
        <Tag tone={!ok ? "neutral" : stat.kind === "realtime" ? "sky" : "lavender"}>
          {!ok ? t("unavailable") : stat.kind === "realtime" ? t("realtime") : t("statistic")}
        </Tag>
      </div>
      {ok ? (
        <p className={cx("mt-1 text-2xl font-extrabold tracking-tight tabular-nums", warn && "text-warn")}>
          {value}<span className="ml-1 text-xs font-medium text-ink-3">{unit}</span>
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-ink-3">{t("data_unavailable")}</p>
      )}
      <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-ink-3">
        {stat.year && <span>{t("base_year")} {stat.year}</span>}
        {stat.measured_at && <span>{t("measured_at")} {new Date(stat.measured_at).toLocaleString(lang)}</span>}
        <span>{coverage}</span>
        {ok && stat.url ? (
          <a href={stat.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
            {stat.source} <IconExternal size={10} />
          </a>
        ) : !ok && stat.reason ? <span>{stat.reason}</span> : null}
      </p>
    </div>
  );
}

export function CountryBriefing({ data }: { data: Data }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const { air_annual: air, air_realtime: live, population, waste, events, related } = data;
  const name = data.country.names[lang];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-extrabold tracking-tight">{name}</h2>
        <span className="text-xs font-semibold text-ink-3">{data.country.iso3}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Metric label={t("air_realtime")} stat={live} coverage={name}
          value={live.value != null ? String(live.value) : undefined} unit={live.unit} warn={(live.value ?? 0) > 35} />
        <Metric label={t("air_annual")} stat={air} coverage={name}
          value={air.value != null ? String(air.value) : undefined} unit="µg/m³" warn={(air.value ?? 0) > 25} />
        <Metric label={t("waste")} stat={waste} coverage={name}
          value={waste.total_tons_per_year != null ? fmt(waste.total_tons_per_year, lang) : undefined} unit="t/yr" />
        <Metric label={t("population")} stat={population} coverage={name}
          value={population.value != null ? fmt(population.value, lang) : undefined} unit="" />
      </div>

      <div>
        <p className="mb-2 text-[13px] font-semibold">{t("events")} <span className="font-normal text-ink-3">· NASA EONET</span></p>
        {events.status !== "ok" ? (
          <p className="text-[13px] text-ink-3">{t("data_unavailable")}</p>
        ) : events.items?.length ? (
          <ul className="flex flex-col gap-1.5">
            {events.items.map((e) => (
              <li key={e.title + e.date} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate"><span className="mr-2 text-ink-3 tabular-nums">{e.date}</span>{e.title}</span>
                <Tag tone={e.category === "Wildfires" ? "warn" : "sky"}>{e.category}</Tag>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-ink-3">{t("no_events")}</p>}
      </div>

      {related.length > 0 && (
        <div id="briefing-sources">
          <p className="mb-2 text-[13px] font-semibold">{t("related")}</p>
          <ul className="flex flex-col gap-2">
            {related.map((r) => (
              <li key={r.url} className="text-[13px]">
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                  {r.title} <IconExternal size={11} />
                </a>
                <p className="line-clamp-2 text-ink-2">{r.extract}</p>
                <p className="text-[11px] text-ink-3">Wikipedia · {r.license}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
