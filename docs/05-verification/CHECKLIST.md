# 셀프·상호 체크리스트 (AI 코어 프로젝트 2회차)

[README](../../README.md) · [검증 결과](./VERIFICATION.md) · [요구사항 매핑](../02-requirements/TRACEABILITY.md) · [데이터 출처](../04-data/DATA_SOURCES.md)

> 규칙: **확인하지 않은 것을 통과로 적지 않는다.** 증빙은 `evidence/` 폴더의 파일명이며 키·내부 오류는 들어 있지 않다.
> 항목 이름은 요구사항 ID 기준으로 정리한 것이어서 PDF 문구와 표현이 다를 수 있다.

**확인일** 2026-10-23 · **방법** `backend/rag-service/scripts/verify_checklist.py`(임시 저장소·LLM 키 강제 해제·오프라인) 자동 점검 + 코드 확인
**요약** ✅ 22 · ❌ 0 · ⬜ 미확인 4 · ➖ 해당없음 1  (재현: `cd backend/rag-service && .venv\Scripts\python.exe scripts/verify_checklist.py`)

| # | ID | 점검 내용 | 결과 | 비고 | 증빙 |
|---|---|---|---|---|---|
| 1 | F2001 | 품목 데이터 로드·색인 텍스트에 속성 포함 | ✅ 통과 | 로드 152건 = 색인 152건, 색인 텍스트에 속성 9/9개 포함 | 01-items-index.txt |
| 2 | F2002 | 품목 색인 + 안내 문서 색인, 재실행해도 중복 없음 | ✅ 통과 | 품목 색인 152→152, 안내 문서 청크 72→72 (재실행해도 늘지 않음) | 02-idempotent.txt |
| 3 | F2003/F2004 | P1 검색어 생성 → 후보 수집 → P2 선별(채택·버림 기록) | ✅ 통과 | 검색어 5개, 후보 18건 중 채택 3건·버림 15건 | 03-collect-p1-p2.txt |
| 4 | F2004/NF2002 | 같은 질문 재요청 시 외부 호출 0회(캐시) | ✅ 통과 | 같은 질문 2회차: 외부 호출 0회, 새 색인 0청크, 캐시 적중 5/5, 8.60s→0.01s | 04-collect-cache.txt |
| 5 | F2005 | 청크 크기 설정이 색인에 반영됨 | ✅ 통과 | CHUNK_SIZE 1000→300: 청크 72→249, 색인 72→249 (되돌리면 72) | 05-chunk-size.txt |
| 6 | F2006 | Top-k 설정이 근거 개수에 반영됨 | ✅ 통과 | TOP_K 2→6: 근거 3건→7건 | 06-top-k.txt |
| 7 | F2007 | LangGraph retrieve → generate | ✅ 통과 | LangGraph 노드: ['generate', 'retrieve'] (START→retrieve→generate→END) | 07-graph.txt |
| 8 | F2008 | 본문 인용 번호 = 근거 목록 번호, 출처 종류 구분 | ✅ 통과 | 본문 인용 [1, 5, 6] = 근거 목록 [1, 5, 6], 구분: ['배출 안내', '위키백과', '품목 메타데이터'] | 08-citations.txt |
| 9 | F2007/F2008 | 근거 없는 질문 → '확인할 수 없음' | ✅ 통과 | 색인에 없는 질문 → 답변 '확인할 수 없음', 인용 [] (화면 안내는 UI 점검에서 확인) | 09-unanswerable.txt |
| 10 | F2009 | 대화 기록이 품목별로 분리 | ✅ 통과 | E001 기록 2건, G002 기록 2건, 섞인 메시지 0건 | 10-chat-isolation.txt |
| 11 | F2011 | 조건 기반 탐색 | ✅ 통과 | 조건 3개 검색, 조건과 맞지 않는 항목 0건 | 11-condition-search.txt |
| 12 | F2010 | 요약·재사용·수리·배출·다음 선택 항목과 근거 | ✅ 통과 | 수리·재사용·분리배출·다음 선택 각 항목에 근거 번호 또는 '확인할 수 없음' 표시 | 12-domain-feature.txt |
| 13 | F2012 | 진행 상태 · 색인 없음 · 키 없음 안내 | ✅ 통과 | 진행 이벤트 11단계 순서 일치, 색인 없음 → 'index_missing / 품목 색인이 비어 있어요. 관리자에게 색인 실행을 요청해 주세요.', 키 없음 → offline=True(화면 안내는 UI 점검) | 13-progress-errors.txt |
| 14 | 도메인 면책 | 건강·금융 등 면책 대상 여부 | ➖ 해당없음 | 환경·분리배출 도메인이라 건강·금융 면책 대상이 아님 (배터리·유해물은 안전 안내 `safety`가 별도로 표시됨 — UI 점검 참고) |  |
| 15 | F2013 | UI와 API 분리(Next.js ↔ 게이트웨이 ↔ rag-service) | ✅ 통과 | `frontend/`가 Next.js, 브라우저는 게이트웨이(:4000)만 호출(rag-service 직접 호출 없음). `pnpm lint`·`pnpm build` 통과 | `grep 8000 frontend/src`(rag 포트 호출 0건), AGENTS.md §2 |
| 16 | F2014 | 유사도 검색 vs MMR 비교 | ✅ 통과 | 유사도 5건·MMR 5건 나란히 기록 (이 질문에서는 순서·구성이 다름) | 16-similarity-vs-mmr.txt |
| 17 | F2015 | RAG 사용/미사용 답변 비교 ① | ⬜ 미확인 | LLM 없이 실행한 비교만 있음. '미사용' 열은 LLM 키가 있어야 해서 이번에는 실행하지 않음(토큰 예산 보호) | docs/05-verification/RAG_COMPARISON.md |
| 18 | F2015 | RAG 사용/미사용 답변 비교 ② | ⬜ 미확인 | 위와 같음 | docs/05-verification/RAG_COMPARISON.md |
| 19 | F2016 | 여러 출처(위키백과·안내 문서·업로드·품목 메타) 결합 | ✅ 통과 | 출처 종류 구분: ['배출 안내', '업로드 문서', '위키백과', '품목 메타데이터'] (위키백과는 3번 수집 결과에 포함) | 19-source-kinds.txt |
| 20 | NF2001 | 처리 시간 | ✅ 통과 | 첫 분석 투명 페트병 3.39s, 소주병·맥주병 2.71s, 형광등 5.68s / 재분석 0.03s, 0.03s, 0.03s (오프라인·위키백과 수집 포함, LLM 시간은 미포함) | 20-timings.txt |
| 21 | NF2003/NF2004 | 키 비노출 · 오류 시 내부 정보 비노출 | ✅ 통과 | 저장소(HEAD 전체)에서 키 패턴 0건, 추적 중인 .env 파일 0개, 오류 응답의 내부 정보 노출 0건 | 21-secrets-errors.txt |
| 22 | NF2005 | 수집·색인·검색·생성·UI 모듈 분리 | ✅ 통과 | 수집·색인·검색·생성·UI가 파일로 분리됨 (없는 것: 없음) | 22-modules.txt |
| 23 | NF2006 | 외부 호출 예의(간격·재시도·User-Agent) | ✅ 통과 | 호출 간격 [0.25, 0.25, 0.25]초(≥0.25), 429·5xx 재시도(지수 백오프·Retry-After), User-Agent='CLOUDLE/0.1 (SSAFY AI core project; https://lab.ssafy.com/s16/a11/ai_day/CLOUDLE)' | 23-http-etiquette.txt |
| 24 | NF2007 | README에 데이터 출처·이용 조건 | ✅ 통과 | README에 사용 데이터의 출처·이용 조건이 있는지 | 24-readme-sources.txt |
| 25 | 제출 | 화면 캡처 첨부 | ⬜ 미확인 | 화면 캡처(Playwright)는 이번에 찍지 않음 | — |
| 26 | 제출 | 시연·실행 방법 | ⬜ 미확인 | 실행 명령은 README·AGENTS §4, 배포는 docs/06-deploy/ORACLE_CLOUD.md에 적혀 있으나 처음부터 따라 실행해 보지는 않았고, 이 항목의 원문 기준도 확인하지 못함 | README.md |
| 27 | 제출 | 제출 문서 모음 | ✅ 통과 | 제출 문서 7/7 존재 (셀프 체크리스트는 CHECKLIST.md로 별도) | 27-deliverables.txt |

## 확인하지 못했거나 한계가 있는 것
1. **F2015 (17·18번)**: RAG 미사용 답변은 LLM 키가 있어야 만들 수 있어 실행하지 않았다. 실행하면 토큰 예산(70,000) 일부를 쓰므로 승인 후 `scripts/compare_rag.py`로 돌릴 수 있다.
2. **화면 캡처 (25번)와 UI 항목(9·13·15·19번의 화면 부분)**: 엔진 동작은 자동 점검으로 확인했지만 브라우저 화면 캡처는 아직 없다. 채팅 말풍선의 "인용한 근거 없음" 안내는 이번에 추가했고 `pnpm lint`·`pnpm build`만 통과, **브라우저에서는 미확인**.
3. **오프라인 한계**: 3번 항목은 위키백과 후보 중 품목명/별칭이 제목에 있는 문서만 규칙으로 채택한다. 예: 무선 이어폰(E001)은 후보 19건 중 0건 채택 → 스마트폰(E002)으로 점검했다. LLM 사용 시 P2 선별 품질은 미측정.
4. **처리 시간(20번)**: LLM 시간은 포함하지 않았다.
5. **User-Agent(23번)**: 로컬 `.env.local` 값이 적용된다(`CLOUDLE/0.1 …`). 코드 기본값·`docker-compose.yml` 기본값은 `CLOUDLE/0.2 (GitLab URL; SSAFY education project)`로 맞췄다.

## 이번에 발견해 고친 것
| # | 문제 | 조치 |
|---|---|---|
| G1 | 근거 없는 답변도 평범한 말풍선으로 보임 | `ChatPanel.tsx`에 "인용한 근거가 없어요" 안내(4개 언어) |
| G2 | 배출 안내 문서가 9개·합계 약 7KB로 얇고 "원문 확인 필요" 표시 | 법령·정책브리핑·한국환경공단·e순환거버넌스·한국폐기물협회 기반 문서 6개 추가(`data/docs/`), 출처·라이선스를 문서와 `DATA_SOURCES.md`에 기록 |
| G3 | docker 기본 User-Agent에 연락처 URL 없음 | `docker-compose.yml` 기본값 수정 |
| G4 | README에 데이터 출처·이용 조건 없음 | README에 표 추가 |
| G5 | `pytest`가 `.env.local`의 GMS 키로 실제 LLM을 호출(테스트 3건 실패·토큰 소모) | `tests/conftest.py`에서 키 3종을 비움 → 45 passed |
| G6 | TRACEABILITY/VERIFICATION의 경로·테스트 수가 오래됨 | 정정(rag 45, gateway 15) |

## 추가한 RAG 문서 (`backend/rag-service/data/docs/`)
| 파일 | 내용 | 이용 조건 처리 |
|---|---|---|
| `law-waste-management-act.md` | 폐기물관리법 정의·투기 금지·생활폐기물 처리·종량제 수수료 | 법령(보호 대상 아님), 2024-05-20 기준 명시 |
| `clear-pet-separate-discharge.md` | 투명 페트병 별도 배출 방법·대상·도입 경과 | 제1유형 인용, 제4유형은 사실만 새로 서술 |
| `battery-safety-classification.md` | 리튬이온 배터리 안전수칙·2026 폐전지류 분류 개편 | 제1유형 인용, 소방청(제4유형)은 사실만 |
| `appliance-free-pickup.md` | 폐가전 무상 방문수거 신청·품목·준비 | 사실만 새로 서술, 페이지 간 기준 차이 명시 |
| `separation-mark-system.md` | 분리배출표시제도 근거·대상·2020 개편 예고 | 제1유형 인용 + 공단 사실 |
| `waste-statistics-2024.md` | 2024 폐기물 발생·처리 통계 표 | 협회 약관 제7조 ③(출처 명시, 비영리) |

문서에서 일부러 뺀 것: 빈용기보증금 금액, 분리배출 도안 색상·세부 규격, 지역별 종량제 봉투 가격 — 공식 원문으로 확인하지 못했다.
