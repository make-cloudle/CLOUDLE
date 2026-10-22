"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudMascot } from "@/entities/mascot/characters";
import type { BucketMessage, Memo, MemoMessage, Room } from "@/entities/talk/types";
import { type Paper, useLoop } from "@/features/cloud-lab/model";
import { useDiscoveries } from "@/features/discovery/model";
import { useEcoBucket } from "@/features/eco-bucket/model";
import { Avatar, ChatRoom, RoomIcon } from "@/features/talk/ChatRoom";
import { ensureConnected, getRooms, TalkError, useTalk } from "@/features/talk/model";
import { fill, useT } from "@/shared/lib/i18n";
import { IconArrow } from "@/shared/ui/icons";
import { Alert, Button, Overline, Tag } from "@/shared/ui/primitives";

const noop = () => () => {};

/**
 * 구름 광장: 주제가 있는 실시간 채팅방.
 * - 목록 화면 → 참여하지 않은 방은 "참여하시겠습니까?" 확인 후에만 들어간다 (그때만 입장 알림).
 * - 참여한 방은 바로 열린다. "채팅방" 버튼으로 나와도 참여는 유지, "나가기"를 눌러야 퇴장 알림.
 * - 대화 → CLOUDLE MEMO / 에코 버킷 → Cloud Lab(RAG 근거 확인) → 발견 노트로 이어진다.
 * 기능 간 연결(노트·버킷·발견 노트)은 이 화면(app 계층)에서만 한다.
 */
export default function TalkPage() {
  const t = useT();
  const router = useRouter();
  const save = useDiscoveries((s) => s.add);
  const bucket = useEcoBucket();
  const hydrated = useSyncExternalStore(noop, () => true, () => false); // 버킷은 브라우저 저장소에만 있다
  const { me, room, join, open, close, exit } = useTalk();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState("");
  const [entering, setEntering] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Room | null>(null);

  useEffect(() => {
    ensureConnected();
    const id = setInterval(loadRooms, 15_000); // 방별 참여자·접속자 수
    loadRooms();
    return () => { clearInterval(id); useTalk.getState().close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadRooms() {
    getRooms().then((d) => setRooms(d.rooms)).catch(() => setError(t("error_generic")));
  }

  /** 참여 중인 방은 바로 열고, 아니면 참여 확인 창을 띄운다 */
  const pick = (r: Room) => (r.joined ? enter(r.id, false) : setConfirm(r));
  const enter = async (id: string, isJoin: boolean) => {
    setEntering(id); setError(""); setConfirm(null);
    try { await (isJoin ? join(id) : open(id)); window.scrollTo({ top: 0 }); }
    catch (e) { setError(e instanceof TalkError ? e.message : t("error_generic")); loadRooms(); }
    finally { setEntering(null); }
  };
  const back = () => { close(); loadRooms(); };
  const leaveRoom = async () => {
    try { await exit(); loadRooms(); } catch (e) { setError(e instanceof TalkError ? e.message : t("error_generic")); }
  };

  const myNote = (): Memo => {
    const p = useLoop.getState().paper;
    return { product_name: p.product_name, condition: p.condition, region: p.region, purpose: p.purpose, note: p.note };
  };
  const applyMemo = (m: Memo) => {
    const purpose: Paper["purpose"] = m.purpose;
    useLoop.getState().setPaper({ product_name: m.product_name, item_id: "", category: "", condition: m.condition, region: m.region || "대한민국", purpose, note: m.note });
  };
  const openMemo = (m: Memo) => {
    applyMemo(m);
    useLoop.getState().resetFlow();
    router.push("/bin");
  };
  const saveMemo = (msg: MemoMessage, roomTitle: string) =>
    save({ kind: "talk", title: `${roomTitle} · ${msg.memo.product_name || msg.author.nickname}`, summary: msg.memo.note, sources: [] });
  const keepBucket = (msg: BucketMessage) => bucket.add(msg.bucket);

  /* ── 채팅방 안: 그 방만 화면 가득 ── */
  if (room) {
    return (
      <div className="h-[calc(100dvh-14.5rem)] min-h-[440px] pt-2 md:h-[calc(100dvh-11.5rem)]">
        <ChatRoom onBack={back} onExit={leaveRoom} myNote={myNote} onApplyMemo={applyMemo} onOpenMemo={openMemo} onSaveMemo={saveMemo}
          bucket={hydrated ? bucket.items : []} onKeepBucket={keepBucket} />
      </div>
    );
  }

  /* ── 채팅방 목록 ── */
  return (
    <div className="flex flex-col gap-6 pt-8 lg:pt-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Overline>Cloud Square · Community</Overline>
          <h1 className="mt-1 text-[32px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[44px]">{t("talk_title")}</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-ink-2">{t("talk_desc")}</p>
          {me && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1 text-[13px] shadow-soft">
              <Avatar member={me} size={24} /><b>{me.nickname}</b>{t("talk_as")}
            </p>
          )}
        </div>
        <CloudMascot mood="curious" className="hidden h-20 w-24 shrink-0 sm:block" />
      </header>
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="room-list">
        <h2 id="room-list" className="mb-3 text-[15px] font-extrabold">{t("talk_rooms")}</h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rooms.map((r) => (
            <li key={r.id}>
              <button onClick={() => pick(r)} disabled={!!entering}
                className="group flex w-full items-start gap-4 rounded-[24px] bg-surface p-5 text-left shadow-soft ring-1 ring-line transition-colors hover:ring-line-strong disabled:opacity-70">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-soft text-sky-deep"><RoomIcon icon={r.icon} size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[17px] font-extrabold">{r.title}</span>
                      {r.joined && <Tag tone="mint">{t("talk_joined_badge")}</Tag>}
                    </span>
                    <span className="shrink-0 text-[12px] text-ink-3">{r.members ?? 0}{t("talk_member_count")} · {r.online ?? 0}{t("talk_online")}</span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{r.topic}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-sky-deep">
                    {entering === r.id ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
                    {t(r.joined ? "talk_enter" : "talk_join")} <IconArrow size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 참여 확인: 목록을 스치듯 눌러서 들어가 입장 알림이 쌓이지 않게 */}
      {confirm && (
        <div role="dialog" aria-modal="true" aria-labelledby="join-title" className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1220]/45 p-4 sm:items-center"
          onClick={() => setConfirm(null)} onKeyDown={(e) => e.key === "Escape" && setConfirm(null)}>
          <div className="anim-pop w-full max-w-sm rounded-[24px] bg-surface p-6 shadow-float ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-soft text-sky-deep"><RoomIcon icon={confirm.icon} size={22} /></span>
            <h2 id="join-title" className="mt-3 text-[19px] font-extrabold">{fill(t("talk_join_q"), { room: confirm.title })}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{confirm.topic}</p>
            <p className="mt-3 rounded-2xl bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">{fill(t("talk_join_note"), { name: me?.nickname ?? "" })}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>{t("talk_cancel")}</Button>
              <Button variant="primary" autoFocus loading={entering === confirm.id} onClick={() => enter(confirm.id, true)}>{t("talk_join")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
