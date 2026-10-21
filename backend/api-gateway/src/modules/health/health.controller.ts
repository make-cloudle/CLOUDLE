import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { RagEnginePort } from "../../shared/ports/rag-engine.port";

@SkipThrottle()
@Controller("api")
export class HealthController {
  constructor(private readonly engine: RagEnginePort) {}

  /** 게이트웨이 + 엔진 상태 */
  @Get("health")
  async health() {
    try {
      return { gateway: "ok", engine: await this.engine.call("GET", "/api/health") };
    } catch {
      return { gateway: "ok", engine: { ok: false } };
    }
  }
}
