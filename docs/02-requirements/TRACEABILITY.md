# 🔗 요구사항 구현 매핑

[README](../../README.md) · [요구사항](./SRS.md) · **구현 매핑** · [검증 결과](../05-verification/VERIFICATION.md)

상태: ✅ 통과 · 🟡 부분/조건부 · ⏳ 예정

| ID | 구현 위치 | 검증 | 상태 |
|---|---|---|---|
| F2001 | `cloudle/data/items.py` · `data/items.csv` | `test_phase1_index.py` | ✅ |
| F2002 | `cloudle/rag/indexing.py::index_items` | `test_phase1_index.py` | ✅ |
| F2003 | `cloudle/rag/prompts.py::P1` · `collect.py::extract_queries` | `test_p1_*` | ✅ |
| F2004 | `cloudle/rag/collect.py::select_candidates` (P2, 품목 직접 문서 보존) | `test_p2_*` | ✅ |
| F2005 | `cloudle/rag/indexing.py::index_documents` | `test_collect_indexes_with_metadata_and_caches` · `test_chunk_size_is_configurable` | ✅ |
| F2006 | `cloudle/rag/retrieve.py` | `test_retrieve_always_includes_item_meta_and_dedupes` | ✅ |
| F2007 | `cloudle/rag/graph.py` (`retrieve → generate`, P3) | `test_graph_has_retrieve_and_generate_nodes` · `test_unanswerable_*` | ✅ |
| F2008 | `graph.py::_clean_citations` · 결과 근거 목록 | `test_invalid_citations_*` | ✅ |
| F2009 | `cloudle/rag/chat.py` · 분석 화면 채팅 | `test_chat_history_is_isolated_per_item` | ✅ |
| F2010 | `graph.py` (요약·재사용·수리·배출·다음 선택) | `test_offline_analysis_has_next_choice_*` | ✅ |
| F2011 | `cloudle/rag/search.py` · `app_pages/explore.py` | `test_condition_search_*` | ✅ |
| F2012 | `pipeline.py` 진행 이벤트·`UserFacingError` · `st.status` | `test_errors_are_user_facing` · `test_progress_events_*` | ✅ |
| F2014 | `retrieve.py::_mmr` · 데이터·색인 화면 비교 | `test_mmr_returns_top_k` | ✅ |
| F2016 | 위키백과·배출 안내·업로드 문서 결합 (`uploads.py`) | `test_uploaded_doc_is_session_scoped_and_purged` | ✅ |
| NF2002 | `sources/http.py` 디스크 캐시 · `collect.py` 검색어 캐시 | `test_collect_indexes_with_metadata_and_caches` | ✅ |
| NF2003 | `.env` / `.env.example` | `test_no_api_keys_in_repository` | ✅ |
| NF2004 | `UserFacingError` 메시지만 노출 | `test_errors_are_user_facing` | ✅ |
| NF2005 | `cloudle/{data,rag,sources}` · `ui/` · `app_pages/` 분리 | 폴더 구조 | ✅ |
| NF2006 | `sources/http.py` 호출 간격·재시도·User-Agent | 코드 리뷰 | ✅ |
| NF2007 | `storage/sources_ledger.jsonl` · 데이터 문서 | 데이터·색인 화면 | ✅ |
