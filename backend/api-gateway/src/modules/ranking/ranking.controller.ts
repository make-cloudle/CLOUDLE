import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import type { FastifyRequest } from "fastify";
import { SessionGuard, SessionId } from "../../core/session";
import { type Level, LEVELS, MAX_SCORE, RankingError, STAGES_PER_LEVEL } from "./domain/ranking";
import { RankingService } from "./ranking.service";

class ClaimDto {
  @IsString() @Length(1, 40) nickname!: string;
}
class ScoreDto {
  @IsIn(LEVELS as unknown as string[]) level!: string;
  @IsInt() @Min(1) @Max(STAGES_PER_LEVEL) stage!: number;
  @IsInt() @Min(0) @Max(MAX_SCORE) score!: number;
  @IsInt() @Min(1) @Max(3) stars!: number;
}
class BoardQuery {
  @IsOptional() @IsIn(["all", ...LEVELS]) level?: string;
}

const wrap = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RankingError) throw new BadRequestException({ code: e.code, message: e.message });
    throw e;
  }
};

/** 인바운드 어댑터(HTTP): DTO 검증 → 서비스 호출만 한다. */
@Controller("api/ranking")
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @SkipThrottle()
  @Get()
  board(@Query() q: BoardQuery, @Req() req: FastifyRequest) {
    const sid = String(req.headers["x-session-id"] ?? "");
    return this.ranking.board(sid || undefined, (q.level ?? "all") as Level | "all");
  }

  @UseGuards(SessionGuard)
  @Post("claim")
  claim(@Body() body: ClaimDto, @SessionId() sid: string) {
    return wrap(() => this.ranking.claim(sid, body.nickname));
  }

  @UseGuards(SessionGuard)
  @Post("score")
  score(@Body() body: ScoreDto, @SessionId() sid: string) {
    return wrap(() => this.ranking.submit(sid, body.level, body.stage, body.score, body.stars));
  }
}
