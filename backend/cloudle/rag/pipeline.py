"""종이(입력 JSON) → 품목 확정 → 수집 → LangGraph → 결과. Streamlit·API 공용."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable

from cloudle.config import get_settings
from cloudle.data.items import Item, find_item_by_name, get_item
from cloudle.rag.chat import chat_store
from cloudle.rag.collect import PURPOSE_KO, ensure_evidence
from cloudle.rag.embeddings import get_embedder
from cloudle.rag.graph import run_graph
from cloudle.rag.retrieve import IndexMissing
from cloudle.rag.store import item_collection

Emit = Callable[[str, dict], None]


class UserFacingError(RuntimeError):
    """사용자에게 그대로 보여줄 수 있는 오류 (키·스택트레이스 미포함, NF2004)."""

    def __init__(self, code: str, message: str, **extra):
        super().__init__(message)
        self.code, self.message, self.extra = code, message, extra


@dataclass
class Paper:
    """종이에 담긴 구조화 입력 (C02)."""

    product_name: str = ""
    item_id: str = ""
    category: str = ""
    condition: str = ""
    region: str = ""
    purpose: str = "all"  # repair | reuse | disposal | all
    note: str = ""
    lang: str = "ko"
    image_labels: list[str] = field(default_factory=list)

    def question(self) -> str:
        parts = [f"{PURPOSE_KO.get(self.purpose, '모든 가능성')} 관점에서 처리 방법을 알려줘."]
        if self.condition:
            parts.append(f"상태: {self.condition}.")
        if self.note:
            parts.append(self.note)
        return " ".join(parts)


def suggest_items(text: str, n: int = 3) -> list[Item]:
    col = item_collection()
    if not text.strip() or col.count() == 0:
        return []
    res = col.query(query_embeddings=[get_embedder().embed_query(text)], n_results=n)
    return [get_item(i) for i in res["ids"][0] if get_item(i)]


def resolve_item(paper: Paper) -> Item:
    if item_collection().count() == 0:
        raise UserFacingError("index_missing", "품목 색인이 비어 있어요. 관리자에게 색인 실행을 요청해 주세요.")
    if paper.item_id and (item := get_item(paper.item_id)):
        return item
    text = " ".join([paper.product_name, *paper.image_labels]).strip()
    if not text:
        raise UserFacingError("empty_paper", "종이에 물건 이름을 먼저 적어 주세요.")
    if item := find_item_by_name(text):
        return item
    raise UserFacingError(
        "unknown_item", "어떤 물건인지 정확히 알아보지 못했어요. 아래 후보 중에서 골라 주세요.",
        suggestions=[{"item_id": i.item_id, "names": i.names} for i in suggest_items(text)],
    )


def _noop(*_):
    pass


def analyze(paper: Paper, session_id: str = "public", emit: Emit = _noop,
            collect: bool = True) -> dict:
    t0 = time.perf_counter()
    timings: dict[str, float] = {}
    item = resolve_item(paper)
    emit("item", {"item_id": item.item_id, "name": item.name(paper.lang)})

    report = None
    if collect:
        t = time.perf_counter()
        report = ensure_evidence(item, paper.question(), paper.region, paper.purpose, emit)
        timings["collect"] = round(time.perf_counter() - t, 2)
        if report.errors:
            emit("warning", {"code": "external_api", "message": "일부 외부 자료를 불러오지 못해 저장된 자료로 분석해요."})

    emit("retrieve", {"message": "근거를 찾는 중"})
    t = time.perf_counter()
    try:
        state = run_graph(
            item_id=item.item_id, question=paper.question(), mode="analysis", lang=paper.lang,
            condition=paper.condition, region=paper.region, purpose=paper.purpose,
            session_id=session_id, history=[],
        )
    except IndexMissing as e:
        raise UserFacingError("index_missing", str(e)) from e
    timings["rag"] = round(time.perf_counter() - t, 2)
    timings["total"] = round(time.perf_counter() - t0, 2)

    external = [e for e in state["evidence"] if e["kind"] != "item_meta"]
    if not external:
        emit("warning", {"code": "no_evidence", "message": "외부 근거 문서를 찾지 못해 품목 메타데이터만으로 답했어요."})

    answer = state["answer"]
    chat_store.clear(session_id, item.item_id)  # 새 분석은 새 대화로 시작
    chat_store.append(session_id, item.item_id, "assistant", answer.get("summary", ""),
                      citations=answer.get("citations", []))
    result = {
        "item": {"item_id": item.item_id, "names": item.names, "category": item.category,
                 "recycling_category": item.recycling_category,
                 "has_battery": item.has_battery, "hazardous": item.hazardous},
        "paper": paper.__dict__,
        "answer": answer,
        "evidence": state["evidence"],
        "engine": state["engine"],
        "offline": get_settings().offline,
        "collect": report.__dict__ if report else None,
        "timings": timings,
    }
    emit("generate_done", {"engine": state["engine"]})
    return result


def ask(item_id: str, question: str, session_id: str = "public", lang: str = "ko",
        emit: Emit = _noop) -> dict:
    """선택 품목에 대한 후속 질문 (F2009)."""
    item = get_item(item_id)
    if not item:
        raise UserFacingError("unknown_item", "선택한 물건을 찾을 수 없어요.")
    if not question.strip():
        raise UserFacingError("empty_question", "질문을 입력해 주세요.")
    history = chat_store.history(session_id, item_id)
    emit("retrieve", {"message": "근거를 찾는 중"})
    t = time.perf_counter()
    try:
        state = run_graph(item_id=item_id, question=question, mode="chat", lang=lang,
                          session_id=session_id, history=history)
    except IndexMissing as e:
        raise UserFacingError("index_missing", str(e)) from e
    answer = state["answer"]
    chat_store.append(session_id, item_id, "user", question)
    chat_store.append(session_id, item_id, "assistant", answer.get("answer", ""),
                      citations=answer.get("citations", []), sources=answer.get("sources", []))
    emit("generate_done", {"engine": state["engine"]})
    return {"answer": answer, "evidence": state["evidence"], "engine": state["engine"],
            "history": chat_store.history(session_id, item_id),
            "elapsed": round(time.perf_counter() - t, 2)}
