import multipart from "@fastify/multipart";
import { ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { RagEngineError, RagEnginePort } from "../src/shared/ports/rag-engine.port";

/** 포트를 가짜로 바꿔 끼워 rag-service 없이 게이트웨이만 검증한다 (헥사고날 구조의 이점). */
class FakeEngine extends RagEnginePort {
  calls: string[] = [];
  async call<T>(method: string, path: string): Promise<T> {
    this.calls.push(`${method} ${path}`);
    if (path.startsWith("/api/country/XXX")) throw new RagEngineError(404, { code: "unknown_country", message: "국가를 찾을 수 없어요." });
    return { ok: true, path } as T;
  }
  async stream(): Promise<ReadableStream<Uint8Array>> {
    const enc = new TextEncoder();
    return new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('event: progress\ndata: {"step":"item"}\n\n'));
        c.enqueue(enc.encode('event: result\ndata: {"ok":true}\n\n'));
        c.close();
      },
    });
  }
  async upload<T>(path: string, file: { filename: string }): Promise<T> {
    return { name: file.filename, path } as T;
  }
}

const SID = { "x-session-id": "testsession123" };
let app: NestFastifyApplication;
let engine: FakeEngine;

beforeAll(async () => {
  process.env.RATE_LIMIT_PER_MIN = "3";
  engine = new FakeEngine();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RagEnginePort).useValue(engine).compile();
  app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(multipart as never);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

const inject = (opts: Parameters<NestFastifyApplication["inject"]>[0]) => app.inject(opts as never);

test("세션 헤더 없으면 400 no_session", async () => {
  const r = await inject({ method: "POST", url: "/api/search", payload: { query: "가구" } });
  expect(r.statusCode).toBe(400);
  expect(r.json().code).toBe("no_session");
});

test("입력 검증 실패는 invalid_request, 내부 정보 없음", async () => {
  const r = await inject({ method: "POST", url: "/api/country/KOR/ask", headers: SID, payload: { topic: "nope" } });
  expect(r.statusCode).toBe(400);
  expect(r.json()).toEqual(expect.objectContaining({ code: "invalid_request", message: "입력값을 확인해 주세요." }));
});

test("국가 브리핑은 캐시되어 엔진을 한 번만 부른다", async () => {
  await inject({ method: "GET", url: "/api/country/KOR?lang=ko" });
  await inject({ method: "GET", url: "/api/country/KOR?lang=ko" });
  expect(engine.calls.filter((c) => c.startsWith("GET /api/country/KOR?")).length).toBe(1);
});

test("엔진 오류는 상태코드와 code/message만 전달", async () => {
  const r = await inject({ method: "GET", url: "/api/country/XXX" });
  expect(r.statusCode).toBe(404);
  expect(r.json().code).toBe("unknown_country");
});

test("분석 SSE를 그대로 중계한다", async () => {
  const r = await inject({ method: "POST", url: "/api/analyze", headers: SID, payload: { paper: { product_name: "무선 이어폰" } } });
  expect(r.headers["content-type"]).toContain("text/event-stream");
  expect(r.body).toContain("event: progress");
  expect(r.body).toContain("event: result");
});

test("세션별 요청 제한 429 rate_limited", async () => {
  const h = { "x-session-id": "limitsession99" };
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await inject({ method: "POST", url: "/api/search", headers: h, payload: { query: `종이컵 테스트 ${i}` } })).statusCode);
  expect(codes.slice(0, 3)).toEqual([201, 201, 201]);
  expect(codes[3]).toBe(429);
});
