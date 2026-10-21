/** 환경변수 → 타입 있는 설정. LLM 키는 게이트웨이에 두지 않는다 (rag-service만 가진다). */
export interface AppConfig {
  port: number;
  ragServiceUrl: string;
  corsOrigins: string[];
  rateLimitPerMin: number;
}

export const appConfig = (): AppConfig => ({
  port: Number(process.env.PORT ?? 4000),
  ragServiceUrl: (process.env.RAG_SERVICE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, ""),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 20),
});
