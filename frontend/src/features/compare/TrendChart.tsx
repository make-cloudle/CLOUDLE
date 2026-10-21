"use client";

import { useMemo, useState } from "react";
import { cx } from "@/shared/ui/primitives";

export type TrendSeries = { name: string; color: string; points: { year: number; value: number }[] };

const W = 640, H = 240, PAD = { l: 40, r: 70, t: 14, b: 28 };

/**
 * 연도별 추이 (타임머신). 하나의 y축, 2px 선, 범례 + 끝 라벨, 호버 십자선 툴팁, 표 보기.
 * year: 슬라이더로 고른 해 (세로선으로 표시)
 */
export function TrendChart({ series, unit, year, label }: { series: TrendSeries[]; unit: string; year?: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const all = series.flatMap((s) => s.points);
  const years = useMemo(() => [...new Set(all.map((p) => p.year))].sort((a, b) => a - b), [all]);
  if (!all.length) return null;

  const x0 = years[0], x1 = years[years.length - 1];
  const yMax = Math.max(...all.map((p) => p.value)) * 1.1 || 1;
  const sx = (y: number) => PAD.l + ((y - x0) / Math.max(1, x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const ticks = [0, yMax / 2, yMax].map((v) => Math.round(v));
  const focus = hover ?? year ?? null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const yr = Math.round(x0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (x1 - x0));
    setHover(Math.min(x1, Math.max(x0, yr)));
  };

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        {/* 범례: 두 계열이면 항상 표시 */}
        <ul className="flex flex-wrap gap-3 text-[13px] text-ink-2">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color, height: 2 }} />{s.name}
            </li>
          ))}
        </ul>
        <button onClick={() => setTable((t) => !t)} className="text-xs font-semibold text-sky-deep hover:underline">
          {table ? "chart" : "table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-64 overflow-auto rounded-2xl bg-surface-2">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{label}</caption>
            <thead><tr><th className="px-3 py-1.5 text-left text-ink-3">Year</th>{series.map((s) => <th key={s.name} className="px-3 py-1.5 text-right text-ink-3">{s.name}</th>)}</tr></thead>
            <tbody>
              {years.map((y) => (
                <tr key={y} className={cx(y === year && "bg-sky-soft")}>
                  <td className="px-3 py-1 tabular-nums">{y}</td>
                  {series.map((s) => <td key={s.name} className="px-3 py-1 text-right tabular-nums">{s.points.find((p) => p.year === y)?.value ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img" aria-label={label}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke="var(--line)" strokeWidth={1} />
                <text x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">{v}</text>
              </g>
            ))}
            {[x0, Math.round((x0 + x1) / 2), x1].map((y) => (
              <text key={y} x={sx(y)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{y}</text>
            ))}
            {focus != null && <line x1={sx(focus)} x2={sx(focus)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />}
            {series.map((s) => {
              const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`).join(" ");
              const last = s.points[s.points.length - 1];
              const f = focus != null ? s.points.find((p) => p.year === focus) : undefined;
              return (
                <g key={s.name}>
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  {/* 끝 라벨 (직접 라벨) — 글자는 잉크색, 색은 표식만 */}
                  <circle cx={sx(last.year)} cy={sy(last.value)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  <text x={sx(last.year) + 8} y={sy(last.value) + 4} fontSize={11} fill="var(--ink-2)">{s.name}</text>
                  {f && <circle cx={sx(f.year)} cy={sy(f.value)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
                </g>
              );
            })}
          </svg>
          {focus != null && (
            <div className="pointer-events-none absolute top-1 rounded-xl bg-surface px-3 py-2 text-[12px] shadow-float"
              style={{ left: `min(calc(${(sx(focus) / W) * 100}% + 8px), calc(100% - 150px))` }}>
              <p className="font-bold tabular-nums">{focus}</p>
              {series.map((s) => (
                <p key={s.name} className="flex items-center gap-1.5 text-ink-2">
                  <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name}: <b className="text-ink tabular-nums">{s.points.find((p) => p.year === focus)?.value ?? "—"}</b> {unit}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
