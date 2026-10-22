import { Injectable } from "@nestjs/common";
import { TtlCache } from "../../shared/cache/ttl-cache";
import { RagEnginePort } from "../../shared/ports/rag-engine.port";

export type Topic = "air" | "waste" | "help";

/** Earth SOS · 국가 브리핑 · 국가 질문 유스케이스 */
@Injectable()
export class EarthService {
  // 핵심 지표만 짧게 캐시: 같은 나라를 다시 눌러도 엔진·외부 API를 다시 부르지 않는다
  private readonly briefings = new TtlCache<unknown>(10 * 60_000);
  private readonly sosCache = new TtlCache<unknown>(30 * 60_000, 4);
  private readonly answers = new TtlCache<unknown>(60 * 60_000);

  constructor(private readonly engine: RagEnginePort) {}

  sos() {
    return this.sosCache.getOrLoad("sos", () => this.engine.call("GET", "/api/sos"));
  }

  briefing(iso3: string, lang: string, detail: boolean) {
    return this.briefings.getOrLoad(`${iso3}:${lang}:${detail}`, () =>
      this.engine.call("GET", `/api/country/${iso3}?lang=${lang}&detail=${detail}`));
  }

  /** 같은 나라·주제 질문은 1시간 동안 재사용 (LLM 토큰 절약) */
  ask(iso3: string, topic: Topic, lang: string, sessionId: string) {
    return this.answers.getOrLoad(`${iso3}:${topic}:${lang}`, () =>
      this.engine.call("POST", `/api/country/${iso3}/ask`, { sessionId, body: { topic, lang } }));
  }
}
