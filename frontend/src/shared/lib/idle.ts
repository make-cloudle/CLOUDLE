"use client";

import { useEffect, useState } from "react";

const EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/** 사용자가 ms 동안 아무 입력도 하지 않으면 true. 입력이 들어오면 즉시 false. */
export function useIdle(ms = 30_000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    EVENTS.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [ms]);
  return idle;
}
