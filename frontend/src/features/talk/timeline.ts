import type { ChatMessage } from "@/entities/talk/types";

/**
 * 카카오톡식 표시 규칙 (순수 함수 — 화면과 분리해 검증하기 쉽게).
 * - 같은 사람이 같은 "분" 안에 연달아 보낸 말풍선 묶음은 **마지막 말풍선에만** 시간을 붙인다.
 * - 묶음의 첫 말풍선에만 닉네임·아바타를 붙인다.
 * - 날짜가 바뀌면 날짜 구분선을 넣는다.
 */
export type Row =
  | { kind: "date"; key: string; at: number }
  | { kind: "msg"; key: string; message: ChatMessage; showTime: boolean; showAuthor: boolean };

const minuteKey = (t: number) => Math.floor(t / 60_000);
const dayKey = (t: number) => new Date(t).toDateString();
const authorOf = (m?: ChatMessage) => (m && m.type !== "system" ? m.author.id : null);

export function sameGroup(a?: ChatMessage, b?: ChatMessage): boolean {
  const ida = authorOf(a);
  return !!a && !!b && ida !== null && ida === authorOf(b) && minuteKey(a.at) === minuteKey(b.at);
}

export function buildRows(messages: ChatMessage[]): Row[] {
  const rows: Row[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || dayKey(prev.at) !== dayKey(m.at)) rows.push({ kind: "date", key: `d-${dayKey(m.at)}`, at: m.at });
    rows.push({ kind: "msg", key: m.id, message: m, showTime: !sameGroup(m, next), showAuthor: !sameGroup(prev, m) || dayKey(prev.at) !== dayKey(m.at) });
  });
  return rows;
}

/** 말풍선 옆 시간: 시:분 (마우스를 올리면 초까지) */
export const timeLabel = (t: number, lang: string) =>
  new Date(t).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12: false });
export const timeTitle = (t: number, lang: string) =>
  new Date(t).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** 같은 ID는 한 번만, 시간순으로 */
export function mergeMessages(cur: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map(cur.map((m) => [m.id, m]));
  incoming.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort((a, b) => a.at - b.at).slice(-300);
}
