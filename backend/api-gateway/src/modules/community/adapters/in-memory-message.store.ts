import { Injectable } from "@nestjs/common";
import type { ChatMessage, MemberId } from "../domain/community.types";
import { MessageStorePort } from "../ports/message-store.port";

const KEEP_PER_ROOM = 300;

/** 메모리 어댑터: 방마다 최근 300개만 보관한다 (재시작하면 사라짐 — 로그인 없는 서비스의 기본값). */
@Injectable()
export class InMemoryMessageStore extends MessageStorePort {
  private readonly rooms = new Map<string, ChatMessage[]>();

  async append(message: ChatMessage) {
    const list = this.rooms.get(message.roomId) ?? [];
    list.push(message);
    if (list.length > KEEP_PER_ROOM) list.splice(0, list.length - KEEP_PER_ROOM);
    this.rooms.set(message.roomId, list);
  }

  async recent(roomId: string, limit: number) {
    return (this.rooms.get(roomId) ?? []).slice(-limit);
  }

  async toggleReaction(roomId: string, messageId: string, reaction: string, memberId: MemberId) {
    const msg = this.rooms.get(roomId)?.find((m) => m.id === messageId);
    if (!msg || msg.type === "system") return null;
    const who = new Set(msg.reactions[reaction] ?? []);
    if (who.has(memberId)) who.delete(memberId);
    else who.add(memberId);
    msg.reactions = { ...msg.reactions, [reaction]: [...who] };
    return msg.reactions;
  }
}
