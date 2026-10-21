import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/** 요청 제한: 세션 ID 기준(없으면 IP). 비용이 드는 POST에만 적용한다. */
@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const sid = req.headers?.["x-session-id"];
    return typeof sid === "string" && sid ? `sid:${sid}` : `ip:${req.ip}`;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new HttpException({ code: "rate_limited", message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
