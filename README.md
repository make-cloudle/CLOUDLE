# ☁️ CLOUDLE · 클라우들

> **Explore the Earth. Uncover the Truth.** 지구를 탐험하고, 진실을 발견해요.

지구 곳곳의 환경 문제를 발견하고, 구름에 증거를 모아 **RAG로 근거를 찾아** 사실을 확인하는 인터랙티브 환경 탐험 서비스입니다. 로그인 없이 쓸 수 있어요.

## 🌍 다섯 가지 기능
| | 기능 | 하는 일 |
|---|---|---|
| 🆘 | **Earth SOS** | 지구본에서 대기 오염·자연현상 신호를 보고 나라를 골라 핵심 지표 확인 |
| ☁️ | **Cloud Lab** | 노트·캔·페트병을 쓰레기통에 던져 수리·재사용·재활용 방법 분석 |
| ⚖️ | **Planet VS** | 두 나라 비교 + 연도별 변화(타임머신) |
| 🔎 | **Eco Detective** | 인터넷에서 본 환경 주장을 문서 근거로 검토 |
| 📒 | **Discovery Book** | 알아낸 사실과 출처가 자동으로 쌓이는 발견 노트 |

## 🧱 구조
```
frontend/              Next.js · React Three Fiber · Feature-Sliced Design
backend/api-gateway/   NestJS + Fastify · 헥사고날 (프론트가 부르는 유일한 API)
backend/rag-service/   Python · LangGraph · ChromaDB · Streamlit (RAG 엔진)
```

## 🚀 실행 (pnpm)
```bash
# 0) GMS 키: backend/.env.local 에  GMS_KEY=...  (없으면 오프라인 모드)
cd backend/rag-service && pip install -r requirements.txt && python scripts/build_index.py
python -m uvicorn cloudle.api.main:app --port 8000      # RAG 엔진
cd backend/api-gateway && pnpm install && pnpm dev      # 게이트웨이 :4000
cd frontend && pnpm install && pnpm dev                 # 웹 :3000
```
과제 기본 UI: `cd backend/rag-service && streamlit run streamlit_app.py`

## 📚 문서
[기획서](docs/01-planning/PLAN.md) · [요구사항](docs/02-requirements/SRS.md) · [구현 매핑](docs/02-requirements/TRACEABILITY.md) · [아키텍처](docs/03-design/ARCHITECTURE.md) · [RAG 설계](docs/03-design/RAG_PIPELINE.md) · [데이터](docs/04-data/DATA_SOURCES.md) · [검증](docs/05-verification/VERIFICATION.md) · [에이전트 하네스](AGENTS.md)

> 토큰 예산 70,000: LLM은 최종 답변에만 쓰고, 임베딩은 내장, 같은 질문은 캐시합니다.
