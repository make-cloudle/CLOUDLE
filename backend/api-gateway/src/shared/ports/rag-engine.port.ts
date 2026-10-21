/**
 * 포트 (헥사고날 아키텍처): 유스케이스가 의존하는 RAG 엔진의 추상 계약.
 * 실제 구현(어댑터)은 Python rag-service를 HTTP로 호출하지만, 유스케이스는 그 사실을 모른다.
 */
export type UploadFilePart = { filename: string; mimetype: string; data: Buffer };
export type HttpMethod = "GET" | "POST" | "DELETE";

export abstract class RagEnginePort {
  /** JSON 요청 → JSON 응답 */
  abstract call<T = unknown>(method: HttpMethod, path: string, opts?: { sessionId?: string; body?: unknown }): Promise<T>;
  /** SSE 스트림 그대로 받기 (분석 진행 단계) */
  abstract stream(path: string, body: unknown, sessionId: string): Promise<ReadableStream<Uint8Array>>;
  /** 파일 업로드 (multipart) */
  abstract upload<T = unknown>(path: string, file: UploadFilePart, sessionId: string): Promise<T>;
}

/** 엔진이 돌려준 오류 (상태코드 + 사용자에게 보여줄 code/message) */
export class RagEngineError extends Error {
  constructor(public readonly status: number, public readonly detail: Record<string, unknown>) {
    super(String(detail.message ?? "rag-service error"));
  }
}
