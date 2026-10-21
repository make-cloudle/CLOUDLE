import { BadRequestException, type CanActivate, createParamDecorator, type ExecutionContext, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

const SID = /^[A-Za-z0-9]{8,64}$/;

/** 비회원 세션: X-Session-Id 헤더가 있어야 한다 (로그인 없음, C01). */
@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const sid = ctx.switchToHttp().getRequest<FastifyRequest>().headers["x-session-id"];
    if (typeof sid !== "string" || !SID.test(sid)) {
      throw new BadRequestException({ code: "no_session", message: "세션 정보가 없어요. 새로고침해 주세요." });
    }
    return true;
  }
}

export const SessionId = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  String(ctx.switchToHttp().getRequest<FastifyRequest>().headers["x-session-id"] ?? ""));
