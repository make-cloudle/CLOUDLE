import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommunityError, cleanNickname, NICKNAME_MAX, type Member } from "../domain/community.types";
import { type ConnectionInfo, IdentityPort } from "../ports/identity.port";

const TONES: Member["tone"][] = ["sky", "mint", "yellow", "lavender", "warn"];
const MAX_REMEMBERED = 5000;

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
  /** 세션 ID → 사용자가 고른 닉네임 (메모리, 오래된 것부터 버림) */
  private readonly chosen = new Map<string, string>();

  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    this.byPort = parseIdentities(config.get<string>("communityIdentities") ?? "");
  }

  resolve({ origin, sessionId }: ConnectionInfo): Member {
    const port = portOf(origin);
    const mapped = port && this.byPort.get(port);
    const sid = sessionId || "anonymous";
    const picked = this.chosen.get(sid);
    // 식별자(id)는 바뀌지 않는다: 개발 매핑은 이름, 게스트는 세션 ID 전체(충돌 방지). 닉네임은 보이는 이름만 바꾼다.
    if (mapped) return { id: `u:${mapped}`, nickname: picked ?? mapped, tone: toneFor(mapped) };
    return { id: `g:${sid}`, nickname: picked ?? `구름손님${sid.slice(0, 4).toUpperCase()}`, tone: toneFor(sid) };
  }

  rename(info: ConnectionInfo, nickname: string): Member {
    const name = cleanNickname(nickname);
    if (!name) throw new CommunityError("bad_nickname", `닉네임은 1~${NICKNAME_MAX}자로 적어 주세요. (< > 와 줄바꿈은 쓸 수 없어요)`);
    const sid = info.sessionId || "anonymous";
    this.chosen.delete(sid); // 가장 최근 것이 맨 뒤로 가게
    this.chosen.set(sid, name);
    if (this.chosen.size > MAX_REMEMBERED) this.chosen.delete(this.chosen.keys().next().value as string);
    return this.resolve(info);
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
