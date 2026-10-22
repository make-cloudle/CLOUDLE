import { Injectable } from "@nestjs/common";
import { RagEnginePort } from "../../../shared/ports/rag-engine.port";
import { type MemoSummary, MemoSummarizerPort } from "../ports/memo-summarizer.port";

/** rag-service `/api/memo/summarize`로 위임 (LLM 키·토큰 예산은 rag-service가 관리) */
@Injectable()
export class RagMemoSummarizer extends MemoSummarizerPort {
  constructor(private readonly engine: RagEnginePort) {
    super();
  }

  summarize(lines: string[], lang: string, sessionId: string) {
    return this.engine.call<MemoSummary>("POST", "/api/memo/summarize", { sessionId, body: { lines, lang } });
  }
}
