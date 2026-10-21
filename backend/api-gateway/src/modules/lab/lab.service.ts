import { Injectable } from "@nestjs/common";
import { TtlCache } from "../../shared/cache/ttl-cache";
import { RagEnginePort, type UploadFilePart } from "../../shared/ports/rag-engine.port";

/** Cloud Lab 유스케이스: 품목 · 분석(SSE) · 후속 질문 · 업로드 · 사진 · 조건 탐색 */
@Injectable()
export class LabService {
  private readonly itemsCache = new TtlCache<unknown>(24 * 60 * 60_000, 2);

  constructor(private readonly engine: RagEnginePort) {}

  items() {
    return this.itemsCache.getOrLoad("items", () => this.engine.call("GET", "/api/items"));
  }

  analyze(paper: Record<string, unknown>, sessionId: string) {
    return this.engine.stream("/api/analyze", { paper }, sessionId);
  }

  chat(body: { item_id: string; question: string; lang: string }, sessionId: string) {
    return this.engine.call("POST", "/api/chat", { sessionId, body });
  }

  history(itemId: string, sessionId: string) {
    return this.engine.call("GET", `/api/chat/${encodeURIComponent(itemId)}`, { sessionId });
  }

  upload(file: UploadFilePart, sessionId: string) {
    return this.engine.upload("/api/upload", file, sessionId);
  }

  vision(file: UploadFilePart, sessionId: string) {
    return this.engine.upload("/api/vision", file, sessionId);
  }

  search(query: string, sessionId: string) {
    return this.engine.call("POST", "/api/search", { sessionId, body: { query } });
  }

  forget(sessionId: string) {
    return this.engine.call("DELETE", "/api/session", { sessionId });
  }
}
