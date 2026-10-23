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
  core/socket-io.adapter.ts  socket.io CORS를 HTTP와 같은 Origin 규칙으로
  modules/{earth,lab,health}/   유스케이스 서비스 + 컨트롤러 + DTO
  modules/community/          구름 광장 (WebSocket) — 아래 §2-1
```
규칙
- 유스케이스(서비스)는 **포트에만 의존**한다. `fetch`·URL은 어댑터 밖으로 새지 않는다.
- 비용이 드는 POST는 `SessionGuard` + 요청 제한, 조회 GET은 `@SkipThrottle()` + `TtlCache`.
- 오류는 항상 `{ code, message }`. 스택트레이스·내부 주소 노출 금지.
- 테스트는 `RagEnginePort`를 가짜로 바꿔 끼워 rag-service 없이 돌린다 (`test/gateway.spec.ts`).

## 2-1. Community 모듈 (WebSocket 결합도 관리)
```
modules/community/
  domain/      community.types.ts(메시지 5종, RoomEvent) · rooms.ts(주제 방 4개) · presence.ts(Roster: 참여 명단 + 접속 수)
  ports/       MessageStorePort · AttachmentStorePort · IdentityPort · RoomEventsPort · MemoSummarizerPort
  adapters/    InMemoryMessageStore · InMemoryAttachmentStore · OriginPortIdentity · SocketIoRoomEvents · RagMemoSummarizer
  community.service.ts            유스케이스 (참여·열기·닫기·나가기 · 메시지·첨부·리액션·입력 중·메모/버킷 공유·AI 메모 요약)
  inbound/community.gateway.ts    socket.io ↔ 유스케이스 번역만 (namespace `/community`)
  inbound/community.controller.ts HTTP: GET me · GET rooms · POST rooms/:id/attachments · GET attachments/:id
  inbound/ws-error.filter.ts      WS 오류도 { ok:false, code, message } (ack 또는 `failure` 이벤트)
  community.module.ts             포트 ← 어댑터 바인딩은 여기서만
```
규칙
- **socket.io를 import하는 곳은 `inbound/community.gateway.ts`, `adapters/socket-io.room-events.ts`, `core/socket-io.adapter.ts` 세 곳뿐.** 서비스는 `RoomEventsPort.publish()`로만 방송한다.
- 소켓 이벤트(클라 → 서버, ack 응답 `{ ok, ... }`): `room:join` · `room:open` · `room:close` · `room:exit` · `message:send` · `typing` · `reaction:toggle` · `memo:share` · `bucket:share` · `memo:summarize`.
- 메시지 5종: `text` · `attachment` · `memo`(CLOUDLE MEMO) · `bucket`(에코 버킷: title·item·kind·text·sources≤3, URL은 http(s)만) · `system`(입장/퇴장).
- 리액션은 일반 대화용 6가지: `like 👍 · love ❤️ · laugh 😂 · wow 😮 · sad 😢 · eco 🌱` (`REACTIONS`, 프론트 `entities/talk/types.ts`와 같은 순서).
  서버 → 클라: `me` · `message` · `reaction` · `presence`(members + online) · `typing` · `failure`. `GET /api/community/rooms`는 방마다 `members · online · joined`를 준다. 페이로드는 class-validator DTO(`inbound/community.dto.ts`)로 검증한다.
- 바이너리(사진·파일 ≤5MB, png·jpg·webp·gif·pdf·txt·md)는 소켓이 아니라 HTTP multipart로 올린다 (`maxHttpBufferSize` 64KB).
- **신원(개발용):** `IdentityPort` = `OriginPortIdentity`. 브라우저가 붙이는 `Origin`의 포트로 닉네임을 정한다 — `COMMUNITY_IDENTITIES=3000:지구미,3001:예나`. **닉네임:** 로그인이 없으므로 방에 처음 참여할 때(`room:join`의 `nickname`) 직접 정한다. 서버는 세션 ID별로 기억(`IdentityPort.rename`, 메모리 5,000건)하고, 브라우저는 `localStorage`에 저장해 접속·새로고침 때 `auth.nickname`으로 다시 알린다. 규칙은 `cleanNickname`(1~12자, 제어문자·`<`·`>` 금지, 공백 정리), 같은 방에서 다른 사람이 쓰는 이름(대소문자·공백 무시)은 `nickname_taken`으로 거절한다. 식별자(`id`)는 닉네임과 무관하게 그대로다. 로그인 도입 시 이 어댑터만 교체한다.
- **참여 모델 (카카오톡 방식, `Roster`)** — 참여(멤버십)와 접속(소켓)을 분리한다.
  - `room:join` = "참여하시겠습니까?" 확인 → 명단 추가, **처음일 때만** "OO님이 들어왔습니다."
  - `room:open` = 참여한 방 다시 열기(알림 없음). 미참여면 `not_member`.
  - `room:close` · 연결 끊김 = 화면에서 나옴(알림 없음, 참여 유지).
  - `room:exit` = "나가기" → 명단 제거 + "OO님이 나갔습니다." (퇴출도 `Roster.remove()` 재사용)
  - 메시지·첨부·리액션·공유 권한은 **참여** 기준. 접속은 "보는 중" 표시에만 쓴다.
  - 경위와 근거: `docs/05-verification/REFACTOR_COMMUNITY.md` T1
- 메시지 연타 제한 10초 8개, 방마다 최근 300개만 메모리 보관, 첨부는 24시간·총 200MB.
- 여러 인스턴스로 늘릴 땐 `MessageStorePort`·`RoomEventsPort`를 Redis 어댑터로 바꾸고 socket.io Redis adapter를 붙인다 (유스케이스 변경 없음).
- 테스트: `test/community.spec.ts` — 실제 socket.io 서버를 `createApp(factory)`로 띄워 두 사람(3000/3001)으로 접속해 검증한다.

## 3. rag-service 구조
```
cloudle/data/       품목 메타데이터 로더 (RAG 1, 152건)
cloudle/rag/        임베딩·색인·프롬프트·수집·검색·LangGraph·채팅·국가 질문·팩트체크(화면 미사용)·메모 요약(memo.py)·LLM 예산
cloudle/sources/    위키백과·World Bank·NASA EONET·OpenAQ·국가 경계 (캐시·재시도·User-Agent)
cloudle/api/        FastAPI (게이트웨이 전용 내부 API)
streamlit_app.py    과제 기본 UI
```
규칙
- **LLM 호출은 `cloudle/rag/llm.py`만 통한다.** 단계(`query|select|generate|vision`)를 지정하고, 꺼진 단계·예산 소진 시 `LLMUnavailable` → 규칙·발췌 경로로 대체.
- 기본값: `LLM_STAGES=generate`, `EMBEDDING_PROVIDER=local`, `EVIDENCE_CHARS=600`, `TOKEN_BUDGET=70000`, 모델 `gpt-4o-mini`(GMS).
- 프롬프트는 `cloudle/rag/prompts.py`에만 둔다 (P1 검색어 · P2 선별 · P3 근거 답변 · 팩트체크 · MEMO 채팅 요약).
- `POST /api/memo/summarize {lines≤30, lang}`: 받은 줄만 요약(새 수치 생성 금지), LLM 불가 시 품목 사전 + 발췌 규칙 요약 (`engine: llm|offline`).
- 국가를 누르면 **핵심 지표(대기질·폐기물·자연현상 3건)만** 조회한다. 인구·관련 문서는 `detail=true`일 때만.
- 외부 호출은 `sources/http.py`의 `get_json`(디스크 캐시·간격·재시도)만 사용.

## 3-1. 배포 (Docker)
- `backend/api-gateway/Dockerfile`, `backend/rag-service/Dockerfile`, 루트 `docker-compose.yml`(caddy → gateway → rag), `deploy/Caddyfile`. 가이드는 `docs/06-deploy/ORACLE_CLOUD.md`.
- 운영 설정은 환경변수로만: `CORS_ORIGINS`(프론트 주소), `ALLOW_LAN_ORIGINS=false`, `COMMUNITY_IDENTITIES=`(비움), `GMS_KEY`(서버 `.env`에만). rag-service는 `RATE_LIMIT_ENABLED=false`(게이트웨이가 제한).
- **WebSocket은 CORS만으로 막히지 않는다.** `core/socket-io.adapter.ts`의 `allowRequest`가 HTTP와 같은 Origin 규칙으로 직접 거절한다 (테스트: `허용되지 않은 Origin은 소켓 접속이 거절된다`).
- 게스트 식별자는 세션 ID **전체**(`g:<sid>`), 앞 4글자는 화면 표시 이름에만 쓴다 (앞 4글자가 같아도 다른 사람).
- 채팅 상태가 메모리라 **인스턴스 1개만** 띄운다. 늘리려면 `MessageStorePort`·`RoomEventsPort`를 Redis 어댑터로 교체.

## 4. 검증
```bash
:: cmd — rag-service의 .venv는 cmd 기준
cd backend\rag-service && .venv\Scripts\activate && python -m pytest -q      # 네트워크·키 없이 실행
cd backend/api-gateway && pnpm typecheck && pnpm test
```
새 엔드포인트를 만들면 rag-service 테스트와 게이트웨이 테스트를 **둘 다** 추가한다.

## 5. 위임할 서브 에이전트
- RAG 품질·프롬프트·토큰 → `rag-engineer`
- 게이트웨이 계층·가드·캐시 → `gateway-engineer`
- 데이터 출처·라이선스·수치 → `data-steward`
