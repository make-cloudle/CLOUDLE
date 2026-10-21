"""조건 기반 품목 탐색 (F2011): 의미 검색으로 후보 → 조건으로 재선별."""
from __future__ import annotations

from dataclasses import dataclass

from cloudle.data.items import CATEGORY_LABELS, Item, get_item
from cloudle.rag import prompts
from cloudle.rag.embeddings import get_embedder
from cloudle.rag.llm import LLMUnavailable, call_json
from cloudle.rag.store import item_collection

# 자연어 → 구조화 조건 (오프라인에서도 동작하는 규칙)
_CATEGORY_WORDS = {
    "electronics": ("전자", "가전", "전기", "electronic", "appliance", "家電", "电器"),
    "textile": ("옷", "의류", "섬유", "신발", "clothing", "衣類", "衣服"),
    "furniture": ("가구", "furniture", "家具"),
    "plastic": ("플라스틱", "비닐", "plastic", "塑料"),
    "paper": ("종이", "paper", "紙", "纸"),
    "glass": ("유리", "도자기", "glass", "ガラス", "玻璃"),
    "metal": ("금속", "고철", "캔", "metal", "金属"),
    "hazardous": ("유해", "전지", "hazard", "有害"),
}
_BATTERY = ("배터리", "충전", "리튬", "battery", "バッテリー", "电池")
_HAZARD = ("위험", "화재", "수은", "유해", "hazard", "危険", "危险")
_SEPARATE = ("별도 수거", "별도수거", "전용 수거", "따로", "수거함", "separate", "回収", "回收")
_SMALL = ("소형", "작은", "small", "小型")
_LARGE = ("대형", "큰", "large", "大型")
_GENERAL = ("일반쓰레기",)


@dataclass
class Conditions:
    categories: set[str]
    battery: bool = False
    hazardous: bool = False
    separate: bool = False
    small: bool = False
    large: bool = False

    def describe(self) -> list[str]:
        out = [CATEGORY_LABELS[c]["ko"] for c in sorted(self.categories)]
        out += [label for flag, label in (
            (self.battery, "배터리 내장"), (self.hazardous, "유해·위험"),
            (self.separate, "별도 수거"), (self.small, "소형"), (self.large, "대형"),
        ) if flag]
        return out


def parse_conditions(text: str) -> Conditions:
    t = text.lower()
    has = lambda words: any(w.lower() in t for w in words)  # noqa: E731
    cats = {c for c, words in _CATEGORY_WORDS.items() if has(words)}
    if has(_BATTERY):
        cats.discard("hazardous")  # "전지/배터리"는 분류가 아니라 속성 조건으로 본다
    return Conditions(categories=cats, battery=has(_BATTERY), hazardous=has(_HAZARD),
                      separate=has(_SEPARATE), small=has(_SMALL), large=has(_LARGE))


def _satisfies(item: Item, c: Conditions) -> bool:
    rc = item.recycling_category
    if c.categories and item.category not in c.categories:
        return False
    if c.battery and not item.has_battery:
        return False
    if c.hazardous and not (item.hazardous or item.has_battery):
        return False
    if c.separate and any(g in rc for g in _GENERAL) and "가스" not in rc:
        return False
    if c.small and ("대형" in rc or "대형" in " ".join(item.properties)):
        return False
    if c.large and not ("대형" in rc or "대형" in " ".join(item.properties)):
        return False
    return True


def _reason(item: Item, c: Conditions) -> str:
    parts = [CATEGORY_LABELS[item.category]["ko"], f"배출: {item.recycling_category}"]
    if item.has_battery:
        parts.append("배터리 내장")
    if item.hazardous:
        parts.append("유해·위험")
    return " · ".join(parts)


def condition_search(text: str, limit: int = 12) -> dict:
    cond = parse_conditions(text)
    col = item_collection()
    if col.count() == 0:
        return {"conditions": cond.describe(), "items": [], "engine": "none"}

    res = col.query(query_embeddings=[get_embedder().embed_query(text)],
                    n_results=min(60, col.count()))
    candidates = [get_item(i) for i in res["ids"][0] if get_item(i)]
    # 구조화 조건 재선별 → 의미 검색 순위 유지
    filtered = [it for it in candidates if _satisfies(it, cond)]
    # 의미 검색 후보 밖에 있어도 조건을 만족하는 품목은 보충한다
    if any((cond.categories, cond.battery, cond.hazardous, cond.large)):
        from cloudle.data.items import item_index
        extra = [it for it in item_index().values() if it not in filtered and _satisfies(it, cond)]
        filtered += extra

    engine, reasons = "rule", {it.item_id: _reason(it, cond) for it in filtered}
    try:
        listing = "\n".join(
            f"- {it.item_id} | {it.name('ko')} | {CATEGORY_LABELS[it.category]['ko']} | "
            f"배터리:{'예' if it.has_battery else '아니오'} | 유해:{'예' if it.hazardous else '아니오'} | "
            f"배출:{it.recycling_category}" for it in (filtered or candidates)[:40]
        )
        out = call_json(prompts.CONDITION_SYSTEM,
                        prompts.CONDITION_USER.format(condition=text, candidates=listing))
        allowed = {it.item_id for it in (filtered or candidates)}
        chosen = [m for m in out.get("matches", []) if m.get("item_id") in allowed]
        filtered = [get_item(m["item_id"]) for m in chosen]
        reasons = {m["item_id"]: m.get("reason", "") for m in chosen}
        engine = "llm"
    except LLMUnavailable:
        pass

    return {
        "conditions": cond.describe(),
        "engine": engine,
        "items": [{
            "item_id": it.item_id, "names": it.names, "category": it.category,
            "recycling_category": it.recycling_category, "has_battery": it.has_battery,
            "hazardous": it.hazardous, "reason": reasons.get(it.item_id, ""),
        } for it in filtered[:limit]],
    }
