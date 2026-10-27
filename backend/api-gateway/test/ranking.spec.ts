import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { leaderboard, emptyPlayer, validateScore } from "../src/modules/ranking/domain/ranking";
import { RagEnginePort } from "../src/shared/ports/rag-engine.port";

class FakeEngine extends RagEnginePort {
  async call<T>(): Promise<T> { return {} as T; }
  async stream(): Promise<ReadableStream<Uint8Array>> { return new ReadableStream(); }
  async upload<T>(): Promise<T> { return {} as T; }
}

const dir = mkdtempSync(join(tmpdir(), "cloudle-rank-"));
const file = join(dir, "ranking.json");
let app: NestFastifyApplication;

async function boot() {
  process.env.RANKING_FILE = file;
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RagEnginePort).useValue(new FakeEngine()).compile();
  const a = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  a.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await a.init();
  await a.getHttpAdapter().getInstance().ready();
  return a;
}
beforeAll(async () => { app = await boot(); });
afterAll(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });

const as = (sid: string) => ({ "x-session-id": sid });
const post = (url: string, sid: string, payload: unknown) => app.inject({ method: "POST", url, headers: as(sid), payload: payload as never });
const get = (url: string, sid?: string) => app.inject({ method: "GET", url, headers: sid ? as(sid) : {} });

test("닉네임을 정하지 않으면 점수를 올릴 수 없다 (트레일 입장 조건)", async () => {
  const r = await post("/api/ranking/score", "rankaaaa0001", { level: "easy", stage: 1, score: 900, stars: 3 });
  expect(r.statusCode).toBe(400);
  expect(r.json().code).toBe("not_claimed");
});

test("닉네임 등록: 공백 정리 · 규칙 위반 거절 · 다른 사람이 쓰는 이름 거절 · 내가 이름을 바꾸는 건 허용", async () => {
  expect((await post("/api/ranking/claim", "rankaaaa0002", { nickname: "  바다  거북 " })).json().nickname).toBe("바다 거북");
  for (const bad of ["   ", "가".repeat(13), "<b>x</b>"]) {
    const r = await post("/api/ranking/claim", "rankaaaa0003", { nickname: bad });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe("bad_nickname");
  }
  const dup = await post("/api/ranking/claim", "rankaaaa0003", { nickname: "바다거북" }); // 공백·대소문자 무시
  expect(dup.statusCode).toBe(400);
  expect(dup.json().code).toBe("nickname_taken");
  expect((await post("/api/ranking/claim", "rankaaaa0002", { nickname: "바다거북" })).statusCode).toBe(201); // 본인은 변경 가능
});

test("점수 등록 → 순위표(별 → 클리어 수 → 점수), 내 순위, 더 나쁜 기록은 덮어쓰지 않는다", async () => {
  await post("/api/ranking/claim", "rankbbbb0001", { nickname: "하늘" });
  await post("/api/ranking/claim", "rankbbbb0002", { nickname: "구름" });
  await post("/api/ranking/score", "rankbbbb0001", { level: "hard", stage: 1, score: 2400, stars: 2 });
  await post("/api/ranking/score", "rankbbbb0002", { level: "hard", stage: 1, score: 3000, stars: 3 });
  const worse = await post("/api/ranking/score", "rankbbbb0002", { level: "hard", stage: 1, score: 1700, stars: 1 });
  expect(worse.json().improved).toBe(false);
  const better = await post("/api/ranking/score", "rankbbbb0002", { level: "hard", stage: 1, score: 3300, stars: 3 });
  expect(better.json().improved).toBe(true);

  const board = (await get("/api/ranking?level=hard", "rankbbbb0001")).json();
  expect(board.rows.map((x: { nickname: string }) => x.nickname)).toEqual(["구름", "하늘"]);
  expect(board.rows[0]).toMatchObject({ rank: 1, cleared: 1, stars: 3, score: 3300 });
  expect(board.me).toMatchObject({ nickname: "하늘", rank: 2 });
  expect(board.nickname).toBe("하늘");
  const easy = (await get("/api/ranking?level=easy")).json();
  expect(easy.rows.some((x: { nickname: string }) => x.nickname === "구름")).toBe(false);   // 쉬움 기록은 없음
  expect((await get("/api/ranking")).json().total).toBeGreaterThanOrEqual(2);              // 전체
});

test("잘못된 점수·별·스테이지·난이도는 거절된다", async () => {
  await post("/api/ranking/claim", "rankcccc0001", { nickname: "검증" });
  for (const bad of [
    { level: "insane", stage: 1, score: 100, stars: 1 }, { level: "easy", stage: 0, score: 100, stars: 1 }, { level: "easy", stage: 11, score: 100, stars: 1 },
    { level: "easy", stage: 1, score: -1, stars: 1 }, { level: "easy", stage: 1, score: 99999999, stars: 1 }, { level: "easy", stage: 1, score: 100, stars: 4 },
    { level: "easy", stage: 1, score: 100.5, stars: 1 }, { level: "easy", stage: 1, score: "9", stars: 1 },
  ]) expect((await post("/api/ranking/score", "rankcccc0001", bad)).statusCode).toBe(400);
  expect((await get("/api/ranking?level=nope")).statusCode).toBe(400);
});

test("세션 헤더가 없으면 등록할 수 없고, 순위표는 헤더 없이도 볼 수 있다", async () => {
  expect((await app.inject({ method: "POST", url: "/api/ranking/claim", payload: { nickname: "누구" } as never })).statusCode).toBe(400);
  expect((await get("/api/ranking")).statusCode).toBe(200);
});

test("서버를 다시 켜도 랭킹이 남는다 (파일 저장) · 깨진 파일은 .bad로 옮기고 새로 시작한다", async () => {
  await post("/api/ranking/claim", "rankdddd0001", { nickname: "영속" });
  await post("/api/ranking/score", "rankdddd0001", { level: "easy", stage: 3, score: 777, stars: 2 });
  await app.close(); // 종료 시 즉시 저장
  expect(JSON.parse(readFileSync(file, "utf8")).players.length).toBeGreaterThan(0);

  app = await boot();
  const after = (await get("/api/ranking?level=easy", "rankdddd0001")).json();
  expect(after.me).toMatchObject({ nickname: "영속", stars: 2, score: 777 });
  await app.close();

  require("node:fs").writeFileSync(file, "{깨진 json");
  app = await boot();
  expect((await get("/api/ranking")).json().total).toBe(0);
  expect(require("node:fs").existsSync(`${file}.bad`)).toBe(true);
});

test("도메인: 같은 점수면 먼저 달성한 사람이 앞, 기록 없는 사람은 순위표에 없다", () => {
  const a = emptyPlayer("a", "에이", 1000), b = emptyPlayer("b", "비", 500), c = emptyPlayer("c", "씨", 1);
  a.stages.easy[0] = { stars: 3, score: 900 }; b.stages.easy[0] = { stars: 3, score: 900 };
  const rows = leaderboard([a, b, c], "easy").map((x) => x.row.nickname);
  expect(rows).toEqual(["비", "에이"]);
  expect(() => validateScore("easy", 1, 100, 0)).toThrow();
});
