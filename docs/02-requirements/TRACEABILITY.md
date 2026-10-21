# 🔗 요구사항 구현 매핑

[README](../../README.md) · [요구사항](./SRS.md) · **구현 매핑** · [검증 결과](../05-verification/VERIFICATION.md)

상태: ✅ 통과 · 🟡 부분/조건부 · ⏳ 예정

| ID | 구현 위치 | 검증 | 상태 |
|---|---|---|---|
| F2001 | `cloudle/data/items.py` · `data/items.csv` | `test_phase1_index.py` | ✅ |
| F2002 | `cloudle/rag/indexing.py::index_items` | `test_phase1_index.py` | ✅ |
| F2003 | `cloudle/rag/prompts.py::P1` · `collect.py` | ⏳ | ⏳ |
| F2004 | `cloudle/rag/collect.py` | ⏳ | ⏳ |
| F2005 | `cloudle/rag/indexing.py::index_documents` | `test_phase1_index.py` | 🟡 |
| F2006 | `cloudle/rag/retrieve.py` | ⏳ | ⏳ |
| F2007 | `cloudle/rag/graph.py` | ⏳ | ⏳ |
| F2008 | `cloudle/rag/graph.py` · 결과 카드 | ⏳ | ⏳ |
| F2009 | `cloudle/rag/chat.py` | ⏳ | ⏳ |
| F2010 | `cloudle/rag/graph.py` (다음 선택 섹션) | ⏳ | ⏳ |
| F2011 | `cloudle/rag/search.py` | ⏳ | ⏳ |
| F2012 | 진행 이벤트 · `streamlit_app.py` · SSE | ⏳ | ⏳ |
