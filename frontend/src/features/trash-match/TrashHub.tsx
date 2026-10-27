"use client";

import { useState, useSyncExternalStore } from "react";
import { type DictKey, fill, useT } from "@/shared/lib/i18n";
import { cx, Card, Overline } from "@/shared/ui/primitives";
import { clearedCount, emptyTrail, isUnlocked, readTrail, record, totalStars, type Trail, writeTrail } from "./progress";
import { getStage, LEVELS, type Level, STAGES_PER_LEVEL } from "./stages";
import { Stars, TrashMatch } from "./TrashMatch";

type Mode = "classic" | "trail";
const noop = () => () => {};

/** 모드 선택(일반 모드 = 기존 게임 그대로 · 트레일 = 스테이지 도전)과 트레일 지도. 진행은 이 브라우저에만 저장된다. */
export function TrashHub() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("classic");
  const [level, setLevel] = useState<Level>("easy");
  const [playing, setPlaying] = useState<number | null>(null); // 지금 하는 스테이지 번호
  const hydrated = useSyncExternalStore(noop, () => true, () => false); // 진행은 브라우저에만 있다 (서버 렌더와 어긋나지 않게)
  const [saved, setSaved] = useState<Trail | null>(null);
  const trail = saved ?? (hydrated ? readTrail() : emptyTrail());

  const saveStars = (lv: Level, no: number, stars: number) => {
    const next = record(trail, lv, no, stars);
    writeTrail(next);
    setSaved(next);
  };

  if (mode === "trail" && playing !== null) {
    const stage = getStage(level, playing);
    return (
      <TrashMatch
        key={`${level}-${playing}`}
        stage={stage}
        onBack={() => setPlaying(null)}
        onCleared={(stars) => saveStars(level, playing, stars)}
        onNext={playing < STAGES_PER_LEVEL ? () => setPlaying(playing + 1) : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label={t("pz_mode")} className="grid grid-cols-2 gap-2 rounded-[22px] bg-surface p-1.5 shadow-soft sm:max-w-md">
        {(["classic", "trail"] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)}
            className={cx("rounded-[16px] px-4 py-2.5 text-left transition-colors", mode === m ? "bg-accent text-accent-ink shadow-soft" : "text-ink-2 hover:bg-surface-2")}>
            <span className="block text-[15px] font-extrabold">{t(m === "classic" ? "pz_mode_classic" : "pz_mode_trail")}</span>
            <span className={cx("block text-[11px] leading-snug", mode === m ? "opacity-85" : "text-ink-3")}>{t(m === "classic" ? "pz_mode_classic_d" : "pz_mode_trail_d")}</span>
          </button>
        ))}
      </div>

      {mode === "classic" ? <TrashMatch /> : <TrailMap level={level} setLevel={setLevel} trail={trail} onPlay={setPlaying} />}
    </div>
  );
}

const LEVEL_TONE: Record<Level, { ring: string; dot: string; soft: string }> = {
  easy: { ring: "ring-mint-deep", dot: "bg-mint-deep", soft: "bg-mint" },
  normal: { ring: "ring-sky-deep", dot: "bg-sky-deep", soft: "bg-sky" },
  hard: { ring: "ring-danger", dot: "bg-danger", soft: "bg-warn-soft" },
};
/** 길이 구불구불하게: 노드의 가로 위치(%) */
const X = [22, 58, 78, 50, 24, 40, 74, 56, 26, 52];
const STEP = 96;

function TrailMap({ level, setLevel, trail, onPlay }: { level: Level; setLevel: (l: Level) => void; trail: Trail; onPlay: (no: number) => void }) {
  const t = useT();
  const done = clearedCount(trail, level);
  const tone = LEVEL_TONE[level];
  const height = STEP * STAGES_PER_LEVEL + 24;
  const pts = X.map((x, i) => [x, 56 + i * STEP] as const);
  // 부드럽게 이어지는 길
  const path = pts.map(([x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const my = (py + y) / 2;
    return `C ${px} ${my}, ${x} ${my}, ${x} ${y}`;
  }).join(" ");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
      <section aria-label={t("pz_mode_trail")} className="flex flex-col gap-4">
        <div>
          <Overline>Sorting Trail</Overline>
          <h1 className="mt-1 text-[32px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[40px]">{t("pz_mode_trail")}</h1>
          <p className="mt-2 text-[15px] text-ink-2">{t("pz_trail_desc")}</p>
        </div>

        <div role="tablist" aria-label={t("pz_level")} className="grid grid-cols-3 gap-2">
          {LEVELS.map((lv) => (
            <button key={lv} role="tab" type="button" aria-selected={level === lv} onClick={() => setLevel(lv)}
              className={cx("rounded-[18px] px-3 py-2.5 text-center shadow-soft ring-1 transition-colors", level === lv ? `bg-surface ring-2 ${LEVEL_TONE[lv].ring}` : "bg-surface ring-line hover:bg-surface-2")}>
              <span className="block text-[14px] font-extrabold">{t(`pz_lv_${lv}` as DictKey)}</span>
              <span className="block text-[11px] text-ink-3">{clearedCount(trail, lv)}/{STAGES_PER_LEVEL}</span>
            </button>
          ))}
        </div>

        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <span className={cx("h-2.5 w-2.5 rounded-full", tone.dot)} aria-hidden />
          {fill(t("pz_trail_progress"), { n: done, total: STAGES_PER_LEVEL })} · ★ {totalStars(trail)}
        </p>

        <div className="relative mx-auto w-full max-w-[420px] rounded-[28px] bg-sky-soft shadow-soft" style={{ height }}>
          <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d={path} fill="none" stroke="currentColor" className="text-ink-3/40" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 10" vectorEffect="non-scaling-stroke" />
          </svg>
          <ol className="contents">
            {pts.map(([x, y], i) => {
              const no = i + 1;
              const stars = trail[level][i];
              const open = isUnlocked(trail, level, no);
              return (
                <li key={no} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: y }}>
                  <button type="button" disabled={!open} onClick={() => onPlay(no)}
                    aria-label={`${fill(t("pz_stage"), { n: no })} ${open ? (stars ? `${stars}/3` : t("pz_open")) : t("pz_locked")}`}
                    className={cx("group relative flex h-[60px] w-[60px] flex-col items-center justify-center rounded-full text-[18px] font-extrabold shadow-float transition-transform",
                      open ? `${stars ? tone.soft : "bg-surface"} text-ink ring-4 ${tone.ring} hover:scale-105` : "bg-surface-2 text-ink-3 ring-2 ring-line")}>
                    {open ? no : <LockIcon />}
                    {no === STAGES_PER_LEVEL && open && <FlagIcon />}
                    {open && (
                      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2"><Stars n={stars} /></span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <Card>
          <h3 className="text-[15px] font-extrabold">{t(`pz_lv_${level}` as DictKey)} · {t("pz_level_rules")}</h3>
          <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
            <li>{t(`pz_lvd_${level}` as DictKey)}</li>
            <li>{t("pz_rule_clear")}</li>
            <li>{t("pz_rule_wash")}</li>
            <li>{t("pz_rule_penalty")}</li>
            <li>{t("pz_rule_stars")}</li>
          </ul>
        </Card>
        <p className="text-[12px] leading-relaxed text-ink-3">{t("pz_note")}</p>
      </aside>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className="absolute -top-2.5 -right-1 text-danger" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      <path d="M6 3v18" fill="none" strokeLinecap="round" /><path d="M6 4h11l-2.5 3.5L17 11H6z" />
    </svg>
  );
}
