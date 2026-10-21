"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import type { Lang } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export type CountryFeature = {
  type: "Feature";
  properties: { iso3: string; iso2: string; ko: string; en: string; ja: string; zh: string; lat: number; lng: number };
  geometry: object;
};

const PALETTE = {
  light: { ocean: "#dbe5ea", land: "#f1efe8", hover: "#d5e2da", selected: "#9db8ac", stroke: "#a9a598", side: "#d8d5ca" },
  dark: { ocean: "#1d2830", land: "#2a2b26", hover: "#33433c", selected: "#5f8576", stroke: "#4a4b43", side: "#24251f" },
};

/** 실제 국가 경계(GeoJSON)로 hover/click을 판정하는 3D 지구본. */
export default function GlobeView({ selected, onSelect }: {
  selected: string | null;
  onSelect: (f: CountryFeature) => void;
}) {
  const lang = usePrefs((s) => s.lang) as Lang;
  const theme = usePrefs((s) => s.theme);
  const c = PALETTE[theme];
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [hover, setHover] = useState<CountryFeature | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const material = useMemo(() => new THREE.MeshLambertMaterial({ color: c.ocean }), [c.ocean]);

  useEffect(() => {
    fetch("/countries.geojson").then((r) => r.json()).then((d) => setCountries(d.features));
  }, []);

  // 컨테이너 크기에 맞춰 반응형 렌더링
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      setSize({ w, h: Math.floor(Math.min(w, window.innerHeight * 0.72)) });
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // 느린 자동 회전 · 조작 중 일시정지 · 6초 후 재개
  useEffect(() => {
    const g = ref.current;
    if (!g || !countries.length) return;
    const controls = g.controls() as unknown as {
      autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean;
      addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void;
    };
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    g.pointOfView({ lat: 30, lng: 127, altitude: 2.3 }, 0);
    const start = () => {
      controls.autoRotate = false;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
    const end = () => {
      resumeTimer.current = setTimeout(() => (controls.autoRotate = true), 6000);
    };
    controls.addEventListener("start", start);
    controls.addEventListener("end", end);
    return () => {
      controls.removeEventListener("start", start);
      controls.removeEventListener("end", end);
    };
  }, [countries.length]);

  const handleClick = (f: CountryFeature) => {
    const g = ref.current;
    if (g) {
      const controls = g.controls() as unknown as { autoRotate: boolean };
      controls.autoRotate = false;
      g.pointOfView({ lat: f.properties.lat, lng: f.properties.lng, altitude: 1.7 }, 1100);
    }
    onSelect(f);
  };

  return (
    <div ref={wrap} className="relative w-full" style={{ height: size.h }}>
      <Globe
        ref={ref}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={false}
        showGraticules={false}
        globeMaterial={material}
        polygonsData={countries}
        polygonAltitude={(d) => {
          const iso = (d as CountryFeature).properties.iso3;
          return iso === selected ? 0.03 : hover?.properties.iso3 === iso ? 0.018 : 0.008;
        }}
        polygonCapColor={(d) => {
          const iso = (d as CountryFeature).properties.iso3;
          return iso === selected ? c.selected : hover?.properties.iso3 === iso ? c.hover : c.land;
        }}
        polygonSideColor={() => c.side}
        polygonStrokeColor={() => c.stroke}
        polygonLabel={(d) => {
          const p = (d as CountryFeature).properties;
          return `<div style="padding:4px 8px;border:1px solid ${c.stroke};border-radius:4px;background:${theme === "dark" ? "#1c1d19" : "#fff"};color:${theme === "dark" ? "#e7e5dd" : "#1f1f1c"};font:500 12px var(--font-sans)">${p[lang]}</div>`;
        }}
        onPolygonHover={(d) => setHover(d as CountryFeature | null)}
        onPolygonClick={(d) => handleClick(d as CountryFeature)}
        polygonsTransitionDuration={250}
      />
    </div>
  );
}
