import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { IsIn, IsObject, IsOptional, IsString, Length } from "class-validator";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Readable } from "node:stream";
import { SessionGuard, SessionId } from "../../core/session";
import type { UploadFilePart } from "../../shared/ports/rag-engine.port";
import { LabService } from "./lab.service";

const MAX_BYTES = 5 * 1024 * 1024;

class AnalyzeDto {
  @IsObject() paper!: Record<string, unknown>;
}

class ChatDto {
  @IsString() @Length(1, 20) item_id!: string;
  @IsString() @Length(1, 1000) question!: string;
  @IsOptional() @IsIn(["ko", "en", "ja", "zh"]) lang = "ko";
}

class SearchDto {
  @IsString() @Length(1, 300) query!: string;
}

@Controller("api")
export class LabController {
  constructor(private readonly lab: LabService) {}

  @SkipThrottle()
  @Get("items")
  items() {
    return this.lab.items();
  }

  /** 분석: rag-service의 실제 진행 이벤트(SSE)를 그대로 중계한다 */
  @UseGuards(SessionGuard)
  @Post("analyze")
  async analyze(@Body() body: AnalyzeDto, @SessionId() sid: string, @Res() reply: FastifyReply) {
    const upstream = await this.lab.analyze(body.paper, sid);
    reply.hijack();
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });
    Readable.fromWeb(upstream as never).pipe(reply.raw);
  }

  @UseGuards(SessionGuard)
  @Post("chat")
  chat(@Body() body: ChatDto, @SessionId() sid: string) {
    return this.lab.chat(body, sid);
  }

  @SkipThrottle()
  @UseGuards(SessionGuard)
  @Get("chat/:itemId")
  history(@Param("itemId") itemId: string, @SessionId() sid: string) {
    return this.lab.history(itemId.slice(0, 20), sid);
  }

  @UseGuards(SessionGuard)
  @Post("upload")
  async upload(@Req() req: FastifyRequest, @SessionId() sid: string) {
    return this.lab.upload(await readFile(req), sid);
  }

  @UseGuards(SessionGuard)
  @Post("vision")
  async vision(@Req() req: FastifyRequest, @SessionId() sid: string) {
    return this.lab.vision(await readFile(req), sid);
  }

  @UseGuards(SessionGuard)
  @Post("search")
  search(@Body() body: SearchDto, @SessionId() sid: string) {
    return this.lab.search(body.query, sid);
  }

  @SkipThrottle()
  @UseGuards(SessionGuard)
  @Delete("session")
  forget(@SessionId() sid: string) {
    return this.lab.forget(sid);
  }
}

async function readFile(req: FastifyRequest): Promise<UploadFilePart> {
  const part = await (req as FastifyRequest & { file: () => Promise<any> }).file();
  if (!part) throw new BadRequestException({ code: "no_file", message: "파일을 선택해 주세요." });
  const data: Buffer = await part.toBuffer();
  if (data.length > MAX_BYTES) throw new BadRequestException({ code: "too_large", message: "파일은 5MB 이하만 올릴 수 있어요." });
  return { filename: String(part.filename).slice(0, 120), mimetype: part.mimetype, data };
}

