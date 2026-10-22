import { type ArgumentsHost, BadRequestException, Catch, type ExceptionFilter, Logger } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import type { Socket } from "socket.io";
import { RagEngineError } from "../../../shared/ports/rag-engine.port";
import { CommunityError } from "../domain/community.types";

export type WsFailure = { ok: false; code: string; message: string };

/**
 * WebSocket 오류를 HTTP와 같은 { code, message } 형식으로 돌려준다.
 * 클라이언트가 ack 콜백을 넘겼으면 그 콜백으로, 아니면 `failure` 이벤트로 보낸다.
 */
@Catch()
export class WsErrorFilter implements ExceptionFilter {
  private readonly log = new Logger("CommunityWs");

  catch(err: unknown, host: ArgumentsHost) {
    const failure = toFailure(err, this.log);
    const ack = host.getArgs().find((a) => typeof a === "function") as ((r: WsFailure) => void) | undefined;
    if (ack) return ack(failure);
    host.switchToWs().getClient<Socket>().emit("failure", failure);
  }
}

function toFailure(err: unknown, log: Logger): WsFailure {
  if (err instanceof CommunityError) return { ok: false, code: err.code, message: err.message };
  if (err instanceof RagEngineError) return { ok: false, code: String(err.detail.code ?? "engine_error"), message: String(err.detail.message ?? "엔진 오류") };
  if (err instanceof BadRequestException || err instanceof WsException) return { ok: false, code: "invalid_request", message: "입력값을 확인해 주세요." };
  log.error(err instanceof Error ? err.stack : String(err));
  return { ok: false, code: "internal", message: "잠시 후 다시 시도해 주세요." };
}
