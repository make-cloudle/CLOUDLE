/** 닉네임 규칙: 공백 정리 후 1~12자, 제어문자·꺾쇠 금지 (코드 포인트 기준이라 이모지도 1자). 구름 광장과 게임 랭킹이 함께 쓴다. */
export const NICKNAME_MAX = 12;

export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const len = [...name].length;
  if (len < 1 || len > NICKNAME_MAX) return null;
  if (/[\u0000-\u001f\u007f<>]/.test(name)) return null;
  return name;
}

/** 같은 이름인지 비교하는 열쇠: 대소문자·공백 차이는 같은 이름으로 본다 */
export const nicknameKey = (name: string) => name.replace(/\s/g, "").toLowerCase();
