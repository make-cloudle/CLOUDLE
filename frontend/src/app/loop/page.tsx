"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { PaperInput } from "@/components/loop/PaperInput";
import { ChatPanel } from "@/components/loop/ChatPanel";
import { ResultCard } from "@/components/loop/ResultCard";
import type { StageHandle } from "@/components/three/CrumpleStage";
import { IconCheck } from "@/components/ui/icons";
import { Alert, Button, Overline, cx } from "@/components/ui/primitives";
import { analyze, ApiError, type ProgressEvent } from "@/lib/api";
import { type DictKey, useT } from "@/lib/i18n";
import { moodFor, paperHasContent, type Phase, useLoop } from "@/lib/loop";
import { drawPaper } from "@/lib/paperTexture";
import { usePrefs } from "@/lib/prefs";

const CrumpleStage = dynamic(() => import("@/components/three/CrumpleStage"), { ssr: false });
const CloudCharacter = dynamic(() => import("@/components/three/CloudCharacter"), { ssr: false });

const STEPS: { key: DictKey; phases: Phase[] }[] = [
  { key: "step_write", phases: ["write"] },
  { key: "step_crumple", phases: ["crumple"] },
  { key: "step_toss", phases: ["ball", "dropped"] },
  { key: "step_analyze", phases: ["analyzing", "error"] },
  { key: "step_open", phases: ["ready", "opened"] },
];
const PROGRESS_STEPS = ["item", "extract", "collect", "select", "index", "retrieve", "generate_done"];

let webglCache: boolean | null = null;
function hasWebGL() {
  if (webglCache === null) {
    try {
      const c = document.createElement("canvas");
      webglCache = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webglCache = false;
    }
  }
  return webglCache;
}
const noopSubscribe = () => () => {};

function Steps({ phase }: { phase: Phase }) {
  const t = useT();
  const cur = STEPS.findIndex((s) => s.phases.includes(phase));
  return (
    <ol className="grid grid-cols-5 border-y border-line">
      {STEPS.map((s, i) => (
        <li key={s.key} aria-current={i === cur ? "step" : undefined}
          className={cx("flex flex-col gap-0.5 py-2.5 pr-2 text-left", i > 0 && "border-l border-line pl-3")}>
          <span className={cx("text-[11px] tabular-nums", i <= cur ? "text-accent" : "text-ink-3")}>{String(i + 1).padStart(2, "0")}</span>
          <span className={cx("truncate text-sm", i === cur ? "font-semibold text-ink" : i < cur ? "text-ink-2" : "text-ink-3")}>{t(s.key)}</span>
        </li>
      ))}
    </ol>
  );
}

function ProgressList({ events }: { events: ProgressEvent[] }) {
  const t = useT();
  const done = new Set(events.map((e) => e.step.replace(/_done$/, "")));
  const warnings = events.filter((e) => e.step === "warning");
  const current = PROGRESS_STEPS.find((s) => !done.has(s.replace(/_done$/, "")));
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1">
        {PROGRESS_STEPS.map((s) => {
          const ok = done.has(s.replace(/_done$/, ""));
          return (
            <li key={s} className={cx("flex items-center gap-2 text-sm", ok ? "text-ink" : s === current ? "text-ink-2" : "text-ink-3")}>
              {ok ? <IconCheck size={14} className="text-accent" />
                : s === current ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                : <span className="h-3 w-3 rounded-full border border-line-strong" />}
              {t(`s_${s}` as DictKey)}
            </li>
          );
        })}
      </ul>
      {warnings.map((w, i) => <Alert key={i} tone="warn">{w.message}</Alert>)}
    </div>
  );
}

export default function LoopPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const theme = usePrefs((s) => s.theme);
  const { paper, phase, setPhase, progress, pushProgress, result, setResult, error, setError, resetFlow, resetAll, setPaper } = useLoop();
  const stage = useRef<StageHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [crumple, setCrumple] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const webgl = useSyncExternalStore(noopSubscribe, hasWebGL, () => true);
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const can = paperHasContent(paper);

  useEffect(() => () => abortRef.current?.abort(), []);

  // 종이 내용 → 캔버스 텍스처 (3D 종이에 그대로 보인다)
  const canvas = useMemo(() => (typeof document === "undefined" ? null : document.createElement("canvas")), []);
  const texture = useMemo(() => {
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [canvas]);
  useEffect(() => {
    if (!canvas || !texture) return;
    let cancelled = false;
    Promise.all(paper.photos.map((p) => new Promise<HTMLImageElement | null>((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = p.url;
    }))).then((imgs) => {
      if (cancelled) return;
      drawPaper(canvas, paper, {
        product: t("product"), condition: t("condition"), region: t("region"), purpose: t("purpose"),
        purposeValue: t(`p_${paper.purpose}` as DictKey),
      }, theme === "dark", imgs.filter((x): x is HTMLImageElement => !!x));
      texture.needsUpdate = true;
    });
    return () => { cancelled = true; };
  }, [canvas, texture, paper, lang, theme, t]);

  const run = async () => {
    abortRef.current?.abort(); // 분석 중 새 요청이 오면 이전 요청을 취소
    const ac = new AbortController();
    abortRef.current = ac;
    useLoop.setState({ progress: [], error: null, result: null });
    setPhase("analyzing");
    try {
      const r = await analyze({
        product_name: paper.product_name, item_id: paper.item_id, category: paper.category,
        condition: paper.condition, region: paper.region, purpose: paper.purpose, note: paper.note,
        lang, image_labels: paper.photos.flatMap((p) => p.labels),
      }, pushProgress, ac.signal);
      setResult(r);
      setPhase("ready");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const err = e instanceof ApiError ? e : new ApiError("internal", "");
      setError({ code: err.code, message: err.message, extra: err.extra });
      setPhase("error");
    }
  };

  const restart = () => {
    abortRef.current?.abort();
    resetAll();
    setCrumple(0);
  };

  // 3D가 없으면 같은 흐름을 버튼으로 진행한다
  const doCrumple = () => (webgl ? stage.current?.autoCrumple() : can ? setPhase("ball") : setBlocked(true));
  const doToss = () => (webgl ? stage.current?.toss() : setPhase("dropped"));
  const doOpen = () => (webgl ? stage.current?.openCloud() : setPhase("opened"));
  const doUnfold = () => { stage.current?.unfold(); setPhase("write"); };

  const mood = moodFor(phase, progress);
  const errorText = error && (error.code === "rate_limited" ? t("rate_limited")
    : error.code === "network" || error.code === "internal" || !error.message ? t("error_generic") : error.message);
  const suggestions = (error?.extra?.suggestions ?? []) as { item_id: string; names: Record<string, string> }[];

  return (
    <div className="flex flex-col gap-6 pt-8">
      <header>
        <Overline>02 · Cloud Loop</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{t("loop_title")}</h1>
        <p className="mt-2 max-w-xl text-ink-2">{t("loop_desc")}</p>
      </header>

      <Steps phase={phase} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section aria-label="paper" className="flex flex-col gap-3 lg:col-span-5">
          <PaperInput disabled={!["write", "crumple"].includes(phase)} />
          {blocked && !can && <Alert tone="warn">{t("paper_empty")}</Alert>}
          <div className="flex flex-wrap gap-2">
            {(phase === "write" || phase === "crumple") && (
              <Button variant="primary" onClick={doCrumple} disabled={!can}>{t("crumple_auto")}</Button>
            )}
            {phase === "ball" && <Button variant="primary" onClick={doToss}>{t("toss_button")}</Button>}
            {(phase === "crumple" || phase === "ball") && <Button onClick={doUnfold}>{t("unfold")}</Button>}
            {phase === "ready" && <Button variant="primary" onClick={doOpen}>{t("open_button")}</Button>}
            {phase !== "write" && <Button variant="ghost" onClick={restart}>{t("restart")}</Button>}
          </div>
        </section>

        <section aria-label="stage" className="relative h-[520px] overflow-hidden rounded-lg border border-line bg-surface lg:col-span-7 lg:h-[600px]">
          {!isClient ? null : webgl && texture ? (
            <CrumpleStage
              ref={stage}
              className="absolute inset-0"
              texture={texture}
              phase={phase}
              canCrumple={can}
              onProgress={(p) => {
                setCrumple(p);
                if (p > 0.02 && useLoop.getState().phase === "write") setPhase("crumple");
              }}
              onBall={() => setPhase("ball")}
              onDropped={() => setPhase("dropped")}
              onOpened={() => setPhase("opened")}
              onBlocked={() => setBlocked(true)}
            />
          ) : (
            <div className="flex h-full flex-col items-start justify-center gap-3 p-6">
              <Alert tone="info">{t("webgl_off")}</Alert>
              <p className="text-sm text-ink-2">{t(STEPS.find((s) => s.phases.includes(phase))!.key)}</p>
            </div>
          )}

          {/* 안내 문구 · 구김 진행도 */}
          <div className="pointer-events-none absolute top-4 left-4 flex max-w-[70%] flex-col gap-2">
            {(phase === "write" || phase === "crumple") && (
              <>
                <p className="text-sm text-ink-2">{can ? t("crumple_hint") : t("paper_empty")}</p>
                <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(crumple * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(crumple * 100)}%` }} />
                </div>
              </>
            )}
            {phase === "ball" && <p className="text-sm text-ink-2">{t("toss_hint")}</p>}
            {phase === "ready" && <p className="text-sm font-semibold text-ink">{t("open_hint")}</p>}
          </div>

          {/* 투입 완료 → 확인 (분석은 '네'를 누를 때만 시작) */}
          {phase === "dropped" && (
            <div className="absolute inset-0 flex items-end justify-center bg-bg/60 p-4 sm:items-center">
              <div role="dialog" aria-modal="true" aria-labelledby="confirm-q" className="w-full max-w-md rounded-lg border border-line-strong bg-surface p-5">
                <div className="flex items-center gap-3">
                  <CloudCharacter mood="complete" className="h-16 w-16 shrink-0" />
                  <p id="confirm-q" className="text-base font-semibold">{t("confirm_q")}</p>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button variant="primary" onClick={run} autoFocus className="flex-1 whitespace-nowrap">{t("confirm_yes")}</Button>
                  <Button onClick={resetFlow} className="flex-1 whitespace-nowrap">{t("confirm_no")}</Button>
                </div>
              </div>
            </div>
          )}

          {/* 실제 서버 진행 단계 */}
          {(phase === "analyzing" || phase === "error") && (
            <div className="absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-end gap-3">
              <CloudCharacter mood={mood} className="h-20 w-20 shrink-0" />
              <div className="rounded-lg border border-line bg-surface p-3">
                {phase === "analyzing" ? <ProgressList events={progress} /> : (
                  <div className="flex max-w-xs flex-col gap-2">
                    <Alert tone="error">{errorText}</Alert>
                    {suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <p className="w-full text-xs text-ink-3">{t("unknown_pick")}</p>
                        {suggestions.map((s) => (
                          <Button key={s.item_id} size="sm" onClick={() => { setPaper({ item_id: s.item_id, product_name: s.names[lang] ?? s.names.ko }); run(); }}>
                            {s.names[lang] ?? s.names.ko}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={run}>{t("retry")}</Button>
                      <Button size="sm" onClick={resetFlow}>{t("confirm_no")}</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {phase === "opened" && result && (
        <>
          <section aria-label="result" className="border-t border-line pt-6">
            <ResultCard result={result} />
          </section>
          <div className="border-t border-line pt-6">
            <ChatPanel key={result.item.item_id} itemId={result.item.item_id} itemName={result.item.names[lang]} />
          </div>
          <div>
            <Button onClick={restart}>{t("restart")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
