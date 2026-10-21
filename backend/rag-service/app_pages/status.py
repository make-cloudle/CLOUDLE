"""데이터·색인 상태 (F2001 · F2002 · F2005 확인, F2014 유사도 vs MMR 비교)."""
import json

import streamlit as st

from cloudle.config import get_settings
from cloudle.data.items import get_item, load_items
from cloudle.rag.embeddings import get_embedder
from cloudle.rag.indexing import index_guides, index_items
from cloudle.rag.retrieve import retrieve
from cloudle.rag.store import evidence_collection, item_collection
from ui.i18n import t

s = get_settings()
st.title(t("status_title"))

items = load_items()
ev = evidence_collection()
cols = st.columns(4)
cols[0].metric("items.csv", len(items), border=True)
cols[1].metric("item_meta", item_collection().count(), border=True)
cols[2].metric("evidence_docs", ev.count(), border=True)
cols[3].metric("embedding", get_embedder().id, border=True)

if item_collection().count() == 0:
    st.error("item_meta 색인이 비어 있어요. 아래 버튼으로 색인하세요.", icon=":material/error:")
if st.button(t("rebuild"), icon=":material/refresh:"):
    with st.spinner("indexing"):
        n, c = index_items(), index_guides()
    st.success(f"item_meta {n} · guide chunks {c}")
    st.rerun()

st.subheader("RAG settings")
st.dataframe(
    [{"key": k, "value": str(getattr(s, k))} for k in
     ("llm_model", "embedding_model", "chunk_size", "chunk_overlap", "top_k", "use_mmr")],
    hide_index=True, alt="RAG settings",
)

st.subheader("Sample item text (F2001)")
st.code(items[0].search_text(), language=None)

st.subheader("Similarity vs MMR (F2014)")
c1, c2, c3 = st.columns([2, 3, 1], vertical_alignment="bottom")
item_id = c1.selectbox("item", [i.item_id for i in items], format_func=lambda i: get_item(i).name("ko"))
q = c2.text_input("question", "배터리 수리와 배출")
k = c3.number_input("top_k", 1, 10, s.top_k)
if item_collection().count():
    a, b = st.columns(2)
    for col, mmr in ((a, False), (b, True)):
        with col.container(border=True):
            st.markdown(f"**{'MMR' if mmr else 'Similarity'}**")
            res = retrieve(get_item(item_id), q, top_k=int(k), use_mmr=mmr)
            st.dataframe([{"n": e.n, "type": e.kind, "title": e.title, "score": e.score} for e in res],
                         hide_index=True, alt="retrieval results")

st.subheader("Source ledger (NF2007)")
ledger = s.storage_dir / "sources_ledger.jsonl"
if ledger.exists():
    rows = [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines() if line.strip()]
    uniq = {(r["source_id"], r["item_id"]): r for r in rows}
    st.dataframe([{k: r[k] for k in ("title", "url", "source_type", "license", "collected_at")}
                  for r in uniq.values()], hide_index=True, alt="source ledger")
