# 🗂️ 데이터 출처·라이선스 점검표

[README](../../README.md) · [기획서](../01-planning/PLAN.md) · [요구사항](../02-requirements/SRS.md) · [RAG 설계](../03-design/RAG_PIPELINE.md) · **데이터**

## 1. 사용 중인 출처
| 출처 | 용도 | 라이선스 | 상업 이용 | 상태 |
|---|---|---|---|---|
| 캐릭터 이미지 `frontend/public/characters` | 지구·구름 마스코트 | 사용자 제공 AI 생성 이미지 (사용 허락) | ✅ | 사용 |
| CLOUDLE 품목 목록 `items.csv` | RAG 1 품목 152건 | 팀 자체 작성 | ✅ | 사용 (배출 안내는 **초안**, 공식 지침 확인 필요) |
| CLOUDLE 배출 안내 `data/docs/` | RAG 2 기본 문서 | 팀 자체 작성 요약 | ✅ | 사용 (원문 링크 병기) |
| [위키백과 API](https://www.mediawiki.org/wiki/API:Main_page) | RAG 2 품목 문서·국가 환경 요약 | CC BY-SA 4.0 (출처·라이선스 표기) | ✅ 조건부 | 사용 |
| [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392) | PM2.5 연평균·인구·산림 면적 (연간 통계, 2000년~) | CC BY 4.0 | ✅ | 사용 |
| [World Bank What a Waste](https://datacatalog.worldbank.org/search/dataset/0039597) | 국가별 폐기물 통계 | CC BY 4.0 | ✅ | CSV 수동 적재 |
| [NASA EONET](https://eonet.gsfc.nasa.gov/docs/v3) | 자연현상 이벤트 | 공공 (NASA 데이터 정책) | ✅ | 사용 |
| [Natural Earth](https://www.naturalearthdata.com/) | 국가 경계 GeoJSON (110m, 대한민국은 50m로 제주도·울릉도 포함, 독도는 실제 좌표에 표시용 최소 크기로 추가) | Public Domain | ✅ | 사용 |
| [OpenAQ](https://docs.openaq.org/) | 실시간 대기질 관측 | 데이터별 상이 | ⚠️ 확인 | 키 있을 때만 |

## 2. 사용하지 않는 출처 (이용권 미확인)
| 출처 | 사유 |
|---|---|
| 분리의 정석 품목사전 | 공개 조회 가능하나 **재수집·임베딩 허가 미확인** → 링크만 안내 |
| 기후에너지환경부 분리배출 API | 활용신청 필요, 서울 범위 → 키 확보 후 추가 |
| 제품안전정보센터 API | 승인 키 필요 |

## 3. 원칙
- 수치는 **기준연도·관측시각·출처**를 함께 표시하고, 없으면 "조회 불가".
- 위키백과 문서는 제목·URL·CC BY-SA 4.0을 결과 화면에 표기한다.
- 수익화 기능에는 상업 이용 ✅ 출처만 사용한다.
- 수집 기록은 `backend/storage/sources_ledger.jsonl`(제목·URL·라이선스·수집일)에 남는다.
