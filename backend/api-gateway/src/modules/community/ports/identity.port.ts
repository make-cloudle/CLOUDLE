import type { Member } from "../domain/community.types";

/** 연결 정보 → 사용자. 지금은 Origin 포트로 정하지만, 로그인이 생기면 토큰 어댑터로 교체한다. */
export interface ConnectionInfo {
  origin?: string;
  sessionId?: string;
}

export abstract class IdentityPort {
  abstract resolve(info: ConnectionInfo): Member;
  /**
   * 사용자가 정한 닉네임을 이 세션에 기억시킨다. 이후 resolve()가 같은 이름을 돌려준다.
   * 로그인이 생기면 이 메서드는 프로필 변경으로 바뀐다.
   * @throws CommunityError("bad_nickname") 규칙에 맞지 않을 때
   */
  abstract rename(info: ConnectionInfo, nickname: string): Member;
}
