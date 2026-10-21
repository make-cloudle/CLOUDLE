"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useIdle } from "@/shared/lib/idle";
import { cx } from "@/shared/ui/primitives";

export type CloudMood = "idle" | "curious" | "thinking" | "happy" | "concerned" | "presenting" | "sleepy" | "error";

const CLOUD: Record<CloudMood, { src: string; anim: string }> = {
  idle: { src: "cloud-default", anim: "anim-float" },
  curious: { src: "cloud-wink", anim: "anim-tilt" },
  thinking: { src: "cloud-default", anim: "anim-hop" },
  happy: { src: "cloud-joy", anim: "anim-hop" },
  concerned: { src: "cloud-surprise", anim: "anim-float" },
  presenting: { src: "cloud-joy", anim: "anim-float" },
  sleepy: { src: "cloud-sleepy", anim: "anim-float" },
  error: { src: "cloud-angry", anim: "anim-wiggle" },
};

/** 구름 마스코트. 30초 동안 입력이 없으면 졸린 표정으로 바뀐다. */
export function CloudMascot({ mood, className, label }: { mood: CloudMood; className?: string; label?: string }) {
  const idle = useIdle(30_000);
  const m = idle && (mood === "idle" || mood === "curious") ? "sleepy" : mood;
  return (
    <div className={cx("relative select-none", className)} role="img" aria-label={label ?? `cloud ${m}`}>
      {/* 상태가 바뀌면 key가 바뀌어 말랑하게 한 번 눌린다 */}
      <div key={m} className="anim-squish h-full w-full">
        <img src={`/characters/${CLOUD[m].src}.png`} alt="" draggable={false}
          className={cx("h-full w-full object-contain drop-shadow-[0_10px_18px_rgba(47,143,208,0.18)]", CLOUD[m].anim)} />
      </div>
      {m === "thinking" && (
        <span className="absolute -top-1 right-1 flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-sky-deep" style={{ animation: `dot 1.2s ${i * 0.2}s infinite` }} />
          ))}
        </span>
      )}
      {m === "sleepy" && <span className="absolute -top-2 right-0 text-sm font-bold text-sky-deep anim-float" aria-hidden>z z</span>}
    </div>
  );
}

const EARTH_ACTIONS = [
  { src: "earth-rest", anim: "anim-float" },
  { src: "earth-joy", anim: "anim-hop" },
  { src: "earth-love", anim: "anim-squish" },
  { src: "earth-happy", anim: "anim-wiggle" },
  { src: "earth-surprise", anim: "anim-hop" },
];

/** 지구 친구. 평소엔 둥실 떠 있고, 30초 동안 아무것도 안 하면 혼자 놀기 시작한다. 누르면 반응한다. */
export function EarthBuddy({ className, mood }: { className?: string; mood?: "default" | "joy" | "love" | "surprise" }) {
  const idle = useIdle(30_000);
  const [step, setStep] = useState(0);
  const [poke, setPoke] = useState(false);

  useEffect(() => {
    if (!idle) return;
    const id = setInterval(() => setStep((s) => s + 1), 3500);
    return () => clearInterval(id);
  }, [idle]);

  const act = poke ? { src: "earth-surprise", anim: "anim-wiggle" }
    : idle ? EARTH_ACTIONS[step % EARTH_ACTIONS.length]
    : mood && mood !== "default" ? { src: `earth-${mood}`, anim: "anim-hop" }
    : { src: "earth-default", anim: "anim-float" };

  return (
    <button type="button" className={cx("relative select-none", className)} aria-label="earth buddy"
      onClick={() => { setPoke(true); setTimeout(() => setPoke(false), 1200); }}>
      <img key={act.src + step} src={`/characters/${act.src}.png`} alt="" draggable={false}
        className={cx("h-full w-full object-contain drop-shadow-[0_14px_22px_rgba(47,143,208,0.2)]", act.anim)} />
    </button>
  );
}
