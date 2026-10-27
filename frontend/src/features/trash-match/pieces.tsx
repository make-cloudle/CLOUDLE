"use client";

import type { Special } from "./engine";

/** 쓰레기 6종: 색 + 모양이 모두 달라서 색만으로 구분하지 않아도 된다 (index = engine의 kind) */
export const KIND_KEYS = ["pz_vinyl", "pz_plastic", "pz_can", "pz_paper", "pz_glass", "pz_general"] as const;
export const KIND_BG = ["#dcd5ff", "#bfe6ff", "#d7dee8", "#ffe5a3", "#bce8c8", "#ffd0bf"] as const;
const INK = "#25354d";

const common = { fill: "none", stroke: INK, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function KindGlyph({ kind, size = 28 }: { kind: number; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      {kind === 0 && <><path {...common} d="M9 11h14l-1.5 15h-11z" /><path {...common} d="M12 11c0-4 1.5-6 4-6s4 2 4 6M11 17h10" /></>}
      {kind === 1 && <><path {...common} d="M13 4h6v4l2.5 3v15a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V11L13 8z" /><path {...common} d="M10.5 16h11M10.5 21h11" /></>}
      {kind === 2 && <><rect {...common} x="9" y="7" width="14" height="20" rx="3" /><path {...common} d="M9 12h14M9 22h14M13 4.5h6" /></>}
      {kind === 3 && <><path {...common} d="M9 4h10l5 5v19H9z" /><path {...common} d="M19 4v5h5M12.5 15h8M12.5 19h8M12.5 23h5" /></>}
      {kind === 4 && <><path {...common} d="M12 4h8v4c0 2 4 3 4 8v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V16c0-5 4-6 4-8z" /><path {...common} d="M10 17h12" /></>}
      {kind === 5 && <><path {...common} d="M8 9h16M13 9V6h6v3M10 9l1.2 17h9.6L22 9" /><path {...common} d="M14 14v8M18 14v8" /></>}
    </svg>
  );
}

/** 특수 블록 표시: 줄 폭탄(양방향 화살표) · 구역 폭탄(폭탄) · 분리수거 폭탄(무지개 별) */
function SpecialMark({ special }: { special: Exclude<Special, null> }) {
  const p = { fill: "none", stroke: INK, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 32 32" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {special === "line-h" && <path {...p} d="M3 16h26M7 12l-4 4 4 4M25 12l4 4-4 4" />}
      {special === "line-v" && <path {...p} d="M16 3v26M12 7l4-4 4 4M12 25l4 4 4-4" />}
      {special === "bomb" && <><circle cx="15" cy="18" r="8" fill={INK} /><path {...p} d="M19 11l3-4M22 5l1.5 2.5M24.5 7l2.5-.5" /></>}
      {special === "color" && (
        <>
          <defs>
            <linearGradient id="pz-rainbow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff7a7a" /><stop offset=".35" stopColor="#ffd25e" />
              <stop offset=".65" stopColor="#6fd6a0" /><stop offset="1" stopColor="#6aa7ff" />
            </linearGradient>
          </defs>
          <path d="M16 3l3.6 8.2 8.9.9-6.7 5.9 2 8.8L16 22.2 8.2 26.8l2-8.8-6.7-5.9 8.9-.9z" fill="url(#pz-rainbow)" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/** 음식물이 묻은 모습: 1겹은 얼룩 몇 점, 2겹(찌든 때)은 더 크고 진한 얼룩 + 말라붙은 금. 색뿐 아니라 모양으로도 구분된다 */
function Grime({ level }: { level: 1 | 2 }) {
  const c = level === 2 ? "#6b4a2b" : "#a9743f";
  return (
    <svg viewBox="0 0 32 32" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <g fill={c} opacity={level === 2 ? 0.92 : 0.78}>
        <path d="M4 9c1-4 6-5 8-2 2 2 1 6-2 7-3 1-7-1-6-5z" />
        <path d="M21 20c2-3 7-3 8 0 1 3-1 6-4 6s-5-3-4-6z" />
        <circle cx="25" cy="8" r="2.2" /><circle cx="9" cy="25" r="1.8" /><circle cx="17" cy="14" r="1.4" />
        {level === 2 && <><path d="M12 19c2-2 6-1 6 2s-3 5-6 3-2-4 0-5z" /><circle cx="27" cy="14" r="2" /><circle cx="5" cy="17" r="1.6" /></>}
      </g>
      {level === 2 && <path d="M3 29l6-5M27 3l-4 6" stroke="#3f2a16" strokeWidth="1.6" strokeLinecap="round" fill="none" />}
    </svg>
  );
}

export function TileFace({ kind, special, dirt = 0 }: { kind: number; special: Special; dirt?: number }) {
  if (special === "color") {
    return <span className="relative flex h-full w-full items-center justify-center rounded-[14px] bg-white shadow-soft ring-2 ring-[#ffd25e]"><SpecialMark special="color" /></span>;
  }
  return (
    <span className={`relative flex h-full w-full items-center justify-center rounded-[14px] shadow-soft ${special ? "ring-2 ring-white" : ""}`} style={{ background: KIND_BG[kind] }}>
      <span className={special ? "opacity-40" : ""}><KindGlyph kind={kind} /></span>
      {special && <SpecialMark special={special} />}
      {dirt > 0 && <Grime level={dirt >= 2 ? 2 : 1} />}
    </span>
  );
}
