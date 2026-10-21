# 백엔드 주 에이전트

> 공통 규칙은 루트 [`AGENTS.md`](../AGENTS.md)를 먼저 따른다. 이 문서는 `backend/` 안에서만 적용된다.

## 1. 두 서비스
| 서비스 | 스택 | 아키텍처 | 역할 |
|---|---|---|---|
| `api-gateway/` | NestJS 11 + Fastify, TypeScript | **헥사고날 (포트·어댑터)** | 프론트가 호출하는 유일한 API. 세션 확인·요청 제한·입력 검증·캐시·SSE 중계·오류 형식 통일 |
| `rag-service/` | Python 3.12, LangGraph, ChromaDB, Streamlit | **계층형 모듈** (`data → rag → sources → api`) | RAG 엔진(과제 필수 스택). 게이트웨이 뒤 내부 서비스 |

## 2. api-gateway 구조
```
src/
  main.ts                    부트스트랩 (Fastify, multipart, CORS, ValidationPipe)
  app.module.ts              조립 (Throttler 전역 가드, 예외 필터)
  config/                    환경변수 → 타입 설정
  core/                      횡단 관심사: SessionGuard · SessionThrottlerGuard · AppExceptionFilter
  shared/ports/              RagEnginePort (추상 계약)
  shared/adapters/           RagEngineHttpAdapter (rag-service HTTP 구현)
  shared/cache/              TtlCache
  modules/{earth,lab,detective,health}/   유스케이스 서비스 + 컨트롤러 + DTO
```
규칙
- 유스케이스(서비스)는 **포트에만 의존**한다. `fetch`·URL은 어댑터 밖으로 새지 않는다.
- 비용이 드는 POST는 `SessionGuard` + 요청 제한, 조회 GET은 `@SkipThrottle()` + `TtlCache`.
- 오류는 항상 `{ code, message }`. 스택트레이스·내부 주소 노출 금지.
- 테스트는 `RagEnginePort`를 가짜로 바꿔 끼워 rag-service 없이 돌린다 (`test/gateway.spec.ts`).

## 3. rag-service 구조
```
cloudle/data/       품목 메타데이터 로더 (RAG 1, 152건)
cloudle/rag/        임베딩·색인·프롬프트·수집·검색·LangGraph·채팅·국가 질문·팩트체크·LLM 예산
cloudle/sources/    위키백과·World Bank·NASA EONET·OpenAQ·국가 경계 (캐시·재시도·User-Agent)
cloudle/api/        FastAPI (게이트웨이 전용 내부 API)
streamlit_app.py    과제 기본 UI
```
규칙
- **LLM 호출은 `cloudle/rag/llm.py`만 통한다.** 단계(`query|select|generate|vision`)를 지정하고, 꺼진 단계·예산 소진 시 `LLMUnavailable` → 규칙·발췌 경로로 대체.
- 기본값: `LLM_STAGES=generate`, `EMBEDDING_PROVIDER=local`, `EVIDENCE_CHARS=600`, `TOKEN_BUDGET=70000`, 모델 `gpt-4o-mini`(GMS).
- 프롬프트는 `cloudle/rag/prompts.py`에만 둔다 (P1 검색어 · P2 선별 · P3 근거 답변 · 팩트체크).
- 국가를 누르면 **핵심 지표(대기질·폐기물·자연현상 3건)만** 조회한다. 인구·관련 문서는 `detail=true`일 때만.
- 외부 호출은 `sources/http.py`의 `get_json`(디스크 캐시·간격·재시도)만 사용.

## 4. 검증
```bash
cd backend/rag-service && python -m pytest -q      # 네트워크·키 없이 실행
cd backend/api-gateway && pnpm typecheck && pnpm test
```
새 엔드포인트를 만들면 rag-service 테스트와 게이트웨이 테스트를 **둘 다** 추가한다.

## 5. 위임할 서브 에이전트
- RAG 품질·프롬프트·토큰 → `rag-engineer`
- 게이트웨이 계층·가드·캐시 → `gateway-engineer`
- 데이터 출처·라이선스·수치 → `data-steward`
