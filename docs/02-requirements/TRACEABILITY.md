# 🔗 요구사항 구현 매핑

[README](../../README.md) · [요구사항](./SRS.md) · **구현 매핑** · [검증 결과](../05-verification/VERIFICATION.md)

상태: ✅ 통과 · 🟡 조건부(키 필요 등)

## 과제 필수 · 심화
| ID | 구현 위치 | 검증 | 상태 |
|---|---|---|---|
| F2001 | `backend/data/items.csv`(152건) · `cloudle/data/items.py` | `test_f2001_*` | ✅ |
| F2002 | `cloudle/rag/indexing.py::index_items` | `test_f2002_*` | ✅ |
| F2003 | `rag/prompts.py::P1` · `rag/collect.py::extract_queries` | `test_p1_*` | ✅ |
| F2004 | `rag/collect.py::select_candidates` (P2, 품목 직접 문서 보존) | `test_p2_*` | ✅ |
| F2005 | `rag/indexing.py::index_documents` | `test_collect_indexes_*` · `test_chunk_size_*` | ✅ |
| F2006 | `rag/retrieve.py` (품목 메타 필수 + 안내 문서 보장 + 중복 제거) | `test_retrieve_*` | ✅ |
| F2007 | `rag/graph.py` (`retrieve → generate`, P3) | `test_graph_*` · `test_unanswerable_*` | ✅ |
| F2008 | `graph.py::_clean_citations` · 결과 카드 근거 번호 | `test_invalid_citations_*` | ✅ |
| F2009 | `rag/chat.py` · `ChatPanel.tsx` · Streamlit 채팅 | `test_chat_history_is_isolated_per_item` | ✅ |
| F2010 | `graph.py` (요약·재사용·수리·배출·다음 선택) | `test_offline_analysis_*` | ✅ |
| F2011 | `rag/search.py` · `/explore` · `app_pages/explore.py` | `test_condition_search_*` | ✅ |
| F2012 | 진행 이벤트 · SSE · `st.status` · 오류 안내 | `test_progress_events_*` · `test_analyze_sse_*` | ✅ |
| F2013 | `frontend/` (Next.js, API 분리) | 브라우저 시나리오 | ✅ |
| F2014 | `retrieve.py::_mmr` · 데이터·색인 화면 | `test_mmr_*` · [RAG 비교 §2](../05-verification/RAG_COMPARISON.md) | ✅ |
| F2015 | `scripts/compare_rag.py` | [RAG 비교 §1](../05-verification/RAG_COMPARISON.md) | 🟡 RAG 미사용 열은 LLM 키 필요 |
| F2016 | 위키백과 · 배출 안내 · 업로드 문서 결합 | `test_uploaded_doc_*` | ✅ |

## 비기능
| ID | 구현 위치 | 상태 |
|---|---|---|
| NF2001 | `pipeline.py` timings · RAG 비교 §3 | ✅ |
| NF2002 | `sources/http.py` · `collect.py` 캐시 | ✅ |
| NF2003 | `.env` · `.env.example` | ✅ |
| NF2004 | `UserFacingError` · API 예외 처리기 | ✅ |
| NF2005 | `cloudle/{data,rag,sources,api}` · `ui/` · `app_pages/` · `frontend/` | ✅ |
| NF2006 | `sources/http.py` | ✅ |
| NF2007 | `storage/sources_ledger.jsonl` · 데이터 문서 | ✅ |

## CLOUDLE 추가
| ID | 구현 위치 | 상태 |
|---|---|---|
| C01 | `api/session.py` (세션 TTL·요청 제한) | ✅ |
| C02 | `PaperInput.tsx` · `lib/loop.ts` (구조화 JSON, 분석 전 수정) | ✅ |
| C03 | `graph.py` safety · P3 규칙 4 | ✅ |
| C04 | `sources/environment.py` · `GlobeView.tsx` · `CountryBriefing.tsx` | ✅ (폐기물 통계 🟡) |
| C05 | `CrumpleStage.tsx` (정점 변형·드래그·투입) | ✅ |
| C06 | `CrumpleStage.tsx::ResultCloud` · `ResultCard.tsx` | ✅ |
| C07 | `Attachments.tsx` · `CameraCapture.tsx` · `lib/i18n.ts` · 다크 모드 | ✅ (사진 인식 🟡) |
| C08 | 업체 연결 — 인터페이스만 기획, 미구현 | ⏳ Could |
