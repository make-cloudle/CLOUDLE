"use client";

import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import type { BucketEntry } from "@/entities/eco-bucket/types";
import type { AuthoredMessage, ChatMessage, Member, Memo, Reaction, Reactions, Room } from "@/entities/talk/types";
import { apiBase, request, sessionId } from "@/shared/api/client";
import { mergeMessages } from "./timeline";

/**
 * 채팅 상태 + 소켓 연결. 화면은 이 스토어만 보고, socket.io는 이 파일 밖으로 나가지 않는다.
 * 서버 이벤트: me · message · reaction · presence · typing · failure
 *
 * 참여 모델(카카오톡 방식): join = "참여하시겠습니까?" 확인(처음만 입장 알림) · open = 참여한 방 다시 열기 ·
 * close = 화면에서 나옴(알림 없음, 참여 유지) · exit = "나가기"(퇴장 알림)
 */
type Ack<T> = ({ ok: true } & T) | { ok: false; code: string; message: string };
export class TalkError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

type Status = "idle" | "connecting" | "online" | "offline";
type State = {
  status: Status;
  me: Member | null;
  room: Room | null;
  members: Member[];
  /** 지금 방 화면을 보고 있는 참여자 */
  online: string[];
  messages: ChatMessage[];
  typing: Record<string, { member: Member; until: number }>;
  join: (roomId: string) => Promise<void>;
  open: (roomId: string) => Promise<void>;
  close: () => void;
  exit: () => Promise<void>;
  send: (text: string) => Promise<void>;
  react: (messageId: string, reaction: Reaction) => Promise<void>;
  setTyping: (typing: boolean) => void;
  shareMemo: (memo: Memo) => Promise<void>;
  shareBucket: (bucket: BucketEntry) => Promise<void>;
  summarize: (lang: string, region?: string) => Promise<AuthoredMessage>;
  upload: (file: File, caption?: string) => Promise<void>;
};

let socket: Socket | null = null;

async function call<T>(event: string, body: unknown): Promise<T> {
  const s = connect();
  let res: Ack<T>;
  try {
    res = (await s.timeout(15_000).emitWithAck(event, body)) as Ack<T>;
  } catch {
    throw new TalkError("timeout", "서버 응답이 늦어요. 연결을 확인해 주세요.");
  }
  if (!res.ok) throw new TalkError(res.code, res.message);
  return res;
}

function connect(): Socket {
  if (socket) return socket;
  const set = useTalk.setState;
  const get = useTalk.getState;
  socket = io(`${apiBase()}/community`, { auth: { sessionId: sessionId() }, transports: ["websocket", "polling"] });
  set({ status: "connecting" });
  socket.on("connect", () => {
    set({ status: "online" });
    // 재연결 시 서버는 방 정보를 잃는다 → 보고 있던 방에 다시 들어간다
    const room = get().room;
    if (room) void get().open(room.id).catch(() => set({ room: null }));
  });
  socket.on("disconnect", () => set({ status: "offline" }));
  socket.on("connect_error", () => set({ status: "offline" }));
  socket.on("me", (me: Member) => set({ me }));
  socket.on("message", ({ roomId, message }: { roomId: string; message: ChatMessage }) => {
    if (roomId !== get().room?.id) return;
    set((s) => ({ messages: mergeMessages(s.messages, [message]) }));
    if (message.type !== "system") clearTyping(message.author.id);
  });
  socket.on("reaction", ({ roomId, messageId, reactions }: { roomId: string; messageId: string; reactions: Reactions }) => {
    if (roomId !== get().room?.id) return;
    set((s) => ({ messages: s.messages.map((m) => (m.id === messageId && m.type !== "system" ? { ...m, reactions } : m)) }));
  });
  socket.on("presence", ({ roomId, members, online }: { roomId: string; members: Member[]; online: string[] }) => {
    if (roomId === get().room?.id) set({ members, online });
  });
  socket.on("typing", ({ roomId, member, typing }: { roomId: string; member: Member; typing: boolean }) => {
    if (roomId !== get().room?.id || member.id === get().me?.id) return;
    if (!typing) return clearTyping(member.id);
    set((s) => ({ typing: { ...s.typing, [member.id]: { member, until: Date.now() + 5_000 } } }));
  });
  return socket;
}

function clearTyping(id: string) {
  useTalk.setState((s) => {
    if (!s.typing[id]) return s;
    const next = { ...s.typing };
    delete next[id];
    return { typing: next };
  });
}

let typingSent = 0;

type Snapshot = { room: Room; me: Member; members: Member[]; online: string[]; history: ChatMessage[] };
async function enter(event: "room:join" | "room:open", roomId: string) {
  const { room: prev } = useTalk.getState();
  if (prev && prev.id !== roomId) useTalk.getState().close();
  const snap = await call<Snapshot>(event, { roomId });
  useTalk.setState((s) => ({
    room: snap.room, me: snap.me, members: snap.members, online: snap.online,
    messages: mergeMessages(prev?.id === roomId ? s.messages : [], snap.history),
  }));
}

export const useTalk = create<State>((set, get) => ({
  status: "idle",
  me: null,
  room: null,
  members: [],
  online: [],
  messages: [],
  typing: {},

  join: (roomId) => enter("room:join", roomId),
  open: (roomId) => enter("room:open", roomId),

  close: () => {
    const room = get().room;
    set({ room: null, messages: [], members: [], online: [], typing: {} });
    if (room && socket?.connected) socket.emit("room:close", { roomId: room.id });
  },

  exit: async () => {
    const room = get().room;
    if (!room) return;
    await call("room:exit", { roomId: room.id });
    set({ room: null, messages: [], members: [], online: [], typing: {} });
  },

  send: async (text) => {
    const room = get().room;
    if (!room) return;
    get().setTyping(false);
    await call("message:send", { roomId: room.id, text });
  },

  react: async (messageId, reaction) => {
    const room = get().room;
    if (room) await call("reaction:toggle", { roomId: room.id, messageId, reaction });
  },

  setTyping: (typing) => {
    const room = get().room;
    if (!room || !socket?.connected) return;
    const now = Date.now();
    if (typing && now - typingSent < 2_000) return; // 2초에 한 번만
    typingSent = typing ? now : 0;
    socket.emit("typing", { roomId: room.id, typing });
  },

  shareMemo: async (memo) => {
    const room = get().room;
    if (room) await call("memo:share", { roomId: room.id, memo });
  },

  shareBucket: async (bucket) => {
    const room = get().room;
    const { title, item, kind, text, sources } = bucket; // 저장용 id·createdAt은 보내지 않는다
    if (room) await call("bucket:share", { roomId: room.id, bucket: { title, item, kind, text, sources } });
  },

  summarize: async (lang, region) => {
    const room = get().room;
    if (!room) throw new TalkError("not_member", "먼저 채팅방에 참여해 주세요.");
    const res = await call<{ message: AuthoredMessage }>("memo:summarize", { roomId: room.id, lang, ...(region ? { region } : {}) });
    return res.message;
  },

  upload: async (file, caption = "") => {
    const room = get().room;
    if (!room) return;
    const fd = new FormData();
    fd.append("caption", caption); // 파일보다 먼저 (서버가 필드를 먼저 읽는다)
    fd.append("file", file, file.name);
    try {
      await request(`/api/community/rooms/${room.id}/attachments`, { method: "POST", body: fd });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      throw new TalkError(err.code ?? "upload_failed", err.message ?? "upload failed");
    }
  },
}));

/** 방 목록(접속자 수 포함) */
export const getRooms = () => request<{ rooms: Room[] }>("/api/community/rooms");

/** 소켓 연결을 시작한다 (방 목록 화면에서도 내 닉네임을 바로 보이게) */
export const ensureConnected = () => void connect();

export const attachmentUrl = (id: string) => `${apiBase()}/api/community/attachments/${id}`;

/** 오래된 "입력 중" 표시 정리 */
export function pruneTyping() {
  const now = Date.now();
  Object.entries(useTalk.getState().typing).forEach(([id, t]) => { if (t.until < now) clearTyping(id); });
}
