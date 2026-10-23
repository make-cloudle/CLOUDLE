/**
 * 커뮤니티 도메인 모델. 프레임워크(Nest·socket.io)를 전혀 모른다.
 * 프론트엔드 `entities/talk/types.ts`와 같은 모양을 유지한다.
 */
export type MemberId = string;

export interface Member {
  id: MemberId;
  nickname: string;
  /** 아바타 색 (디자인 토큰 이름) */
  tone: "sky" | "mint" | "yellow" | "lavender" | "warn";
}

export interface Room {
  id: string;
  title: string;
  topic: string;
  /** 프론트 라인 아이콘 키 (이모지 대신) */
  icon: "recycle" | "tool" | "air" | "leaf";
  /** 방 상단 고정 안내 — 서비스 원칙(출처·근거)을 대화에서도 지키게 한다 */
  pinned: string;
  /** 빠르게 꺼낼 수 있는 질문 칩 */
  prompts: string[];
}

export type Purpose = "all" | "repair" | "reuse" | "resell" | "disposal";

/** CLOUDLE NOTE(메모장)와 같은 필드 — Cloud Lab에서 그대로 열 수 있다 */
export interface Memo {
  product_name: string;
  condition: string;
  region: string;
  purpose: Purpose;
  note: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  kind: "image" | "file";
}

interface Base {
  id: string;
  roomId: string;
  at: number; // epoch ms (서버 시각이 기준)
}
export interface TextMessage extends Base { type: "text"; author: Member; text: string; reactions: Record<string, MemberId[]> }
export interface AttachmentMessage extends Base { type: "attachment"; author: Member; text: string; attachment: Attachment; reactions: Record<string, MemberId[]> }
export interface MemoMessage extends Base { type: "memo"; author: Member; memo: Memo; source: "shared" | "summary"; engine?: "llm" | "offline"; basedOn?: number; reactions: Record<string, MemberId[]> }
export interface SystemMessage extends Base { type: "system"; event: "join" | "leave"; nickname: string }

/** 에코 버킷: Cloud Lab에서 담아 둔 좋은 결과(방법)를 방에 공유한 큰 카드 */
export type BucketKind = "result" | "reuse" | "repair" | "disposal" | "basic_info";
export interface BucketEntry {
  title: string;
  item: string;
  kind: BucketKind;
  text: string;
  sources: { title: string; url: string }[];
}
export interface BucketMessage extends Base { type: "bucket"; author: Member; bucket: BucketEntry; reactions: Record<string, MemberId[]> }

export type ChatMessage = TextMessage | AttachmentMessage | MemoMessage | BucketMessage | SystemMessage;
export type AuthoredMessage = Exclude<ChatMessage, SystemMessage>;

/** 허용 리액션 — 일반 대화에도 어울리는 평범한 감정 표현 */
export const REACTIONS = ["like", "love", "laugh", "wow", "sad", "eco"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** 서버 → 클라이언트 실시간 이벤트 (전송 수단과 무관한 도메인 이벤트) */
export type RoomEvent =
  | { kind: "message"; message: ChatMessage }
  | { kind: "reaction"; messageId: string; reactions: Record<string, MemberId[]> }
  | { kind: "presence"; members: Member[]; online: MemberId[] }
  | { kind: "typing"; member: Member; typing: boolean };

export class CommunityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/** 닉네임 규칙: 공백 정리 후 1~12자, 제어문자·꺾쇠 금지 (코드 포인트 기준이라 이모지도 1자) */
export const NICKNAME_MAX = 12;
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const len = [...name].length;
  if (len < 1 || len > NICKNAME_MAX) return null;
  if (/[\u0000-\u001f\u007f<>]/.test(name)) return null;
  return name;
}
