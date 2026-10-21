"""Natural Earth 110m 국가 경계 (Public Domain). 국가 식별·점-다각형 판정."""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

from cloudle.config import get_settings


@dataclass(frozen=True)
class Country:
    iso3: str
    iso2: str
    names: dict[str, str]
    polygons: tuple  # 각 다각형은 (외곽 링, *구멍 링); 링은 ((lon, lat), ...)
    bbox: tuple[float, float, float, float]  # min_lon, min_lat, max_lon, max_lat
    aliases: tuple[str, ...] = ()  # 영어 이름 변형 (위키백과 제목 탐색용)


def _iso(props: dict, key: str, fallback: str) -> str:
    v = props.get(key)
    if not v or v == "-99":
        v = props.get(f"{key}_EH")
    if not v or v == "-99":
        v = props.get(fallback, "")
    return v


@lru_cache
def countries() -> dict[str, Country]:
    path = get_settings().data_dir / "geo" / "countries.geojson"
    data = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, Country] = {}
    for f in data["features"]:
        p, g = f["properties"], f["geometry"]
        iso3 = _iso(p, "ISO_A3", "ADM0_A3")
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings = tuple(tuple(tuple(tuple(pt) for pt in ring) for ring in poly) for poly in polys)
        lons = [pt[0] for poly in rings for pt in poly[0]]
        lats = [pt[1] for poly in rings for pt in poly[0]]
        out[iso3] = Country(
            iso3=iso3, iso2=_iso(p, "ISO_A2", "ISO_A2"),
            names={"ko": p.get("NAME_KO") or p["NAME"], "en": p.get("NAME_EN") or p["NAME"],
                   "ja": p.get("NAME_JA") or p["NAME"], "zh": p.get("NAME_ZH") or p["NAME"]},
            polygons=rings, bbox=(min(lons), min(lats), max(lons), max(lats)),
            aliases=tuple(dict.fromkeys(p[k] for k in ("NAME_LONG", "NAME", "ADMIN") if p.get(k))),
        )
    return out


def get_country(iso3: str) -> Country | None:
    return countries().get(iso3.upper())


def _in_ring(lon: float, lat: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def contains(country: Country, lon: float, lat: float) -> bool:
    x0, y0, x1, y1 = country.bbox
    if not (x0 - 0.5 <= lon <= x1 + 0.5 and y0 - 0.5 <= lat <= y1 + 0.5):
        return False
    for poly in country.polygons:
        if _in_ring(lon, lat, poly[0]) and not any(_in_ring(lon, lat, h) for h in poly[1:]):
            return True
    return False
