"""Phase 3: 국가 경계·환경 데이터·FastAPI (외부 호출은 모의)."""
import json

import pytest
from fastapi.testclient import TestClient

from cloudle.api.main import app
from cloudle.rag.indexing import index_guides, index_items
from cloudle.sources import environment
from cloudle.sources.geo import contains, get_country
from tests import fakes

client = TestClient(app)
SID = {"X-Session-Id": "testsession123"}


def test_point_in_country():
    kor = get_country("KOR")
    assert kor.names["ko"] == "대한민국"
    assert contains(kor, 126.98, 37.57)  # 서울
    assert not contains(kor, 139.69, 35.69)  # 도쿄
    assert get_country("FRA") is not None  # ISO_A3=-99 보정


def test_waste_without_csv_is_unavailable_not_invented():
    w = environment.waste_stats("KOR")
    assert w["status"] == "unavailable" and "value" not in w


def test_eonet_filters_events_by_country(monkeypatch):
    data = {"events": [
        {"title": "Wildfire Korea", "categories": [{"title": "Wildfires"}], "link": "x",
         "geometry": [{"type": "Point", "coordinates": [128.0, 36.5], "date": "2026-10-01T00:00:00Z"}]},
        {"title": "Storm Japan", "categories": [{"title": "Storms"}], "link": "y",
         "geometry": [{"type": "Point", "coordinates": [139.7, 35.7], "date": "2026-10-02T00:00:00Z"}]},
    ]}
    monkeypatch.setattr(environment, "get_json", lambda *a, **k: data)
    ev = environment.eonet_events(get_country("KOR"))
    assert [e["title"] for e in ev["items"]] == ["Wildfire Korea"]


def test_country_endpoint(monkeypatch):
    monkeypatch.setattr("cloudle.api.main.briefing", lambda c, lang: {"country": {"iso3": c.iso3}})
    assert client.get("/api/country/KOR").json()["country"]["iso3"] == "KOR"
    assert client.get("/api/country/XXX").status_code == 404


def _events(text: str):
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        yield lines["event"], json.loads(lines["data"])


def test_analyze_sse_streams_real_progress_then_result(monkeypatch):
    fakes.install(monkeypatch, [])
    index_items()
    index_guides()
    r = client.post("/api/analyze", json={"paper": {"product_name": "무선 이어폰", "purpose": "all"}}, headers=SID)
    assert r.headers["content-type"].startswith("text/event-stream")
    events = list(_events(r.text))
    steps = [d["step"] for e, d in events if e == "progress"]
    assert steps[0] == "item" and "retrieve" in steps
    kind, result = events[-1]
    assert kind == "result" and result["item"]["item_id"] == "E001"
    assert result["answer"]["sources"]


def test_analyze_errors_are_safe():
    index_items()
    r = client.post("/api/analyze", json={"paper": {"product_name": ""}}, headers=SID)
    kind, data = list(_events(r.text))[-1]
    assert kind == "error" and data["code"] == "empty_paper"
    assert "Traceback" not in r.text


@pytest.mark.parametrize("path", ["/api/health", "/api/items"])
def test_basic_endpoints(path):
    index_items()
    assert client.get(path).status_code == 200
