import type { Memo } from "../domain/community.types";

export type MemoSummary = Pick<Memo, "product_name" | "condition" | "purpose" | "note"> & { engine: "llm" | "offline" };

/** 대화 몇 줄 → 메모 필드. 실제 LLM은 rag-service에만 있다 (게이트웨이에 키를 두지 않는다). */
export abstract class MemoSummarizerPort {
  abstract summarize(lines: string[], lang: string, sessionId: string): Promise<MemoSummary>;
}
