import type { Player } from "../domain/ranking";

/** 랭킹 저장소 포트. 지금은 파일(재시작해도 유지), 여러 인스턴스를 띄우면 DB/Redis 어댑터로 바꾼다. */
export abstract class RankingStorePort {
  abstract all(): Player[];
  abstract get(id: string): Player | undefined;
  abstract put(player: Player): void;
}
