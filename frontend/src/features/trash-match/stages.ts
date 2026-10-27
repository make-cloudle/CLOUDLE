/**
 * 분리수거 트레일: 쉬움·보통·어려움 각 10 스테이지. React·DOM을 모르는 순수 함수라 따로 테스트·시뮬레이션할 수 있다.
 *
 * 스테이지 = 제한 시간 안에 목표를 모두 채우기. 목표는 점수 + (스테이지에 따라) 종류별 모으기, 오염 씻기.
 * 난이도가 오를수록 ① 시간이 줄고 ② 목표가 커지고 ③ 오염이 더 자주·더 두껍게 나오고 ④ 벌점이 생기고 커진다.
 *   - 오분리 벌점(miss): 아무것도 맞지 않는 교환을 하면 점수가 깎인다(어려움은 시간도 깎인다).
 *   - 오염 방치 벌점(leak): 한 번 움직일 때마다 보드에 남은 오염 칸 수만큼 점수가 깎인다(칸 수는 최대 LEAK_CAP).
 * 목표를 채우면 남은 시간이 보너스 점수가 되고, 최종 점수가 목표의 1.0 / 1.3 / 1.6배면 별 1 / 2 / 3개.
 * 같은 레벨에서는 앞 스테이지를 깨야 다음이 열린다(진행 저장은 화면 쪽).
 */
export type Level = "easy" | "normal" | "hard";
export const LEVELS: readonly Level[] = ["easy", "normal", "hard"];
export const STAGES_PER_LEVEL = 10;
export const LEAK_CAP = 8;
export const STAR_RATIOS = [1, 1.3, 1.6] as const;

export type Goal = {
  score: number;
  /** 종류(kind)별로 N개 이상 사라지게 하기 (씻기만 한 칸은 세지 않는다) */
  collect?: { kind: number; n: number };
  /** 오염을 N번 씻기 */
  wash?: number;
};

export type Stage = {
  level: Level;
  no: number; // 1..10
  time: number;
  maxTime: number;
  kinds: number;
  dirtRate: number;
  dirtMax: 1 | 2;
  goal: Goal;
  missPenalty: number;
  missTime: number;
  leak: number;
  /** 목표를 채우고 남은 시간 1초당 보너스 점수 */
  timeBonus: number;
};

type Row = { time: number; kinds: number; dirt: number; max?: 2; score: number; wash?: number; collect?: [kind: number, n: number] };

const EASY: Row[] = [
  { time: 75, kinds: 5, dirt: 0, score: 400 },
  { time: 75, kinds: 5, dirt: 0, score: 550 },
  { time: 70, kinds: 5, dirt: 0, score: 700, collect: [3, 12] },
  { time: 70, kinds: 5, dirt: 0.04, score: 850, wash: 3 },
  { time: 70, kinds: 6, dirt: 0.05, score: 1000, wash: 3 },
  { time: 65, kinds: 6, dirt: 0.06, score: 1150, wash: 4, collect: [2, 14] },
  { time: 65, kinds: 6, dirt: 0.07, score: 1300, wash: 5 },
  { time: 65, kinds: 6, dirt: 0.08, score: 1450, wash: 5 },
  { time: 60, kinds: 6, dirt: 0.09, score: 1600, wash: 6, collect: [1, 16] },
  { time: 60, kinds: 6, dirt: 0.1, score: 1800, wash: 8 },
];
const NORMAL: Row[] = [
  { time: 60, kinds: 6, dirt: 0.08, score: 1000, wash: 4 },
  { time: 60, kinds: 6, dirt: 0.09, score: 1200, wash: 5, collect: [0, 16] },
  { time: 60, kinds: 6, dirt: 0.1, score: 1400, wash: 6 },
  { time: 55, kinds: 6, dirt: 0.11, score: 1600, wash: 7, collect: [4, 18] },
  { time: 55, kinds: 6, dirt: 0.12, score: 1800, wash: 8 },
  { time: 55, kinds: 6, dirt: 0.13, score: 2000, wash: 9, collect: [2, 20] },
  { time: 50, kinds: 6, dirt: 0.14, score: 2300, wash: 10 },
  { time: 50, kinds: 6, dirt: 0.15, score: 2600, wash: 11, collect: [5, 22] },
  { time: 50, kinds: 6, dirt: 0.16, score: 2900, wash: 12 },
  { time: 50, kinds: 6, dirt: 0.17, score: 3200, wash: 14, collect: [3, 24] },
];
const HARD: Row[] = [
  { time: 60, kinds: 6, dirt: 0.12, score: 1600, wash: 6, collect: [1, 20] },
  { time: 60, kinds: 6, dirt: 0.13, score: 1900, wash: 7 },
  { time: 55, kinds: 6, dirt: 0.14, max: 2, score: 2200, wash: 9, collect: [4, 22] },
  { time: 55, kinds: 6, dirt: 0.15, max: 2, score: 2500, wash: 10 },
  { time: 55, kinds: 6, dirt: 0.16, max: 2, score: 2800, wash: 12, collect: [0, 24] },
  { time: 50, kinds: 6, dirt: 0.18, max: 2, score: 3100, wash: 13 },
  { time: 50, kinds: 6, dirt: 0.2, max: 2, score: 3400, wash: 15, collect: [5, 26] },
  { time: 50, kinds: 6, dirt: 0.22, max: 2, score: 3700, wash: 16 },
  { time: 45, kinds: 6, dirt: 0.24, max: 2, score: 3800, wash: 18, collect: [2, 28] },
  { time: 45, kinds: 6, dirt: 0.26, max: 2, score: 4200, wash: 20, collect: [3, 30] },
];

const TABLE: Record<Level, Row[]> = { easy: EASY, normal: NORMAL, hard: HARD };
/** 레벨별 벌점·보너스: 어려울수록 벌점이 커지고 시간 보너스는 줄어든다 */
const RULES: Record<Level, Pick<Stage, "missPenalty" | "missTime" | "leak" | "timeBonus">> = {
  easy: { missPenalty: 0, missTime: 0, leak: 0, timeBonus: 20 },
  normal: { missPenalty: 5, missTime: 0, leak: 1, timeBonus: 15 },
  hard: { missPenalty: 15, missTime: 1, leak: 3, timeBonus: 10 },
};

export function getStage(level: Level, no: number): Stage {
  const row = TABLE[level][no - 1];
  if (!row) throw new Error(`없는 스테이지: ${level} ${no}`);
  return {
    level, no, time: row.time, maxTime: row.time + 30, kinds: row.kinds, dirtRate: row.dirt, dirtMax: row.max ?? 1,
    goal: { score: row.score, ...(row.collect ? { collect: { kind: row.collect[0], n: row.collect[1] } } : {}), ...(row.wash ? { wash: row.wash } : {}) },
    ...RULES[level],
  };
}

export const allStages = (): Stage[] => LEVELS.flatMap((l) => Array.from({ length: STAGES_PER_LEVEL }, (_, i) => getStage(l, i + 1)));

/* ── 진행 · 목표 · 벌점 · 별 ───────────────────────────────────── */
export type Progress = { score: number; collected: number; washes: number };
export const emptyProgress = (): Progress => ({ score: 0, collected: 0, washes: 0 });

export type GoalLine = { id: "score" | "collect" | "wash"; have: number; need: number; kind?: number };
export function goalLines(stage: Stage, p: Progress): GoalLine[] {
  const g = stage.goal;
  const lines: GoalLine[] = [{ id: "score", have: p.score, need: g.score }];
  if (g.collect) lines.push({ id: "collect", have: p.collected, need: g.collect.n, kind: g.collect.kind });
  if (g.wash) lines.push({ id: "wash", have: p.washes, need: g.wash });
  return lines;
}
export const isCleared = (stage: Stage, p: Progress) => goalLines(stage, p).every((l) => l.have >= l.need);

/** 한 번 움직인 뒤의 벌점. 맞지 않은 교환이면 miss, 맞았으면 보드에 남은 오염 칸 수만큼 leak */
export function penaltyFor(stage: Stage, moved: boolean, dirtLeft: number): { points: number; seconds: number } {
  if (!moved) return { points: stage.missPenalty, seconds: stage.missTime };
  return { points: stage.leak * Math.min(Math.max(dirtLeft, 0), LEAK_CAP), seconds: 0 };
}

export const finalScore = (stage: Stage, score: number, timeLeft: number) => score + Math.round(Math.max(timeLeft, 0) * stage.timeBonus);
export function starsFor(stage: Stage, final: number): 0 | 1 | 2 | 3 {
  const n = STAR_RATIOS.filter((r) => final >= stage.goal.score * r).length;
  return n as 0 | 1 | 2 | 3;
}
