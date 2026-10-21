"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import type { EnvEvent } from "@/shared/api/client";
import type { Lang } from "@/shared/lib/i18n";
import { pmColor } from "@/entities/country/pm";
import { usePrefs } from "@/shared/lib/prefs";

export type CountryFeature = {
  type: "Feature";
  properties: { iso3: string; iso2: string; ko: string; en: string; ja: string; zh: string; lat: number; lng: number };
  geometry: object;
};

export type GlobeHandle = { reset: () => void; focus: (f: CountryFeature) => void };

const ICE = new Set(["ATA", "GRL"]);
const PALETTE = {
  light: { ocean: "#8fd0f6", land: "#bce8c8", side: "#93cfa5", hover: "#a6dfb5", selected: "#ffe5a3", ice: "#f4fbff", stroke: "#7fbf95", atmosphere: "#bfe6ff" },
  dark: { ocean: "#2d6f9a", land: "#5d9e78", side: "#3f7a59", hover: "#73b48c", selected: "#e8c873", ice: "#dfeaf3", stroke: "#3f7a59", atmosphere: "#4f8fbf" },
};
const EVENT_COLOR: Record<string, string> = { Wildfires: "#e9784f", "Severe Storms": "#9b8cf0", Volcanoes: "#d64545", Floods: "#2f8fd0" };
const HOME = { lat: 28, lng: 127, altitude: 2.4 };

const GlobeView = forwardRef<GlobeHandle, {
  selected: string | null;
  onSelect: (f: CountryFeature) => void;
  events?: EnvEvent[];
  onReady?: (features: CountryFeature[]) => void;
  pm25?: Record<string, { value: number }>;
  sos?: boolean;
}>(function GlobeView({ selected, onSelect, events = [], onReady, pm25, sos }, ref) {
  const lang = usePrefs((s) => s.lang) as Lang;
  const theme = usePrefs((s) => s.theme);
  const c = PALETTE[theme];
  const g = useRef<GlobeMethods | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const material = useMemo(
    () => new THREE.MeshPhongMaterial({ color: c.ocean, shininess: 12, specular: new THREE.Color("#ffffff").multiplyScalar(0.15) }),
    [c.ocean],
  );

  useEffect(() => {
    fetch("/countries.geojson").then((r) => r.json()).then((d) => {
      setCountries(d.features);
      onReady?.(d.features);
    });
  }, [onReady]);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      setSize({ w, h: Math.floor(Math.min(w * 0.95, Math.max(360, window.innerHeight * 0.7))) });
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const controls = () => g.current?.controls() as unknown as {
    autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean; dampingFactor: number;
    minDistance: number; maxDistance: number; rotateSpeed: number; zoomSpeed: number;
    addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void;
  } | undefined;

  useEffect(() => {
    const ctl = controls();
    if (!g.current || !ctl || !countries.length) return;
    ctl.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ctl.autoRotateSpeed = 0.3;
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08; // 절제된 관성
    ctl.rotateSpeed = 0.6;
    ctl.zoomSpeed = 0.6;
    ctl.minDistance = 170; // 확대 제한
    ctl.maxDistance = 380;
    g.current.pointOfView(HOME, 0);
    const start = () => { ctl.autoRotate = false; if (resumeTimer.current) clearTimeout(resumeTimer.current); };
    const end = () => { resumeTimer.current = setTimeout(() => (ctl.autoRotate = !selected), 8000); };
    ctl.addEventListener("start", start);
    ctl.addEventListener("end", end);
    return () => { ctl.removeEventListener("start", start); ctl.removeEventListener("end", end); };
  }, [countries.length, selected]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      g.current?.pointOfView(HOME, 900);
      const ctl = controls();
      if (ctl) ctl.autoRotate = true;
    },
    focus: (f) => {
      const ctl = controls();
      if (ctl) ctl.autoRotate = false;
      g.current?.pointOfView({ lat: f.properties.lat, lng: f.properties.lng, altitude: 1.6 }, 1100);
    },
  }));

  return (
    <div ref={wrap} className="relative w-full" style={{ height: size.h, cursor: hover ? "pointer" : "grab" }}>
      <Globe
        ref={g}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor={c.atmosphere}
        atmosphereAltitude={0.16}
        globeMaterial={material}
        polygonsData={countries}
        polygonAltitude={(d) => {
          const iso = (d as CountryFeature).properties.iso3;
          return iso === selected ? 0.035 : iso === hover ? 0.022 : 0.012;
        }}
        polygonCapColor={(d) => {
          const iso = (d as CountryFeature).properties.iso3;
          if (iso === selected) return c.selected;
          if (iso === hover) return c.hover;
          if (ICE.has(iso)) return c.ice;
          const pm = sos ? pm25?.[iso]?.value : undefined;
          return pm != null ? pmColor(pm) : c.land;
        }}
        polygonSideColor={() => c.side}
        polygonStrokeColor={(d) => ((d as CountryFeature).properties.iso3 === selected ? "#2f8fd0" : c.stroke)}
        polygonLabel={(d) => {
          const p = (d as CountryFeature).properties;
          return `<div style="padding:4px 10px;border-radius:999px;background:${theme === "dark" ? "#1b2535" : "#fff"};color:${theme === "dark" ? "#eef3f9" : "#25354d"};font:600 12px var(--font-sans);box-shadow:0 6px 16px rgba(37,53,77,.12)">${p[lang]}</div>`;
        }}
        onPolygonHover={(d) => setHover((d as CountryFeature | null)?.properties.iso3 ?? null)}
        onPolygonClick={(d) => onSelect(d as CountryFeature)}
        polygonsTransitionDuration={250}
        pointsData={events}
        pointLat="lat"
        pointLng="lng"
        pointColor={(d) => EVENT_COLOR[(d as EnvEvent).category] ?? "#2f8fd0"}
        pointAltitude={0.05}
        pointRadius={selected ? 0.45 : 0.6}
        pointLabel={(d) => `<div style="padding:4px 8px;border-radius:8px;background:#fff;color:#25354d;font:500 11px var(--font-sans)">${(d as EnvEvent).date} · ${(d as EnvEvent).title}</div>`}
      />
    </div>
  );
});

export default GlobeView;
