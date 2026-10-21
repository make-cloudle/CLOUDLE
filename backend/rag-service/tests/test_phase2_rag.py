"""Phase 2: F2003~F2012 (네트워크·LLM 없이 실행)."""
import pathlib
import re

import pytest

from cloudle.data.items import get_item
from cloudle.rag import collect, graph, search
from cloudle.rag.chat import chat_store
from cloudle.rag.collect import CollectReport, ensure_evidence, extract_queries, select_candidates
from cloudle.rag.indexing import index_guides, index_items
from cloudle.rag.pipeline import Paper, UserFacingError, analyze, ask
from cloudle.rag.retrieve import retrieve
from cloudle.rag.store import evidence_collection
from cloudle.sources.wikipedia import WikiCandidate
from tests import fakes

EARBUDS = "E001"


@pytest.fixture
def indexed(monkeypatch):
    calls = []
    fakes.install(monkeypatch, calls)
    index_items()
    index_guides()
    return calls


# F2003 ───────────────────────────────────────────────────────────────
def test_p1_rule_queries_include_item_name():
    q, src = extract_queries(get_item(EARBUDS), "", "", "repair")
    assert src == "rule" and q[0] == "무선 이어폰" and "Wireless earbuds" in q


def test_p1_llm_output_is_corrected_to_include_item_name(monkeypatch):
    monkeypatch.setattr(collect, "call_json", lambda *a, **k: {"queries": ["배터리 재활용"]})
    q, src = extract_queries(get_item(EARBUDS), "", "", "all")
    assert src == "llm" and q[:2] == ["무선 이어폰", "Wireless earbuds"]


# F2004 ───────────────────────────────────────────────────────────────
def test_p2_keeps_item_direct_doc_even_if_llm_rejects(monkeypatch):
    monkeypatch.setattr(collect, "call_json", lambda *a, **k: {"selected_ids": ["wiki-ko-103"]})
    cands = [WikiCandidate("wiki-ko-101", 101, "ko", "에어팟", ""),
             WikiCandidate("wiki-ko-103", 103, "ko", "리튬 이온 전지", "")]
    chosen = select_candidates(get_item(EARBUDS), "all", cands, CollectReport())
    assert [c.id for c in chosen] == ["wiki-ko-101", "wiki-ko-103"]


def test_p2_rule_rejects_unrelated_homonym(indexed):
    report = ensure_evidence(get_item(EARBUDS))
    assert "wiki-ko-101" in report.selected
    assert "wiki-ko-102" not in report.selected


# F2005 · NF2002 ───────────────────────────────────────────────────────
def test_collect_indexes_with_metadata_and_caches(indexed):
    r1 = ensure_evidence(get_item(EARBUDS))
    assert r1.indexed_chunks > 0
    count = evidence_collection().count()
    searches = sum(1 for c in indexed if c[0] == "search")
    r2 = ensure_evidence(get_item(EARBUDS))
    assert sum(1 for c in indexed if c[0] == "search") == searches  # 캐시 적중
    assert r2.cache_hits == len(r2.queries)
    assert evidence_collection().count() == count  # 중복 없음
    meta = evidence_collection().get(where={"source_type": "wikipedia"}, limit=1)["metadatas"][0]
    assert meta["item_id"] == EARBUDS and meta["url"].startswith("https://ko.wikipedia.org/")
    assert meta["license"].startswith("CC BY-SA")


def test_chunk_size_is_configurable():
    from cloudle.rag.indexing import Doc, chunk_doc
    d = Doc("x", "t", "", "가나다라마바사 " * 200, "guide", "x")
    assert len(chunk_doc(d, 300, 0)) > len(chunk_doc(d, 1200, 0))


# F2006 · F2014 ────────────────────────────────────────────────────────
def test_retrieve_always_includes_item_meta_and_dedupes(indexed):
    ensure_evidence(get_item(EARBUDS))
    ev = retrieve(get_item(EARBUDS), "배터리 수리", top_k=3)
    assert ev[0].kind == "item_meta" and ev[0].chunk_id == EARBUDS
    assert len(ev) == 4
    assert len({e.text for e in ev}) == len(ev)
    assert {e.kind for e in ev[1:]} <= {"wikipedia", "guide"}


def test_mmr_returns_top_k(indexed):
    ensure_evidence(get_item(EARBUDS))
    assert len(retrieve(get_item(EARBUDS), "배터리", top_k=3, use_mmr=True)) == 4


# F2007 · F2008 · F2010 ───────────────────────────────────────────────
def test_graph_has_retrieve_and_generate_nodes():
    g = graph.build_graph().get_graph()
    assert {"retrieve", "generate"} <= set(g.nodes)


def test_invalid_citations_are_removed_and_sources_match(indexed, monkeypatch):
    monkeypatch.setattr(graph, "_llm_generate", lambda s, ev: {
        "answer": "수거함에 넣으세요 [근거 1]. 시세는 3만원 [근거 99].", "uncertainties": []})
    out = graph.run_graph(item_id=EARBUDS, question="버리는 법", mode="chat")
    ans = out["answer"]
    assert "[근거 99]" not in ans["answer"]
    assert ans["citations"] == [1]
    assert [s["n"] for s in ans["sources"]] == [1]


def test_offline_analysis_has_next_choice_sections_with_citations(indexed):
    r = analyze(Paper(product_name="무선 이어폰", purpose="all"), "s-a")
    a = r["answer"]
    for key in ("summary", "basic_info", "reuse", "repair", "disposal", "next_actions"):
        assert key in a
    assert r["engine"] == "offline"
    cited = {int(n) for n in re.findall(r"\[근거 (\d+)\]", str({k: a[k] for k in a if k != "sources"}))}
    assert cited == set(a["citations"]) == {s["n"] for s in a["sources"]}
    assert a["safety"] is True  # C03 배터리 품목


def test_unanswerable_question_says_cannot_confirm(indexed):
    out = graph.run_graph(item_id="R012", question="zzqx 우주선 연료 효율", mode="chat")
    assert "확인할 수 없음" in out["answer"]["answer"]


# F2009 ───────────────────────────────────────────────────────────────
def test_chat_history_is_isolated_per_item(indexed):
    ask(EARBUDS, "배터리는?", "sess")
    ask("E010", "보조배터리는?", "sess")
    h1 = chat_store.history("sess", EARBUDS)
    h2 = chat_store.history("sess", "E010")
    assert any(m["content"] == "배터리는?" for m in h1)
    assert not any(m["content"] == "보조배터리는?" for m in h1)
    assert any(m["content"] == "보조배터리는?" for m in h2)
    assert chat_store.history("other", EARBUDS) == []


# F2011 ───────────────────────────────────────────────────────────────
def test_condition_search_battery_small_electronics(indexed):
    r = search.condition_search("배터리가 들어 있는 소형 전자제품 중 별도 수거가 필요한 품목을 찾아줘")
    assert r["items"]
    assert all(i["has_battery"] and i["category"] == "electronics" for i in r["items"])
    assert "배터리 내장" in r["conditions"]


def test_condition_search_furniture():
    index_items()
    r = search.condition_search("큰 가구")
    assert r["items"] and all(i["category"] == "furniture" for i in r["items"])


# F2012 ───────────────────────────────────────────────────────────────
def test_errors_are_user_facing():
    with pytest.raises(UserFacingError) as e:
        analyze(Paper(product_name="무선 이어폰"))
    assert e.value.code == "index_missing"
    index_items()
    with pytest.raises(UserFacingError) as e:
        analyze(Paper(product_name=""))
    assert e.value.code == "empty_paper"
    with pytest.raises(UserFacingError) as e:
        analyze(Paper(product_name="뭔지모를물건xyz"), collect=False)
    assert e.value.code == "unknown_item" and e.value.extra["suggestions"]


def test_progress_events_are_emitted_in_order(indexed):
    events = []
    analyze(Paper(product_name="에어팟"), "s-e", emit=lambda k, d: events.append(k))
    order = ["item", "extract", "collect", "select", "index", "retrieve", "generate_done"]
    assert [e for e in events if e in order] == order


# NF2003 ───────────────────────────────────────────────────────────────
def test_no_api_keys_in_repository():
    root = pathlib.Path(__file__).resolve().parents[3]
    pattern = re.compile(r"sk-[A-Za-z0-9_-]{20,}")
    skip = {".git", ".venv", "node_modules", "storage", ".next"}
    for p in root.rglob("*"):
        if skip & set(p.parts):
            continue
        if p.is_file() and p.suffix in {".py", ".ts", ".tsx", ".md", ".example", ".json", ".toml"}:
            assert not pattern.search(p.read_text(encoding="utf-8", errors="ignore")), p


# F2016 · 업로드 세션 격리 ───────────────────────────────────────────────
def test_uploaded_doc_is_session_scoped_and_purged(indexed):
    from cloudle.rag import uploads
    text = "우리 기숙사는 무선 이어폰을 3층 배터리 수거함에 버린다. ".encode() * 5
    uploads.add_session_document("me", "dorm.txt", text)
    mine = retrieve(get_item(EARBUDS), "기숙사 배터리 수거함", session_id="me", top_k=8)
    other = retrieve(get_item(EARBUDS), "기숙사 배터리 수거함", session_id="you", top_k=8)
    assert any(e.kind == "user_upload" for e in mine)
    assert not any(e.kind == "user_upload" for e in other)
    uploads.purge_session("me")
    assert uploads.session_documents("me") == []
    with pytest.raises(uploads.UploadRejected):
        uploads.extract_text("virus.exe", b"x")


# 토큰 예산 ─────────────────────────────────────────────────────────────
def test_llm_budget_and_stages(monkeypatch):
    import json as _json
    from cloudle.config import get_settings
    from cloudle.rag import llm
    monkeypatch.setenv("GMS_KEY", "dummy-gms-key")
    monkeypatch.setenv("TOKEN_BUDGET", "1000")
    get_settings.cache_clear()
    s = get_settings()
    assert not s.offline and "gms.ssafy.io" in s.openai_base_url  # GMS 키 → GMS 엔드포인트
    assert s.embedding_provider == "local"  # 키가 있어도 임베딩은 내장 (토큰 0)
    assert llm.stage_enabled("generate") and not llm.stage_enabled("query")  # 기본: 최종 생성만
    with pytest.raises(llm.LLMUnavailable):
        llm.call_json("sys", "user", stage="query")
    (s.storage_dir / "llm_usage.json").write_text(_json.dumps({"total_tokens": 999, "calls": 1, "cache_hits": 0}))
    with pytest.raises(llm.LLMUnavailable):  # 예산 소진 → 오프라인으로 대체
        llm.call_json("sys", "user", stage="generate")
