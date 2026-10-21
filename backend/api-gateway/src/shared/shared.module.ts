import { Global, Module } from "@nestjs/common";
import { RagEngineHttpAdapter } from "./adapters/rag-engine.http.adapter";
import { RagEnginePort } from "./ports/rag-engine.port";

/** 포트 ← 어댑터 바인딩. 테스트에서는 RagEnginePort만 가짜로 바꿔 끼운다. */
@Global()
@Module({
  providers: [{ provide: RagEnginePort, useClass: RagEngineHttpAdapter }],
  exports: [RagEnginePort],
})
export class SharedModule {}
