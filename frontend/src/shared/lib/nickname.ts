/**
 * 닉네임은 로그인이 없으므로 이 브라우저에만 기억한다. 구름 광장(채팅)과 분리수거 트레일(랭킹)이 같은 이름을 쓴다.
 * 서버는 접속·입장 때 이 값을 다시 받아 검증한다.
 */
const KEY = "cloudle.nickname";

export function savedNickname(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export function rememberNickname(name: string) {
  try { localStorage.setItem(KEY, name); } catch { /* 저장소를 못 쓰는 환경 — 이번 방문에만 적용 */ }
}
