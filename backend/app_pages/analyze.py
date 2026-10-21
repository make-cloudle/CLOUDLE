"""물건 분석: 종이 입력 → 분석(실제 진행 상태) → 근거 결과 → 품목별 채팅."""
import re

import streamlit as st

from cloudle.data.items import CATEGORY_LABELS, get_item, item_index
from cloudle.rag import uploads, vision
from cloudle.rag.chat import chat_store
from cloudle.rag.pipeline import Paper, UserFacingError, analyze, ask
from ui.i18n import lang, t
from ui.style import inject_paper_css

STEPS = {
    "item": {"ko": "물건 확인", "en": "Item identified", "ja": "モノを確認", "zh": "确认物品"},
    "extract": {"ko": "검색어 고르기 (P1)", "en": "Choosing queries (P1)", "ja": "検索語の抽出 (P1)", "zh": "提取检索词 (P1)"},
    "collect": {"ko": "자료 후보 찾기", "en": "Finding candidates", "ja": "候補を検索", "zh": "查找候选资料"},
    "select": {"ko": "관련 문서 고르기 (P2)", "en": "Selecting documents (P2)", "ja": "文書の選別 (P2)", "zh": "筛选文档 (P2)"},
    "index": {"ko": "문서 읽고 색인", "en": "Reading & indexing", "ja": "読み込み・索引", "zh": "读取并索引"},
    "retrieve": {"ko": "근거 검색 (retrieve)", "en": "Retrieving evidence", "ja": "根拠を検索", "zh": "检索依据"},
    "generate_done": {"ko": "답변 생성 (generate)", "en": "Answer generated", "ja": "回答を生成", "zh": "生成回答"},
    "warning": {"ko": "알림", "en": "Notice", "ja": "お知らせ", "zh": "提示"},
}
REGIONS = ["대한민국", "서울", "경기", "부산", "기타 지역"]
PURPOSES = ["all", "repair", "reuse", "disposal"]
SECTION_KEYS = ["basic_info", "reuse", "repair", "disposal"]
CITE = re.compile(r"\[근거\s*(\d+)\]")

sid = st.session_state.sid
L = lang()


def cite_md(text: str) -> str:
    return CITE.sub(lambda m: f" :green-badge[{m.group(1)}]", text or "")


def item_label(item_id: str) -> str:
    it = get_item(item_id)
    return f"{it.name(L)} · {CATEGORY_LABELS[it.category][L]}" if it else item_id


# ── 업로드 처리 콜백 (한 번만 실행) ─────────────────────────────────────
def _add_photo(file) -> None:
    data = file.getvalue()
    try:
        uploads.check_image(file.name, data)
    except uploads.UploadRejected as e:
        st.toast(str(e), icon=":material/error:")
        return
    found = vision.identify(data, file.type or "image/jpeg")
    st.session_state.photos.append({"name": file.name, "bytes": data, "labels": found["labels"]})
    if found.get("item_id") and not st.session_state.get("w_item"):
        st.session_state.w_item = found["item_id"]
    if found.get("message"):
        st.toast(found["message"], icon=":material/info:")


def on_photo():
    if f := st.session_state.get("up_photo"):
        _add_photo(f)


def on_camera():
    if f := st.session_state.get("up_camera"):
        _add_photo(f)


def on_doc():
    for f in st.session_state.get("up_doc") or []:
        try:
            n = uploads.add_session_document(sid, f.name, f.getvalue())
            st.toast(f"{f.name}: {n} chunks", icon=":material/description:")
        except uploads.UploadRejected as e:
            st.toast(str(e), icon=":material/error:")


def clear_paper():
    for k in ("w_product", "w_condition", "w_note"):
        st.session_state[k] = ""
    st.session_state.w_item = None
    st.session_state.photos = []
    st.session_state.result = None


def pick_item(item_id: str):
    st.session_state.w_item = item_id


# ── 화면 ──────────────────────────────────────────────────────────────
inject_paper_css()
st.title(t("paper_title"))
left, right = st.columns([5, 4], gap="large")

with left:
    with st.container(key="paper"):
        st.text_input(t("product"), key="w_product", placeholder=t("product_ph"))
        st.selectbox(t("pick_item"), list(item_index()), index=None, key="w_item",
                     format_func=item_label, placeholder="—")
        c1, c2 = st.columns(2)
        c1.text_input(t("condition"), key="w_condition", placeholder=t("condition_ph"))
        c2.selectbox(t("region"), REGIONS, key="w_region")
        st.segmented_control(t("purpose"), PURPOSES, key="w_purpose", default="all",
                             format_func=lambda p: t(f"p_{p}"))
        st.text_area(t("note"), key="w_note", placeholder=t("note_ph"), height=110)

        if st.session_state.photos:
            with st.container(key="paper-photos", horizontal=True):
                for i, p in enumerate(st.session_state.photos):
                    with st.container(width=140):
                        st.image(p["bytes"], alt=p["name"], width=130)
                        if p["labels"]:
                            st.caption(f"{t('photo_hint')}: {', '.join(p['labels'])}")
                        if st.button(":material/close:", key=f"rm_photo_{i}", help="remove"):
                            st.session_state.photos.pop(i)
                            st.rerun()

        with st.container(horizontal=True, vertical_alignment="center"):
            with st.popover(t("attach_image"), icon=":material/image:"):
                st.file_uploader(t("attach_image"), type=["png", "jpg", "jpeg", "webp"],
                                 key="up_photo", on_change=on_photo, label_visibility="collapsed")
            with st.popover(t("attach_doc"), icon=":material/attach_file:"):
                st.file_uploader(t("attach_doc"), type=["pdf", "txt", "md"], accept_multiple_files=True,
                                 key="up_doc", on_change=on_doc, label_visibility="collapsed")
            camera_on = st.toggle(t("attach_camera"), key="camera_on")
        if camera_on:
            st.camera_input(t("camera_label"), key="up_camera", on_change=on_camera)

        if docs := uploads.session_documents(sid):
            st.caption(" · ".join(docs))

    b1, b2 = st.columns([3, 1])
    run = b1.button(t("crumple"), type="primary", icon=":material/delete:", width="stretch")
    b2.button(t("clear"), on_click=clear_paper, width="stretch")

with right:
    if run:
        paper = Paper(
            product_name=st.session_state.w_product.strip(), item_id=st.session_state.w_item or "",
            condition=st.session_state.w_condition, region=st.session_state.w_region,
            purpose=st.session_state.w_purpose or "all", note=st.session_state.w_note, lang=L,
            image_labels=[lbl for p in st.session_state.photos for lbl in p["labels"]],
        )
        with st.status(t("analyzing"), expanded=True) as status:
            def emit(kind: str, data: dict):
                if kind.endswith("_done") and kind != "generate_done":
                    return
                label = STEPS.get(kind, {}).get(L, kind)
                detail = data.get("message") if kind == "warning" else data.get("name", "")
                st.write(f":material/check: {label}" + (f" — {detail}" if detail else ""))

            try:
                st.session_state.result = analyze(paper, sid, emit=emit)
                status.update(label=t("done"), state="complete", expanded=False)
            except UserFacingError as e:
                status.update(label=e.message, state="error")
                st.session_state.result = None
                if e.code == "unknown_item":
                    st.write(t("unknown_pick"))
                    with st.container(horizontal=True):
                        for s in e.extra.get("suggestions", []):
                            st.button(s["names"].get(L, s["names"]["ko"]), key=f"sg_{s['item_id']}",
                                      on_click=pick_item, args=(s["item_id"],))

    res = st.session_state.result
    if res:
        a = res["answer"]
        item = res["item"]
        st.subheader(item["names"].get(L, item["names"]["ko"]))
        st.caption(f"{CATEGORY_LABELS[item['category']][L]} · {item['recycling_category']} · "
                   f"{'LLM' if res['engine'] == 'llm' else t('offline_title')} · {res['timings']['total']}s")
        if a.get("safety"):
            st.warning(t("safety"), icon=":material/battery_alert:")
        with st.container(border=True):
            st.markdown(f"**{t('summary')}**  \n{cite_md(a.get('summary'))}")
        for row in (SECTION_KEYS[:2], SECTION_KEYS[2:]):
            cols = st.columns(2)
            for col, key in zip(cols, row):
                with col.container(border=True, height="stretch"):
                    st.markdown(f"**{t(key)}**  \n{cite_md(a.get(key))}")
        with st.container(border=True):
            st.markdown(f"**{t('next_actions')}**")
            for act in a.get("next_actions", []):
                st.markdown(f"- {cite_md(act)}")
        if a.get("uncertainties"):
            st.caption(f"{t('uncertain')}: " + " / ".join(a["uncertainties"]))

        st.markdown(f"#### {t('sources')}")
        for s in a.get("sources", []):
            with st.expander(f"[{s['n']}] {s['kind_label']} · {s['title']}"):
                if s["url"]:
                    st.markdown(f"[{s['url']}]({s['url']})")
                st.caption(s["license"])
                st.text(s["text"][:1200])

if res := st.session_state.result:
    st.divider()
    st.subheader(t("chat_title"))
    item_id = res["item"]["item_id"]
    for m in chat_store.history(sid, item_id):
        with st.chat_message(m["role"]):
            st.markdown(cite_md(m["content"]))
            for s in m.get("sources", []):
                st.caption(f"[{s['n']}] {s['title']}" + (f" — {s['url']}" if s["url"] else ""))
    prompt = st.chat_input(t("chat_ph"), accept_file="multiple",
                           file_type=["png", "jpg", "jpeg", "webp", "pdf", "txt", "md"])
    if prompt:
        for f in prompt.files:
            if f.type and f.type.startswith("image/"):
                _add_photo(f)
            else:
                try:
                    uploads.add_session_document(sid, f.name, f.getvalue())
                except uploads.UploadRejected as e:
                    st.toast(str(e), icon=":material/error:")
        if prompt.text:
            try:
                ask(item_id, prompt.text, sid, L)
            except UserFacingError as e:
                st.error(e.message)
        st.rerun()
