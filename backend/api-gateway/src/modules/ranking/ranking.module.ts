import { Module } from "@nestjs/common";
import { FileRankingStore } from "./adapters/file-ranking.store";
import { RankingStorePort } from "./ports/ranking-store.port";
import { RankingController } from "./ranking.controller";
import { RankingService } from "./ranking.service";

/**
 * 분리수거 트레일 랭킹 — 포트 ← 어댑터 바인딩은 이 모듈 한 곳에서만 한다.
 *   HTTP ─▶ RankingController ─▶ RankingService ─▶ RankingStorePort (← FileRankingStore)
 * 여러 인스턴스를 띄우려면 RankingStorePort 어댑터만 DB/Redis로 바꾼다.
 */
@Module({
  controllers: [RankingController],
  providers: [RankingService, FileRankingStore, { provide: RankingStorePort, useExisting: FileRankingStore }],
})
export class RankingModule {}
