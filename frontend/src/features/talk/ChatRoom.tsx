"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import type { BucketItem } from "@/entities/eco-bucket/types";
import {
  type AuthoredMessage, type BucketMessage, type Member, type Memo, type MemoMessage,
  REACTION_EMOJI, REACTIONS, type Room, TONE_BG,
} from "@/entities/talk/types";
import { fill, useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { IconBack, IconClip, IconFile, IconImage, IconLeaf, IconNote, IconPin, IconRecycle, IconSend, IconSparkle, IconTool, IconUsers, IconWind, IconX } from "@/shared/ui/icons";
import { Alert, Button, Chip, cx } from "@/shared/ui/primitives";
import { BucketCard } from "./BucketCard";
import { MemoCard } from "./MemoCard";
import { MemoComposer } from "./MemoComposer";
import { attachmentUrl, pruneTyping, TalkError, useTalk } from "./model";
import { buildRows, timeLabel, timeTitle } from "./timeline";

const MAX_BYTES = 5 * 1024 * 1024;

export function RoomIcon({ icon, size = 18 }: { icon: Room["icon"]; size?: number }) {
  const I = { recycle: IconRecycle, tool: IconTool, air: IconWind, leaf: IconLeaf }[icon];
  return <I size={size} />;
}

export function Avatar({ member, size = 32 }: { member: Member; size?: number }) {
  return (
    <span className={cx("flex shrink-0 items-center justify-center rounded-full font-bold", TONE_BG[member.tone])}
      style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {member.nickname.slice(0, 1)}
    </span>
  );
}

export type ChatRoomProps = {
  /** 방 화면에서 나오기 (참여 유지, 알림 없음) */
  onBack: () => void;
  /** "나가기" — 참여 종료, 퇴장 알림 */
  onExit: () => void;
  /** 내 Cloud Lab 노트 (공유 전 미리보기용) */
  myNote: () => Memo;
  /** 메모 → 내 노트에 담기 */
  onApplyMemo: (m: Memo) => void;
  /** 메모 → Cloud Lab에서 RAG로 근거 확인 */
  onOpenMemo: (m: Memo) => void;
  onSaveMemo: (msg: MemoMessage, roomTitle: string) => void;
  /** 내 에코 버킷 목록 (공유 토글 리스트에 보인다) */
  bucket: BucketItem[];
  /** 공유받은 에코 버킷 → 내 버킷에 담기 */
  onKeepBucket: (msg: BucketMessage) => void;
};

/** 채팅방: 카카오톡식 말풍선 · 입장/퇴장 알림 · 사진/파일 · CLOUDLE MEMO · 에코 버킷 공유 · AI 메모 정리 */
export function ChatRoom({ onBack, onExit, myNote, onApplyMemo, onOpenMemo, onSaveMemo, bucket, onKeepBucket }: ChatRoomProps) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const { status, me, room, members, online, messages, typing, send, react, setTyping, shareMemo, shareBucket, summarize, upload } = useTalk();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [composer, setComposer] = useState<Memo | null>(null);
  const [bucketOpen, setBucketOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "send" | "memo" | "summary" | "bucket">("");
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [askExit, setAskExit] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => buildRows(messages), [messages]);
  const typers = Object.values(typing).map((x) => x.member.nickname);

  useEffect(() => { const id = setInterval(pruneTyping, 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(id); }, [notice]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // 방에 들어오면 지난 대화의 맨 아래부터, 새 메시지는 바닥 근처에 있거나 내가 보낸 것이면 아래로
  const last = messages.at(-1);
  const landed = useRef<string | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !last) return;
    if (landed.current !== last.roomId) {
      landed.current = last.roomId;
      el.scrollTop = el.scrollHeight;
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    const mine = last.type !== "system" && last.author.id === me?.id;
    if (nearBottom || mine) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [last, me?.id]);

  const fail = (e: unknown) => setNotice({ tone: "error", text: e instanceof TalkError ? e.message : t("error_generic") });

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setNotice({ tone: "error", text: "≤ 5MB" });
    setPending(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : "");
  };
  const clearPending = () => { setPending(null); setPreview(""); };

  const submit = async () => {
    if (busy) return;
    const body = text.trim();
    if (!pending && !body) return;
    setBusy("send");
    try {
      if (pending) { await upload(pending, body); clearPending(); }
      else await send(text);
      setText("");
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const doSummary = async () => {
    setBusy("summary");
    try {
      const msg = await summarize(lang, myNote().region || undefined);
      if (msg.type === "memo") { onApplyMemo(msg.memo); setNotice({ tone: "info", text: t("talk_memo_applied") }); }
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const doShare = async (m: Memo) => {
    setBusy("memo");
    try { await shareMemo(m); setComposer(null); } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const doBucket = async (b: BucketItem) => {
    setBusy("bucket");
    try { await shareBucket(b); setBucketOpen(false); } catch (e) { fail(e); } finally { setBusy(""); }
  };

  if (!room) return null;
  const isMine = (m: AuthoredMessage) => m.author.id === me?.id;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] bg-surface shadow-soft ring-1 ring-line" aria-label={`${t("talk_room")} · ${room.title}`}>
      {/* 헤더: 지금 어느 채팅방 안에 있는지 분명하게 */}
      <header className="flex items-center gap-2 border-b border-line px-2 py-2.5 sm:px-4">
        <button onClick={onBack} className="flex h-9 shrink-0 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
          <IconBack /> {t("talk_rooms")}
        </button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-soft text-sky-deep"><RoomIcon icon={room.icon} size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold tracking-[0.14em] text-ink-3 uppercase">{t("talk_title")} · {t("talk_room")}</p>
          <h1 className="truncate text-[17px] leading-tight font-extrabold">{room.title}</h1>
          <p className="hidden truncate text-[12px] text-ink-3 sm:block">{room.topic}</p>
        </div>
        <button onClick={() => setShowMembers((v) => !v)} aria-expanded={showMembers} aria-label={t("talk_members")}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ink-2 ring-1 ring-line hover:text-ink">
          <IconUsers size={16} /> {members.length}
        </button>
        <button onClick={() => { setShowMembers(true); setAskExit(true); }}
          className="hidden h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold text-danger ring-1 ring-danger/40 hover:bg-warn-soft sm:block">
          {t("talk_exit")}
        </button>
      </header>
      {showMembers && (
        <ul className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5" aria-label={t("talk_members")}>
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-1.5 text-[13px]">
              <span className="relative"><Avatar member={m} size={22} />
                {online.includes(m.id) && <i className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-mint-deep ring-2 ring-surface" aria-label="online" />}
              </span>
              {m.nickname}{m.id === me?.id && <span className="text-ink-3">({t("talk_me")})</span>}
            </li>
          ))}
          <li className="ml-auto">
            {askExit ? (
              <span className="flex items-center gap-1.5 text-[12px]">
                {t("talk_exit_q")}
                <Button size="sm" variant="danger" onClick={onExit}>{t("talk_exit")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setAskExit(false)}>{t("talk_cancel")}</Button>
              </span>
            ) : <Button size="sm" variant="danger" onClick={() => setAskExit(true)}>{t("talk_exit")}</Button>}
          </li>
        </ul>
      )}
      <p className="flex items-start gap-2 bg-sky-soft px-4 py-2 text-[12px] leading-relaxed text-ink-2"><IconPin size={14} className="mt-0.5 shrink-0" />{room.pinned}</p>
      {status !== "online" && <div className="px-4 pt-2"><Alert tone="warn">{t(status === "offline" ? "talk_offline" : "talk_connecting")}</Alert></div>}

      {/* 메시지 */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-chat-bg px-3 py-4 sm:px-6" role="log" aria-live="polite">
        {messages.length === 0 && <p className="py-10 text-center text-[13px] text-ink-3">{t("talk_empty")}</p>}
        <ol className="mx-auto flex max-w-[900px] flex-col">
          {rows.map((row) => {
            if (row.kind === "date") {
              return (
                <li key={row.key} className="my-3 flex justify-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-ink-3 ring-1 ring-line">
                    {new Date(row.at).toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
                  </span>
                </li>
              );
            }
            const m = row.message;
            if (m.type === "system") {
              return (
                <li key={row.key} className="my-2 flex justify-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[12px] text-ink-2 ring-1 ring-line">
                    {m.nickname}{t(m.event === "join" ? "talk_joined" : "talk_left")}
                  </span>
                </li>
              );
            }
            const mine = isMine(m);
            const time = row.showTime && (
              <time dateTime={new Date(m.at).toISOString()} title={timeTitle(m.at, lang)} className="shrink-0 self-end pb-0.5 text-[10px] text-ink-3 tabular-nums">
                {timeLabel(m.at, lang)}
              </time>
            );
            const counts = REACTIONS.filter((r) => (m.reactions[r]?.length ?? 0) > 0);
            const open = active === m.id;
            return (
              <li key={row.key} className={cx("flex gap-2", row.showAuthor ? "mt-3" : "mt-1", mine ? "justify-end" : "justify-start")}>
                {!mine && (row.showAuthor ? <Avatar member={m.author} /> : <span className="w-8 shrink-0" />)}
                <div className={cx("flex min-w-0 flex-col", m.type === "bucket" ? "max-w-[92%]" : "max-w-[82%]", mine ? "items-end" : "items-start")}>
                  {!mine && row.showAuthor && <span className="mb-1 text-[12px] font-semibold text-ink-2">{m.author.nickname}</span>}
                  <div className={cx("flex items-end gap-1.5", mine && "flex-row-reverse")}>
                    {m.type === "memo" ? (
                      <MemoCard message={m} onApply={() => { onApplyMemo(m.memo); setNotice({ tone: "info", text: t("talk_memo_applied") }); }}
                        onOpen={() => onOpenMemo(m.memo)} onSave={() => { onSaveMemo(m, room.title); setNotice({ tone: "info", text: t("saved") }); }} />
                    ) : m.type === "bucket" ? (
                      <BucketCard message={m} onSave={() => { onKeepBucket(m); setNotice({ tone: "info", text: t("bucket_saved") }); }} />
                    ) : (
                      <button type="button" onClick={() => setActive(open ? null : m.id)} className="min-w-0 text-left" aria-expanded={open} aria-haspopup="true">
                        <Bubble message={m} mine={mine} />
                      </button>
                    )}
                    {time}
                  </div>
                  {/* 반응: 말풍선을 누르면 이모티콘 고르기, 받은 반응은 아래에 숫자로 */}
                  {(counts.length > 0 || open || m.type !== "text" && m.type !== "attachment") && (
                    <div className={cx("mt-1 flex flex-wrap items-center gap-1", mine && "justify-end")}>
                      {counts.map((r) => {
                        const who = m.reactions[r] ?? [];
                        const on = !!me && who.includes(me.id);
                        return (
                          <button key={r} type="button" onClick={() => react(m.id, r).catch(fail)} aria-pressed={on} aria-label={`${REACTION_EMOJI[r]} ${who.length}`}
                            className={cx("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-semibold ring-1",
                              on ? "bg-sky-soft text-sky-deep ring-sky" : "bg-surface text-ink-2 ring-line")}>
                            <span aria-hidden>{REACTION_EMOJI[r]}</span>{who.length}
                          </button>
                        );
                      })}
                      {(open || m.type === "memo" || m.type === "bucket") && (
                        <span role="group" aria-label="reactions" className="inline-flex items-center gap-0.5 rounded-full bg-surface px-1 py-0.5 shadow-soft ring-1 ring-line">
                          {REACTIONS.map((r) => (
                            <button key={r} type="button" aria-label={r} onClick={() => { react(m.id, r).catch(fail); setActive(null); }}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] transition-transform hover:scale-125 hover:bg-surface-2">
                              {REACTION_EMOJI[r]}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* 입력 중 · 안내 */}
      <div className="min-h-5 bg-surface px-4 pt-1 text-[12px] text-ink-3" aria-live="polite">
        {typers.length > 0 && `${typers.join(", ")} ${t("talk_typing")}`}
      </div>
      {notice && <div className="px-3 pb-1"><Alert tone={notice.tone}>{notice.text}</Alert></div>}

      {composer ? (
        <div className="max-h-[60%] overflow-y-auto border-t border-line p-3">
          <MemoComposer initial={composer} busy={busy === "memo"} onCancel={() => setComposer(null)} onShare={doShare} />
        </div>
      ) : (
        <div className="relative border-t border-line px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:px-3">
          {/* 에코 버킷 공유: 작은 토글 리스트 → 제목을 누르면 바로 방에 공유 */}
          {bucketOpen && (
            <div className="anim-pop absolute right-2 bottom-full left-2 z-20 mb-2 max-h-72 overflow-y-auto rounded-[20px] bg-surface p-2 shadow-float ring-1 ring-line sm:right-auto sm:w-96">
              <p className="flex items-center justify-between px-2 pt-1 pb-2 text-[12px] font-bold text-ink-2">
                <span className="flex items-center gap-1.5"><IconLeaf size={14} /> {t("bucket_title")}</span>
                <button onClick={() => setBucketOpen(false)} aria-label={t("talk_cancel")} className="text-ink-3 hover:text-ink"><IconX size={14} /></button>
              </p>
              {bucket.length === 0 ? (
                <p className="px-2 pb-2 text-[12px] leading-relaxed text-ink-3">{t("bucket_empty")}</p>
              ) : (
                <ul className="flex flex-col">
                  {bucket.map((b) => (
                    <li key={b.id}>
                      <button type="button" disabled={busy === "bucket"} onClick={() => doBucket(b)}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-50">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint/70 text-mint-deep"><IconLeaf size={14} /></span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{b.title}</span>
                        <IconSend size={14} className="shrink-0 text-ink-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {messages.filter((x) => x.type !== "system").length < 3 && !text && !pending && (
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
              {room.prompts.map((p) => <Chip key={p} className="h-8 text-[12px]" onClick={() => setText(p)}>{p}</Chip>)}
            </div>
          )}
          {pending && (
            <div className="mb-2 flex items-center gap-3 rounded-2xl bg-surface-2 p-2">
              {preview ? <img src={preview} alt={pending.name} className="h-14 w-14 rounded-xl object-cover" />
                : <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface text-ink-2"><IconFile size={22} /></span>}
              <p className="min-w-0 flex-1 truncate text-[13px]">{pending.name}<br /><span className="text-ink-3">{t("talk_caption_ph")}</span></p>
              <button onClick={clearPending} aria-label={t("remove")} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface"><IconX size={14} /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea value={text} rows={1} maxLength={1000}
              onChange={(e) => { setText(e.target.value); setTyping(e.target.value.length > 0); }}
              onBlur={() => setTyping(false)}
              onKeyDown={(e) => {
                // 한글 조합 중 Enter는 무시 (IME), Shift+Enter는 줄바꿈
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
              }}
              placeholder={pending ? t("talk_caption_ph") : t("talk_ph")} aria-label={t("talk_ph")}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-surface-2 px-4 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-sky" />
            <Button variant="primary" className="h-11 w-11 shrink-0 !px-0" aria-label={t("talk_send")} loading={busy === "send"}
              disabled={status !== "online" || (!text.trim() && !pending)} onClick={submit}>
              {busy !== "send" && <IconSend size={18} className="shrink-0" />}
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-0.5">
            <ToolButton onClick={() => imgRef.current?.click()} icon={<IconImage size={16} />} label={t("talk_photo")} />
            <ToolButton onClick={() => fileRef.current?.click()} icon={<IconClip size={16} />} label={t("talk_file")} />
            <ToolButton onClick={() => setComposer(myNote())} icon={<IconNote size={16} />} label={t("talk_share_note")} />
            <ToolButton onClick={() => setBucketOpen((v) => !v)} icon={<IconLeaf size={16} />} label={t("bucket_share")} pressed={bucketOpen} />
            <ToolButton onClick={doSummary} icon={<IconSparkle size={16} />} label={t("talk_summarize")} busy={busy === "summary"} title={t("talk_summarize_hint")} />
          </div>
          <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      )}
    </section>
  );
}

function ToolButton({ onClick, icon, label, busy, title, pressed }: { onClick: () => void; icon: React.ReactNode; label: string; busy?: boolean; title?: string; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} title={title} aria-pressed={pressed}
      className={cx("inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] hover:bg-surface-2 hover:text-ink disabled:opacity-50",
        pressed ? "bg-mint/70 text-mint-deep" : "text-ink-2")}>
      {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : icon} {label}
    </button>
  );
}

function Bubble({ message: m, mine }: { message: Extract<AuthoredMessage, { type: "text" | "attachment" }>; mine: boolean }) {
  const shape = cx("block rounded-[18px] px-3.5 py-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap",
    mine ? "rounded-tr-md bg-bubble-mine text-bubble-mine-ink" : "rounded-tl-md bg-bubble-other text-bubble-other-ink");
  if (m.type === "text") return <span className={shape}>{m.text}</span>;
  const url = attachmentUrl(m.attachment.id);
  return (
    <span className="flex flex-col gap-1">
      {m.attachment.kind === "image" ? (
        <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          <img src={url} alt={m.text || m.attachment.name} loading="lazy" decoding="async"
            className="max-h-72 w-auto max-w-[min(260px,62vw)] rounded-[16px] bg-surface object-cover ring-1 ring-line" />
        </a>
      ) : (
        <a href={url} download={m.attachment.name} onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 rounded-[16px] bg-surface px-3 py-2.5 text-ink ring-1 ring-line hover:ring-line-strong">
          <IconFile size={20} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{m.attachment.name}</span>
            <span className="text-[11px] text-ink-3">{fill("{kb} KB", { kb: String(Math.max(1, Math.round(m.attachment.size / 1024))) })}</span>
          </span>
        </a>
      )}
      {m.text && <span className={shape}>{m.text}</span>}
    </span>
  );
}
