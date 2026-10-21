"""RAG 2 외부 문서 수집: P1 검색어 → 캐시 → 후보 검색 → P2 선별 → 본문·청킹·색인.

F2003 · F2004 · F2005 · NF2002 · NF2006
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable

from cloudle.data.items import CATEGORY_LABELS, Item
from cloudle.rag import prompts
from cloudle.rag.indexing import Doc, index_documents
from cloudle.rag.llm import LLMUnavailable, call_json
from cloudle.rag.store import evidence_collection
from cloudle.sources import wikipedia
from cloudle.sources.http import ExternalAPIError, cache_get, cache_put

log = logging.getLogger("cloudle.collect")

Emit = Callable[[str, dict], None]
PURPOSE_KO = {"repair": "수리", "reuse": "중고 재사용", "disposal": "분리배출", "all": "모든 가능성"}
PURPOSE_KEYWORD = {"repair": "수리", "reuse": "재사용", "disposal": "재활용", "all": "재활용"}


def _noop(*_):
    pass


@dataclass
class CollectReport:
    queries: list[str] = field(default_factory=list)
    query_source: str = "rule"  # llm | rule
    cache_hits: int = 0
    candidates: list[dict] = field(default_factory=list)
    selected: list[str] = field(default_factory=list)
    rejected: list[dict] = field(default_factory=list)
    select_source: str = "rule"
    indexed_chunks: int = 0
    errors: list[str] = field(default_factory=list)


# ── P1 ────────────────────────────────────────────────────────────────
def _rule_queries(item: Item, purpose: str) -> list[str]:
    q = [item.name("ko"), item.name("en")]
    q.append(f"{item.name('ko')} {PURPOSE_KEYWORD.get(purpose, '재활용')}")
    if item.has_battery:
        q.append("리튬 이온 전지 재활용")
    q.append(f"{item.materials[0]} 재활용" if item.materials else "재활용")
    return list(dict.fromkeys(q))


def extract_queries(item: Item, question: str, region: str, purpose: str) -> tuple[list[str], str]:
    """P1. LLM 결과에도 품목명 검색어가 빠지지 않게 보정한다."""
    try:
        out = call_json(prompts.P1_SYSTEM, prompts.P1_USER.format(
            name_ko=item.name("ko"), name_en=item.name("en"), aliases=", ".join(item.aliases),
            category=CATEGORY_LABELS[item.category]["ko"], materials=", ".join(item.materials),
            battery="예" if item.has_battery else "아니오", region=region or "미지정",
            purpose=PURPOSE_KO.get(purpose, purpose), question=question or "처리 방법",
        ))
        queries = [q.strip() for q in out.get("queries", []) if isinstance(q, str) and q.strip()]
        source = "llm"
    except LLMUnavailable:
        queries, source = [], "rule"
    must = [item.name("ko"), item.name("en")]
    queries = list(dict.fromkeys(must + queries))[:6] if queries else _rule_queries(item, purpose)
    return queries, source


# ── 후보 검색 (캐시) ──────────────────────────────────────────────────
def _lang_of(query: str) -> str:
    return "en" if query.isascii() else "ko"


def search_candidates(queries: list[str], report: CollectReport) -> list[wikipedia.WikiCandidate]:
    seen: dict[str, wikipedia.WikiCandidate] = {}
    for q in queries:
        lang = _lang_of(q)
        key = f"{lang}:{q}"
        cached = cache_get("collect-query", key, ttl=7 * 86400)
        if cached is not None:
            report.cache_hits += 1
            found = [wikipedia.WikiCandidate(**c) for c in cached]
        else:
            try:
                found = wikipedia.search(q, lang=lang, limit=4)
            except ExternalAPIError as e:
                report.errors.append(str(e))
                continue
            cache_put("collect-query", key, [c.__dict__ for c in found])
        for c in found:
            seen.setdefault(c.id, c)
    return list(seen.values())


# ── P2 ────────────────────────────────────────────────────────────────
def _is_direct(item: Item, c: wikipedia.WikiCandidate) -> bool:
    """제목이 품목명·별칭과 사실상 같으면 품목 직접 문서로 본다."""
    title = c.title.lower().replace(" ", "")
    names = [n.lower().replace(" ", "") for n in (*item.names.values(), *item.aliases)]
    return any(title == n or title.startswith(n + "(") for n in names if n)


def _rule_select(item: Item, cands: list[wikipedia.WikiCandidate]) -> list[str]:
    direct = [c.id for c in cands if _is_direct(item, c)]
    related = [
        c.id for c in cands
        if c.id not in direct and any(
            n and n.lower() in (c.title + " " + c.snippet).lower()
            for n in (item.name("ko"), item.name("en"), *item.aliases)
        )
    ]
    return (direct + related)[:3]


def select_candidates(item: Item, purpose: str, cands: list[wikipedia.WikiCandidate],
                      report: CollectReport) -> list[wikipedia.WikiCandidate]:
    if not cands:
        return []
    by_id = {c.id: c for c in cands}
    direct = [c.id for c in cands if _is_direct(item, c)]
    try:
        listing = "\n".join(f"- id={c.id} | 제목={c.title} | 요약={c.snippet[:160]}" for c in cands)
        out = call_json(prompts.P2_SYSTEM, prompts.P2_USER.format(
            name_ko=item.name("ko"), name_en=item.name("en"),
            purpose=PURPOSE_KO.get(purpose, purpose), candidates=listing,
        ))
        chosen = [i for i in out.get("selected_ids", []) if i in by_id]
        report.rejected = [r for r in out.get("rejected", []) if isinstance(r, dict)]
        report.select_source = "llm"
    except LLMUnavailable:
        chosen = _rule_select(item, cands)
        report.rejected = [{"id": c.id, "reason": "품목명 불일치(규칙)"} for c in cands if c.id not in chosen]
    # 품목 직접 문서는 P2 결과와 관계없이 보존한다.
    final = list(dict.fromkeys(direct + chosen))[:4]
    return [by_id[i] for i in final]


# ── 본문 수집·색인 ─────────────────────────────────────────────────────
def _already_indexed(item_id: str, source_id: str) -> bool:
    got = evidence_collection().get(
        where={"$and": [{"item_id": item_id}, {"source_id": source_id}]}, limit=1
    )
    return bool(got["ids"])


def ensure_evidence(item: Item, question: str = "", region: str = "", purpose: str = "all",
                    emit: Emit = _noop) -> CollectReport:
    report = CollectReport()

    emit("extract", {"message": "검색어를 고르는 중"})
    report.queries, report.query_source = extract_queries(item, question, region, purpose)
    emit("extract_done", {"queries": report.queries, "source": report.query_source})

    emit("collect", {"message": "자료 후보를 찾는 중"})
    cands = search_candidates(report.queries, report)
    report.candidates = [{"id": c.id, "title": c.title, "url": c.url} for c in cands]
    emit("collect_done", {"candidates": len(cands), "cache_hits": report.cache_hits,
                          "errors": report.errors})

    emit("select", {"message": "관련 문서를 고르는 중"})
    selected = select_candidates(item, purpose, cands, report)
    report.selected = [c.id for c in selected]
    emit("select_done", {"selected": [c.title for c in selected], "source": report.select_source})

    emit("index", {"message": "문서를 읽고 색인하는 중"})
    docs = []
    for c in selected:
        if _already_indexed(item.item_id, c.id):
            continue
        try:
            text = wikipedia.extract(c.pageid, c.lang)
        except ExternalAPIError as e:
            report.errors.append(str(e))
            continue
        if len(text) < 80:
            continue
        docs.append(Doc(source_id=c.id, title=f"위키백과: {c.title}", url=c.url, text=text,
                        source_type="wikipedia", license=wikipedia.LICENSE,
                        item_id=item.item_id, lang=c.lang, query=" | ".join(report.queries)))
    report.indexed_chunks = index_documents(docs) if docs else 0
    emit("index_done", {"chunks": report.indexed_chunks})
    return report
