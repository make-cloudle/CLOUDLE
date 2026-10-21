"""RAG 1 품목 메타데이터 로더 (F2001)."""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from cloudle.config import get_settings

LANGS = ("ko", "en", "ja", "zh")

CATEGORY_LABELS = {
    "electronics": {"ko": "전자제품", "en": "Electronics", "ja": "電子機器", "zh": "电子产品"},
    "hazardous": {"ko": "유해·전지", "en": "Hazardous & batteries", "ja": "有害・電池", "zh": "有害·电池"},
    "plastic": {"ko": "플라스틱", "en": "Plastic", "ja": "プラスチック", "zh": "塑料"},
    "paper": {"ko": "종이", "en": "Paper", "ja": "紙", "zh": "纸类"},
    "glass": {"ko": "유리·도자기", "en": "Glass & ceramic", "ja": "ガラス・陶磁器", "zh": "玻璃·陶瓷"},
    "metal": {"ko": "금속", "en": "Metal", "ja": "金属", "zh": "金属"},
    "textile": {"ko": "의류·섬유", "en": "Clothing & textile", "ja": "衣類・繊維", "zh": "衣物·纺织"},
    "furniture": {"ko": "가구", "en": "Furniture", "ja": "家具", "zh": "家具"},
    "household": {"ko": "생활용품", "en": "Household", "ja": "生活用品", "zh": "生活用品"},
}


@dataclass(frozen=True)
class Item:
    item_id: str
    names: dict[str, str]
    aliases: tuple[str, ...]
    category: str
    materials: tuple[str, ...]
    has_battery: bool
    hazardous: bool
    recycling_category: str
    properties: tuple[str, ...]
    disposal_hint: str
    source: str = field(default="CLOUDLE 팀 작성 초안 (공식 지침 확인 필요)")

    def name(self, lang: str = "ko") -> str:
        return self.names.get(lang) or self.names["ko"]

    def search_text(self) -> str:
        """항목 1건을 검색 가능한 텍스트 1개로 구성한다."""
        return "\n".join(
            [
                f"품목명: {self.names['ko']} ({self.names['en']} / {self.names['ja']} / {self.names['zh']})",
                f"별칭: {', '.join(self.aliases) or '없음'}",
                f"분류: {CATEGORY_LABELS[self.category]['ko']}",
                f"재질: {', '.join(self.materials)}",
                f"배터리 내장: {'예' if self.has_battery else '아니오'}",
                f"유해·위험성: {'있음' if self.hazardous else '일반'}",
                f"배출 분류: {self.recycling_category}",
                f"특성: {', '.join(self.properties)}",
                f"처리 안내(초안): {self.disposal_hint}",
            ]
        )

    def metadata(self) -> dict:
        """ChromaDB 메타데이터는 스칼라만 허용하므로 평탄화한다."""
        return {
            "item_id": self.item_id,
            **{f"name_{lang}": self.names[lang] for lang in LANGS},
            "aliases": ";".join(self.aliases),
            "category": self.category,
            "materials": ";".join(self.materials),
            "has_battery": self.has_battery,
            "hazardous": self.hazardous,
            "recycling_category": self.recycling_category,
            "source_type": "item_meta",
            "source": self.source,
        }

    def matches_name(self, text: str) -> bool:
        t = text.lower().replace(" ", "")
        return any(
            n and n.lower().replace(" ", "") in t
            for n in (*self.names.values(), *self.aliases)
        )


def _split(v: str) -> tuple[str, ...]:
    return tuple(x.strip() for x in v.split(";") if x.strip())


def load_items(path: Path | None = None) -> list[Item]:
    path = path or get_settings().data_dir / "items.csv"
    with path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    items = []
    for r in rows:
        if r["category"] not in CATEGORY_LABELS:
            raise ValueError(f"알 수 없는 분류: {r['item_id']} {r['category']}")
        items.append(
            Item(
                item_id=r["item_id"],
                names={lang: r[f"name_{lang}"].strip() for lang in LANGS},
                aliases=_split(r["aliases"]),
                category=r["category"],
                materials=_split(r["material"]),
                has_battery=r["has_battery"] == "1",
                hazardous=r["hazardous"] == "1",
                recycling_category=r["recycling_category"].strip(),
                properties=_split(r["properties"]),
                disposal_hint=r["disposal_hint"].strip(),
            )
        )
    return items


@lru_cache
def item_index() -> dict[str, Item]:
    return {i.item_id: i for i in load_items()}


def get_item(item_id: str) -> Item | None:
    return item_index().get(item_id)


def find_item_by_name(text: str) -> Item | None:
    """자유 입력 물건명에서 가장 긴 이름이 일치하는 품목을 찾는다."""
    best, best_len = None, 0
    t = text.lower().replace(" ", "")
    for item in item_index().values():
        for n in (*item.names.values(), *item.aliases):
            key = n.lower().replace(" ", "")
            if key and (key in t or (len(t) >= 2 and t in key)) and len(key) > best_len:
                best, best_len = item, len(key)
    return best
