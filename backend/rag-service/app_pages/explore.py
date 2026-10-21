"""조건 기반 품목 탐색 (F2011) → 카드 선택 시 분석 화면으로 연결."""
import streamlit as st

from cloudle.data.items import CATEGORY_LABELS
from cloudle.rag.search import condition_search
from ui.i18n import lang, t

L = lang()
EXAMPLES = {
    "ko": ["배터리가 들어 있는 소형 전자제품 중 별도 수거가 필요한 품목", "유해하거나 화재 위험이 있는 물건", "대형 가구"],
    "en": ["small electronics with batteries that need separate collection", "hazardous items", "large furniture"],
    "ja": ["電池入りの小型家電で別回収が必要なもの", "有害・火災の危険がある物", "大型家具"],
    "zh": ["含电池且需单独回收的小型电子产品", "有害或有火灾风险的物品", "大型家具"],
}


def go_analyze(item_id: str):
    st.session_state.w_item = item_id
    st.session_state.result = None
    st.switch_page("app_pages/analyze.py")


st.title(t("explore_title"))
with st.form("explore"):
    query = st.text_input(t("search"), placeholder=t("explore_ph"), label_visibility="collapsed")
    submitted = st.form_submit_button(t("search"), icon=":material/search:", type="primary")
example = st.pills("examples", EXAMPLES[L], label_visibility="collapsed", key="ex_pill")
query = example if example and not submitted else query

if query:
    res = condition_search(query)
    if res["conditions"]:
        st.caption(f"{t('conditions')}: " + " · ".join(res["conditions"]) + f" · engine={res['engine']}")
    if not res["items"]:
        st.info(t("no_match"), icon=":material/search_off:")
    cols = st.columns(3)
    for i, it in enumerate(res["items"]):
        with cols[i % 3].container(border=True, height="stretch"):
            st.markdown(f"**{it['names'].get(L, it['names']['ko'])}**")
            badges = [CATEGORY_LABELS[it["category"]][L], it["recycling_category"]]
            if it["has_battery"]:
                badges.append(t("battery"))
            st.caption(" · ".join(badges))
            if it["reason"]:
                st.write(it["reason"])
            if st.button(t("analyze_this"), key=f"go_{it['item_id']}", icon=":material/arrow_forward:"):
                go_analyze(it["item_id"])
