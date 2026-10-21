"""사진 → 물건 이름 후보 (선택 기능). 이미지는 저장하지 않고 호출에만 쓴다."""
from __future__ import annotations

import base64

from cloudle.data.items import find_item_by_name
from cloudle.rag.llm import LLMUnavailable, _parse_json, _record, chat_model, stage_enabled

PROMPT = """사진 속 중심 물건을 한국어 일반 명사로 알려주세요. 상표·인물·개인정보는 언급하지 마세요.
상태(파손·오염)가 보이면 짧게 적고, 확실하지 않으면 confidence를 낮게 주세요.
JSON만 출력: {"labels": ["물건명", "다른 후보"], "condition": "보이는 상태", "confidence": 0.0}"""


def identify(data: bytes, mime: str = "image/jpeg") -> dict:
    """반환: {"available": bool, "labels": [...], "item_id": str|None, ...}"""
    try:
        if not stage_enabled("vision"):  # 이미지는 토큰이 많이 들어 기본으로 끈다
            raise LLMUnavailable("vision 비활성")
        model = chat_model()
    except LLMUnavailable:
        return {"available": False, "labels": [], "item_id": None,
                "message": "사진 인식은 토큰 절약을 위해 꺼져 있어요. 물건 이름을 직접 적어 주세요."}
    b64 = base64.b64encode(data).decode()
    try:
        out = model.invoke([("human", [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
        ])])
        _record(int((getattr(out, "usage_metadata", None) or {}).get("total_tokens", 800)))
        parsed = _parse_json(out.content)
    except Exception:
        return {"available": True, "labels": [], "item_id": None,
                "message": "사진을 알아보지 못했어요. 물건 이름을 직접 적어 주세요."}
    labels = [str(x) for x in parsed.get("labels", [])][:3]
    item = next((find_item_by_name(lbl) for lbl in labels if find_item_by_name(lbl)), None)
    return {"available": True, "labels": labels, "condition": parsed.get("condition", ""),
            "confidence": parsed.get("confidence", 0), "item_id": item.item_id if item else None,
            "message": ""}
