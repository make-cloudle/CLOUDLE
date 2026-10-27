import { Injectable } from "@nestjs/common";
import { cleanNickname, NICKNAME_MAX, nicknameKey } from "../../shared/nickname";
import {
  emptyPlayer, isBetter, leaderboard, type Level, MAX_PLAYERS, RankingError, type Row, validateScore,
} from "./domain/ranking";
import { RankingStorePort } from "./ports/ranking-store.port";

const TOP = 20;

/** 유스케이스: 닉네임 등록 → 점수 등록 → 순위표. 저장 방식은 RankingStorePort가 숨긴다. */
@Injectable()
export class RankingService {
  constructor(private readonly store: RankingStorePort) {}

  /** 트레일에 들어갈 때 닉네임을 정한다. 다른 사람이 쓰는 이름은 거절, 내가 이름을 바꾸는 것은 허용 */
  claim(sid: string, nickname: unknown): { nickname: string } {
    const name = cleanNickname(nickname);
    if (!name) throw new RankingError("bad_nickname", `닉네임은 1~${NICKNAME_MAX}자로 적어 주세요. (< > 와 줄바꿈은 쓸 수 없어요)`);
    const key = nicknameKey(name);
    if (this.store.all().some((p) => p.id !== sid && nicknameKey(p.nickname) === key)) {
      throw new RankingError("nickname_taken", "이미 랭킹에서 쓰고 있는 닉네임이에요. 다른 이름을 골라 주세요.");
    }
    const mine = this.store.get(sid);
    if (!mine && this.store.all().length >= MAX_PLAYERS) throw new RankingError("full", "지금은 새로 등록할 수 없어요.");
    this.store.put({ ...(mine ?? emptyPlayer(sid, name)), nickname: name });
    return { nickname: name };
  }

  /** 스테이지 기록 등록. 더 좋은 기록일 때만 바뀌고, 별·점수 범위만 검증한다(로그인이 없는 명예 랭킹) */
  submit(sid: string, level: unknown, stage: unknown, score: unknown, stars: unknown) {
    const me = this.store.get(sid);
    if (!me) throw new RankingError("not_claimed", "닉네임을 먼저 정해 주세요.");
    const v = validateScore(level, stage, score, stars);
    const rec = { stars: v.stars, score: v.score };
    const improved = isBetter(rec, me.stages[v.level][v.stage - 1]);
    if (improved) {
      const stages = { ...me.stages, [v.level]: me.stages[v.level].map((r, i) => (i === v.stage - 1 ? rec : r)) };
      this.store.put({ ...me, stages, updatedAt: Date.now() });
    }
    return { improved, ...this.board(sid, v.level) };
  }

  board(sid: string | undefined, level: Level | "all") {
    const all = leaderboard(this.store.all(), level);
    const mine = sid ? all.find((x) => x.id === sid)?.row ?? null : null;
    const nickname = sid ? this.store.get(sid)?.nickname ?? null : null;
    return { level, total: all.length, rows: all.slice(0, TOP).map((x) => x.row) as Row[], me: mine, nickname };
  }
}
