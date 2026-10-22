import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SessionGuard, SessionId } from "../../../core/session";
import { CommunityService } from "../community.service";
import { CommunityError } from "../domain/community.types";
import { IdentityPort } from "../ports/identity.port";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * 인바운드 어댑터(HTTP). 실시간이 필요 없는 것만 HTTP로 둔다:
 * 방 목록 · 내 닉네임 · 첨부 업로드(바이너리) · 첨부 내려받기.
 */
@Controller("api/community")
export class CommunityController {
  constructor(private readonly community: CommunityService, private readonly identity: IdentityPort) {}

  @SkipThrottle()
  @Get("me")
  me(@Req() req: FastifyRequest) {
    return this.identity.resolve({ origin: req.headers.origin, sessionId: String(req.headers["x-session-id"] ?? "") });
  }

  @SkipThrottle()
  @Get("rooms")
  rooms(@Req() req: FastifyRequest) {
    const me = this.identity.resolve({ origin: req.headers.origin, sessionId: String(req.headers["x-session-id"] ?? "") });
    return { rooms: this.community.rooms(me.id) };
  }

  /** 사진·파일 올리기 → 같은 방에 첨부 메시지로 방송된다 */
  @UseGuards(SessionGuard)
  @Post("rooms/:roomId/attachments")
  async upload(@Param("roomId") roomId: string, @Req() req: FastifyRequest, @SessionId() sid: string) {
    const member = this.identity.resolve({ origin: req.headers.origin, sessionId: sid });
    const part = await (req as FastifyRequest & { file: () => Promise<any> }).file();
    if (!part) throw new BadRequestException({ code: "no_file", message: "파일을 선택해 주세요." });
    const data: Buffer = await part.toBuffer();
    if (data.length > MAX_BYTES) throw new BadRequestException({ code: "too_large", message: "파일은 5MB 이하만 올릴 수 있어요." });
    // 클라이언트는 caption 필드를 파일보다 먼저 붙인다
    const field = part.fields?.caption as { value?: unknown } | undefined;
    const caption = typeof field?.value === "string" ? field.value : "";
    try {
      return await this.community.sendAttachment(roomId.slice(0, 24), member, { filename: String(part.filename), mimetype: part.mimetype, data }, caption);
    } catch (e) {
      if (e instanceof CommunityError) throw new BadRequestException({ code: e.code, message: e.message });
      throw e;
    }
  }

  /** 추측하기 어려운 ID로만 열린다. 이미지가 아니면 항상 내려받기로 처리한다. */
  @SkipThrottle()
  @Get("attachments/:id")
  async download(@Param("id") id: string, @Res() reply: FastifyReply) {
    const f = /^[a-f0-9]{32}$/.test(id) ? await this.community.getAttachment(id) : null;
    if (!f) throw new NotFoundException({ code: "not_found", message: "파일이 만료되었거나 없어요." });
    const disposition = f.kind === "image" ? "inline" : "attachment";
    return reply
      .header("Content-Type", f.mimetype)
      .header("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=86400")
      .send(f.data);
  }
}
