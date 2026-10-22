import { Logger, UseFilters, UsePipes, ValidationPipe } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  ConnectedSocket, MessageBody, type OnGatewayConnection, type OnGatewayDisconnect, type OnGatewayInit,
  SubscribeMessage, WebSocketGateway,
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";
import { roomChannel, SocketIoRoomEvents } from "../adapters/socket-io.room-events";
import { CommunityService } from "../community.service";
import type { Member } from "../domain/community.types";
import { IdentityPort } from "../ports/identity.port";
import { ReactDto, RoomRefDto, SendTextDto, ShareBucketDto, ShareMemoDto, SummarizeDto, TypingDto } from "./community.dto";
import { WsErrorFilter } from "./ws-error.filter";

type Data = { member: Member; sessionId: string; rooms: Set<string> };
type Client = Socket<any, any, any, Data>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 인바운드 어댑터(WebSocket). 하는 일은 "소켓 이벤트 ↔ 유스케이스 호출" 번역뿐이다.
 * 비즈니스 규칙은 CommunityService, 방송은 RoomEventsPort가 맡는다.
 * CORS는 core/socket-io.adapter.ts에서 HTTP와 같은 허용 목록으로 설정한다.
 */
@SkipThrottle()
@UseFilters(WsErrorFilter)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@WebSocketGateway({ namespace: "/community" })
export class CommunityGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger("CommunityWs");

  constructor(
    private readonly community: CommunityService,
    private readonly identity: IdentityPort,
    private readonly events: SocketIoRoomEvents,
  ) {}

  afterInit(nsp: Namespace) {
    this.events.bind(nsp);
  }

  handleConnection(client: Client) {
    const auth = (client.handshake.auth ?? {}) as { sessionId?: unknown };
    const sessionId = typeof auth.sessionId === "string" && /^[A-Za-z0-9]{8,64}$/.test(auth.sessionId) ? auth.sessionId : client.id.replace(/[^A-Za-z0-9]/g, "");
    const member = this.identity.resolve({ origin: client.handshake.headers.origin, sessionId });
    client.data = { member, sessionId, rooms: new Set() };
    client.emit("me", member);
  }

  /** 연결이 끊겨도(이동·새로고침·탭 닫기) 참여는 유지된다 → 알림 없음 */
  handleDisconnect(client: Client) {
    client.data?.rooms?.forEach((roomId) => this.community.close(roomId, client.data.member));
  }

  /** "참여하시겠습니까?" 확인 후: 명단에 추가(처음이면 입장 알림) + 화면 열기 */
  @SubscribeMessage("room:join")
  async join(@ConnectedSocket() client: Client, @MessageBody() { roomId }: RoomRefDto) {
    return this.view(client, roomId, () => this.community.join(roomId, client.data.member));
  }

  /** 이미 참여한 방 다시 열기 (알림 없음) */
  @SubscribeMessage("room:open")
  async open(@ConnectedSocket() client: Client, @MessageBody() { roomId }: RoomRefDto) {
    return this.view(client, roomId, () => this.community.open(roomId, client.data.member));
  }

  /** 방 화면에서 나와 다른 곳으로 (참여 유지, 알림 없음) */
  @SubscribeMessage("room:close")
  async close(@ConnectedSocket() client: Client, @MessageBody() { roomId }: RoomRefDto) {
    if (client.data.rooms.delete(roomId)) {
      await client.leave(roomChannel(roomId));
      this.community.close(roomId, client.data.member);
    }
    return { ok: true };
  }

  /** "나가기": 명단에서 빠지고 퇴장 알림 */
  @SubscribeMessage("room:exit")
  async exit(@ConnectedSocket() client: Client, @MessageBody() { roomId }: RoomRefDto) {
    if (client.data.rooms.delete(roomId)) await client.leave(roomChannel(roomId));
    await this.community.exit(roomId, client.data.member);
    return { ok: true };
  }

  /** 같은 소켓이 같은 방을 두 번 열어도 접속 수가 늘지 않게 */
  private async view(client: Client, roomId: string, enter: () => ReturnType<CommunityService["open"]>) {
    if (client.data.rooms.has(roomId)) this.community.close(roomId, client.data.member);
    const snapshot = await enter();
    await client.join(roomChannel(roomId));
    client.data.rooms.add(roomId);
    return { ok: true, ...snapshot };
  }

  @SubscribeMessage("message:send")
  async send(@ConnectedSocket() client: Client, @MessageBody() body: SendTextDto) {
    return { ok: true, message: await this.community.sendText(body.roomId, client.data.member, body.text) };
  }

  @SubscribeMessage("typing")
  typing(@ConnectedSocket() client: Client, @MessageBody() body: TypingDto) {
    this.community.typing(body.roomId, client.data.member, body.typing);
  }

  @SubscribeMessage("reaction:toggle")
  async react(@ConnectedSocket() client: Client, @MessageBody() body: ReactDto) {
    return { ok: true, reactions: await this.community.react(body.roomId, client.data.member, body.messageId, body.reaction) };
  }

  @SubscribeMessage("memo:share")
  async shareMemo(@ConnectedSocket() client: Client, @MessageBody() body: ShareMemoDto) {
    return { ok: true, message: await this.community.shareMemo(body.roomId, client.data.member, body.memo) };
  }

  @SubscribeMessage("bucket:share")
  async shareBucket(@ConnectedSocket() client: Client, @MessageBody() body: ShareBucketDto) {
    return { ok: true, message: await this.community.shareBucket(body.roomId, client.data.member, body.bucket) };
  }

  @SubscribeMessage("memo:summarize")
  async summarize(@ConnectedSocket() client: Client, @MessageBody() body: SummarizeDto) {
    const { member, sessionId } = client.data;
    this.log.log(`메모 요약 요청 room=${body.roomId} by=${member.nickname}`);
    return { ok: true, message: await this.community.summarizeMemo(body.roomId, member, body.lang, sessionId, body.region) };
  }
}
