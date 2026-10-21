"""국가 환경 질문 RAG ("구름에게 물어보기" 칩).

국가·주제 → 검색어 → 위키백과 후보(제목에 국가명) → 수집·색인(item_id=country:ISO3)
→ 의미 검색 → 근거 기반 답변. 수치는 만들지 않는다.
"""
from __future__ import annotations

import re

import numpy as np

from cloudle.config import get_settings
from cloudle.rag import prompts
from cloudle.rag.embeddings import get_embedder
from cloudle.rag.graph import NOT_FOUND, _bigrams, _clean_citations, _sentences
from cloudle.rag.indexing import Doc, index_documents
from cloudle.rag.llm import LLMUnavailable, call_json
from cloudle.rag.retrieve import SOURCE_LABEL
from cloudle.rag.store import evidence_collection
from cloudle.sources import wikipedia
from cloudle.sources.geo import Country
from cloudle.sources.http import ExternalAPIError

TOPICS = {
    "air": {"en": ["Air pollution in {en}"], "ko": ["{ko} 대기 오염"], "words": ("대기", "미세먼지", "오염", "pollution", "air")},
    "waste": {"en": ["Waste management in {en}"], "ko": ["{ko} 쓰레기", "{ko} 재활용"], "words": ("폐기물", "쓰레기", "재활용", "waste", "recycl")},
    "help": {"en": ["Environmental issues in {en}", "Environment of {en}"], "ko": ["{ko} 환경"], "words": ("환경", "보호", "정책", "environment", "policy")},
}
QUESTIONS = {
    "air": "이 나라의 대기 오염은 왜 생기나요?",
    "waste": "이 나라는 쓰레기를 어떻게 관리하나요?",
    "help": "이 나라의 환경을 위해 내가 할 수 있는 일은?",
}


def _collect(country: Country, topic: str) -> list[str]:
    cfg, errors, docs = TOPICS[topic], [], []
    names = {country.names["en"].lower(), *(a.lower() for a in country.aliases), country.names["ko"]}
    queries = [(q.format(en=country.names["en"], ko=country.names["ko"]), "en" if "{en}" in q else "ko")
               for lang in ("en", "ko") for q in cfg[lang]]
    for q, lang in queries:
        try:
            cands = wikipedia.search(q, lang=lang, limit=4)
        except ExternalAPIError as e:
            errors.append(str(e))
            continue
        # 국가명이 제목에 있는 문서만 (P2 규칙 선별)
        for c in [c for c in cands if any(n in c.title.lower() for n in names)][:2]:
            sid = f"{c.id}"
            if evidence_collection().get(where={"$and": [{"item_id": f"country:{country.iso3}"}, {"source_id": sid}]}, limit=1)["ids"]:
                continue
            try:
                text = wikipedia.extract(c.pageid, c.lang)
            except ExternalAPIError as e:
                errors.append(str(e))
                continue
            if len(text) > 80:
                docs.append(Doc(source_id=sid, title=f"위키백과: {c.title}", url=c.url, text=text,
                                source_type="wikipedia", license=wikipedia.LICENSE,
                                item_id=f"country:{country.iso3}", lang=c.lang, query=q))
    if docs:
        index_documents(docs)
    return errors


def _retrieve(country: Country, question: str, top_k: int = 5) -> list[dict]:
    col = evidence_collection()
    where = {"item_id": f"country:{country.iso3}"}
    if not col.get(where=where, limit=1)["ids"]:
        return []
    q = np.array(get_embedder().embed_query(f"{country.names['ko']} {country.names['en']} {question}"))
    res = col.query(query_embeddings=[q.tolist()], n_results=top_k * 2, where=where,
                    include=["documents", "metadatas", "distances"])
    out, seen = [], set()
    for doc, m, d in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
        if m["content_hash"] in seen:
            continue
        seen.add(m["content_hash"])
        out.append({"n": len(out) + 1, "kind": m["source_type"], "kind_label": SOURCE_LABEL.get(m["source_type"], ""),
                    "title": m["title"], "url": m["url"], "text": doc, "license": m["license"],
                    "chunk_id": "", "score": round(1 - float(d), 4)})
        if len(out) >= top_k:
            break
    return out


def ask_country(country: Country, topic: str, lang: str = "ko") -> dict:
    if topic not in TOPICS:
        topic = "help"
    errors = _collect(country, topic)
    question = QUESTIONS[topic]
    ev = _retrieve(country, question)
    if not ev:
        return {"answer": {"answer": NOT_FOUND.get(lang, NOT_FOUND["ko"]), "citations": [], "sources": [],
                           "uncertainties": ["관련 문서를 찾지 못했습니다."]},
                "engine": "none", "question": question, "errors": errors}
    try:
        raw = call_json(
            prompts.P3_SYSTEM.format(lang_name=prompts.LANG_NAMES.get(lang, "한국어")),
            prompts.P3_USER.format(
                evidence="\n\n".join(f"[근거 {e['n']}] {e['title']}\n{e['text'][:get_settings().evidence_chars]}" for e in ev),
                history="(없음)", name=country.names[lang], condition="-", region=country.names[lang],
                purpose="국가 환경 이해", question=question, format=prompts.P3_CHAT_FORMAT),
        )
        engine = "llm"
    except LLMUnavailable:
        words = TOPICS[topic]["words"]
        qb = _bigrams(question + country.names["ko"])
        ranked = sorted(((len(qb & _bigrams(s)) + 3 * sum(w in s.lower() for w in words), s, e["n"])
                         for e in ev for s in _sentences(e)), key=lambda x: -x[0])
        picks = [f"{re.sub(r'\s+', ' ', s)} [근거 {n}]" for sc, s, n in ranked[:3] if sc >= 3]
        raw = {"answer": " ".join(picks) or NOT_FOUND["ko"],
               "uncertainties": ["오프라인 모드: 문서 문장을 발췌했습니다."]}
        engine = "offline"
    answer, used = _clean_citations(raw, ev)
    answer["citations"] = used
    answer["sources"] = [e for e in ev if e["n"] in used]
    return {"answer": answer, "engine": engine, "question": question, "errors": errors}
