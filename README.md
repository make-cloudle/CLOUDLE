# ☁️ CLOUDLE · 클라우들
링크 : https://cloudle.vercel.app

> **Explore the Earth. Uncover the Truth.** 지구를 탐험하고, 진실을 발견해요.

지구 곳곳의 환경 문제를 발견하고, 구름에 증거를 모아 **RAG로 근거를 찾아** 사실을 확인하는 인터랙티브 환경 탐험 서비스입니다. 로그인 없이 쓸 수 있어요.

## 🌍 다섯 가지 기능
| | 기능 | 하는 일 |
|---|---|---|
| 🆘 | **Earth SOS** | 지구본에서 대기 오염·자연현상 신호를 보고 나라를 골라 핵심 지표 확인 |
| ☁️ | **Cloud Lab** | 노트·캔·페트병을 **에코 버킷**에 던져 수리·재사용·재활용 방법 분석 · 좋은 결과물을 저장하고 공유|
| 🎮 | **분리수거 게임** | 비닐·플라스틱·캔·종이·유리·일반을 3개 이상 맞추는 퍼즐 — 폭탄 3종, 콤보 ×2·×3·×4, 터뜨릴수록 시간 회복 (구 국가 비교를 대체) |
| 💬 | **구름 광장** | 주제별 실시간 채팅방(웹소켓) · 사진/파일 · 이모티콘 반응 · CLOUDLE MEMO · **에코 버킷 공유** · AI 메모 정리 |
| 🌱 | **에코 버킷** | Cloud Lab 결과에서 마음에 든 결과·방법(재사용·수리·배출)을 담아 두고 채팅방에 큰 카드로 공유 |
| 📒 | **Discovery Book** | 알아낸 사실과 출처가 자동으로 쌓이는 발견 노트 · 지구가 살아온 스토리 열람 |

## 🧱 구조
```
frontend/              Next.js · React Three Fiber · Feature-Sliced Design
backend/api-gateway/   NestJS + Fastify · 헥사고날 (프론트가 부르는 유일한 API)
backend/rag-service/   Python · LangGraph · ChromaDB · Streamlit (RAG 엔진)
```

## 🚀 실행
> **rag-service(Python)는 cmd에서 실행합니다.** `.venv`가 cmd 기준으로 만들어져 있어 Git Bash에서는 활성화되지 않습니다.

**1) RAG 엔진 — cmd**
```bat
:: GMS 키: backend\.env.local 에  GMS_KEY=...  (없으면 오프라인 모드)
cd backend\rag-service
.venv\Scripts\activate
pip install -r requirements.txt
python scripts\build_index.py
python -m uvicorn cloudle.api.main:app --port 8000
```

**2) 게이트웨이 · 웹 — 아무 터미널 (pnpm)**
```bash
cd backend/api-gateway && pnpm install && pnpm dev      # 게이트웨이 :4000 (HTTP + WebSocket /community)
cd frontend && pnpm install && pnpm dev                 # 웹 :3000 (지구미)
cd frontend && pnpm dev:both                            # 웹 :3000(지구미) + :3001(예나) — 구름 광장 두 사람 테스트
```
휴대폰은 같은 와이파이에서 `http://<PC LAN IP>:3000`.
과제 기본 UI(cmd, `.venv` 활성화 후): `cd backend\rag-service && streamlit run streamlit_app.py`

## 🗂️ 데이터 출처와 이용 조건
| 출처 | 쓰는 곳 | 이용 조건 |
|---|---|---|
| 위키백과 (MediaWiki API) | 품목·국가 설명 근거 | CC BY-SA 4.0 — 화면에 제목·URL·라이선스 표기 |
| World Bank Indicators / What a Waste | 국가 지표 (PM2.5·인구·산림·폐기물) | CC BY 4.0 — 출처·연도·단위 표기 |
| NASA EONET | 지구본 자연현상 | NASA 데이터 정책 (공개) |
| Natural Earth | 국가 경계 | Public Domain |
| 법제처 폐기물관리법, 정책브리핑(환경부·소방청), 한국환경공단, e순환거버넌스, 한국폐기물협회 | 분리배출 안내 문서(`backend/rag-service/data/docs/`) | 공공누리 제1유형은 출처표시 인용, 제4유형은 **사실만 새로 서술**, 법령은 보호 대상 아님 |

자세한 대장과 사용하지 않은 출처의 사유는 [`docs/04-data/DATA_SOURCES.md`](docs/04-data/DATA_SOURCES.md). 수집 기록(제목·URL·라이선스·수집일)은 실행 중 `sources_ledger.jsonl`에 남고, 위키백과 요청은 간격 0.25초 이상·재시도·`User-Agent`에 프로젝트 정보를 넣어 보낸다.

## 📚 문서
[기획서](docs/01-planning/PLAN.md) · [요구사항](docs/02-requirements/SRS.md) · [구현 매핑](docs/02-requirements/TRACEABILITY.md) · [아키텍처](docs/03-design/ARCHITECTURE.md) · [RAG 설계](docs/03-design/RAG_PIPELINE.md) · [데이터](docs/04-data/DATA_SOURCES.md) · [검증](docs/05-verification/VERIFICATION.md) · [구름 광장 리팩토링·트러블슈팅](docs/05-verification/REFACTOR_COMMUNITY.md) · [배포(Oracle Cloud + Docker)](docs/06-deploy/ORACLE_CLOUD.md) · [에이전트 하네스](AGENTS.md)

> 토큰 예산 70,000: LLM은 최종 답변에만 쓰고, 임베딩은 내장, 같은 질문은 캐시합니다.
