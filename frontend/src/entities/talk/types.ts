import type { BucketEntry } from "@/entities/eco-bucket/types";

/** Community 도메인 타입 — 게이트웨이 `modules/community/domain/community.types.ts`와 같은 모양. */
export type Member = { id: string; nickname: string; tone: "sky" | "mint" | "yellow" | "lavender" | "warn" };

export type Room = {
  id: string;
  title: string;
  topic: string;
  icon: "recycle" | "tool" | "air" | "leaf";
  pinned: string;
  prompts: string[];
  /** 참여자 수 · 지금 보고 있는 사람 수 · 내가 참여 중인지 (방 목록용) */
  members?: number;
  online?: number;
  joined?: boolean;
};

export type Purpose = "all" | "repair" | "reuse" | "resell" | "disposal";
export type Memo = { product_name: string; condition: string; region: string; purpose: Purpose; note: string };
export type Attachment = { id: string; name: string; mimetype: string; size: number; kind: "image" | "file" };
export type Reactions = Record<string, string[]>;
/** 일반 대화에도 어울리는 평범한 반응 (게이트웨이 REACTIONS와 같은 순서) */
export const REACTIONS = ["like", "love", "laugh", "wow", "sad", "eco"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REACTION_EMOJI: Record<Reaction, string> = { like: "👍", love: "❤️", laugh: "😂", wow: "😮", sad: "😢", eco: "🌱" };

type Base = { id: string; roomId: string; at: number };
export type TextMessage = Base & { type: "text"; author: Member; text: string; reactions: Reactions };
export type AttachmentMessage = Base & { type: "attachment"; author: Member; text: string; attachment: Attachment; reactions: Reactions };
export type MemoMessage = Base & { type: "memo"; author: Member; memo: Memo; source: "shared" | "summary"; engine?: "llm" | "offline"; basedOn?: number; reactions: Reactions };
export type BucketMessage = Base & { type: "bucket"; author: Member; bucket: BucketEntry; reactions: Reactions };
export type SystemMessage = Base & { type: "system"; event: "join" | "leave"; nickname: string };
export type ChatMessage = TextMessage | AttachmentMessage | MemoMessage | BucketMessage | SystemMessage;
export type AuthoredMessage = Exclude<ChatMessage, SystemMessage>;

export const TONE_BG: Record<Member["tone"], string> = {
  sky: "bg-sky-soft text-sky-deep",
  mint: "bg-mint/70 text-mint-deep",
  yellow: "bg-yellow/80 text-[#8a6416] dark:text-yellow-100",
  lavender: "bg-lavender/80 text-[#5b4fb0] dark:text-violet-200",
  warn: "bg-warn-soft text-warn",
};
