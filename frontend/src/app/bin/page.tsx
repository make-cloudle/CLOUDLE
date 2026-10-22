"use client";

/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { charImg, CloudMascot, EarthBuddy } from "@/entities/mascot/characters";
import { ChatPanel } from "@/features/ask-cloud/ChatPanel";
import { PaperInput } from "@/features/cloud-lab/PaperInput";
import { ResultCard } from "@/widgets/result-card/ResultCard";
import type { BinStageHandle, TrashKind } from "@/features/cloud-lab/BinStage";
import { IconCheck, IconX } from "@/shared/ui/icons";
import { Alert, Button, cx, Overline } from "@/shared/ui/primitives";
import { analyze, ApiError, type ProgressEvent } from "@/shared/api/client";
import { type DictKey, useT } from "@/shared/lib/i18n";
import { paperHasContent, useLoop } from "@/features/cloud-lab/model";
import { useDiscoveries } from "@/features/discovery/model";
import { drawPaper } from "@/features/cloud-lab/paperTexture";
import { usePrefs } from "@/shared/lib/prefs";

const BinStage = dynamic(() => import("@/features/cloud-lab/BinStage"), { ssr: false });

/** 선반의 쓰레기 = 분석할 물건. 품목 ID는 RAG 1 메타데이터와 같다. */
const SHELF: { kind: TrashKind; label: DictKey; itemId?: string }[] = [
  { kind: "paper", label: "trash_paper" },
  { kind: "can", label: "trash_can", itemId: "M001" },
  { kind: "bottle", label: "trash_bottle", itemId: "P001" },
  { kind: "cup", label: "trash_cup", itemId: "R005" },
];
const STEPS = ["item", "extract", "collect", "select", "index", "retrieve", "generate_done"];

let webglCache: boolean | null = null;
const hasWebGL = () => {
  if (webglCache === null) {
    try { const c = document.createElement("canvas"); webglCache = !!(c.getContext("webgl2") || c.getContext("webgl")); }
    catch { webglCache = false; }
  }
  return webglCache;
};
const noop = () => () => {};

function TrashIcon({ kind }: { kind: TrashKind }) {
  // 디자인된 라인 아이콘 (이모지 대신)
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      {kind === "paper" && <><path {...common} d="M9 5h11l5 5v17H9z" /><path {...common} d="M20 5v5h5M12 15h9M12 19h9M12 23h6" /></>}
      {kind === "can" && <><rect {...common} x="10" y="6" width="12" height="21" rx="2.5" /><path {...common} d="M10 11h12M10 22h12M14 4h4" /></>}
      {kind === "bottle" && <><path {...common} d="M13 4h6v4l2 3v15a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V11l2-3z" /><path {...common} d="M11 16h10" /></>}
      {kind === "cup" && <><path {...common} d="M8 8h16l-2 19H10z" /><path {...common} d="M7 8h18M9.5 14h13" /></>}
    </svg>
  );
}

export default function BinPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const theme = usePrefs((s) => s.theme);
  const { paper, phase, setPhase, progress, pushProgress, result, setResult, error, setError, resetFlow, resetAll, setPaper } = useLoop();
  const save = useDiscoveries((s) => s.add);
  const stage = useRef<BinStageHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [kind, setKind] = useState<TrashKind>("paper");
  const [crumple, setCrumple] = useState(0);
  const [toast, setToast] = useState("");
  const [binPos, setBinPos] = useState({ x: 0.75, y: 0.6 });
  const [opening, setOpening] = useState(false);
  const webgl = useSyncExternalStore(noop, hasWebGL, () => true);
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const can = paperHasContent(paper);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 1800); return () => clearTimeout(id); }, [toast]);

  // 노트 내용 → 3D 종이 텍스처
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
      const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = p.url;
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

  const pickTrash = (s: (typeof SHELF)[number]) => {
    if (!["write", "crumple", "ball"].includes(phase)) return;
    setKind(s.kind);
    if (s.kind === "paper") { setPhase("write"); return; }
    setPaper({ product_name: t(s.label), item_id: s.itemId ?? "", category: "" });
    setPhase("ball");
  };

  const run = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    useLoop.setState({ progress: [], error: null, result: null });
    setOpening(false);
    setPhase("analyzing");
    try {
      const r = await analyze({
        product_name: paper.product_name, item_id: paper.item_id, category: paper.category,
        condition: paper.condition, region: paper.region, purpose: paper.purpose === "resell" ? "reuse" : paper.purpose,
        note: [paper.purpose === "resell" ? "중고로 되팔 때 확인할 점을 알려줘." : "", paper.note].filter(Boolean).join(" "),
        lang, image_labels: paper.photos.flatMap((p) => p.labels),
      }, pushProgress, ac.signal);
      setResult(r);
      setPhase("ready");
      save({ kind: "analysis", title: r.item.names[lang], summary: r.answer.summary ?? "",
        sources: r.answer.sources.map((x) => ({ title: x.title, url: x.url })) });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const err = e instanceof ApiError ? e : new ApiError("internal", "");
      setError({ code: err.code, message: err.message, extra: err.extra });
      setPhase("error");
    }
  };

  const openCloud = () => {
    if (phase !== "ready" || opening) return;
    setOpening(true);
    setTimeout(() => {
      setPhase("opened");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }, 750);
  };

  const restart = () => { abortRef.current?.abort(); resetAll(); setKind("paper"); setCrumple(0); setOpening(false); };
  const takeOut = () => { resetFlow(); if (kind !== "paper") setPhase("ball"); };

  const done = new Set(progress.map((e) => e.step.replace(/_done$/, "")));
  const current = STEPS.find((s) => !done.has(s.replace(/_done$/, "")));
  const errorText = error && (error.code === "rate_limited" ? t("rate_limited")
    : ["network", "internal"].includes(error.code) || !error.message ? t("error_generic") : error.message);
  const suggestions = (error?.extra?.suggestions ?? []) as { item_id: string; names: Record<string, string> }[];
  const warnings = progress.filter((e: ProgressEvent) => e.step === "warning");

  return (
    <div className="flex flex-col gap-8 pt-8 lg:pt-12">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Cloud Bin</Overline>
          <h1 className="mt-1 text-[36px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[48px]">{t("bin_title")}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">{t("bin_desc")}</p>
        </div>
        <EarthBuddy className="hidden h-24 w-24 sm:block" />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 노트 */}
        <section aria-label="note" className="flex flex-col gap-4 lg:col-span-5">
          <PaperInput disabled={!["write", "crumple", "ball"].includes(phase)} />
        </section>

        {/* 스테이지 */}
        <section aria-label="stage" className="flex flex-col gap-3 lg:col-span-7">
          {/* 선반: 무엇을 버려 볼까요? */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold">{t("shelf_title")}</span>
            {SHELF.map((s) => (
              <button key={s.kind} onClick={() => pickTrash(s)} aria-pressed={kind === s.kind}
                disabled={!["write", "crumple", "ball"].includes(phase)}
                className={cx("flex items-center gap-2 rounded-2xl px-3 py-1.5 text-[13px] font-semibold transition-all disabled:opacity-40",
                  kind === s.kind ? "bg-accent text-accent-ink shadow-soft" : "bg-surface text-ink-2 shadow-soft hover:-translate-y-0.5 hover:text-ink")}>
                <TrashIcon kind={s.kind} />{t(s.label)}
              </button>
            ))}
          </div>

          <div className="relative h-[520px] overflow-hidden rounded-[28px] bg-gradient-to-b from-sky-soft to-surface shadow-soft lg:h-[600px]">
            {!isClient ? null : webgl && texture ? (
              <BinStage ref={stage} className="absolute inset-0" kind={kind} texture={texture} phase={phase} canCrumple={can}
                onProgress={(p) => { setCrumple(p); if (p > 0.02 && useLoop.getState().phase === "write") setPhase("crumple"); }}
                onReady={() => setPhase("ball")}
                onIn={() => { setPhase("dropped"); setToast(t("in_bin")); }}
                onMiss={() => setToast(t("missed"))}
                onBlocked={() => setToast(t("paper_empty"))}
                onBinScreen={(x, y) => setBinPos({ x, y })} />
            ) : (
              <div className="flex h-full items-center justify-center p-6"><Alert tone="info">{t("webgl_off")}</Alert></div>
            )}

            {/* 안내 */}
            <div className="pointer-events-none absolute top-5 left-5 flex max-w-[60%] flex-col gap-2">
              {(phase === "write" || phase === "crumple") && kind === "paper" && (
                <>
                  <p className="text-sm font-medium text-ink-2">{can ? t("crumple_hint") : t("paper_empty")}</p>
                  <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={Math.round(crumple * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-sky transition-[width]" style={{ width: `${Math.round(crumple * 100)}%` }} />
                  </div>
                </>
              )}
              {phase === "ball" && <p className="text-sm font-medium text-ink-2">{t("throw_hint")}</p>}
            </div>
            {toast && <div className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-float anim-pop">{toast}</div>}

            {/* 통 위 구름: 분석 중 → 형성 → 눌러서 열기 */}
            {(phase === "analyzing" || phase === "ready" || phase === "error" || opening) && (
              <div className="absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center"
                style={{ left: `${binPos.x * 100}%`, top: `calc(${binPos.y * 100}% - 8px)` }}>
                {phase === "ready" && !opening && <p className="mb-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold shadow-soft anim-pop">{t("open_hint")}</p>}
                <button type="button" onClick={openCloud} disabled={phase !== "ready"} aria-label={t("open_button")}
                  className={cx("relative anim-rise", phase === "ready" ? "h-36 w-48 cursor-pointer" : "h-28 w-36")}>
                  {phase === "ready" && !opening && <span className="absolute inset-4 rounded-full bg-yellow/70 blur-2xl" aria-hidden />}
                  {opening ? (
                    <>
                      <img {...charImg("cloud-joy")} alt="" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: "inset(0 50% 0 0)", animation: "split-left .75s ease-in forwards" }} />
                      <img {...charImg("cloud-joy")} alt="" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: "inset(0 0 0 50%)", animation: "split-right .75s ease-in forwards" }} />
                    </>
                  ) : (
                    <CloudMascot mood={phase === "ready" ? "happy" : phase === "error" ? "error" : "thinking"} className="h-full w-full" />
                  )}
                </button>
              </div>
            )}

            {/* 진행 상태 (서버가 실제로 수행한 단계만) */}
            {(phase === "analyzing" || phase === "error") && (
              <div className="absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-3xl bg-surface/95 p-4 shadow-float backdrop-blur sm:max-w-xs">
                {phase === "analyzing" ? (
                  <ul className="flex flex-col gap-1.5">
                    {STEPS.map((s) => {
                      const ok = done.has(s.replace(/_done$/, ""));
                      return (
                        <li key={s} className={cx("flex items-center gap-2 text-[13px]", ok ? "text-ink" : s === current ? "font-semibold text-ink" : "text-ink-3")}>
                          {ok ? <IconCheck size={14} className="text-mint-deep" />
                            : s === current ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-deep border-t-transparent" />
                            : <span className="h-3 w-3 rounded-full bg-surface-2" />}
                          {t(`s_${s}` as DictKey)}
                        </li>
                      );
                    })}
                    {warnings.map((w, i) => <li key={i}><Alert tone="warn">{w.message}</Alert></li>)}
                  </ul>
                ) : (
                  <div className="flex flex-col gap-2">
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
                    <div className="flex gap-2"><Button size="sm" variant="primary" onClick={run}>{t("retry")}</Button><Button size="sm" onClick={takeOut}>{t("take_out")}</Button></div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 조작 버튼 (드래그 없이도 같은 흐름) */}
          <div className="flex flex-wrap items-center gap-2">
            {(phase === "write" || phase === "crumple") && kind === "paper" && (
              <Button variant="primary" onClick={() => (webgl ? stage.current?.crumple() : can ? setPhase("ball") : setToast(t("paper_empty")))} disabled={!can}>{t("crumple_paper")}</Button>
            )}
            {phase === "ball" && (
              <Button variant="sky" onClick={() => (webgl ? stage.current?.autoThrow() : setPhase("dropped"))}>{t("auto_throw")}</Button>
            )}
            {phase === "ball" && kind === "paper" && <Button onClick={() => { stage.current?.unfold(); setPhase("write"); }}>{t("unfold")}</Button>}
            {phase === "dropped" && (
              <div className="flex w-full flex-wrap items-center gap-2 rounded-3xl bg-surface p-3 shadow-soft anim-pop">
                <span className="text-xs font-semibold text-ink-3">{t("in_bin_list")}</span>
                <span className="inline-flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-1.5 text-[13px] font-semibold">
                  <TrashIcon kind={kind} /> {paper.product_name} · {paper.region} · {t(`p_${paper.purpose}` as DictKey)}
                  <button onClick={takeOut} aria-label={t("take_out")} className="ml-1 text-ink-3 hover:text-ink"><IconX size={14} /></button>
                </span>
                <Button variant="primary" className="ml-auto" onClick={run}>{t("analyze")}</Button>
              </div>
            )}
            {phase === "ready" && <Button variant="sky" onClick={openCloud}>{t("open_button")}</Button>}
            {phase !== "write" && phase !== "dropped" && <Button variant="ghost" onClick={restart}>{t("restart")}</Button>}
          </div>
        </section>
      </div>

      {phase === "opened" && result && (
        <div ref={resultRef} className="flex scroll-mt-24 flex-col gap-8">
          <section aria-label="result" className="anim-pop"><ResultCard result={result} /></section>
          <ChatPanel key={result.item.item_id} itemId={result.item.item_id} itemName={result.item.names[lang]} />
          <div><Button onClick={restart}>{t("restart")}</Button></div>
        </div>
      )}
    </div>
  );
}
