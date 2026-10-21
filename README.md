# ☁️ CLOUDLE · 클라우들

> **Wrap the Earth in Care.** 지구를 다정히 감싸고, 물건 하나부터 조금씩 더 푸르게.

버릴까 고민되는 물건의 **수리·재사용·분리배출** 방법을 실제 문서에서 찾아 **근거 번호와 함께** 알려주는 비회원 RAG 서비스입니다.

## 🌍 이렇게 써요
1. **지구본**에서 나라를 고르면 구름이 환경 브리핑을 해줘요.
2. **종이**에 물건을 적고(사진·파일·카메라 가능) 직접 **구겨서** 쓰레기통에 던져요.
3. **구름을 열면** 근거가 달린 결과가 나와요. 이어서 질문도 할 수 있어요.

## 🧱 구성
| 폴더 | 역할 |
|---|---|
| `backend/` | RAG 코어(LangGraph·ChromaDB) · FastAPI · **Streamlit 앱** |
| `frontend/` | Next.js 3D 웹 (지구본·종이 구기기·구름) |
| `docs/` | 기획 · 요구사항 · 설계 · 데이터 · 검증 |

## 🚀 실행
```bash
# 1) 백엔드 (Python 3.10+)
cd backend
pip install -r requirements.txt
cp .env.example .env              # OPENAI_API_KEY 없으면 오프라인 모드
python scripts/build_index.py     # 품목 152건 색인
streamlit run streamlit_app.py    # 과제 기본 UI  → :8501
uvicorn cloudle.api.main:app --port 8000   # 3D 웹용 API

# 2) 프론트엔드 (Node 20+)
cd frontend
cp .env.example .env.local && npm install && npm run dev   # → :3000

# 3) 검증
cd backend && python -m pytest -q   # 41 passed
```

## 📚 문서
[기획서](docs/01-planning/PLAN.md) · [요구사항](docs/02-requirements/SRS.md) · [구현 매핑](docs/02-requirements/TRACEABILITY.md) · [RAG 설계](docs/03-design/RAG_PIPELINE.md) · [아키텍처](docs/03-design/ARCHITECTURE.md) · [데이터·라이선스](docs/04-data/DATA_SOURCES.md) · [검증 결과](docs/05-verification/VERIFICATION.md)

> LLM 키가 없으면 규칙·발췌 기반 **오프라인 모드**로 동작하고 화면에 표시됩니다.
