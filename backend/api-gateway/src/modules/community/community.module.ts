import { Module } from "@nestjs/common";
import { InMemoryAttachmentStore } from "./adapters/in-memory-attachment.store";
import { InMemoryMessageStore } from "./adapters/in-memory-message.store";
import { OriginPortIdentity } from "./adapters/origin-port.identity";
import { RagMemoSummarizer } from "./adapters/rag-memo.summarizer";
import { SocketIoRoomEvents } from "./adapters/socket-io.room-events";
import { CommunityService } from "./community.service";
import { CommunityController } from "./inbound/community.controller";
import { CommunityGateway } from "./inbound/community.gateway";
import { AttachmentStorePort } from "./ports/attachment-store.port";
import { IdentityPort } from "./ports/identity.port";
import { MemoSummarizerPort } from "./ports/memo-summarizer.port";
import { MessageStorePort } from "./ports/message-store.port";
import { RoomEventsPort } from "./ports/room-events.port";

/**
 * Community (실시간 채팅방) — 포트 ← 어댑터 바인딩을 이 모듈 한 곳에서만 한다.
 *
 *   socket.io ─▶ CommunityGateway ─▶ CommunityService ─▶ MessageStorePort / AttachmentStorePort
 *   HTTP     ─▶ CommunityController ─┘        │         └▶ MemoSummarizerPort (→ rag-service)
 *                                             └▶ RoomEventsPort (→ SocketIoRoomEvents)
 *
 * Redis로 여러 인스턴스를 띄우려면 MessageStorePort·RoomEventsPort 어댑터만 바꾼다.
 */
@Module({
  controllers: [CommunityController],
  providers: [
    CommunityService,
    CommunityGateway,
    SocketIoRoomEvents,
    { provide: RoomEventsPort, useExisting: SocketIoRoomEvents },
    { provide: MessageStorePort, useClass: InMemoryMessageStore },
    { provide: AttachmentStorePort, useClass: InMemoryAttachmentStore },
    { provide: IdentityPort, useClass: OriginPortIdentity },
    { provide: MemoSummarizerPort, useClass: RagMemoSummarizer },
  ],
})
export class CommunityModule {}
