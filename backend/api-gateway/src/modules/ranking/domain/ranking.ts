/**
 * 분리수거 트레일 랭킹 도메인. 프레임워크를 모른다.
 * 점수는 브라우저가 보내므로 **로그인 없는 명예 랭킹**이다(서버는 값의 범위만 검증한다).
 */
export const LEVELS = ["easy", "normal", "hard"] as const;
export type Level = (typeof LEVELS)[number];
export const STAGES_PER_LEVEL = 10;
/** 한 스테이지 최종 점수의 상식적인 상한(목표 4,200점 + 시간 보너스) — 이보다 큰 값은 거절 */
export const MAX_SCORE = 30_000;
export const MAX_PLAYERS = 5_000;

export interface StageRecord { stars: 1 | 2 | 3; score: number }
export interface Player {
  /** 세션 ID — 브라우저마다 한 명 */
  id: string;
  nickname: string;
  stages: Record<Level, (StageRecord | null)[]>;
  updatedAt: number;
}

export class RankingError extends Error {
  constructor(public code: "bad_nickname" | "nickname_taken" | "not_claimed" | "bad_score" | "full", message: string) {
    super(message);
  }
}

export const emptyPlayer = (id: string, nickname: string, now = Date.now()): Player => ({
  id, nickname, updatedAt: now,
  stages: { easy: Array(STAGES_PER_LEVEL).fill(null), normal: Array(STAGES_PER_LEVEL).fill(null), hard: Array(STAGES_PER_LEVEL).fill(null) },
});

/** 같은 스테이지는 별이 많은 쪽, 같으면 점수가 높은 쪽만 남긴다 */
export const isBetter = (a: StageRecord, b: StageRecord | null) => !b || a.stars > b.stars || (a.stars === b.stars && a.score > b.score);

export function validateScore(level: unknown, stage: unknown, score: unknown, stars: unknown): { level: Level; stage: number; score: number; stars: 1 | 2 | 3 } {
  const ok = LEVELS.includes(level as Level) && Number.isInteger(stage) && (stage as number) >= 1 && (stage as number) <= STAGES_PER_LEVEL
    && Number.isInteger(score) && (score as number) >= 0 && (score as number) <= MAX_SCORE && (stars === 1 || stars === 2 || stars === 3);
  if (!ok) throw new RankingError("bad_score", "점수 정보가 올바르지 않아요.");
  return { level: level as Level, stage: stage as number, score: score as number, stars: stars as 1 | 2 | 3 };
}

export interface Row { rank: number; nickname: string; cleared: number; stars: number; score: number }

const totals = (p: Player, level: Level | "all") => {
  const lv = level === "all" ? LEVELS : [level];
  let cleared = 0, stars = 0, score = 0;
  for (const l of lv) for (const r of p.stages[l]) if (r) { cleared++; stars += r.stars; score += r.score; }
  return { cleared, stars, score };
};

/** 별 합계 → 클리어 수 → 점수 합계 → 먼저 달성한 사람 순. 클리어 기록이 없는 사람은 제외 */
export function leaderboard(players: Iterable<Player>, level: Level | "all"): { id: string; row: Row }[] {
  const list = [...players].map((p) => ({ p, t: totals(p, level) })).filter(({ t }) => t.cleared > 0);
  list.sort((a, b) => b.t.stars - a.t.stars || b.t.cleared - a.t.cleared || b.t.score - a.t.score || a.p.updatedAt - b.p.updatedAt || a.p.nickname.localeCompare(b.p.nickname));
  return list.map(({ p, t }, i) => ({ id: p.id, row: { rank: i + 1, nickname: p.nickname, ...t } }));
}
