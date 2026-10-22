"""Community 채팅 → CLOUDLE MEMO 요약.

게이트웨이가 방의 최근 N줄만 보내므로 입력 토큰이 작다. LLM이 꺼져 있거나 예산이 없으면
규칙(품목 사전 매칭 + 최근 문장 발췌)으로 같은 형식을 만든다.
"""
from __future__ import annotations

from cloudle.data.items import find_item_by_name
from cloudle.rag import prompts
from cloudle.rag.llm import LLMUnavailable, call_json

PURPOSES = ("all", "repair", "reuse", "resell", "disposal")
_LANG_NAME = {"ko": "한국어", "en": "English", "ja": "日本語", "zh": "中文"}
_PURPOSE_WORDS = {
    "repair": ("수리", "고치", "repair", "fix"),
    "resell": ("중고", "판매", "팔", "resell", "sell"),
    "reuse": ("재사용", "나눔", "업사이클", "reuse"),
    "disposal": ("버리", "배출", "분리수거", "폐기", "dispose", "recycl"),
}


def _offline(lines: list[str], lang: str) -> dict:
    text = "\n".join(lines)
    item = find_item_by_name(text)
    low = text.lower()
    purpose = next((p for p, words in _PURPOSE_WORDS.items() if any(w in low for w in words)), "all")
    picked = [ln.split(": ", 1)[-1].strip() for ln in lines if len(ln.split(": ", 1)[-1].strip()) >= 6][-5:]
    return {
        "product_name": item.name(lang) if item else "",
        "condition": "",
        "purpose": purpose,
        "note": "\n".join(f"- {p[:120]}" for p in picked),
        "engine": "offline",
    }


def summarize_memo(lines: list[str], lang: str = "ko") -> dict:
    lines = [ln.strip()[:300] for ln in lines if ln.strip()][-30:]
    if not lines:
        return {"product_name": "", "condition": "", "purpose": "all", "note": "", "engine": "offline"}
    try:
        data = call_json(
            prompts.MEMO_SYSTEM.format(lang_name=_LANG_NAME.get(lang, "한국어")),
            prompts.MEMO_USER.format(lines="\n".join(lines)),
            stage="generate",
        )
    except LLMUnavailable:
        return _offline(lines, lang)
    purpose = str(data.get("purpose", "all"))
    return {
        "product_name": str(data.get("product_name", ""))[:60],
        "condition": str(data.get("condition", ""))[:120],
        "purpose": purpose if purpose in PURPOSES else "all",
        "note": str(data.get("note", ""))[:800],
        "engine": "llm",
    }
