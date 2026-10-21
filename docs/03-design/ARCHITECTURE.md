# 🏗️ 아키텍처

[README](../../README.md) · [기획서](../01-planning/PLAN.md) · [요구사항](../02-requirements/SRS.md) · [RAG 설계](./RAG_PIPELINE.md) · **아키텍처** · [데이터](../04-data/DATA_SOURCES.md)

## 1. 구조
```
backend/                 Python 3.10+
  cloudle/
    config.py            환경변수 설정
    data/                품목 로더
    rag/                 임베딩·색인·프롬프트·수집·검색·LangGraph·채팅
    sources/             위키백과·World Bank·NASA EONET·OpenAQ·국가 경계
    api/                 FastAPI (세션·요청 제한·SSE)
  data/                  items.csv(품목) · docs/(배출 안내) · geo/
  scripts/               색인·데이터 수집·RAG 비교
  streamlit_app.py       과제 기본 UI (F2001~F2012)
frontend/                Next.js 15 + TypeScript (F2013)
  src/components/        globe · cloud · paper · bin · result
```
Streamlit과 Next.js는 **같은 RAG 코어**를 쓴다. Streamlit은 코어를 직접 import, Next.js는 FastAPI로 호출한다.

## 2. 왜 이 기술인가
| 선택 | 이유 |
|---|---|
| **Streamlit** | 과제 지정 UI. 필수 기능 검증을 가장 빠르게 |
| **Next.js** | 3D·드래그 등 Streamlit으로 불가능한 상호작용 (F2013). App Router + 클라이언트 컴포넌트 |
| **react-globe.gl** | GeoJSON 국가 폴리곤 hover/click, 카메라 이동(`pointOfView`), 자동 회전 내장 |
| **React Three Fiber** | 종이 메시 정점 변형·드래그·충돌 판정을 React 상태와 연결 |
| **물리 엔진 미사용** | 종이공 낙하·튕김은 간단한 스프링으로 충분 → 번들·복잡도 절감 |
| **Zustand** | 종이 JSON·분석 상태·언어·테마를 가볍게 공유 |
| **FastAPI + SSE** | 수집→검색→생성 단계를 실제 진행 이벤트로 스트리밍 (가짜 로딩 금지) |

## 3. 디자인 시스템
- **플랫·에디토리얼:** 스위스 타이포그래피 위계, 엄격한 12열 그리드, 넉넉한 여백, 벤토 그리드 카드.
- **색:** 뮤트 톤(오프화이트·잉크·세이지·스카이). 네온·화려한 그라데이션·글래스모피즘·무거운 그림자 금지.
- **형태:** 라운드 4–8px, 그림자 대신 1px 보더로 구분. 3D 요소(지구본·종이·구름)도 무광 재질.
- **반응형:** 모바일 우선. 모바일에서는 제목·본문 **왼쪽 정렬**, 3D 영역은 세로 스택.
- **모드:** 라이트/다크, 한국어·English·日本語·中文. 컴포넌트 키트는 `/design` 페이지.

## 4. 종이 구기기 구현 방식
- `PlaneGeometry(48×64 세그먼트)`에 종이 내용(줄노트·글·사진)을 **CanvasTexture**로 입힌다.
- 정점마다 **구김도 cᵢ**를 두고, 포인터가 지나간 자리 주변(가우시안)을 올린다.
- 정점 위치 = `평면 ↔ 노이즈 구면(종이공)` 보간 + 주름 노이즈 + 접힘선 회전, 매 프레임 법선 재계산.
- 평균 구김도 85% 이상이면 자동으로 종이공 완성. **자동 구기기 버튼**·**펴기(취소)** 제공.
- 종이공은 z=0 평면 투영으로 드래그, 쓰레기통 입구 반경 안에서 놓으면 낙하, 밖이면 스프링 복귀.

## 5. 보안·세션
- API 키는 서버 `.env`에만. 프론트는 키를 모른다.
- 세션 ID(UUID)는 브라우저 저장, 서버 메모리에 24시간 TTL. 이미지 원본은 분석 후 즉시 폐기.
- 세션·IP 기준 분당 요청 제한.
