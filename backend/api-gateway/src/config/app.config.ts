/** 환경변수 → 타입 있는 설정. LLM 키는 게이트웨이에 두지 않는다 (rag-service만 가진다). */
export interface AppConfig {
  port: number;
  ragServiceUrl: string;
  corsOrigins: string[];
  /** 개발 중 휴대폰(같은 와이파이)에서 접속할 수 있게 사설망 Origin을 허용할지 */
  allowLanOrigins: boolean;
  rateLimitPerMin: number;
  /** Community 개발용 신원: "프론트 포트:닉네임" 목록 */
  communityIdentities: string;
  /** 랭킹 저장 파일 (비우면 메모리에만 — 테스트용) */
  rankingFile: string;
}

const list = (v: string) => v.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

export const appConfig = (): AppConfig => ({
  port: Number(process.env.PORT ?? 4000),
  ragServiceUrl: (process.env.RAG_SERVICE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, ""),
  corsOrigins: list(process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001"),
  allowLanOrigins: (process.env.ALLOW_LAN_ORIGINS ?? (process.env.NODE_ENV === "production" ? "false" : "true")) === "true",
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 20),
  communityIdentities: process.env.COMMUNITY_IDENTITIES ?? "3000:지구미,3001:예나",
  rankingFile: process.env.RANKING_FILE ?? "storage/ranking.json",
});

const LAN_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/** HTTP·WebSocket이 함께 쓰는 Origin 허용 규칙 */
export function originAllowed(origin: string | undefined, allowed: string[], allowLan: boolean): boolean {
  if (!origin) return true; // 같은 출처·서버 간 호출
  if (allowed.includes(origin.replace(/\/$/, ""))) return true;
  if (!allowLan) return false;
  try {
    return LAN_HOST.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}
