import type { Member, MemberId } from "./community.types";

/**
 * 방 명단 (카카오톡 방식).
 *
 * - **참여(membership)**: "참여하시겠습니까?"에 확인했을 때만 생기고, "나가기"(또는 퇴출) 때만 사라진다.
 *   → "OO님이 들어왔습니다 / 나갔습니다"는 이 변화에만 붙는다.
 * - **접속(connection)**: 방 화면을 열어 둔 소켓 수. 다른 메뉴로 이동·새로고침·탭 닫기는 접속만 바뀌고
 *   참여는 그대로라서 알림이 뜨지 않는다. "지금 보고 있는 사람" 표시에만 쓴다.
 */
export class Roster {
  private readonly members = new Map<string, Map<MemberId, Member>>();
  private readonly online = new Map<string, Map<MemberId, number>>();

  /* ── 참여 ── */
  /** @returns 새로 참여한 것인지 (이미 참여 중이면 false → 알림 없음) */
  join(roomId: string, member: Member): boolean {
    const room = this.members.get(roomId) ?? new Map<MemberId, Member>();
    this.members.set(roomId, room);
    const isNew = !room.has(member.id);
    room.set(member.id, member);
    return isNew;
  }

  /** @returns 실제로 참여 중이었는지 (아니었으면 false → 알림 없음) */
  remove(roomId: string, memberId: MemberId): boolean {
    this.online.get(roomId)?.delete(memberId);
    return this.members.get(roomId)?.delete(memberId) ?? false;
  }

  isMember(roomId: string, memberId: MemberId): boolean {
    return !!this.members.get(roomId)?.has(memberId);
  }

  list(roomId: string): Member[] {
    return [...(this.members.get(roomId)?.values() ?? [])];
  }

  memberCount(roomId: string): number {
    return this.members.get(roomId)?.size ?? 0;
  }

  /* ── 접속 (탭 여러 개 = 연결 수) ── */
  connect(roomId: string, memberId: MemberId) {
    const room = this.online.get(roomId) ?? new Map<MemberId, number>();
    this.online.set(roomId, room);
    room.set(memberId, (room.get(memberId) ?? 0) + 1);
  }

  disconnect(roomId: string, memberId: MemberId) {
    const room = this.online.get(roomId);
    const n = room?.get(memberId) ?? 0;
    if (!room || n === 0) return;
    if (n > 1) room.set(memberId, n - 1);
    else room.delete(memberId);
  }

  onlineIds(roomId: string): MemberId[] {
    return [...(this.online.get(roomId)?.keys() ?? [])];
  }
}
