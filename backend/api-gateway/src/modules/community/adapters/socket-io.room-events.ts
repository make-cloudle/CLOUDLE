import { Injectable, Logger } from "@nestjs/common";
import type { Namespace } from "socket.io";
import type { RoomEvent } from "../domain/community.types";
import { RoomEventsPort } from "../ports/room-events.port";

export const roomChannel = (roomId: string) => `room:${roomId}`;

/**
 * socket.io 어댑터: 도메인 이벤트 → 소켓 이벤트 이름(kind)으로 방송.
 * 네임스페이스는 게이트웨이가 초기화될 때 bind()로 넘겨받는다 (순환 의존 없음).
 */
@Injectable()
export class SocketIoRoomEvents extends RoomEventsPort {
  private readonly log = new Logger("RoomEvents");
  private nsp: Namespace | null = null;

  bind(nsp: Namespace) {
    this.nsp = nsp;
  }

  publish(roomId: string, event: RoomEvent) {
    if (!this.nsp) return this.log.warn(`소켓 서버 준비 전 이벤트 무시: ${event.kind}`);
    const { kind, ...payload } = event;
    this.nsp.to(roomChannel(roomId)).emit(kind, { roomId, ...payload });
  }
}
