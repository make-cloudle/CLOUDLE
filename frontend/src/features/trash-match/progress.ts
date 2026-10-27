import { LEVELS, type Level, STAGES_PER_LEVEL } from "./stages";

/** 트레일 진행: 레벨별로 스테이지마다 받은 별(0 = 아직 못 깸). 브라우저에만 저장한다(로그인 없음). */
export type Trail = Record<Level, number[]>;
const KEY = "cloudle-pz-trail";

export const emptyTrail = (): Trail => ({
  easy: Array(STAGES_PER_LEVEL).fill(0), normal: Array(STAGES_PER_LEVEL).fill(0), hard: Array(STAGES_PER_LEVEL).fill(0),
});

/** 저장값이 깨졌거나 예전 형식이어도 안전하게 읽는다 (별은 0~3 정수만 인정) */
export function parseTrail(raw: string | null): Trail {
  const out = emptyTrail();
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Partial<Record<Level, unknown>>;
    for (const lv of LEVELS) {
      const arr = data[lv];
      if (Array.isArray(arr)) out[lv] = out[lv].map((_, i) => (Number.isInteger(arr[i]) && arr[i] >= 0 && arr[i] <= 3 ? (arr[i] as number) : 0));
    }
  } catch { /* 깨진 저장값은 처음부터 */ }
  return out;
}

export const readTrail = (): Trail => { try { return parseTrail(localStorage.getItem(KEY)); } catch { return emptyTrail(); } };
export const writeTrail = (t: Trail) => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* 저장 못 해도 게임은 계속 */ } };

/** 앞 스테이지를 깨야 다음이 열린다. 1번은 항상 열려 있다. */
export const isUnlocked = (t: Trail, level: Level, no: number) => no === 1 || t[level][no - 2] > 0;
export const clearedCount = (t: Trail, level: Level) => t[level].filter((s) => s > 0).length;
export const totalStars = (t: Trail) => LEVELS.reduce((n, lv) => n + t[lv].reduce((a, b) => a + b, 0), 0);

/** 더 높은 별만 기록한다 */
export function record(t: Trail, level: Level, no: number, stars: number): Trail {
  const next: Trail = { ...t, [level]: t[level].map((s, i) => (i === no - 1 ? Math.max(s, stars) : s)) };
  return next;
}
