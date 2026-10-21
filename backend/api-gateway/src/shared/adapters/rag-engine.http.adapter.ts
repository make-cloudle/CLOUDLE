import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type HttpMethod, RagEngineError, RagEnginePort, type UploadFilePart } from "../ports/rag-engine.port";

/** 어댑터: RagEnginePort를 Python rag-service(HTTP)로 구현한다. */
@Injectable()
export class RagEngineHttpAdapter extends RagEnginePort {
  private readonly log = new Logger("RagEngine");
  private readonly base: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    this.base = config.get<string>("ragServiceUrl") ?? "http://127.0.0.1:8000";
  }

  private headers(sessionId?: string, json = false): Record<string, string> {
    return { ...(sessionId ? { "X-Session-Id": sessionId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
  }

  private async unwrap<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = (body.detail ?? body) as Record<string, unknown> | string;
      throw new RagEngineError(res.status, typeof detail === "object" ? detail : { message: detail });
    }
    return body as T;
  }

  private async request(path: string, init: RequestInit, timeoutMs = 120_000): Promise<Response> {
    try {
      return await fetch(`${this.base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      this.log.warn(`rag-service 연결 실패: ${path} (${(e as Error).name})`);
      throw new RagEngineError(503, { code: "engine_unavailable", message: "분석 엔진에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." });
    }
  }

  async call<T>(method: HttpMethod, path: string, opts: { sessionId?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.request(path, {
      method,
      headers: this.headers(opts.sessionId, opts.body !== undefined),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    return this.unwrap<T>(res);
  }

  async stream(path: string, body: unknown, sessionId: string): Promise<ReadableStream<Uint8Array>> {
    const res = await this.request(path, { method: "POST", headers: this.headers(sessionId, true), body: JSON.stringify(body) }, 300_000);
    if (!res.ok || !res.body) await this.unwrap(res);
    return res.body as ReadableStream<Uint8Array>;
  }

  async upload<T>(path: string, file: UploadFilePart, sessionId: string): Promise<T> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.data)], { type: file.mimetype }), file.filename);
    const res = await this.request(path, { method: "POST", headers: this.headers(sessionId), body: form });
    return this.unwrap<T>(res);
  }
}
