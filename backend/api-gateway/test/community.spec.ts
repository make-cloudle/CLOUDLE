import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { io, type Socket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { createApp } from "../src/main";
import { RagEnginePort } from "../src/shared/ports/rag-engine.port";

/** 실제 socket.io 서버를 띄우고 두 사람(3000=지구미, 3001=예나)으로 접속해 본다. rag-service는 가짜. */
class FakeEngine extends RagEnginePort {
  summaries: { lines: string[] }[] = [];
  async call<T>(_m: string, path: string, opts?: { body?: unknown }): Promise<T> {
    if (path === "/api/memo/summarize") {
      this.summaries.push(opts?.body as { lines: string[] });
      return { product_name: "전자레인지", condition: "고장", purpose: "disposal", note: "- 대형폐기물 스티커", engine: "offline" } as T;
    }
    return {} as T;
  }
  async stream(): Promise<ReadableStream<Uint8Array>> { return new ReadableStream(); }
  async upload<T>(): Promise<T> { return {} as T; }
}

let app: NestFastifyApplication;
let url: string;
const engine = new FakeEngine();
const sockets: Socket[] = [];

beforeAll(async () => {
  process.env.CORS_ORIGINS = "https://cloudle.vercel.app"; // 운영과 같은 허용 목록
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RagEnginePort).useValue(engine).compile();
  // main.ts의 createApp을 그대로 써서 CORS·소켓 어댑터까지 실제와 같게 띄운다
  app = await createApp(async (adapter) => mod.createNestApplication<NestFastifyApplication>(adapter));
  await app.listen(0, "127.0.0.1");
  url = `${await app.getUrl()}/community`.replace("[::1]", "127.0.0.1");
});
afterEach(() => { sockets.splice(0).forEach((s) => s.disconnect()); });
afterAll(() => app.close());

function connect(port: number): Promise<{ s: Socket; me: { nickname: string } }> {
  const s = io(url, { transports: ["websocket"], extraHeaders: { origin: `http://localhost:${port}` }, auth: { sessionId: `sess${port}abcd` }, forceNew: true });
  sockets.push(s);
  return new Promise((resolve, reject) => {
    s.once("me", (me) => resolve({ s, me }));
    s.once("connect_error", reject);
  });
}
const emit = <T = any>(s: Socket, ev: string, body: unknown) => s.timeout(3000).emitWithAck(ev, body) as Promise<T>;
const next = <T = any>(s: Socket, ev: string, pred: (x: T) => boolean = () => true) =>
  new Promise<T>((resolve) => { const h = (x: T) => { if (pred(x)) { s.off(ev, h); resolve(x); } }; s.on(ev, h); });

test("포트로 사람이 정해진다: 3000=지구미, 3001=예나", async () => {
  const [a, b] = await Promise.all([connect(3000), connect(3001)]);
  expect(a.me.nickname).toBe("지구미");
  expect(b.me.nickname).toBe("예나");
});

test("허용되지 않은 Origin은 소켓 접속이 거절된다 (CORS와 별개로 서버가 검사)", async () => {
  const bad = io(url, { transports: ["websocket"], extraHeaders: { origin: "https://evil.example.com" }, forceNew: true, reconnection: false, timeout: 3000 });
  sockets.push(bad);
  const err = await new Promise<string>((resolve) => { bad.once("connect_error", (e) => resolve(e.message)); bad.once("me", () => resolve("connected")); });
  expect(err).not.toBe("connected");
});

test("게스트는 세션마다 다른 사람이다 (세션 ID 앞 4글자가 같아도 합쳐지지 않는다)", async () => {
  const mkGuest = (sid: string) => new Promise<{ s: Socket; me: { id: string; nickname: string } }>((resolve) => {
    const s = io(url, { transports: ["websocket"], extraHeaders: { origin: "https://cloudle.vercel.app" }, auth: { sessionId: sid }, forceNew: true });
    sockets.push(s);
    s.once("me", (me) => resolve({ s, me }));
  });
  const [g1, g2] = await Promise.all([mkGuest("abcd1111aaaa"), mkGuest("abcd2222bbbb")]);
  expect(g1.me.nickname).toBe(g2.me.nickname);       // 보이는 이름은 같을 수 있지만
  expect(g1.me.id).not.toBe(g2.me.id);               // 사람(식별자)은 다르다
});

test("입장 알림 · 메시지 방송 · 리액션", async () => {
  const { s: a } = await connect(3000);
  const { s: b } = await connect(3001);
  const joinA = await emit(a, "room:join", { roomId: "sorting" });
  expect(joinA.ok).toBe(true);
  expect(joinA.room.title).toBe("분리배출 Q&A");

  const joined = next<any>(a, "message", (x) => x.message.type === "system" && x.message.nickname === "예나");
  await emit(b, "room:join", { roomId: "sorting" });
  expect((await joined).message.event).toBe("join");

  const got = next<any>(b, "message", (x) => x.message.type === "text");
  const sent = await emit(a, "message:send", { roomId: "sorting", text: "전자레인지 어디에 버려요?" });
  const recv = await got;
  expect(recv.message.text).toBe("전자레인지 어디에 버려요?");
  expect(recv.message.author.nickname).toBe("지구미");

  const r = await emit(b, "reaction:toggle", { roomId: "sorting", messageId: sent.message.id, reaction: "like" });
  expect(r.reactions.like).toEqual(["u:예나"]);
  expect(await emit(b, "reaction:toggle", { roomId: "sorting", messageId: sent.message.id, reaction: "helpful" })).toEqual(expect.objectContaining({ ok: false, code: "invalid_request" }));

  const bucket = { title: "무선 이어폰 · 수리", item: "무선 이어폰", kind: "repair", text: "배터리만 교체하면 돼요", sources: [{ title: "위키백과", url: "https://ko.wikipedia.org" }] };
  const gotBucket = next<any>(b, "message", (x) => x.message.type === "bucket");
  expect((await emit(a, "bucket:share", { roomId: "sorting", bucket })).ok).toBe(true);
  expect((await gotBucket).message.bucket.title).toBe("무선 이어폰 · 수리");
});

test("들어가지 않은 방에는 보낼 수 없고, 잘못된 입력은 code/message로 돌아온다", async () => {
  const { s } = await connect(3000);
  expect(await emit(s, "message:send", { roomId: "air", text: "hi" })).toEqual(expect.objectContaining({ ok: false, code: "not_member" }));
  expect(await emit(s, "message:send", { roomId: "../etc", text: "" })).toEqual(expect.objectContaining({ ok: false, code: "invalid_request" }));
});

test("AI 메모 요약은 최근 대화 줄만 보내고, 같은 대화는 다시 요약하지 않는다", async () => {
  const { s: a } = await connect(3000);
  const { s: b } = await connect(3001);
  await emit(a, "room:join", { roomId: "repair" });
  await emit(b, "room:join", { roomId: "repair" });
  await emit(a, "message:send", { roomId: "repair", text: "전자레인지가 고장났어요" });
  await emit(b, "message:send", { roomId: "repair", text: "대형폐기물 스티커 붙이면 돼요" });

  const before = engine.summaries.length;
  const r1 = await emit(a, "memo:summarize", { roomId: "repair" });
  expect(r1.ok).toBe(true);
  expect(r1.message.type).toBe("memo");
  expect(r1.message.memo.product_name).toBe("전자레인지");
  expect(engine.summaries.at(-1)!.lines).toEqual(["지구미: 전자레인지가 고장났어요", "예나: 대형폐기물 스티커 붙이면 돼요"]);

  const r2 = await emit(b, "memo:summarize", { roomId: "repair" });
  expect(r2.message.id).toBe(r1.message.id);
  expect(engine.summaries.length).toBe(before + 1);
});

test("카카오톡식 참여: 참여 확인 때만 입장 알림, 이동·끊김은 조용히, 나가기 때만 퇴장 알림", async () => {
  const { s: watcher } = await connect(3001);
  await emit(watcher, "room:join", { roomId: "zerowaste" });
  const systems: string[] = [];
  watcher.on("message", (x: any) => { if (x.message.type === "system") systems.push(`${x.message.nickname}:${x.message.event}`); });

  // 참여 전에는 열 수 없다 (목록에서 실수로 눌러도 들어가지지 않음)
  const { s: tab1 } = await connect(3000);
  expect(await emit(tab1, "room:open", { roomId: "zerowaste" })).toEqual(expect.objectContaining({ ok: false, code: "not_member" }));

  await emit(tab1, "room:join", { roomId: "zerowaste" });                 // 참여 확인 → 알림 1번
  const { s: tab2 } = await connect(3000);
  await emit(tab2, "room:open", { roomId: "zerowaste" });                 // 다른 탭에서 다시 열기 → 알림 없음
  await emit(tab2, "room:join", { roomId: "zerowaste" });                 // 이미 참여 중이면 다시 확인해도 알림 없음
  tab1.disconnect();                                                      // 탭 닫기·새로고침 → 알림 없음
  await emit(tab2, "room:close", { roomId: "zerowaste" });                // 다른 메뉴로 이동 → 알림 없음
  await new Promise((r) => setTimeout(r, 200));
  expect(systems).toEqual(["지구미:join"]);

  const rooms = await app.inject({ method: "GET", url: "/api/community/rooms", headers: { origin: "http://localhost:3000" } });
  expect(rooms.json().rooms.find((r: any) => r.id === "zerowaste")).toEqual(expect.objectContaining({ joined: true, members: 2 }));

  await emit(tab2, "room:exit", { roomId: "zerowaste" });                 // 나가기 → 퇴장 알림
  await new Promise((r) => setTimeout(r, 200));
  expect(systems).toEqual(["지구미:join", "지구미:leave"]);
  expect(await emit(tab2, "message:send", { roomId: "zerowaste", text: "hi" })).toEqual(expect.objectContaining({ code: "not_member" }));
});

test("방 목록과 내 닉네임은 HTTP로", async () => {
  const me = await app.inject({ method: "GET", url: "/api/community/me", headers: { origin: "http://localhost:3001" } });
  expect(me.json().nickname).toBe("예나");
  const rooms = await app.inject({ method: "GET", url: "/api/community/rooms" });
  expect(rooms.json().rooms.map((r: { id: string }) => r.id)).toEqual(["sorting", "repair", "air", "zerowaste"]);
});

test("첨부 업로드는 방에 들어간 사람만, 허용 형식만", async () => {
  const boundary = "----cloudle";
  const body = (name: string, type: string) => Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\nhello\r\n--${boundary}--\r\n`);
  const headers = { "x-session-id": "sess3000abcd", origin: "http://localhost:3000", "content-type": `multipart/form-data; boundary=${boundary}` };

  const notIn = await app.inject({ method: "POST", url: "/api/community/rooms/air/attachments", headers, payload: body("a.txt", "text/plain") });
  expect(notIn.json().code).toBe("not_member");

  const { s } = await connect(3000);
  await emit(s, "room:join", { roomId: "air" });
  const bad = await app.inject({ method: "POST", url: "/api/community/rooms/air/attachments", headers, payload: body("a.exe", "application/x-msdownload") });
  expect(bad.json().code).toBe("unsupported_file");
  const ok = await app.inject({ method: "POST", url: "/api/community/rooms/air/attachments", headers, payload: body("guide.txt", "text/plain") });
  expect(ok.json().type).toBe("attachment");
  const file = await app.inject({ method: "GET", url: `/api/community/attachments/${ok.json().attachment.id}` });
  expect(file.body).toBe("hello");
  expect(file.headers["content-disposition"]).toContain("attachment");
});

