import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Member } from "../domain/community.types";
import { type ConnectionInfo, IdentityPort } from "../ports/identity.port";

const TONES: Member["tone"][] = ["sky", "mint", "yellow", "lavender", "warn"];

/**
 * 개발용 신원 어댑터: 프론트가 뜬 포트(Origin)로 사람을 정한다.
 *   COMMUNITY_IDENTITIES=3000:지구미,3001:예나
 * 브라우저가 붙이는 Origin 헤더는 페이지 스크립트가 바꿀 수 없으므로, 로그인 없이도
 * "3000에서 연 화면 = 지구미"가 강제된다. 휴대폰(LAN IP:3000)도 같은 규칙을 따른다.
 * 정식 로그인이 생기면 IdentityPort만 토큰 어댑터로 바꾸면 된다.
 */
@Injectable()
export class OriginPortIdentity extends IdentityPort {
  private readonly byPort: Map<string, string>;

  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    this.byPort = parseIdentities(config.get<string>("communityIdentities") ?? "");
  }

  resolve({ origin, sessionId }: ConnectionInfo): Member {
    const port = portOf(origin);
    const mapped = port && this.byPort.get(port);
    if (mapped) return { id: `u:${mapped}`, nickname: mapped, tone: toneFor(mapped) };
    // 게스트: 식별자는 세션 ID 전체(충돌 방지), 앞 4글자는 화면에 보이는 이름에만 쓴다
    const sid = sessionId || "anonymous";
    return { id: `g:${sid}`, nickname: `구름손님${sid.slice(0, 4).toUpperCase()}`, tone: toneFor(sid) };
  }
}

export function parseIdentities(raw: string): Map<string, string> {
  return new Map(
    raw.split(",").map((pair) => pair.split(":").map((s) => s.trim()))
      .filter(([port, name]) => /^\d{2,5}$/.test(port ?? "") && !!name)
      .map(([port, name]) => [port, name.slice(0, 12)] as [string, string]),
  );
}

function portOf(origin?: string): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    return u.port || (u.protocol === "https:" ? "443" : "80");
  } catch {
    return null;
  }
}

function toneFor(name: string): Member["tone"] {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TONES[h % TONES.length];
}
