import type { Member } from "../domain/community.types";

/** 연결 정보 → 사용자. 지금은 Origin 포트로 정하지만, 로그인이 생기면 토큰 어댑터로 교체한다. */
export interface ConnectionInfo {
  origin?: string;
  sessionId?: string;
}

export abstract class IdentityPort {
  abstract resolve(info: ConnectionInfo): Member;
}
