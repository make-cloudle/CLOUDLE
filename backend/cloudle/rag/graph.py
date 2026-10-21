"""LangGraph `retrieve → generate` (F2007 · F2008 · F2010)."""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from cloudle.data.items import get_item
from cloudle.rag import prompts
from cloudle.rag.collect import PURPOSE_KO
from cloudle.rag.llm import LLMUnavailable, call_json
from cloudle.rag.retrieve import Evidence, retrieve

NOT_FOUND = {"ko": "확인할 수 없음", "en": "Not confirmed in sources",
             "ja": "確認できません", "zh": "无法确认"}
CITE = re.compile(r"\[근거\s*(\d+)\]")
SECTIONS = ("summary", "basic_info", "reuse", "repair", "disposal")


class RagState(TypedDict, total=False):
    item_id: str
    question: str
    mode: str  # analysis | chat
    lang: str
    condition: str
    region: str
    purpose: str
    session_id: str
    history: list[dict]
    top_k: int
    use_mmr: bool
    evidence: list[dict]
    answer: dict
    engine: str  # llm | offline


# ── retrieve 노드 ─────────────────────────────────────────────────────
def retrieve_node(state: RagState) -> dict:
    item = get_item(state["item_id"])
    ev = retrieve(item, state.get("question", ""), state.get("session_id", "public"),
                  state.get("top_k"), state.get("use_mmr"))
    return {"evidence": [e.to_dict() for e in ev]}


# ── generate 노드 ─────────────────────────────────────────────────────
def _evidence_block(ev: list[dict]) -> str:
    return "\n\n".join(f"[근거 {e['n']}] ({e['kind_label']}) {e['title']}\n{e['text']}" for e in ev)


def _history_block(history: list[dict]) -> str:
    if not history:
        return "(없음)"
    return "\n".join(f"{h['role']}: {h['content'][:400]}" for h in history[-6:])


def _llm_generate(state: RagState, ev: list[dict]) -> dict:
    item = get_item(state["item_id"])
    lang = state.get("lang", "ko")
    fmt = prompts.P3_ANALYSIS_FORMAT if state.get("mode") == "analysis" else prompts.P3_CHAT_FORMAT
    return call_json(
        prompts.P3_SYSTEM.format(lang_name=prompts.LANG_NAMES.get(lang, "한국어")),
        prompts.P3_USER.format(
            evidence=_evidence_block(ev), history=_history_block(state.get("history", [])),
            name=item.name(lang), condition=state.get("condition") or "미입력",
            region=state.get("region") or "미지정",
            purpose=PURPOSE_KO.get(state.get("purpose", "all"), "모든 가능성"),
            question=state.get("question") or "이 물건을 어떻게 처리하면 좋을까요?", format=fmt,
        ),
    )


# 오프라인: 근거 문장 발췌 (LLM 미사용) ─────────────────────────────────
_SENT = re.compile(r"(?<=[.!?。다])\s+")
KEYWORDS = {
    "repair": ("수리", "서비스센터", "보증", "고칠", "수선", "repair"),
    "reuse": ("중고", "나눔", "기부", "재사용", "reuse"),
    "disposal": ("배출", "수거", "수거함", "종량제", "분리", "재활용"),
}


def _sentences(e: dict):
    for s in _SENT.split(e["text"].replace("\n", " ")):
        s = s.strip()
        if 12 <= len(s) <= 260:
            yield s


def _best(ev: list[dict], words: tuple[str, ...], exclude_meta=True, limit=2) -> str:
    picks = []
    for e in ev:
        if exclude_meta and e["kind"] == "item_meta":
            continue
        for s in _sentences(e):
            score = sum(w in s for w in words)
            if score:
                picks.append((score, e["score"], s, e["n"]))
    picks.sort(key=lambda x: (-x[0], -x[1]))
    out, used = [], set()
    for _, _, s, n in picks:
        if s in used:
            continue
        used.add(s)
        out.append(f"{s} [근거 {n}]")
        if len(out) >= limit:
            break
    return " ".join(out)


def _bigrams(t: str) -> set[str]:
    t = re.sub(r"\s+", "", t.lower())
    return {t[i : i + 2] for i in range(len(t) - 1)}


def _offline_generate(state: RagState, ev: list[dict]) -> dict:
    item = get_item(state["item_id"])
    nf = NOT_FOUND["ko"]
    if state.get("mode") != "analysis":
        q = _bigrams(state.get("question", ""))
        ranked = sorted(
            ((len(q & _bigrams(s)), s, e["n"]) for e in ev if e["kind"] != "item_meta"
             for s in _sentences(e)),
            key=lambda x: -x[0],
        )
        picks = [f"{s} [근거 {n}]" for sc, s, n in ranked[:3] if sc > 1]
        if picks:
            picks.append(f"이 물건의 처리 안내: {item.disposal_hint} [근거 1]")
        return {"answer": " ".join(picks) or nf,
                "uncertainties": [] if picks else ["질문과 직접 관련된 근거 문장을 찾지 못했습니다."]}

    actions = []
    if item.has_battery:
        actions.append("배터리가 들어 있으니 종량제봉투에 넣지 말고 전용 수거 경로를 이용하세요. [근거 1]")
    if any("개인정보" in p for p in item.properties):
        actions.append("배출·판매 전에 기기를 초기화해 개인정보를 지우세요. [근거 1]")
    actions.append(f"{item.disposal_hint} [근거 1]")
    guide = _best(ev, KEYWORDS["disposal"], limit=1)
    if guide:
        actions.append(guide)
    actions.append("거주지 지자체의 배출 기준을 함께 확인하세요.")
    return {
        "summary": f"{item.name('ko')}의 배출 분류는 '{item.recycling_category}'입니다. [근거 1]",
        "basic_info": (f"분류 {item.category}, 재질 {', '.join(item.materials)}, "
                       f"배터리 {'내장' if item.has_battery else '없음'}. [근거 1]"),
        "reuse": _best(ev, KEYWORDS["reuse"]) or nf,
        "repair": _best(ev, KEYWORDS["repair"]) or nf,
        "disposal": (f"{item.disposal_hint} [근거 1] " + _best(ev, KEYWORDS["disposal"])).strip(),
        "next_actions": actions,
        "uncertainties": ["중고 시세·수리비는 근거 자료로 확인할 수 없습니다."],
    }


def _clean_citations(answer: dict, ev: list[dict]) -> tuple[dict, list[int]]:
    """존재하지 않는 근거 번호는 지우고, 실제 인용된 번호만 모은다 (F2008 1:1)."""
    valid = {e["n"] for e in ev}
    used: list[int] = []

    def fix(text: str) -> str:
        def repl(m):
            n = int(m.group(1))
            if n in valid:
                used.append(n)
                return f"[근거 {n}]"
            return ""
        return CITE.sub(repl, text).strip()

    out: dict[str, Any] = {}
    for k, v in answer.items():
        if isinstance(v, str):
            out[k] = fix(v)
        elif isinstance(v, list):
            out[k] = [fix(x) if isinstance(x, str) else x for x in v]
        else:
            out[k] = v
    return out, sorted(set(used))


def generate_node(state: RagState) -> dict:
    ev = state["evidence"]
    try:
        raw, engine = _llm_generate(state, ev), "llm"
    except LLMUnavailable:
        raw, engine = _offline_generate(state, ev), "offline"
    answer, used = _clean_citations(raw, ev)
    answer["citations"] = used
    answer["sources"] = [e for e in ev if e["n"] in used]
    if item := get_item(state["item_id"]):
        if item.has_battery or item.hazardous:  # C03
            answer.setdefault("uncertainties", [])
            answer["safety"] = True
    return {"answer": answer, "engine": engine}


@lru_cache
def build_graph():
    g = StateGraph(RagState)
    g.add_node("retrieve", retrieve_node)
    g.add_node("generate", generate_node)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "generate")
    g.add_edge("generate", END)
    return g.compile()


def run_graph(**state) -> RagState:
    return build_graph().invoke(state)


__all__ = ["build_graph", "run_graph", "Evidence", "SECTIONS"]
