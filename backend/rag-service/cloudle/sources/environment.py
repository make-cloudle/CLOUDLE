"""국가 환경 브리핑 데이터: World Bank · What a Waste · NASA EONET · OpenAQ.

수치는 API/데이터에서 직접 읽고, 없으면 만들지 않고 "unavailable"로 둔다.
관측값(realtime)과 통계값(annual_statistic)을 구분해 표기한다.
"""
from __future__ import annotations

import csv
import logging
from datetime import datetime, timedelta, timezone

from cloudle.config import get_settings
from cloudle.sources import wikipedia
from cloudle.sources.geo import Country, contains
from cloudle.sources.http import ExternalAPIError, get_json

log = logging.getLogger("cloudle.env")

def _unavailable(reason: str) -> dict:
    return {"status": "unavailable", "reason": reason}


# ── World Bank Indicators (CC BY 4.0) ─────────────────────────────────
def wb_indicator(iso3: str, code: str) -> dict:
    try:
        data = get_json(f"https://api.worldbank.org/v2/country/{iso3}/indicator/{code}",
                        {"format": "json", "mrnev": 1}, namespace="worldbank", ttl=7 * 86400)
    except ExternalAPIError:
        return _unavailable("World Bank API 호출 실패")
    rows = data[1] if isinstance(data, list) and len(data) > 1 and data[1] else []
    if not rows or rows[0].get("value") is None:
        return _unavailable("World Bank 데이터 없음")
    r = rows[0]
    return {
        "status": "ok", "kind": "annual_statistic", "value": round(float(r["value"]), 2),
        "year": r["date"], "indicator": r["indicator"]["value"],
        "source": "World Bank WDI", "license": "CC BY 4.0",
        "url": f"https://data.worldbank.org/indicator/{code}?locations={iso3}",
    }


# ── What a Waste (CC BY 4.0, CSV 수동 적재) ─────────────────────────────
def _find_col(header: list[str], *must: str, exclude: tuple[str, ...] = ()) -> str | None:
    for h in header:
        low = h.lower()
        if all(m in low for m in must) and not any(e in low for e in exclude):
            return h
    return None


def waste_stats(iso3: str) -> dict:
    path = get_settings().data_dir / "raw" / "what_a_waste_country.csv"
    if not path.exists():
        return _unavailable("What a Waste CSV 미적재 (scripts/fetch_world_data.py 참고)")
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return _unavailable("CSV 비어 있음")
    header = list(rows[0])
    c_iso = _find_col(header, "iso3")
    c_total = _find_col(header, "total_msw", "tons")
    c_pop = _find_col(header, "population", "number")
    if not (c_iso and c_total):
        return _unavailable("CSV 열 형식을 알 수 없음")
    row = next((r for r in rows if r[c_iso].upper() == iso3), None)
    if not row or not row[c_total]:
        return _unavailable("해당 국가 데이터 없음")
    total = float(row[c_total])
    per_capita = None
    if c_pop and row.get(c_pop):
        per_capita = round(total * 1000 / float(row[c_pop]) / 365, 2)  # kg/인/일
    year_col = next((h for h in header if h.lower().endswith("year") and "tons" not in h.lower()), None)
    return {
        "status": "ok", "kind": "annual_statistic", "total_tons_per_year": round(total),
        "kg_per_capita_day": per_capita, "year": row.get(year_col, "") if year_col else "",
        "source": "World Bank What a Waste", "license": "CC BY 4.0",
        "url": "https://datacatalog.worldbank.org/search/dataset/0039597",
    }


# ── NASA EONET 자연현상 이벤트 ───────────────────────────────────────────
def eonet_events(country: Country, days: int = 90, limit: int = 5) -> dict:
    try:
        data = get_json("https://eonet.gsfc.nasa.gov/api/v3/events",
                        {"status": "all", "days": days, "limit": 1000},
                        namespace="eonet", ttl=3 * 3600)
    except ExternalAPIError:
        return _unavailable("NASA EONET 호출 실패")
    found = []
    for ev in data.get("events", []):
        for geo in ev.get("geometry", []):
            coords = geo.get("coordinates")
            if geo.get("type") == "Point":
                pts = [coords]
            elif geo.get("type") == "Polygon":
                pts = coords[0]
            else:
                continue
            inside = [(float(lon), float(lat)) for lon, lat in pts if contains(country, float(lon), float(lat))]
            if inside:
                found.append({
                    "lng": inside[0][0], "lat": inside[0][1],
                    "title": ev["title"],
                    "category": (ev.get("categories") or [{}])[0].get("title", ""),
                    "date": geo.get("date", "")[:10],
                    "url": ev.get("link", ""),
                    "source_url": (ev.get("sources") or [{}])[0].get("url", ""),
                })
                break
    found.sort(key=lambda e: e["date"], reverse=True)
    return {"status": "ok", "kind": "event_log", "days": days, "items": found[:limit],
            "source": "NASA EONET", "url": "https://eonet.gsfc.nasa.gov/"}


# ── OpenAQ 실시간 관측 (키 있을 때만) ───────────────────────────────────
def openaq_latest(country: Country) -> dict:
    key = get_settings().openaq_api_key
    if not key:
        return _unavailable("OPENAQ_API_KEY 미설정")
    headers = {"X-API-Key": key}
    try:
        locs = get_json("https://api.openaq.org/v3/locations",
                        {"iso": country.iso2, "parameters_id": 2, "limit": 20},
                        namespace="openaq", ttl=1800, headers=headers)
        recent = datetime.now(timezone.utc) - timedelta(days=2)
        best = None
        for loc in locs.get("results", []):
            last = (loc.get("datetimeLast") or {}).get("utc")
            if last and datetime.fromisoformat(last.replace("Z", "+00:00")) > recent:
                best, recent = loc, datetime.fromisoformat(last.replace("Z", "+00:00"))
        if not best:
            return _unavailable("최근 48시간 PM2.5 관측소 없음")
        latest = get_json(f"https://api.openaq.org/v3/locations/{best['id']}/latest",
                          namespace="openaq", ttl=1800, headers=headers)
        pm25_ids = {s["id"] for s in best.get("sensors", []) if s.get("parameter", {}).get("id") == 2}
        m = next((r for r in latest.get("results", []) if r.get("sensorsId") in pm25_ids), None)
        if not m:
            return _unavailable("PM2.5 측정값 없음")
        return {"status": "ok", "kind": "realtime", "value": m["value"], "unit": "µg/m³",
                "measured_at": m["datetime"]["utc"], "location": best.get("name", ""),
                "source": "OpenAQ", "url": f"https://explore.openaq.org/locations/{best['id']}"}
    except (ExternalAPIError, KeyError, ValueError, TypeError) as e:
        log.warning("OpenAQ 실패: %s", type(e).__name__)
        return _unavailable("OpenAQ 호출 실패")


# ── 위키백과 관련 자료 ──────────────────────────────────────────────────
def related_reading(country: Country, lang: str) -> list[dict]:
    out = []
    for name in dict.fromkeys((country.names["en"], *country.aliases)):
        if en := (wikipedia.summary(f"Environment of {name}", "en")
                  or wikipedia.summary(f"Environment of the {name}", "en")):
            out.append(en)
            break
    if lang != "en":
        local = wikipedia.summary(country.names.get(lang, ""), lang)
        if local:
            out.append(local)
    return out


def briefing(country: Country, lang: str = "ko", detail: bool = False) -> dict:
    """국가를 누르면 핵심 지표만 불러온다: 대기질 · 폐기물 · 최근 자연현상(3건).
    인구 · 관련 문서는 detail=True(국가 비교 등)일 때만 불러온다."""
    out = {
        "country": {"iso3": country.iso3, "iso2": country.iso2, "names": country.names},
        "air_annual": wb_indicator(country.iso3, "EN.ATM.PM25.MC.M3"),
        "air_realtime": openaq_latest(country),
        "waste": waste_stats(country.iso3),
        "events": eonet_events(country, limit=3),
        "population": {"status": "unavailable", "reason": "요청 시 조회"},
        "related": [],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if detail:
        out["population"] = wb_indicator(country.iso3, "SP.POP.TOTL")
        out["related"] = related_reading(country, lang)
    return out


# ── Earth SOS · 타임머신 ────────────────────────────────────────────────
INDICATORS = {"pm25": "EN.ATM.PM25.MC.M3", "population": "SP.POP.TOTL", "forest": "AG.LND.FRST.ZS"}


def wb_series(iso3: str, key: str, start: int = 2000, end: int = 2025) -> dict:
    """연도별 지표 (World Bank). 값이 없는 해는 비워 둔다."""
    code = INDICATORS.get(key)
    if not code:
        return _unavailable("지원하지 않는 지표")
    try:
        data = get_json(f"https://api.worldbank.org/v2/country/{iso3}/indicator/{code}",
                        {"format": "json", "date": f"{start}:{end}", "per_page": 100},
                        namespace="worldbank-series", ttl=7 * 86400)
    except ExternalAPIError:
        return _unavailable("World Bank API 호출 실패")
    rows = data[1] if isinstance(data, list) and len(data) > 1 and data[1] else []
    points = sorted(({"year": int(r["date"]), "value": round(float(r["value"]), 2)}
                     for r in rows if r.get("value") is not None), key=lambda p: p["year"])
    if not points:
        return _unavailable("World Bank 데이터 없음")
    return {"status": "ok", "kind": "annual_statistic", "indicator": rows[0]["indicator"]["value"],
            "points": points, "source": "World Bank WDI", "license": "CC BY 4.0",
            "url": f"https://data.worldbank.org/indicator/{code}?locations={iso3}"}


def global_sos() -> dict:
    """지구의 구조 신호: 전 세계 PM2.5 연평균(한 번에 조회) + 최근 30일 자연현상."""
    pm = {}
    try:
        data = get_json("https://api.worldbank.org/v2/country/all/indicator/EN.ATM.PM25.MC.M3",
                        {"format": "json", "mrnev": 1, "per_page": 400}, namespace="worldbank", ttl=7 * 86400)
        for r in (data[1] if isinstance(data, list) and len(data) > 1 and data[1] else []):
            if r.get("value") is not None and r.get("countryiso3code"):
                pm[r["countryiso3code"]] = {"value": round(float(r["value"]), 1), "year": r["date"]}
    except ExternalAPIError:
        pass
    events = []
    try:
        data = get_json("https://eonet.gsfc.nasa.gov/api/v3/events", {"status": "open", "days": 30, "limit": 300},
                        namespace="eonet", ttl=3 * 3600)
        for ev in data.get("events", []):
            geo = (ev.get("geometry") or [{}])[-1]
            if geo.get("type") == "Point":
                lon, lat = geo["coordinates"]
                events.append({"title": ev["title"], "category": (ev.get("categories") or [{}])[0].get("title", ""),
                               "date": geo.get("date", "")[:10], "lat": float(lat), "lng": float(lon), "url": ev.get("link", "")})
    except ExternalAPIError:
        pass
    return {
        "pm25": {"status": "ok" if pm else "unavailable", "values": pm, "kind": "annual_statistic",
                 "source": "World Bank WDI", "unit": "µg/m³", "license": "CC BY 4.0"},
        "events": {"status": "ok" if events else "unavailable", "items": events, "kind": "event_log",
                   "days": 30, "source": "NASA EONET"},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
