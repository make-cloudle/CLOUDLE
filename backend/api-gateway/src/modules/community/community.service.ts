import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  type AuthoredMessage, type BucketEntry, type ChatMessage, CommunityError, type Member, type MemberId, type Memo,
  REACTIONS, type Reaction, type Room,
} from "./domain/community.types";
import { Roster } from "./domain/presence";
import { findRoom, ROOMS } from "./domain/rooms";
import { AttachmentStorePort } from "./ports/attachment-store.port";
import { MemoSummarizerPort } from "./ports/memo-summarizer.port";
import { MessageStorePort } from "./ports/message-store.port";
import { RoomEventsPort } from "./ports/room-events.port";

export const HISTORY_LIMIT = 60;
/** AI 메모 요약에 넣는 최근 대화 줄 수 — 토큰을 아끼려고 방 전체가 아니라 이만큼만 쓴다 */
export const SUMMARY_LINES = 20;
const SUMMARY_COOLDOWN_MS = 20_000;
const BURST = { windowMs: 10_000, max: 8 };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const FILE_TYPES = ["application/pdf", "text/plain", "text/markdown"];

type Postable = Extract<AuthoredMessage, { type: "text" | "attachment" }>;
export type RoomSnapshot = { room: Room; me: Member; members: Member[]; online: MemberId[]; history: ChatMessage[] };
export type RoomSummary = Room & { members: number; online: number; joined: boolean };

/**
 * 커뮤니티 유스케이스. 소켓·HTTP를 모르고 포트에만 의존한다.
 *
 * 참여 모델 (카카오톡 방식)
 *   join  — "참여하시겠습니까?" 확인 → 명단에 추가 + "OO님이 들어왔습니다." (처음 한 번만)
 *   open  — 이미 참여한 방 화면을 연다 (알림 없음). 참여하지 않은 방은 열 수 없다.
 *   close — 다른 메뉴로 이동·새로고침·연결 끊김 (알림 없음, 명단 유지)
 *   exit  — "나가기" → 명단에서 제거 + "OO님이 나갔습니다."
 */
@Injectable()
export class CommunityService {
  private readonly roster = new Roster();
  private readonly bursts = new Map<MemberId, number[]>();
  private readonly lastSummary = new Map<string, { at: number; basedOnId: string; message: ChatMessage }>();
  private readonly summarizing = new Set<string>();

  constructor(
    private readonly store: MessageStorePort,
    private readonly files: AttachmentStorePort,
    private readonly events: RoomEventsPort,
    private readonly summarizer: MemoSummarizerPort,
  ) {}

  /** 방 목록 + 내가 참여 중인지 (목록에서 "참여 중" 표시와 확인 창 여부를 정한다) */
  rooms(memberId?: MemberId): RoomSummary[] {
    return ROOMS.map((r) => ({
      ...r,
      members: this.roster.memberCount(r.id),
      online: this.roster.onlineIds(r.id).length,
      joined: !!memberId && this.roster.isMember(r.id, memberId),
    }));
  }

  /* ── 참여 · 열기 · 닫기 · 나가기 ─────────────────────────────── */
  async join(roomId: string, member: Member): Promise<RoomSnapshot> {
    this.room(roomId);
    if (this.roster.join(roomId, member)) await this.announce(roomId, "join", member.nickname);
    return this.open(roomId, member);
  }

  async open(roomId: string, member: Member): Promise<RoomSnapshot> {
    const room = this.room(roomId);
    if (!this.roster.isMember(roomId, member.id)) throw new CommunityError("not_member", "먼저 채팅방에 참여해 주세요.");
    this.roster.connect(roomId, member.id);
    this.publishPresence(roomId);
    return {
      room, me: member, members: this.roster.list(roomId), online: this.roster.onlineIds(roomId),
      history: await this.store.recent(roomId, HISTORY_LIMIT),
    };
  }

  close(roomId: string, member: Member) {
    this.roster.disconnect(roomId, member.id);
    this.events.publish(roomId, { kind: "typing", member, typing: false });
    this.publishPresence(roomId);
  }

  async exit(roomId: string, member: Member) {
    this.room(roomId);
    if (!this.roster.remove(roomId, member.id)) return;
    this.events.publish(roomId, { kind: "typing", member, typing: false });
    this.publishPresence(roomId);
    await this.announce(roomId, "leave", member.nickname);
  }

  /* ── 메시지 ──────────────────────────────────────────────────── */
  async sendText(roomId: string, member: Member, text: string) {
    this.mustBeIn(roomId, member);
    const clean = text.replace(/\s+$/, "").slice(0, 1000);
    if (!clean.trim()) throw new CommunityError("empty", "메시지를 입력해 주세요.");
    return this.post({ ...this.base(roomId), type: "text", author: member, text: clean, reactions: {} });
  }

  async sendAttachment(roomId: string, member: Member, file: { filename: string; mimetype: string; data: Buffer }, caption = "") {
    this.mustBeIn(roomId, member);
    const kind = IMAGE_TYPES.includes(file.mimetype) ? "image" : FILE_TYPES.includes(file.mimetype) ? "file" : null;
    if (!kind) throw new CommunityError("unsupported_file", "사진(png·jpg·webp·gif) 또는 pdf·txt·md만 올릴 수 있어요.");
    const attachment = await this.files.save({
      roomId, name: file.filename.slice(0, 120) || "file", mimetype: file.mimetype, size: file.data.length, kind, data: file.data,
    });
    return this.post({ ...this.base(roomId), type: "attachment", author: member, text: caption.slice(0, 300), attachment, reactions: {} });
  }

  async shareMemo(roomId: string, member: Member, memo: Memo) {
    this.mustBeIn(roomId, member);
    if (!memo.product_name.trim() && !memo.note.trim()) throw new CommunityError("empty_memo", "메모에 물건 이름이나 내용을 적어 주세요.");
    return this.post({ ...this.base(roomId), type: "memo", author: member, memo, source: "shared", reactions: {} });
  }

  async shareBucket(roomId: string, member: Member, bucket: BucketEntry) {
    this.mustBeIn(roomId, member);
    if (!bucket.title.trim() || !bucket.text.trim()) throw new CommunityError("empty_bucket", "공유할 에코 버킷 내용이 비어 있어요.");
    const sources = bucket.sources.filter((s) => /^https?:\/\//.test(s.url) || !s.url).slice(0, 3);
    return this.post({ ...this.base(roomId), type: "bucket", author: member, bucket: { ...bucket, sources }, reactions: {} });
  }

  async react(roomId: string, member: Member, messageId: string, reaction: Reaction) {
    this.mustBeIn(roomId, member, false);
    if (!REACTIONS.includes(reaction)) throw new CommunityError("bad_reaction", "지원하지 않는 반응이에요.");
    const reactions = await this.store.toggleReaction(roomId, messageId, reaction, member.id);
    if (!reactions) throw new CommunityError("no_message", "메시지를 찾을 수 없어요.");
    this.events.publish(roomId, { kind: "reaction", messageId, reactions });
    return reactions;
  }

  typing(roomId: string, member: Member, typing: boolean) {
    if (this.roster.isMember(roomId, member.id)) this.events.publish(roomId, { kind: "typing", member, typing });
  }

  /* ── AI 메모 요약: 최근 N줄만 → CLOUDLE MEMO ─────────────────── */
  async summarizeMemo(roomId: string, member: Member, lang: string, sessionId: string, region = "대한민국") {
    this.mustBeIn(roomId, member, false);
    const recent = (await this.store.recent(roomId, HISTORY_LIMIT))
      .filter((m): m is Postable => m.type === "text" || m.type === "attachment")
      .slice(-SUMMARY_LINES);
    if (recent.length < 2) throw new CommunityError("too_short", "요약하려면 대화가 2줄 이상 필요해요.");

    // 같은 대화를 다시 요약하면 이전 결과를 재사용(토큰 0), 짧은 시간 연타는 막는다
    const prev = this.lastSummary.get(roomId);
    const lastId = recent[recent.length - 1].id;
    if (prev?.basedOnId === lastId) return prev.message;
    if (prev && Date.now() - prev.at < SUMMARY_COOLDOWN_MS) {
      throw new CommunityError("cooldown", "방금 요약했어요. 잠시 후 다시 시도해 주세요.");
    }
    if (this.summarizing.has(roomId)) throw new CommunityError("busy", "구름이 이미 정리하고 있어요.");

    const lines = recent.map((m) => `${m.author.nickname}: ${m.type === "text" ? m.text : `[첨부 ${m.attachment.name}] ${m.text}`}`);
    this.summarizing.add(roomId);
    const s = await this.summarizer.summarize(lines, lang, sessionId).finally(() => this.summarizing.delete(roomId));
    const memo: Memo = { product_name: s.product_name, condition: s.condition, region, purpose: s.purpose, note: s.note };
    const message = await this.post({
      ...this.base(roomId), type: "memo", author: member, memo, source: "summary", engine: s.engine, basedOn: lines.length, reactions: {},
    });
    this.lastSummary.set(roomId, { at: Date.now(), basedOnId: lastId, message });
    return message;
  }

  getAttachment(id: string) {
    return this.files.get(id);
  }

  /* ── 내부 ───────────────────────────────────────────────────── */
  private room(roomId: string) {
    const room = findRoom(roomId);
    if (!room) throw new CommunityError("no_room", "없는 채팅방이에요.");
    return room;
  }

  private mustBeIn(roomId: string, member: Member, countBurst = true) {
    this.room(roomId);
    if (!this.roster.isMember(roomId, member.id)) throw new CommunityError("not_member", "먼저 채팅방에 참여해 주세요.");
    if (!countBurst) return;
    const now = Date.now();
    const hits = (this.bursts.get(member.id) ?? []).filter((t) => now - t < BURST.windowMs);
    if (hits.length >= BURST.max) throw new CommunityError("rate_limited", "메시지를 너무 빨리 보내고 있어요. 잠시만요.");
    this.bursts.set(member.id, [...hits, now]);
  }

  private base(roomId: string) {
    return { id: randomUUID(), roomId, at: Date.now() };
  }

  private publishPresence(roomId: string) {
    this.events.publish(roomId, { kind: "presence", members: this.roster.list(roomId), online: this.roster.onlineIds(roomId) });
  }

  private async post(message: ChatMessage) {
    await this.store.append(message);
    this.events.publish(message.roomId, { kind: "message", message });
    return message;
  }

  private announce(roomId: string, event: "join" | "leave", nickname: string) {
    return this.post({ ...this.base(roomId), type: "system", event, nickname });
  }
}
