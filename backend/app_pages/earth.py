"""지구 환경 (C04): 국가 선택 → 통계·관측·이벤트·관련 자료. 수치는 출처·기준연도와 함께."""
import streamlit as st

from cloudle.sources.environment import briefing
from cloudle.sources.geo import countries
from ui.i18n import lang, t

L = lang()


@st.cache_data(ttl=3600, max_entries=64, show_spinner=False)
def load(iso3: str, lang_code: str) -> dict:
    return briefing(countries()[iso3], lang_code)


def stat_caption(s: dict) -> str:
    if s["status"] != "ok":
        return f":gray[{s.get('reason', '')}]"
    kind = "실시간 관측" if s.get("kind") == "realtime" else "통계"
    when = s.get("year") or s.get("measured_at", "")
    return f":gray-badge[{kind}] {when} · [{s.get('source', '')}]({s.get('url', '')})"


st.title(t("nav_earth"))
options = sorted(countries(), key=lambda k: countries()[k].names[L])
iso = st.selectbox("country", options, index=options.index("KOR"),
                   format_func=lambda k: countries()[k].names[L], label_visibility="collapsed")

with st.spinner("…"):
    b = load(iso, L)

cols = st.columns(4)
specs = [
    ("PM2.5 (live)", b["air_realtime"], lambda s: f"{s['value']} {s['unit']}"),
    ("PM2.5 (annual)", b["air_annual"], lambda s: f"{s['value']} µg/m³"),
    ("Municipal waste", b["waste"], lambda s: f"{s['total_tons_per_year']:,} t/yr"),
    ("Population", b["population"], lambda s: f"{int(s['value']):,}"),
]
for col, (label, s, fmt) in zip(cols, specs):
    with col.container(border=True, height="stretch"):
        st.metric(label, fmt(s) if s["status"] == "ok" else "—")
        st.caption(stat_caption(s))

st.subheader("NASA EONET")
ev = b["events"]
if ev["status"] != "ok":
    st.warning(ev.get("reason", ""), icon=":material/cloud_off:")
elif not ev["items"]:
    st.caption("최근 90일 이벤트 없음")
else:
    st.dataframe(ev["items"], hide_index=True, alt="natural events",
                 column_config={"url": st.column_config.LinkColumn("url"),
                                "source_url": st.column_config.LinkColumn("source")})

if b["related"]:
    st.subheader("Related reading")
    for r in b["related"]:
        with st.container(border=True):
            st.markdown(f"**[{r['title']}]({r['url']})**")
            st.write(r["extract"])
            st.caption(f"Wikipedia · {r['license']}")
