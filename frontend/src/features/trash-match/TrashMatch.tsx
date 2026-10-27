"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudMascot } from "@/entities/mascot/characters";
import { type DictKey, fill, useT } from "@/shared/lib/i18n";
import { IconPause, IconPlay } from "@/shared/ui/icons";
import { Button, buttonClass, Card, cx, Overline } from "@/shared/ui/primitives";
import {
  type Board, type Cell, COLS, createBoard, type Ctx, MAX_TIME, resolveMove, ROWS, type Special, START_TIME, type Step,
} from "./engine";
import { KIND_KEYS, TileFace } from "./pieces";
import { emptyProgress, finalScore, goalLines, isCleared, penaltyFor, type Progress, type Stage, starsFor } from "./stages";

type TileView = { id: number; kind: number; special: Special; dirt: number; r: number; c: number; clearing?: boolean };

const BEST_KEY = "cloudle-pz-best";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const raf2 = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const flatten = (b: Board): TileView[] =>
  b.flatMap((row, r) => row.map((t, c) => ({ id: t!.id, kind: t!.kind, special: t!.special, dirt: t!.dirt ?? 0, r, c })));
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const writeBest = (n: number) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* 저장 못 해도 게임은 계속 */ } };
const DIRS: Record<string, Cell> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

type Result = { cleared: boolean; stars: number; bonus: number; final: number };
type Props = {
  /** 없으면 일반 모드(기존 방식: 60초, 끝없이 점수 도전). 있으면 트레일의 한 스테이지 */
  stage?: Stage;
  onBack?: () => void;
  onNext?: () => void;
  /** 스테이지를 깼을 때 받은 별 */
  onCleared?: (stars: number) => void;
};

/** 분리배출 퍼즐: 같은 쓰레기 3개 이상을 맞춰 분리수거. 콤보 배수 · 특수 블록 · 시간 회복 · (트레일) 오염 씻기·목표·벌점. */
export function TrashMatch({ stage, onBack, onNext, onCleared }: Props = {}) {
  const t = useT();
  const T0 = stage?.time ?? START_TIME;
  const TMAX = stage?.maxTime ?? MAX_TIME;
  const kindCount = stage?.kinds ?? KIND_KEYS.length;
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [tiles, setTiles] = useState<TileView[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [time, setTime] = useState(T0);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [focus, setFocus] = useState<Cell>([0, 0]);
  const [combo, setCombo] = useState<{ chain: number; mult: number; key: number } | null>(null);
  const [gain, setGain] = useState<{ text: string; key: number; bad?: boolean } | null>(null);
  const [prog, setProg] = useState<Progress>(emptyProgress);
  const [result, setResult] = useState<Result | null>(null);
  const [washFx, setWashFx] = useState<{ key: number; r: number; c: number }[]>([]);
  const [notice, setNotice] = useState("");
  const [newBest, setNewBest] = useState(false);
  const [paused, setPaused] = useState(false);

  const ctx = useRef<Ctx>({ rng: Math.random, nextId: 1 });
  const board = useRef<Board>([]);
  const busy = useRef(false);
  const alive = useRef(true);
  const timeLeft = useRef(T0);
  const progRef = useRef<Progress>(emptyProgress());
  const cleared = useRef(onCleared);
  useEffect(() => { cleared.current = onCleared; });
  const scoreRef = useRef(0);
  const phaseRef = useRef<"ready" | "playing" | "over">("ready");
  const pausedRef = useRef(false);
  const drag = useRef<{ r: number; c: number; x: number; y: number } | null>(null);
  const boardEl = useRef<HTMLDivElement>(null);
  const bannerKey = useRef(0);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const finish = useCallback((win = false) => {
    phaseRef.current = "over";
    pausedRef.current = false;
    setPaused(false);
    setPhase("over");
    setSelected(null);
    if (stage) {
      // 트레일: 목표를 채웠으면 남은 시간이 보너스 점수, 최종 점수로 별을 정한다
      const final = win ? finalScore(stage, scoreRef.current, timeLeft.current) : scoreRef.current;
      const stars = win ? starsFor(stage, final) : 0;
      setResult({ cleared: win, stars, bonus: final - scoreRef.current, final });
      if (win) cleared.current?.(stars);
    } else if (scoreRef.current > readBest()) { writeBest(scoreRef.current); setBest(scoreRef.current); setNewBest(true); }
  }, [stage]);

  /** 시간은 터지는 동안에는 멈추고, 입력을 기다리는 동안에만 줄어든다 */
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      if (busy.current || pausedRef.current) return;
      timeLeft.current = Math.max(0, timeLeft.current - 0.1);
      setTime(timeLeft.current);
      if (timeLeft.current <= 0) finish(false);
    }, 100);
    return () => clearInterval(id);
  }, [phase, finish]);

  const start = async () => {
    ctx.current = stage
      ? { rng: Math.random, nextId: 1, kinds: stage.kinds, dirtRate: stage.dirtRate, dirtMax: stage.dirtMax }
      : { rng: Math.random, nextId: 1 };
    board.current = createBoard(ctx.current);
    timeLeft.current = T0; scoreRef.current = 0; phaseRef.current = "playing";
    progRef.current = emptyProgress(); setProg(emptyProgress()); setResult(null); setWashFx([]); setGain(null);
    pausedRef.current = false; setPaused(false);
    busy.current = true;
    setScore(0); setTime(T0); setSelected(null); setCombo(null); setNotice(""); setNewBest(false);
    setPhase("playing");
    const final = flatten(board.current);
    setTiles(final.map((x) => ({ ...x, r: x.r - ROWS })));
    await raf2();
    setTiles(final);
    await wait(450);
    busy.current = false;
  };

  const showGain = (text: string, bad = false) => { bannerKey.current++; setGain({ text, key: bannerKey.current, bad }); };
  const addScore = (n: number) => {
    scoreRef.current = Math.max(0, scoreRef.current + n);
    setScore(scoreRef.current);
    progRef.current = { ...progRef.current, score: scoreRef.current };
    setProg(progRef.current);
  };

  const applyAfter = async (step: Step) => {
    setTiles((prev) => {
      const ids = new Set(prev.map((x) => x.id));
      return flatten(step.after).map((x) => (ids.has(x.id) ? x : { ...x, r: x.r - ROWS }));
    });
    await raf2();
    if (!alive.current) return;
    setTiles(flatten(step.after));
    await wait(340);
  };

  const swap = async (a: Cell, b: Cell) => {
    if (busy.current || pausedRef.current || phaseRef.current !== "playing") return;
    busy.current = true;
    setSelected(null);
    const res = resolveMove(ctx.current, board.current, a, b);
    const exchange = () => setTiles((ts) => ts.map((x) =>
      x.r === a[0] && x.c === a[1] ? { ...x, r: b[0], c: b[1] } : x.r === b[0] && x.c === b[1] ? { ...x, r: a[0], c: a[1] } : x));
    exchange();
    await wait(180);
    if (!res) { // 안 터지면 제자리로 (트레일에서는 오분리 벌점)
      exchange(); await wait(180);
      if (stage) {
        const pen = penaltyFor(stage, false, 0);
        if (pen.points || pen.seconds) {
          addScore(-pen.points);
          timeLeft.current = Math.max(0, timeLeft.current - pen.seconds); setTime(timeLeft.current);
          showGain(`−${pen.points}${pen.seconds ? `  ⏱ −${pen.seconds}s` : ""}`, true);
          if (timeLeft.current <= 0) { busy.current = false; return finish(false); }
        }
      }
      busy.current = false; return;
    }

    for (const step of res.steps) {
      if (!alive.current) return;
      if (step.shuffle) {
        setNotice(t("pz_shuffle"));
        setTiles((ts) => ts.map((x) => ({ ...x, clearing: true })));
        await wait(300);
        await applyAfter(step);
        setNotice("");
        continue;
      }
      const gone = new Set(step.cleared.map(([r, c]) => r * COLS + c));
      setTiles((ts) => ts.map((x) => (gone.has(x.r * COLS + x.c) ? { ...x, clearing: true } : x)));
      if (step.chain >= 2) { bannerKey.current++; setCombo({ chain: step.chain, mult: step.multiplier, key: bannerKey.current }); }
      if (step.washed.length) {
        bannerKey.current++;
        const fx = step.washed.map((w, i) => ({ key: bannerKey.current * 100 + i, r: w.r, c: w.c }));
        setWashFx((p) => [...p, ...fx]);
        setTimeout(() => alive.current && setWashFx((p) => p.filter((x) => !fx.some((f) => f.key === x.key))), 900);
      }
      await wait(260);
      progRef.current = {
        ...progRef.current,
        washes: progRef.current.washes + step.washed.length,
        collected: progRef.current.collected + (stage?.goal.collect ? step.kindsCleared[stage.goal.collect.kind] : 0),
      };
      addScore(step.points);
      timeLeft.current = Math.min(TMAX, timeLeft.current + step.bonusTime);
      setTime(timeLeft.current);
      showGain(`+${step.points}  ⏱ +${step.bonusTime.toFixed(1)}s`);
      await applyAfter(step);
    }
    board.current = res.final;
    setTimeout(() => alive.current && setCombo(null), 700);
    // 오염을 방치하면 한 번 움직일 때마다 벌점 (남은 오염 칸 수 × 레벨별 점수)
    if (stage) {
      const pen = penaltyFor(stage, true, res.dirtLeft);
      if (pen.points) { addScore(-pen.points); showGain(`−${pen.points} (${t("pz_dirty")} ${Math.min(res.dirtLeft, 8)})`, true); }
    }
    busy.current = false;
    if (stage && isCleared(stage, progRef.current)) return finish(true);
    if (timeLeft.current <= 0) finish(false);
  };

  const setPause = (on: boolean) => {
    if (phaseRef.current !== "playing" || pausedRef.current === on) return;
    pausedRef.current = on;
    setPaused(on);
    if (on) { setSelected(null); drag.current = null; }
  };

  // 탭을 옮기거나 창을 가리면 자동으로 일시정지, P·Esc 키로 일시정지/계속
  useEffect(() => {
    const hidden = () => { if (document.hidden) setPause(true); };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key.toLowerCase() !== "p") return;
      if (phaseRef.current !== "playing" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      setPause(!pausedRef.current);
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("visibilitychange", hidden); window.removeEventListener("keydown", key); };
  }, []);

  const tap = (r: number, c: number) => {
    if (busy.current || pausedRef.current || phaseRef.current !== "playing") return;
    setFocus([r, c]);
    if (!selected) return setSelected([r, c]);
    if (selected[0] === r && selected[1] === c) return setSelected(null);
    if (Math.abs(selected[0] - r) + Math.abs(selected[1] - c) === 1) return void swap(selected, [r, c]);
    setSelected([r, c]);
  };
  const swipe = (r: number, c: number, dr: number, dc: number) => {
    const r2 = r + dr, c2 = c + dc;
    if (r2 >= 0 && r2 < ROWS && c2 >= 0 && c2 < COLS) void swap([r, c], [r2, c2]);
  };

  // 손가락·마우스를 떼는 순간 탭인지 밀기인지 판단 (화면 밖에서 떼도 처리)
  const up = useRef((e: PointerEvent) => { void e; });
  useEffect(() => {
    up.current = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return tap(d.r, d.c);
      if (Math.abs(dx) > Math.abs(dy)) swipe(d.r, d.c, 0, dx > 0 ? 1 : -1);
      else swipe(d.r, d.c, dy > 0 ? 1 : -1, 0);
    };
  });
  useEffect(() => {
    const h = (e: PointerEvent) => up.current(e);
    window.addEventListener("pointerup", h);
    window.addEventListener("pointercancel", () => { drag.current = null; });
    return () => window.removeEventListener("pointerup", h);
  }, []);

  const onKey = (e: React.KeyboardEvent, r: number, c: number) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); return tap(r, c); }
    const dir = DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    if (selected) return swipe(selected[0], selected[1], dir[0], dir[1]);
    const nr = Math.min(ROWS - 1, Math.max(0, r + dir[0])), nc = Math.min(COLS - 1, Math.max(0, c + dir[1]));
    setFocus([nr, nc]);
    boardEl.current?.querySelector<HTMLElement>(`[data-cell="${nr}-${nc}"]`)?.focus();
  };

  const low = time <= 10;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          {stage && onBack && (
            <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-ink">← {t("pz_to_trail")}</button>
          )}
          <Overline>{stage ? `${t(`pz_lv_${stage.level}` as DictKey)} · ${fill(t("pz_stage"), { n: stage.no })}` : "Sorting Puzzle · Match 3"}</Overline>
          <h1 className="mt-1 text-[32px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[44px]">{stage ? fill(t("pz_stage"), { n: stage.no }) : t("pz_title")}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">{stage ? t("pz_stage_desc") : t("pz_desc")}</p>
        </div>
        <CloudMascot mood={phase === "over" ? "sleepy" : combo ? "happy" : "curious"} className="hidden h-20 w-24 shrink-0 sm:block" />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,520px)_1fr] lg:items-start">
        <section aria-label={t("pz_title")} className="flex flex-col gap-3">
          {/* 점수 · 시간 */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div className="rounded-[20px] bg-surface p-3 shadow-soft">
              <p className="text-[11px] font-semibold text-ink-3">{t("pz_score")}</p>
              <p className="text-[26px] leading-none font-extrabold tabular-nums" aria-live="polite">{score.toLocaleString()}</p>
            </div>
            {stage ? (
              <div className="rounded-[20px] bg-surface p-3 shadow-soft">
                <p className="text-[11px] font-semibold text-ink-3">{t("pz_goals")}</p>
                <p className="text-[26px] leading-none font-extrabold tabular-nums">{stage.goal.score.toLocaleString()}<span className="ml-1 text-[12px] font-semibold text-ink-3">{t("pz_pts")}</span></p>
              </div>
            ) : (
              <div className="rounded-[20px] bg-surface p-3 shadow-soft">
                <p className="text-[11px] font-semibold text-ink-3">{t("pz_best")}</p>
                <p className="text-[26px] leading-none font-extrabold tabular-nums">{best.toLocaleString()}</p>
              </div>
            )}
          </div>
          <div className="relative rounded-[20px] bg-surface p-3 shadow-soft">
            <div className="flex items-baseline justify-between text-[12px] font-semibold text-ink-2">
              <span>{t("pz_time")}</span>
              <span className="flex items-center gap-2">
                <span className={cx("text-[15px] tabular-nums", low && "text-warn")}>{time.toFixed(1)}s</span>
                <button type="button" onClick={() => setPause(!paused)} disabled={phase !== "playing"} aria-pressed={paused}
                  aria-label={paused ? t("pz_resume") : t("pz_pause")} title={`${paused ? t("pz_resume") : t("pz_pause")} (P)`}
                  className="flex h-8 items-center gap-1 rounded-full bg-surface-2 px-3 text-[12px] font-semibold text-ink-2 hover:text-ink disabled:opacity-40">
                  {paused ? <IconPlay size={14} /> : <IconPause size={14} />}{paused ? t("pz_resume") : t("pz_pause")}
                </button>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={TMAX} aria-valuenow={Math.round(time)} aria-label={t("pz_time")}>
              <div className={cx("h-full rounded-full transition-[width] duration-100 ease-linear", low ? "bg-warn" : "bg-sky")} style={{ width: `${(time / TMAX) * 100}%` }} />
            </div>
            {gain && <span key={gain.key} className={cx("anim-pop pointer-events-none absolute -top-3 right-3 rounded-full px-2.5 py-0.5 text-[12px] font-bold shadow-soft",
              gain.bad ? "bg-warn-soft text-danger" : "bg-mint text-mint-deep dark:bg-mint/80 dark:text-ink")}>{gain.text}</span>}
          </div>

          {/* 트레일: 목표 진행 + 벌점 규칙 */}
          {stage && (
            <div className="rounded-[20px] bg-surface p-3 shadow-soft">
              <ul className="flex flex-col gap-2">
                {goalLines(stage, prog).map((g) => {
                  const done = g.have >= g.need;
                  const label = g.id === "score" ? fill(t("pz_goal_score"), { have: Math.min(g.have, g.need).toLocaleString(), need: g.need.toLocaleString() })
                    : g.id === "wash" ? fill(t("pz_goal_wash"), { have: Math.min(g.have, g.need), need: g.need })
                    : fill(t("pz_goal_collect"), { kind: t(KIND_KEYS[g.kind ?? 0] as DictKey), have: Math.min(g.have, g.need), need: g.need });
                  return (
                    <li key={g.id} className="flex items-center gap-2 text-[12px] font-semibold text-ink-2">
                      {g.id === "collect" && <span className="block h-6 w-6 shrink-0"><TileFace kind={g.kind ?? 0} special={null} /></span>}
                      {g.id === "wash" && <span className="block h-6 w-6 shrink-0"><TileFace kind={1} special={null} dirt={1} /></span>}
                      <span className="w-40 shrink-0 sm:w-48">{done ? "✓ " : ""}{label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={g.need} aria-valuenow={Math.min(g.have, g.need)} aria-label={label}>
                        <span className={cx("block h-full rounded-full transition-[width] duration-200", done ? "bg-mint-deep" : "bg-sky")} style={{ width: `${Math.min(100, (g.have / g.need) * 100)}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
                {stage.missPenalty || stage.leak
                  ? fill(t("pz_penalty_rule"), { miss: stage.missPenalty, leak: stage.leak }) + (stage.missTime ? ` · ${fill(t("pz_penalty_time"), { s: stage.missTime })}` : "")
                  : t("pz_penalty_none")}
              </p>
            </div>
          )}

          {/* 보드 */}
          <div className="relative mx-auto aspect-square w-full max-w-[520px] rounded-[24px] bg-sky-soft p-1.5 shadow-soft">
            <div ref={boardEl} role="group" aria-label={t("pz_title")} className="relative h-full w-full touch-none overflow-hidden rounded-[18px] select-none">
              {tiles.map((x) => {
                const sel = !!selected && selected[0] === x.r && selected[1] === x.c;
                return (
                  <button key={x.id} type="button" data-cell={`${x.r}-${x.c}`}
                    tabIndex={focus[0] === x.r && focus[1] === x.c ? 0 : -1}
                    aria-label={`${t(KIND_KEYS[Math.max(x.kind, 0)] as DictKey)}${x.special ? " ★" : ""}${x.dirt ? ` (${t("pz_dirty")}${x.dirt >= 2 ? " ×2" : ""})` : ""} ${x.r + 1}-${x.c + 1}`} aria-pressed={sel}
                    onPointerDown={(e) => { drag.current = { r: x.r, c: x.c, x: e.clientX, y: e.clientY }; }}
                    onKeyDown={(e) => onKey(e, x.r, x.c)}
                    className="absolute p-[3px] outline-none focus-visible:z-10"
                    style={{
                      left: `${(x.c * 100) / COLS}%`, top: `${(x.r * 100) / ROWS}%`, width: `${100 / COLS}%`, height: `${100 / ROWS}%`,
                      transition: "top .32s cubic-bezier(.3,1.25,.5,1), left .18s ease, transform .26s ease, opacity .26s ease",
                      transform: x.clearing ? "scale(.2) rotate(25deg)" : sel ? "scale(1.08)" : "none",
                      opacity: x.clearing ? 0 : 1,
                      zIndex: sel ? 5 : x.special ? 2 : 1,
                    }}>
                    <span className={cx("block h-full w-full rounded-[14px]", sel && "ring-[3px] ring-[#25354d] dark:ring-white", focus[0] === x.r && focus[1] === x.c && "focus-within:ring-2")}>
                      <TileFace kind={x.kind} special={x.special} dirt={x.dirt} />
                    </span>
                  </button>
                );
              })}

              {washFx.map((w) => (
                <span key={w.key} className="anim-pop pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky px-2 py-0.5 text-[11px] font-extrabold text-[#0f2a44] shadow-float"
                  style={{ left: `${((w.c + 0.5) * 100) / COLS}%`, top: `${((w.r + 0.5) * 100) / ROWS}%` }}>{t("pz_wash")}</span>
              ))}
              {combo && combo.mult >= 2 && (
                <div key={combo.key} className="anim-pop pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
                  <span className="rounded-full bg-accent px-4 py-1.5 text-[18px] font-extrabold text-accent-ink shadow-float">
                    {t("pz_combo")} {combo.chain} · ×{combo.mult}
                  </span>
                </div>
              )}
              {notice && <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center"><span className="rounded-full bg-surface px-3 py-1 text-[12px] font-semibold shadow-soft">{notice}</span></div>}

              {phase === "playing" && paused && (
                <div role="dialog" aria-label={t("pz_paused")} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
                  <p className="text-[22px] font-extrabold">{t("pz_paused")}</p>
                  <p className="text-[13px] text-ink-3">{t("pz_paused_hint")}</p>
                  <Button variant="primary" size="lg" autoFocus onClick={() => setPause(false)}><IconPlay size={16} /> {t("pz_resume")}</Button>
                  <Button variant="ghost" size="sm" onClick={start}>{t("pz_restart")}</Button>
                </div>
              )}
              {phase !== "playing" && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface/90 p-6 text-center backdrop-blur-sm">
                  {phase === "over" && !stage && (
                    <>
                      <p className="text-[22px] font-extrabold">{t("pz_over")}</p>
                      <p className="text-[40px] leading-none font-extrabold tabular-nums">{score.toLocaleString()}</p>
                      {newBest && <p className="text-[13px] font-bold text-mint-deep">★ {t("pz_new_best")}</p>}
                    </>
                  )}
                  {phase === "over" && stage && result && (
                    <>
                      <p className="text-[22px] font-extrabold">{result.cleared ? t("pz_clear") : t("pz_fail")}</p>
                      {result.cleared && <Stars n={result.stars} big />}
                      <p className="text-[40px] leading-none font-extrabold tabular-nums">{result.final.toLocaleString()}</p>
                      {result.cleared
                        ? <p className="text-[12px] text-ink-3">{fill(t("pz_bonus"), { n: result.bonus.toLocaleString() })}</p>
                        : <p className="max-w-[16rem] text-[12px] text-ink-3">{t("pz_fail_hint")}</p>}
                    </>
                  )}
                  {phase === "ready" && <p className="max-w-[16rem] text-[14px] leading-relaxed text-ink-2">{stage ? t("pz_stage_ready") : t("pz_swap_hint")}</p>}
                  {phase === "over" && stage && result?.cleared && onNext && <Button variant="primary" size="lg" onClick={onNext}>{t("pz_next")}</Button>}
                  <Button variant={phase === "over" && stage && result?.cleared && onNext ? "secondary" : "primary"} size={phase === "over" && stage && result?.cleared && onNext ? "md" : "lg"} onClick={start}>
                    {phase === "over" ? (stage ? t("pz_retry") : t("pz_again")) : t("pz_start")}
                  </Button>
                  {phase === "over" && stage && onBack && <Button variant="ghost" size="sm" onClick={onBack}>{t("pz_to_trail")}</Button>}
                  {phase === "over" && !stage && <Link href="/bin" className={buttonClass("ghost", "sm")}>{t("pz_go_lab")}</Link>}
                </div>
              )}
            </div>
          </div>
          <p className="text-center text-[12px] text-ink-3">{t("pz_swap_hint")}</p>
        </section>

        {/* 설명 */}
        <aside className="flex flex-col gap-4">
          <Card>
            <h3 className="text-[15px] font-extrabold">{t("pz_howto")}</h3>
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
              {KIND_KEYS.slice(0, kindCount).map((k, i) => (
                <li key={k} className="flex flex-col items-center gap-1 text-center text-[11px] font-semibold text-ink-2">
                  <span className="block h-12 w-12"><TileFace kind={i} special={null} /></span>{t(k as DictKey)}
                </li>
              ))}
            </ul>
            <ul className="mt-4 flex flex-col gap-3">
              {([["line-h", "pz_sp_line"], ["bomb", "pz_sp_bomb"], ["color", "pz_sp_color"]] as const).map(([sp, key]) => (
                <li key={sp} className="flex items-start gap-3 text-[13px] leading-relaxed text-ink-2">
                  <span className="block h-11 w-11 shrink-0"><TileFace kind={sp === "color" ? -1 : 1} special={sp} /></span>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            {stage && stage.dirtRate > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {([1, ...(stage.dirtMax === 2 ? [2] : [])] as const).map((d) => (
                  <li key={d} className="flex items-start gap-3 text-[13px] leading-relaxed text-ink-2">
                    <span className="block h-11 w-11 shrink-0"><TileFace kind={1} special={null} dirt={d} /></span>
                    <span>{t(d === 1 ? "pz_dirt1" : "pz_dirt2")}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 rounded-2xl bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-ink-2">{t("pz_combo_rule")}</p>
          </Card>
          <p className="text-[12px] leading-relaxed text-ink-3">{t("pz_note")}</p>
        </aside>
      </div>
    </div>
  );
}

/** 별 1~3개 (색뿐 아니라 채움/윤곽으로 구분) */
export function Stars({ n, big = false }: { n: number; big?: boolean }) {
  const sz = big ? 34 : 14;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${n} / 3`}>
      {[1, 2, 3].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width={sz} height={sz} aria-hidden>
          <path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.5 6 20.9l1.3-6.7-5-4.7 6.8-.8z"
            fill={i <= n ? "#ffc83d" : "none"} stroke={i <= n ? "#b9851a" : "currentColor"} strokeWidth="1.8" strokeLinejoin="round" opacity={i <= n ? 1 : 0.35} />
        </svg>
      ))}
    </span>
  );
}
