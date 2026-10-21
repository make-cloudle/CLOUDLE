# CLOUDLE — 루트 에이전트 (공통 규칙)

> 이 파일은 저장소 전체에 적용되는 **공통 규칙**입니다. 영역별 규칙은 주 에이전트 문서를 따릅니다.
> - 백엔드 주 에이전트: [`backend/AGENTS.md`](backend/AGENTS.md)
> - 프론트엔드 주 에이전트: [`frontend/AGENTS.md`](frontend/AGENTS.md)
> - 서브 에이전트: [`.claude/agents/`](.claude/agents/)

## 1. 서비스 한 줄 요약
**CLOUDLE — Explore the Earth. Uncover the Truth.**
지구본에서 환경 문제를 발견하고 → 구름에 증거를 모아 → RAG로 분석하고 → 새로운 사실을 발견 노트에 남기는 인터랙티브 환경 탐험 서비스. 로그인 없이 모든 기능을 쓴다.

| 기능 | 화면 | 핵심 |
|---|---|---|
| Earth SOS | `/` | 3D 지구본 · PM2.5 레이어 · 국가 핵심 지표 · 구름에게 묻기 |
| Cloud Lab | `/bin` | 노트·쓰레기를 던져 넣고 RAG로 수리·재사용·재활용 분석 |
| Planet VS | `/vs` | 두 나라 비교 · 연도별 변화(타임머신) · 차이의 배경 |
| Eco Detective | `/detective` | 환경 주장 팩트체크 (근거 없으면 판정 보류) |
| Discovery Book | `/book` | 알아낸 사실과 출처 자동 저장 (브라우저에만) |

## 2. 구조
```
frontend/               Next.js 16 · React Three Fiber · Feature-Sliced Design  (pnpm)
backend/api-gateway/    NestJS 11 + Fastify · 헥사고날(포트·어댑터)          (pnpm)
backend/rag-service/    Python · LangGraph · ChromaDB · Streamlit (과제 필수 스택)
docs/                   기획 · 요구사항 · 설계 · 데이터 · 검증
```
요청 흐름: `브라우저 → api-gateway(:4000, 세션·요청제한·검증·캐시) → rag-service(:8000, 내부)`.
프론트엔드는 rag-service를 직접 호출하지 않는다.

## 3. 반드시 지킬 것 (모든 에이전트 공통)
1. **수치를 만들지 않는다.** 환경 수치는 API/데이터에서만 가져오고 출처·단위·기준연도/관측시각을 함께 보여 준다. 없으면 "조회 불가".
2. **근거 없는 답을 하지 않는다.** RAG 답변은 `[근거 n]`과 실제 출처가 1:1로 맞아야 하고, 근거가 없으면 "확인할 수 없음".
3. **토큰 예산 70,000.** LLM은 최종 답변 생성(P3)에만 기본 사용, 임베딩은 내장(로컬), 같은 질문은 캐시. 예산을 넘기면 자동으로 오프라인 모드.
4. **키는 코드·커밋에 넣지 않는다.** GMS 키는 `backend/.env.local`(git 무시)에만. `.env.example`에는 빈 값.
5. **이용조건이 확인된 데이터만 색인한다.** 출처 대장은 `docs/04-data/DATA_SOURCES.md`.
6. **과제 필수 F2001~F2012, NF2001~NF2007을 깨지 않는다.** 구현 위치는 `docs/02-requirements/TRACEABILITY.md`.

## 4. 명령어
| 목적 | 명령 |
|---|---|
| RAG 서비스 | `cd backend/rag-service && python -m uvicorn cloudle.api.main:app --port 8000` |
| 게이트웨이 | `cd backend/api-gateway && pnpm install && pnpm dev` |
| 프론트엔드 | `cd frontend && pnpm install && pnpm dev` |
| Streamlit (과제 UI) | `cd backend/rag-service && streamlit run streamlit_app.py` |
| 테스트 | `python -m pytest -q` (rag-service) · `pnpm test` (gateway) · `pnpm lint && pnpm build` (frontend) |

## 5. 작업 방식
- 브랜치: `phase-N/주제` → 공통 MR 템플릿(`.gitlab/merge_request_templates/Default.md`) → `main` 머지.
- 커밋 메시지는 한국어, `feat|fix|docs|chore(범위): 요약`.
- 완료 전 검증: 자동 테스트 + 실제 화면 확인(Playwright 헤드리스 등). 확인하지 못한 것은 "미검증"으로 적는다.

## 6. Claude 활용 방식 (하네스)
Claude Code는 루트 `CLAUDE.md` → 이 파일을 읽고, 작업 위치에 따라 `backend/`·`frontend/`의 `CLAUDE.md`(→ 각 `AGENTS.md`)를 추가로 읽는다.

| 역할 | 정의 | 맡는 일 |
|---|---|---|
| **루트 에이전트** | 이 파일 | 요구사항 해석, 작업 분배, 공통 규칙, 최종 검증·MR |
| **백엔드 주 에이전트** | `backend/AGENTS.md` | api-gateway · rag-service 설계와 구현 |
| **프론트엔드 주 에이전트** | `frontend/AGENTS.md` | 화면 · 3D · 디자인 시스템 · 다국어 |
| 서브: `rag-engineer` | `.claude/agents/rag-engineer.md` | 프롬프트·수집·검색·LangGraph·토큰 절약 |
| 서브: `gateway-engineer` | `.claude/agents/gateway-engineer.md` | NestJS 포트·어댑터·가드·캐시 |
| 서브: `ui-3d-engineer` | `.claude/agents/ui-3d-engineer.md` | 지구본·클라우드 빈·던지기 물리·캐릭터 |
| 서브: `design-system-keeper` | `.claude/agents/design-system-keeper.md` | 토큰·컴포넌트·반응형·접근성 일관성 |
| 서브: `data-steward` | `.claude/agents/data-steward.md` | 데이터 출처·라이선스·수치 정확성 |
| 서브: `qa-verifier` | `.claude/agents/qa-verifier.md` | 테스트·브라우저 시나리오·요구사항 대조 |

위임 원칙: 한 영역 안의 작업은 해당 주 에이전트가 직접 처리하고, **여러 파일을 넓게 조사하거나 독립적으로 검증할 때만** 서브 에이전트를 쓴다. 서브 에이전트 결과는 루트 에이전트가 확인한 뒤 반영한다.
