"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { CountryBriefing } from "@/components/earth/CountryBriefing";
import type { CountryFeature } from "@/components/earth/GlobeView";
import { IconArrow } from "@/components/ui/icons";
import { Alert, Card, Overline } from "@/components/ui/primitives";
import { ApiError, type CountryBriefing as Briefing, getCountry } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

const GlobeView = dynamic(() => import("@/components/earth/GlobeView"), { ssr: false });
const CloudCharacter = dynamic(() => import("@/components/three/CloudCharacter"), { ssr: false });

export default function EarthPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const [selected, setSelected] = useState<CountryFeature | null>(null);
  const [data, setData] = useState<Briefing | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const reqId = useRef(0);

  const select = async (f: CountryFeature) => {
    setSelected(f);
    setState("loading");
    const id = ++reqId.current; // 늦게 도착한 이전 국가 응답은 무시
    try {
      const d = await getCountry(f.properties.iso3, lang);
      if (id === reqId.current) {
        setData(d);
        setState("idle");
      }
    } catch (e) {
      if (id === reqId.current) setState(e instanceof ApiError ? "error" : "error");
    }
  };

  const mood = state === "loading" ? "thinking" : state === "error" ? "error" : selected ? "country" : "idle";

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 pt-8 lg:grid-cols-12">
      <header className="lg:col-span-12">
        <Overline>01 · Cloud Earth</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{t("earth_title")}</h1>
        <p className="mt-2 max-w-xl text-ink-2">{t("earth_desc")}</p>
      </header>

      <section aria-label="globe" className="lg:col-span-7">
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <GlobeView selected={selected?.properties.iso3 ?? null} onSelect={select} />
        </div>
      </section>

      <aside className="flex flex-col gap-4 lg:col-span-5">
        <div className="grid grid-cols-[96px_1fr] items-start gap-3">
          <CloudCharacter mood={mood} className="h-24 w-24" />
          {/* 말풍선: 1px 보더 + 꼬리 */}
          <div className="relative rounded-lg border border-line-strong bg-surface p-3 text-sm before:absolute before:top-6 before:-left-[7px] before:h-3 before:w-3 before:rotate-45 before:border-b before:border-l before:border-line-strong before:bg-surface">
            {state === "loading" ? t("loading") + "…" : selected ? selected.properties[lang] : t("pick_country")}
          </div>
        </div>

        <Card className="min-h-[320px]">
          {state === "error" && <Alert tone="error">{t("error_generic")}</Alert>}
          {data && state !== "error" && (
            <div className={state === "loading" ? "opacity-50 transition-opacity" : ""}>
              <CountryBriefing data={data} />
            </div>
          )}
          {!data && state === "idle" && <p className="text-sm text-ink-3">{t("pick_country")}</p>}
          {!data && state === "loading" && (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-surface-2" />)}
            </div>
          )}
        </Card>

        <Link
          href="/loop"
          className="inline-flex h-10 items-center gap-2 self-start rounded-md border border-accent bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          {t("go_loop")} <IconArrow size={16} />
        </Link>
      </aside>
    </div>
  );
}
