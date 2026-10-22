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
    monkeypatch.setattr("cloudle.api.main.briefing", lambda c, lang, detail=False: {"country": {"iso3": c.iso3}})
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


# ── Phase 4: 세션·요청 제한·채팅·업로드·탐색 ─────────────────────────────
from cloudle.api.session import limiter  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_limits():
    limiter.reset()
    yield
    limiter.reset()


def test_session_header_required():
    r = client.post("/api/search", json={"query": "가구"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "no_session"


def test_rate_limit(monkeypatch):
    index_items()
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "3")
    from cloudle.config import get_settings
    get_settings.cache_clear()
    codes = [client.post("/api/search", json={"query": "가구"}, headers=SID).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3] == 429


def test_chat_upload_and_delete_session(monkeypatch):
    fakes.install(monkeypatch, [])
    index_items()
    index_guides()
    r = client.post("/api/upload", headers=SID,
                    files={"file": ("dorm.txt", "기숙사 배터리 수거함은 1층에 있다. ".encode() * 5, "text/plain")})
    assert r.status_code == 200 and r.json()["chunks"] >= 1
    r = client.post("/api/chat", json={"item_id": "E001", "question": "기숙사 배터리 수거함 어디?"}, headers=SID)
    assert r.status_code == 200
    assert any(s["kind"] == "user_upload" for s in r.json()["evidence"])
    assert client.get("/api/chat/E001", headers=SID).json()["history"]
    assert client.delete("/api/session", headers=SID).json()["ok"]
    assert client.get("/api/chat/E001", headers=SID).json()["history"] == []


def test_upload_rejects_bad_type_and_vision_offline():
    r = client.post("/api/upload", headers=SID, files={"file": ("x.exe", b"MZ" * 20, "application/octet-stream")})
    assert r.status_code == 415
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    r = client.post("/api/vision", headers=SID, files={"file": ("a.png", png, "image/png")})
    assert r.status_code == 200 and r.json()["available"] is False


def test_chat_unknown_item():
    index_items()
    r = client.post("/api/chat", json={"item_id": "NOPE", "question": "?"}, headers=SID)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "unknown_item"


def test_country_ask_cites_documents(monkeypatch):
    from cloudle.sources import wikipedia
    from cloudle.sources.wikipedia import WikiCandidate
    monkeypatch.setattr(wikipedia, "search", lambda q, lang="ko", limit=4: [
        WikiCandidate("wiki-en-9", 9, "en", "Waste management in South Korea", "")])
    monkeypatch.setattr(wikipedia, "extract", lambda pid, lang="ko":
                        "South Korea uses a volume-based waste fee system for waste and recycling. " * 10)
    r = client.post("/api/country/KOR/ask", json={"topic": "waste"}, headers=SID)
    assert r.status_code == 200
    a = r.json()["answer"]
    assert a["sources"] and a["sources"][0]["url"].startswith("https://en.wikipedia.org/")
    assert client.post("/api/country/KOR/ask", json={"topic": "x"}, headers=SID).status_code == 422


def test_sos_series_and_factcheck(monkeypatch):
    from cloudle.api import main
    monkeypatch.setattr(main, "global_sos", lambda: {"pm25": {"status": "ok", "values": {"KOR": {"value": 21.9, "year": "2023"}}}, "events": {"status": "ok", "items": []}})
    assert client.get("/api/sos").json()["pm25"]["values"]["KOR"]["value"] == 21.9
    monkeypatch.setattr(main, "wb_series", lambda iso, k: {"status": "ok", "points": [{"year": 2000, "value": 1.0}]})
    assert client.get("/api/country/KOR/series?indicator=pm25").json()["points"]
    assert client.get("/api/country/KOR/series?indicator=zzz").status_code == 404

    fakes.install(monkeypatch, [])
    index_items(); index_guides()
    r = client.post("/api/factcheck", json={"claim": "리튬 이온 전지는 화재 위험이 없다"}, headers=SID)
    body = r.json()
    assert r.status_code == 200 and body["verdict"] == "insufficient" and body["engine"] == "offline"  # 키 없으면 판정 보류
    assert all(s["url"] or s["kind"] != "wikipedia" for s in body["answer"]["sources"])


def test_memo_summarize_offline_uses_only_given_lines():
    lines = ["지구미: 고장난 전자레인지 버려야 할까요?", "예나: 대형폐기물 스티커 붙여서 배출하면 돼요", "지구미: 수리비가 더 나올 것 같아서요"]
    r = client.post("/api/memo/summarize", headers=SID, json={"lines": lines})
    assert r.status_code == 200
    body = r.json()
    assert body["engine"] == "offline"
    assert body["purpose"] in ("repair", "disposal")
    assert "대형폐기물" in body["note"]
    assert client.post("/api/memo/summarize", headers=SID, json={"lines": []}).status_code == 422
