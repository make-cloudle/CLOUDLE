"use client";

/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CountryBriefing } from "@/entities/country/CountryBriefing";
import { Cited, SourceList } from "@/entities/evidence/Evidence";
import { CloudMascot, type CloudMood, EarthBuddy } from "@/entities/mascot/characters";
import { useDiscoveries } from "@/features/discovery/model";
import { PM_STEPS } from "@/entities/country/pm";
import type { CountryFeature, GlobeHandle } from "@/features/globe/GlobeView";
import { type Answer, ApiError, askCountry, type CountryBriefing as Briefing, type CountryTopic, getCountry, getSos, type SosData } from "@/shared/api/client";
import { fill, useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { IconArrow, IconSearch } from "@/shared/ui/icons";
import { Alert, buttonClass, Card, Chip, cx, Overline } from "@/shared/ui/primitives";

const GlobeView = dynamic(() => import("@/features/globe/GlobeView"), { ssr: false });

const TOPICS: { key: CountryTopic | "sources"; label: "ask_air" | "ask_waste" | "ask_help" | "ask_sources" }[] = [
  { key: "air", label: "ask_air" }, { key: "waste", label: "ask_waste" },
  { key: "help", label: "ask_help" }, { key: "sources", label: "ask_sources" },
];

/** Earth SOS: 지구본에서 환경 문제를 발견하고 → 나라를 골라 핵심 지표를 보고 → 구름에게 물어본다. */
export default function EarthPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const save = useDiscoveries((s) => s.add);
  const globe = useRef<GlobeHandle>(null);
  const [features, setFeatures] = useState<CountryFeature[]>([]);
  const [selected, setSelected] = useState<CountryFeature | null>(null);
  const [data, setData] = useState<Briefing | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [query, setQuery] = useState("");
  const [sos, setSos] = useState<SosData | null>(null);
  const [sosOn, setSosOn] = useState(true);
  const [ask, setAsk] = useState<{ topic: string; loading: boolean; answer?: Answer; error?: string } | null>(null);
  const reqId = useRef(0);
  const onReady = useCallback((f: CountryFeature[]) => setFeatures(f), []);

  useEffect(() => { getSos().then(setSos).catch(() => setSos(null)); }, []);

  // 실제 데이터 기준 대기 오염이 심한 나라 (국가 경계가 있는 곳만)
  const hotspots = useMemo(() => {
    if (!sos?.pm25.values || !features.length) return [];
    return features
      .map((f) => ({ f, v: sos.pm25.values[f.properties.iso3]?.value }))
      .filter((x): x is { f: CountryFeature; v: number } => x.v != null)
      .sort((a, b) => b.v - a.v).slice(0, 5);
  }, [sos, features]);

  const select = async (f: CountryFeature) => {
    setSelected(f);
    setAsk(null);
    globe.current?.focus(f);
    setState("loading");
    const id = ++reqId.current;
    try {
      const d = await getCountry(f.properties.iso3, lang); // 핵심 지표만
      if (id === reqId.current) { setData(d); setState("idle"); }
    } catch {
      if (id === reqId.current) setState("error");
    }
  };

  const reset = () => {
    reqId.current++;
    setSelected(null); setData(null); setAsk(null); setState("idle"); setQuery("");
    globe.current?.reset();
  };

  const searchCountry = (v: string) => {
    setQuery(v);
    const hit = features.find((f) => [f.properties.ko, f.properties.en, f.properties.ja, f.properties.zh]
      .some((n) => n.toLowerCase() === v.trim().toLowerCase()));
    if (hit) select(hit);
  };

  const askTopic = async (topic: CountryTopic | "sources") => {
    if (!selected) return;
    if (topic === "sources") {
      document.getElementById("briefing")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setAsk({ topic, loading: true });
    try {
      const r = await askCountry(selected.properties.iso3, topic, lang);
      setAsk({ topic, loading: false, answer: r.answer });
      if (r.answer.sources.length) {
        save({
          kind: "country", title: `${selected.properties[lang]} · ${t(TOPICS.find((x) => x.key === topic)!.label)}`,
          summary: r.answer.answer ?? "", sources: r.answer.sources.map((s) => ({ title: s.title, url: s.url })),
          country: { iso3: selected.properties.iso3, name: selected.properties[lang] },
        });
      }
    } catch (e) {
      setAsk({ topic, loading: false, error: e instanceof ApiError && e.code === "rate_limited" ? t("rate_limited") : t("error_generic") });
    }
  };

  const pm = data?.air_annual;
  const concerned = pm?.status === "ok" && (pm.value ?? 0) > 25;
  const mood: CloudMood = state === "loading" || ask?.loading ? "thinking" : state === "error" ? "error"
    : ask?.answer ? "presenting" : concerned ? "concerned" : selected ? "curious" : "idle";
  const name = selected?.properties[lang] ?? "";
  const bubble = selected ? fill(t("greet_country"), { name }) : t("greet_default");
  const markers = selected ? data?.events.items ?? [] : sos?.events.items ?? [];

  return (
    <div className="sky-wash -mx-4 px-4 sm:-mx-8 sm:px-8">
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 pt-8 pb-10 lg:grid-cols-12 lg:pt-12">
        <section className="lg:col-span-7" aria-label="globe">
          <Overline>Earth SOS · Explore the Earth. Uncover the Truth.</Overline>
          <h1 className="mt-2 text-[40px] leading-[1.08] font-extrabold tracking-[-0.03em] whitespace-pre-line sm:text-[56px]">{t("hero_title")}</h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-2">{t("hero_sub")}</p>

          <div className="relative mt-6">
            <div className="absolute top-3 left-3 z-10 w-[min(300px,calc(100%-9rem))]">
              <IconSearch size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
              <input list="countries" value={query} onChange={(e) => searchCountry(e.target.value)}
                placeholder={t("search_country")} aria-label={t("search_country")}
                className="h-10 w-full rounded-full bg-surface/90 pr-3 pl-9 text-[13px] shadow-soft ring-1 ring-line backdrop-blur focus:ring-2 focus:ring-sky focus:outline-none" />
              <datalist id="countries">{features.map((f) => <option key={f.properties.iso3} value={f.properties[lang]} />)}</datalist>
            </div>
            <div className="absolute top-3 right-3 z-10 flex gap-2">
              <button onClick={() => setSosOn((v) => !v)} aria-pressed={sosOn} aria-label={t("sos_layer")}
                className={cx(buttonClass(sosOn ? "primary" : "secondary", "sm"), "h-10")}>SOS</button>
              <button onClick={reset} className={cx(buttonClass("secondary", "sm"), "h-10")}>↺ {t("reset")}</button>
            </div>
            <img src="/characters/cloud-default.png" alt="" aria-hidden className="pointer-events-none absolute top-[20%] right-[5%] z-10 w-14 opacity-90 anim-float" />
            <GlobeView ref={globe} selected={selected?.properties.iso3 ?? null} onSelect={select}
              events={markers} onReady={onReady} pm25={sos?.pm25.values} sos={sosOn} />
            {sosOn && sos?.pm25.status === "ok" && (
              <div className="absolute bottom-3 left-3 z-10 rounded-2xl bg-surface/90 px-3 py-2 shadow-soft backdrop-blur">
                <p className="mb-1 text-[10px] font-semibold text-ink-2">{t("legend_pm")}</p>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-ink-3">
                  {PM_STEPS.map((s, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      <i className="inline-block h-2.5 w-4 rounded-sm" style={{ background: s.color }} />
                      {s.max === Infinity ? "35+" : `<${s.max}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <EarthBuddy className="absolute right-2 bottom-2 z-10 h-24 w-24 sm:h-28 sm:w-28" mood={ask?.answer ? "joy" : undefined} />
          </div>
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-5 lg:pt-24">
          <div className="flex items-end gap-3">
            <CloudMascot mood={mood} className="h-24 w-28 shrink-0" />
            <div key={bubble} className="relative mb-4 rounded-[20px] rounded-bl-md bg-surface px-4 py-3 text-[15px] font-medium shadow-soft anim-pop">{bubble}</div>
          </div>

          {!selected && (
            <Card className="anim-pop">
              <p className="text-[15px] font-extrabold">{t("sos_title")}</p>
              {hotspots.length > 0 && (
                <>
                  <p className="mt-3 mb-1.5 text-xs font-semibold text-ink-3">{t("hotspots")} · World Bank {sos?.pm25.values[hotspots[0].f.properties.iso3]?.year}</p>
                  <ul className="flex flex-col gap-1">
                    {hotspots.map(({ f, v }) => (
                      <li key={f.properties.iso3}>
                        <button onClick={() => select(f)} className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-[13px] hover:bg-surface-2">
                          <span className="font-medium">{f.properties[lang]}</span>
                          <span className="font-bold text-warn tabular-nums">{v} µg/m³</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-3 text-xs text-ink-3">
                {t("live_events")}: <b className="text-ink">{sos?.events.items.length ?? "—"}</b> · NASA EONET {sos?.events.days ?? 30}d
              </p>
              {!sos && <p className="mt-2 text-[13px] text-ink-3">{t("data_unavailable")}</p>}
            </Card>
          )}

          {state === "error" && <Alert tone="error">{t("error_generic")}</Alert>}
          {selected && data && state !== "error" && (
            <Card id="briefing" className={cx("anim-pop", state === "loading" && "opacity-60")}><CountryBriefing data={data} /></Card>
          )}
          {selected && !data && state === "loading" && (
            <Card className="flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-surface-2" />)}</Card>
          )}

          {selected && (
            <section aria-label={t("ask_title")}>
              <p className="mb-2 text-sm font-semibold">{t("ask_title")}</p>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((c) => <Chip key={c.key} active={ask?.topic === c.key} onClick={() => askTopic(c.key)} disabled={ask?.loading}>{t(c.label)}</Chip>)}
              </div>
              {ask?.loading && <p className="mt-3 text-sm text-ink-3">…</p>}
              {ask?.error && <div className="mt-3"><Alert tone="error">{ask.error}</Alert></div>}
              {ask?.answer && (
                <Card className="mt-3 anim-pop">
                  <p className="text-[14px] leading-relaxed">
                    <Cited text={ask.answer.answer} onCite={(n) => document.getElementById(`ask-src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} />
                  </p>
                  {ask.answer.sources.length > 0 && (
                    <>
                      <div className="mt-3"><SourceList sources={ask.answer.sources} active={null} idPrefix="ask-src" /></div>
                      <p className="mt-2 text-xs font-semibold text-mint-deep">✓ {t("saved")}</p>
                    </>
                  )}
                </Card>
              )}
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <Link href="/bin" className={buttonClass(selected ? "secondary" : "sky", "md")}>{t("nav_loop")} <IconArrow size={16} /></Link>
            <Link href="/vs" className={buttonClass("secondary", "md")}>{t("nav_vs")}</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
