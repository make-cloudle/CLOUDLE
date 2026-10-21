"""Streamlit UI 동작 (AppTest, 브라우저 없이)."""
import pytest
from streamlit.testing.v1 import AppTest

from cloudle.rag.indexing import index_guides, index_items
from tests import fakes

APP = "../streamlit_app.py"


@pytest.fixture
def app(monkeypatch):
    fakes.install(monkeypatch, [])
    index_items()
    index_guides()
    return AppTest.from_file(APP, default_timeout=30).run()


def test_analyze_page_runs_and_produces_cited_result(app):
    assert not app.exception
    app.text_input(key="w_product").input("무선 이어폰").run()
    next(b for b in app.button if b.proto.type == "primary").click().run()
    assert not app.exception
    res = app.session_state.result
    assert res["item"]["item_id"] == "E001"
    assert res["answer"]["sources"]
    assert any("[1]" in e.label for e in app.expander)  # 근거 [1] 표시


def test_empty_paper_shows_error_status(app):
    next(b for b in app.button if b.proto.type == "primary").click().run()
    assert not app.exception
    assert app.session_state.result is None


def test_explore_and_status_pages(app):
    app.switch_page("app_pages/explore.py").run()
    assert not app.exception
    app.text_input[0].input("대형 가구").run()
    app.button[0].click().run()
    assert not app.exception
    app.switch_page("app_pages/status.py").run()
    assert not app.exception
    assert app.metric[1].value == "152"


def test_language_switch(app):
    app.selectbox(key="lang").select("en").run()
    assert not app.exception
    assert app.title[0].value == "Write it on paper"
