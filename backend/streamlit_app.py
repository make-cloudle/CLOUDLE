"""CLOUDLE Streamlit 앱 (과제 기본 UI · F2001~F2012).

실행: streamlit run streamlit_app.py
"""
import uuid

import streamlit as st

from cloudle.config import get_settings
from ui.i18n import LANGS, t

st.set_page_config(page_title="CLOUDLE", page_icon=":material/cloud:", layout="wide")

# ── 세션 상태는 여기서 한 번에 초기화한다 ──────────────────────────────
defaults = {
    "lang": "ko",
    "sid": uuid.uuid4().hex,  # 비회원 세션 (C01)
    "paper": {"product_name": "", "item_id": "", "condition": "", "region": "대한민국",
              "purpose": "all", "note": ""},
    "photos": [],  # [{"name", "bytes", "labels"}] — 서버 디스크에 저장하지 않음
    "result": None,
    "top_k": get_settings().top_k,
    "use_mmr": get_settings().use_mmr,
}
for k, v in defaults.items():
    st.session_state.setdefault(k, v)

with st.sidebar:
    st.selectbox(t("language"), list(LANGS), format_func=LANGS.get, key="lang")
    if get_settings().offline:
        st.info(t("offline_body"), icon=":material/cloud_off:", title=t("offline_title"))

pages = st.navigation([
    st.Page("app_pages/analyze.py", title=t("nav_analyze"), icon=":material/edit_note:", default=True),
    st.Page("app_pages/explore.py", title=t("nav_explore"), icon=":material/manage_search:"),
    st.Page("app_pages/status.py", title=t("nav_status"), icon=":material/database:"),
])

st.caption("CLOUDLE · " + t("tagline"))
pages.run()
