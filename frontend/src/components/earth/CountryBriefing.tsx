"use client";

import type { CountryBriefing as Data, Stat } from "@/lib/api";
import { type Lang, useT } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { IconExternal } from "../ui/icons";
import { Alert, Overline, Tag } from "../ui/primitives";

const fmt = (n: number, lang: Lang) => new Intl.NumberFormat(lang).format(n);

function StatRow({ label, stat, value, lang }: { label: string; stat: Stat; value?: string; lang: Lang }) {
  const t = useT();
  const ok = stat.status === "ok";
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-t border-line py-3 first:border-t-0">
      <p className="text-sm text-ink-2">{label}</p>
      <p className={ok ? "text-right text-lg font-semibold tabular-nums" : "text-right text-sm text-ink-3"}>
        {ok ? value : t("unavailable")}
      </p>
      <div className="col-span-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
        {ok ? (
          <>
            <Tag tone={stat.kind === "realtime" ? "sky" : "neutral"}>
              {stat.kind === "realtime" ? t("realtime") : t("statistic")}
            </Tag>
            {stat.year && <span>{t("base_year")} {stat.year}</span>}
            {stat.measured_at && <span>{t("measured_at")} {new Date(stat.measured_at).toLocaleString(lang)}</span>}
            {stat.url && (
              <a href={stat.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                {stat.source} <IconExternal size={11} />
              </a>
            )}
          </>
        ) : (
          <span>{stat.reason}</span>
        )}
      </div>
    </div>
  );
}

export function CountryBriefing({ data }: { data: Data }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const { air_annual, air_realtime, population, waste, events, related } = data;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Overline>{data.country.iso3}</Overline>
        <h2 className="text-2xl font-bold tracking-tight">{data.country.names[lang]}</h2>
      </div>

      <div>
        <StatRow label={t("air_realtime")} stat={air_realtime} lang={lang}
          value={air_realtime.value != null ? `${air_realtime.value} ${air_realtime.unit}` : undefined} />
        <StatRow label={t("air_annual")} stat={air_annual} lang={lang}
          value={air_annual.value != null ? `${air_annual.value} µg/m³` : undefined} />
        <StatRow label={t("waste")} stat={waste} lang={lang}
          value={waste.total_tons_per_year != null ? `${fmt(waste.total_tons_per_year, lang)} t/yr` : undefined} />
        <StatRow label={t("population")} stat={population} lang={lang}
          value={population.value != null ? fmt(population.value, lang) : undefined} />
      </div>

      <div>
        <Overline className="mb-2">{t("events")} · NASA EONET</Overline>
        {events.status !== "ok" ? (
          <Alert tone="warn">{t("unavailable")}</Alert>
        ) : events.items?.length ? (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {events.items.map((e) => (
              <li key={e.title + e.date} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="mr-2 text-xs text-ink-3 tabular-nums">{e.date}</span>
                  {e.title}
                </span>
                <Tag>{e.category}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">{t("no_events")}</p>
        )}
      </div>

      {related.length > 0 && (
        <div>
          <Overline className="mb-2">{t("related")}</Overline>
          <ul className="flex flex-col gap-2">
            {related.map((r) => (
              <li key={r.url} className="text-sm">
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                  {r.title} <IconExternal size={12} />
                </a>
                <p className="line-clamp-2 text-ink-2">{r.extract}</p>
                <p className="text-xs text-ink-3">Wikipedia · {r.license}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
