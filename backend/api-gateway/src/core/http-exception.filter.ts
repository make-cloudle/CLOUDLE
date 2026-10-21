import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { RagEngineError } from "../shared/ports/rag-engine.port";

/** 모든 오류를 { code, message } 형태로만 돌려준다. 스택트레이스·내부 주소는 노출하지 않는다 (NF2004). */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger("Exception");

  catch(err: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (err instanceof RagEngineError) {
      return reply.status(err.status).send({ code: "engine_error", ...err.detail });
    }
    if (err instanceof HttpException) {
      const r = err.getResponse();
      const body = typeof r === "object" ? (r as Record<string, unknown>) : { message: r };
      const code = body.code ?? (err.getStatus() === 400 ? "invalid_request" : "error");
      const message = Array.isArray(body.message) ? "입력값을 확인해 주세요." : body.message;
      return reply.status(err.getStatus()).send({ ...body, code, message });
    }
    this.log.error(err instanceof Error ? err.stack : String(err));
    return reply.status(500).send({ code: "internal", message: "잠시 후 다시 시도해 주세요." });
  }
}
