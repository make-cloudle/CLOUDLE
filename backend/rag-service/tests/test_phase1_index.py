"""Phase 1: F2001 · F2002 · 안내 문서 색인."""
from cloudle.data.items import find_item_by_name, load_items
from cloudle.rag.indexing import index_guides, index_items, load_guide_docs
from cloudle.rag.store import evidence_collection, item_collection


def test_f2001_items_over_100_with_one_text_each():
    items = load_items()
    assert len(items) >= 100
    assert len({i.item_id for i in items}) == len(items)
    text = items[0].search_text()
    assert "품목명" in text and "배출 분류" in text


def test_f2002_index_count_matches_and_rerun_has_no_duplicates():
    n_items = len(load_items())
    assert index_items() == n_items
    assert index_items() == n_items  # 재실행
    assert item_collection().count() == n_items


def test_guides_are_chunked_and_idempotent():
    docs = load_guide_docs()
    assert len(docs) >= 9
    index_guides()
    first = evidence_collection().count()
    index_guides()
    assert evidence_collection().count() == first > 0
    meta = evidence_collection().get(limit=1)["metadatas"][0]
    for key in ("title", "url", "item_id", "source_type", "license", "content_hash"):
        assert key in meta


def test_find_item_by_free_text():
    assert find_item_by_name("고장난 무선 이어폰").item_id == "E001"
    assert find_item_by_name("에어팟").item_id == "E001"
    assert find_item_by_name("Power bank").item_id == "E010"


def test_semantic_lookup_finds_item_offline():
    from cloudle.rag.embeddings import get_embedder

    index_items()
    res = item_collection().query(
        query_embeddings=[get_embedder().embed_query("보조배터리 버리는 법")], n_results=3
    )
    assert "E010" in res["ids"][0]
