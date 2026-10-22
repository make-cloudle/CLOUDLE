import type { ChatMessage, MemberId } from "../domain/community.types";

/** 메시지 저장소 포트. 지금은 메모리, 나중에 Redis·DB 어댑터로 바꿔 끼운다. */
export abstract class MessageStorePort {
  abstract append(message: ChatMessage): Promise<void>;
  /** 오래된 것 → 최신 순으로 최근 limit개 */
  abstract recent(roomId: string, limit: number): Promise<ChatMessage[]>;
  abstract toggleReaction(roomId: string, messageId: string, reaction: string, memberId: MemberId): Promise<Record<string, MemberId[]> | null>;
}
