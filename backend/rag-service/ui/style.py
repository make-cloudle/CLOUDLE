"""종이 입력창 스타일 (사용자 요청: 줄노트 + 손으로 그린 듯한 구불한 테두리).

나머지 화면은 .streamlit/config.toml 테마만 사용한다.
"""
from __future__ import annotations

import streamlit as st

_PAPER = {
    "light": {"bg": "#FBFAF5", "line": "rgba(70, 110, 140, 0.16)", "margin": "rgba(196, 120, 110, 0.45)", "ink": "#2B2B28"},
    "dark": {"bg": "#22231F", "line": "rgba(170, 190, 205, 0.12)", "margin": "rgba(200, 130, 120, 0.35)", "ink": "#E7E5DD"},
}


def inject_paper_css() -> None:
    mode = "dark" if st.context.theme.type == "dark" else "light"
    c = _PAPER[mode]
    st.html(f"""
<style>
.st-key-paper {{
  background-color: {c['bg']};
  background-image:
    linear-gradient(to right, transparent 30px, {c['margin']} 30px, {c['margin']} 31px, transparent 31px),
    repeating-linear-gradient(to bottom, transparent 0, transparent 35px, {c['line']} 35px, {c['line']} 36px);
  border: 1.5px solid {c['ink']};
  border-radius: 255px 14px 225px 14px / 14px 225px 14px 255px;
  padding: 1.75rem 1.25rem 1.25rem 2.75rem;
}}
.st-key-paper [data-baseweb="input"], .st-key-paper [data-baseweb="textarea"],
.st-key-paper [data-baseweb="select"] > div {{
  background: transparent;
}}
.st-key-paper textarea {{ line-height: 36px; background: transparent; }}
.st-key-paper-photos img {{ border: 1px solid {c['ink']}; border-radius: 4px; }}
</style>""")
