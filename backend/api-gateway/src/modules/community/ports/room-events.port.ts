import type { RoomEvent } from "../domain/community.types";

/**
 * 바깥으로 나가는 실시간 이벤트 포트. 유스케이스는 socket.io를 모르고 이 포트에만 알린다.
 * (WebSocket 결합을 어댑터 한 곳에 가둔다.)
 */
export abstract class RoomEventsPort {
  abstract publish(roomId: string, event: RoomEvent): void;
}
