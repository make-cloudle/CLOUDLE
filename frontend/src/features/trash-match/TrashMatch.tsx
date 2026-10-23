"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudMascot } from "@/entities/mascot/characters";
import { type DictKey, useT } from "@/shared/lib/i18n";
import { IconPause, IconPlay } from "@/shared/ui/icons";
import { Button, buttonClass, Card, cx, Overline } from "@/shared/ui/primitives";
import {
  type Board, type Cell, COLS, createBoard, type Ctx, MAX_TIME, resolveMove, ROWS, type Special, START_TIME, type Step,
} from "./engine";
import { KIND_KEYS, TileFace } from "./pieces";

type TileView = { id: number; kind: number; special: Special; r: number; c: number; clearing?: boolean };

const BEST_KEY = "cloudle-pz-best";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const raf2 = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const flatten = (b: Board): TileView[] =>
  b.flatMap((row, r) => row.map((t, c) => ({ id: t!.id, kind: t!.kind, special: t!.special, r, c })));
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const writeBest = (n: number) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* 저장 못 해도 게임은 계속 */ } };
const DIRS: Record<string, Cell> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** 분리배출 퍼즐: 같은 쓰레기 3개 이상을 맞춰 분리수거. 콤보 배수 · 특수 블록 · 시간 회복. */
export function TrashMatch() {
  const t = useT();
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [tiles, setTiles] = useState<TileView[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [time, setTime] = useState(START_TIME);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [focus, setFocus] = useState<Cell>([0, 0]);
  const [combo, setCombo] = useState<{ chain: number; mult: number; key: number } | null>(null);
  const [gain, setGain] = useState<{ text: string; key: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [newBest, setNewBest] = useState(false);
  const [paused, setPaused] = useState(false);

  const ctx = useRef<Ctx>({ rng: Math.random, nextId: 1 });
  const board = useRef<Board>([]);
  const busy = useRef(false);
  const alive = useRef(true);
  const timeLeft = useRef(START_TIME);
  const scoreRef = useRef(0);
  const phaseRef = useRef<"ready" | "playing" | "over">("ready");
  const pausedRef = useRef(false);
  const drag = useRef<{ r: number; c: number; x: number; y: number } | null>(null);
  const boardEl = useRef<HTMLDivElement>(null);
  const bannerKey = useRef(0);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const finish = useCallback(() => {
    phaseRef.current = "over";
    pausedRef.current = false;
    setPaused(false);
    setPhase("over");
    setSelected(null);
    if (scoreRef.current > readBest()) { writeBest(scoreRef.current); setBest(scoreRef.current); setNewBest(true); }
  }, []);

  /** 시간은 터지는 동안에는 멈추고, 입력을 기다리는 동안에만 줄어든다 */
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      if (busy.current || pausedRef.current) return;
      timeLeft.current = Math.max(0, timeLeft.current - 0.1);
      setTime(timeLeft.current);
      if (timeLeft.current <= 0) finish();
    }, 100);
    return () => clearInterval(id);
  }, [phase, finish]);

  const start = async () => {
    ctx.current = { rng: Math.random, nextId: 1 };
    board.current = createBoard(ctx.current);
    timeLeft.current = START_TIME; scoreRef.current = 0; phaseRef.current = "playing";
    pausedRef.current = false; setPaused(false);
    busy.current = true;
    setScore(0); setTime(START_TIME); setSelected(null); setCombo(null); setNotice(""); setNewBest(false);
    setPhase("playing");
    const final = flatten(board.current);
    setTiles(final.map((x) => ({ ...x, r: x.r - ROWS })));
    await raf2();
    setTiles(final);
    await wait(450);
    busy.current = false;
  };

  const showGain = (text: string) => { bannerKey.current++; setGain({ text, key: bannerKey.current }); };

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
    if (!res) { exchange(); await wait(180); busy.current = false; return; } // 안 터지면 제자리로

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
      await wait(260);
      scoreRef.current += step.points;
      setScore(scoreRef.current);
      timeLeft.current = Math.min(MAX_TIME, timeLeft.current + step.bonusTime);
      setTime(timeLeft.current);
      showGain(`+${step.points}  ⏱ +${step.bonusTime.toFixed(1)}s`);
      await applyAfter(step);
    }
    board.current = res.final;
    setTimeout(() => alive.current && setCombo(null), 700);
    busy.current = false;
    if (timeLeft.current <= 0) finish();
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
          <Overline>Sorting Puzzle · Match 3</Overline>
          <h1 className="mt-1 text-[32px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[44px]">{t("pz_title")}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">{t("pz_desc")}</p>
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
            <div className="rounded-[20px] bg-surface p-3 shadow-soft">
              <p className="text-[11px] font-semibold text-ink-3">{t("pz_best")}</p>
              <p className="text-[26px] leading-none font-extrabold tabular-nums">{best.toLocaleString()}</p>
            </div>
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
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={MAX_TIME} aria-valuenow={Math.round(time)} aria-label={t("pz_time")}>
              <div className={cx("h-full rounded-full transition-[width] duration-100 ease-linear", low ? "bg-warn" : "bg-sky")} style={{ width: `${(time / MAX_TIME) * 100}%` }} />
            </div>
            {gain && <span key={gain.key} className="anim-pop pointer-events-none absolute -top-3 right-3 rounded-full bg-mint px-2.5 py-0.5 text-[12px] font-bold text-mint-deep shadow-soft dark:bg-mint/80 dark:text-ink">{gain.text}</span>}
          </div>

          {/* 보드 */}
          <div className="relative mx-auto aspect-square w-full max-w-[520px] rounded-[24px] bg-sky-soft p-1.5 shadow-soft">
            <div ref={boardEl} role="group" aria-label={t("pz_title")} className="relative h-full w-full touch-none overflow-hidden rounded-[18px] select-none">
              {tiles.map((x) => {
                const sel = !!selected && selected[0] === x.r && selected[1] === x.c;
                return (
                  <button key={x.id} type="button" data-cell={`${x.r}-${x.c}`}
                    tabIndex={focus[0] === x.r && focus[1] === x.c ? 0 : -1}
                    aria-label={`${t(KIND_KEYS[Math.max(x.kind, 0)] as DictKey)}${x.special ? " ★" : ""} ${x.r + 1}-${x.c + 1}`} aria-pressed={sel}
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
                      <TileFace kind={x.kind} special={x.special} />
                    </span>
                  </button>
                );
              })}

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
                  {phase === "over" && (
                    <>
                      <p className="text-[22px] font-extrabold">{t("pz_over")}</p>
                      <p className="text-[40px] leading-none font-extrabold tabular-nums">{score.toLocaleString()}</p>
                      {newBest && <p className="text-[13px] font-bold text-mint-deep">★ {t("pz_new_best")}</p>}
                    </>
                  )}
                  {phase === "ready" && <p className="max-w-[16rem] text-[14px] leading-relaxed text-ink-2">{t("pz_swap_hint")}</p>}
                  <Button variant="primary" size="lg" onClick={start}>{phase === "over" ? t("pz_again") : t("pz_start")}</Button>
                  {phase === "over" && <Link href="/bin" className={buttonClass("ghost", "sm")}>{t("pz_go_lab")}</Link>}
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
              {KIND_KEYS.map((k, i) => (
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
            <p className="mt-4 rounded-2xl bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-ink-2">{t("pz_combo_rule")}</p>
          </Card>
          <p className="text-[12px] leading-relaxed text-ink-3">{t("pz_note")}</p>
        </aside>
      </div>
    </div>
  );
}
