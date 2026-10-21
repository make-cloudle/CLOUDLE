import { Body, Controller, Injectable, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import { SessionGuard, SessionId } from "../../core/session";
import { TtlCache } from "../../shared/cache/ttl-cache";
import { RagEnginePort } from "../../shared/ports/rag-engine.port";

class FactCheckDto {
  @IsString() @Length(4, 300) claim!: string;
  @IsOptional() @IsIn(["ko", "en", "ja", "zh"]) lang = "ko";
}

/** Eco Detective 유스케이스: 같은 주장은 하루 동안 재사용해 LLM 토큰을 아낀다. */
@Injectable()
export class DetectiveService {
  private readonly verdicts = new TtlCache<unknown>(24 * 60 * 60_000);

  constructor(private readonly engine: RagEnginePort) {}

  check(claim: string, lang: string, sessionId: string) {
    const key = `${lang}:${claim.trim().replace(/\s+/g, " ")}`;
    return this.verdicts.getOrLoad(key, () => this.engine.call("POST", "/api/factcheck", { sessionId, body: { claim, lang } }));
  }
}

@Controller("api")
export class DetectiveController {
  constructor(private readonly detective: DetectiveService) {}

  @UseGuards(SessionGuard)
  @Post("factcheck")
  check(@Body() body: FactCheckDto, @SessionId() sid: string) {
    return this.detective.check(body.claim, body.lang, sid);
  }
}
