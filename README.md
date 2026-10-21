# ☁️ CLOUDLE · 클라우들

> **Wrap the Earth in Care.** 지구를 다정히 감싸고, 물건 하나부터 조금씩 더 푸르게.

버릴까 고민되는 물건의 **수리·재사용·분리배출** 방법을 실제 문서에서 찾아 **근거 번호와 함께** 알려주는 비회원 RAG 서비스입니다.

## 🌍 이렇게 써요
1. **지구본**에서 국가를 고르면 구름이 환경 브리핑을 해줘요.
2. **종이**에 물건을 적고(사진·파일·카메라 가능) 직접 **구겨서** 쓰레기통에 던져요.
3. **구름을 열면** 근거가 달린 분석 결과가 나와요. 이어서 질문도 할 수 있어요.

## 🧱 구성
| 앱 | 역할 |
|---|---|
| `backend/` | RAG 코어 · FastAPI · **Streamlit 앱**(과제 기본 UI) |
| `frontend/` | Next.js 3D 웹(지구본·종이 구기기·구름) |

## 🚀 빠른 실행
```bash
cd backend && pip install -r requirements.txt
python scripts/build_index.py          # 품목 100건+ 색인
streamlit run streamlit_app.py         # 과제 기본 UI
```

## 📚 문서
[기획서](docs/01-planning/PLAN.md) · [요구사항](docs/02-requirements/SRS.md) · [RAG 설계](docs/03-design/RAG_PIPELINE.md) · [아키텍처](docs/03-design/ARCHITECTURE.md) · [데이터·라이선스](docs/04-data/DATA_SOURCES.md)
