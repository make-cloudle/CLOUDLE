"""Eco Detective: 인터넷에서 본 환경 주장 → 자료 수집 → 근거 기반 판정."""
from __future__ import annotations

import re

import numpy as np

from cloudle.config import get_settings
from cloudle.rag import prompts
from cloudle.rag.embeddings import get_embedder
from cloudle.rag.graph import _bigrams, _clean_citations, _sentences
from cloudle.rag.indexing import Doc, index_documents
from cloudle.rag.llm import LLMUnavailable, call_json
from cloudle.rag.retrieve import SOURCE_LABEL
from cloudle.rag.store import evidence_collection
from cloudle.sources import wikipedia
from cloudle.sources.http import ExternalAPIError

VERDICTS = ("supported", "refuted", "mixed", "insufficient")
_STOP = set("은 는 이 가 을 를 에 의 도 와 과 로 으로 하면 한다 된다 있다 없다 정말 진짜 무조건 사실 이다 것 수".split())


def _queries(claim: str) -> list[str]:
    try:
        out = call_json(prompts.FACT_QUERY_SYSTEM, claim, stage="query")
        qs = [q for q in out.get("queries", []) if isinstance(q, str) and q.strip()]
        if qs:
            return qs[:4]
    except LLMUnavailable:
        pass
    words = [w for w in re.findall(r"[가-힣A-Za-z0-9]{2,}", claim)]
    words = [re.sub(r"(은|는|이|가|을|를|에|의|도|으로|로|에서|하면|한다|된다|이다)$", "", w) for w in words]
    keys = [w for w in words if len(w) >= 2 and w not in _STOP]
    return list(dict.fromkeys([" ".join(keys[:3])] + keys[:3]))[:4] or [claim[:40]]


def _collect(claim: str) -> list[str]:
    errors, docs, keys = [], [], set(_queries(claim))
    for q in keys:
        lang = "en" if q.isascii() else "ko"
        try:
            cands = wikipedia.search(q, lang=lang, limit=3)
        except ExternalAPIError as e:
            errors.append(str(e))
            continue
        for c in cands[:2]:
            if evidence_collection().get(where={"$and": [{"item_id": "factcheck"}, {"source_id": c.id}]}, limit=1)["ids"]:
                continue
            try:
                text = wikipedia.extract(c.pageid, c.lang)
            except ExternalAPIError as e:
                errors.append(str(e))
                continue
            if len(text) > 80:
                docs.append(Doc(source_id=c.id, title=f"위키백과: {c.title}", url=c.url, text=text,
                                source_type="wikipedia", license=wikipedia.LICENSE, item_id="factcheck",
                                lang=c.lang, query=q))
    if docs:
        index_documents(docs)
    return errors


def _retrieve(claim: str, k: int = 6) -> list[dict]:
    col = evidence_collection()
    if col.count() == 0:
        return []
    q = np.array(get_embedder().embed_query(claim))
    res = col.query(query_embeddings=[q.tolist()], n_results=min(k * 3, col.count()),
                    where={"session_id": "public"}, include=["documents", "metadatas", "distances"])
    out, seen = [], set()
    for doc, m, d in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
        if m["content_hash"] in seen:
            continue
        seen.add(m["content_hash"])
        out.append({"n": len(out) + 1, "kind": m["source_type"], "kind_label": SOURCE_LABEL.get(m["source_type"], ""),
                    "title": m["title"], "url": m["url"], "text": doc, "license": m["license"],
                    "chunk_id": "", "score": round(1 - float(d), 4)})
        if len(out) >= k:
            break
    return out


def factcheck(claim: str, lang: str = "ko") -> dict:
    errors = _collect(claim)
    ev = _retrieve(claim)
    if not ev:
        return {"verdict": "insufficient", "answer": {"summary": "확인할 수 있는 문서를 찾지 못했어요.", "points": [],
                "citations": [], "sources": [], "uncertainties": []}, "engine": "none", "errors": errors}
    try:
        raw = call_json(prompts.FACT_SYSTEM.format(lang_name=prompts.LANG_NAMES.get(lang, "한국어")),
                        prompts.FACT_USER.format(evidence="\n\n".join(f"[근거 {e['n']}] {e['title']}\n{e['text'][:get_settings().evidence_chars]}" for e in ev),
                                                 claim=claim))
        engine = "llm"
    except LLMUnavailable:
        # 오프라인: 판정은 LLM 없이 하지 않는다. 관련 문장만 보여 준다.
        qb = _bigrams(claim)
        ranked = sorted(((len(qb & _bigrams(s)), s, e["n"]) for e in ev for s in _sentences(e)), key=lambda x: -x[0])
        raw = {"verdict": "insufficient",
               "summary": "오프라인 모드라 판정은 보류하고, 주장과 관련된 문서 문장을 모았어요.",
               "points": [f"{s} [근거 {n}]" for sc, s, n in ranked[:3] if sc > 2],
               "uncertainties": ["LLM 키가 있어야 근거를 비교해 판정할 수 있어요."]}
        engine = "offline"
    verdict = raw.get("verdict") if raw.get("verdict") in VERDICTS else "insufficient"
    answer, used = _clean_citations({k: v for k, v in raw.items() if k != "verdict"}, ev)
    answer["citations"] = used
    answer["sources"] = [e for e in ev if e["n"] in used]
    return {"verdict": verdict, "answer": answer, "engine": engine, "errors": errors}
