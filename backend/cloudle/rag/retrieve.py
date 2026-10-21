"""근거 검색 (F2006 · F2014): 품목 메타 1건 필수 + 외부 청크 의미 검색 → 병합·중복 제거."""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from cloudle.config import get_settings
from cloudle.data.items import Item
from cloudle.rag.embeddings import get_embedder
from cloudle.rag.store import evidence_collection, item_collection

SOURCE_LABEL = {
    "item_meta": "품목 메타데이터",
    "guide": "배출 안내",
    "wikipedia": "위키백과",
    "user_upload": "업로드 문서",
}


@dataclass
class Evidence:
    n: int
    kind: str
    title: str
    url: str
    text: str
    license: str
    chunk_id: str
    score: float  # 코사인 유사도 (메타데이터는 1.0)

    def to_dict(self) -> dict:
        return {**asdict(self), "kind_label": SOURCE_LABEL.get(self.kind, self.kind)}


class IndexMissing(RuntimeError):
    """item_meta 색인이 비어 있거나 품목이 없음 (F2012)."""


def _mmr(query: np.ndarray, embs: np.ndarray, k: int, lam: float) -> list[int]:
    """Maximal Marginal Relevance: 관련성과 다양성을 함께 고려해 k개 선택."""
    if len(embs) == 0:
        return []
    embs = embs / (np.linalg.norm(embs, axis=1, keepdims=True) + 1e-9)
    q = query / (np.linalg.norm(query) + 1e-9)
    rel = embs @ q
    chosen = [int(np.argmax(rel))]
    while len(chosen) < min(k, len(embs)):
        sim_to_chosen = (embs @ embs[chosen].T).max(axis=1)
        score = lam * rel - (1 - lam) * sim_to_chosen
        score[chosen] = -np.inf
        chosen.append(int(np.argmax(score)))
    return chosen


def retrieve(item: Item, question: str, session_id: str = "public",
             top_k: int | None = None, use_mmr: bool | None = None) -> list[Evidence]:
    s = get_settings()
    top_k = top_k or s.top_k
    use_mmr = s.use_mmr if use_mmr is None else use_mmr

    meta = item_collection().get(ids=[item.item_id])
    if not meta["ids"]:
        raise IndexMissing("품목 색인이 없습니다. scripts/build_index.py를 먼저 실행하세요.")
    results = [Evidence(
        n=1, kind="item_meta", title=f"CLOUDLE 품목 메타데이터: {item.name('ko')}",
        url="", text=meta["documents"][0], license=item.source, chunk_id=item.item_id, score=1.0,
    )]

    col = evidence_collection()
    if col.count() == 0:
        return results
    q_text = f"{item.name('ko')} {item.name('en')} {question}".strip()
    q_emb = np.array(get_embedder().embed_query(q_text))
    where = {"$and": [
        {"item_id": {"$in": [item.item_id, f"cat:{item.category}", "general"]}},
        {"session_id": {"$in": ["public", session_id]}},
    ]}
    fetch_k = max(top_k * 4, s.mmr_fetch_k)
    res = col.query(query_embeddings=[q_emb.tolist()], n_results=min(fetch_k, col.count()),
                    where=where, include=["documents", "metadatas", "distances", "embeddings"])
    ids, docs, metas = res["ids"][0], res["documents"][0], res["metadatas"][0]
    dists, embs = res["distances"][0], res["embeddings"][0]

    # 같은 내용(content_hash)은 하나만 남긴다.
    keep, seen = [], set()
    for i, m in enumerate(metas):
        if m["content_hash"] in seen:
            continue
        seen.add(m["content_hash"])
        keep.append(i)

    if use_mmr and keep:
        picked = _mmr(q_emb, np.array([embs[i] for i in keep]), top_k, s.mmr_lambda)
        order = [keep[p] for p in picked]
    else:
        order = keep[:top_k]

    # 분류별 배출 안내(guide)는 최대 2건 보장한다: 위키백과 청크가 많으면 안내 문서가 후보에서 밀려난다.
    guide_res = col.query(
        query_embeddings=[q_emb.tolist()], n_results=2,
        where={"$and": [where["$and"][0], {"source_type": "guide"}]},
        include=["documents", "metadatas", "distances"],
    )
    chosen_hashes = {metas[i]["content_hash"] for i in order}
    extra = []
    for cid, doc, m, dist in zip(guide_res["ids"][0], guide_res["documents"][0],
                                 guide_res["metadatas"][0], guide_res["distances"][0]):
        if m["content_hash"] not in chosen_hashes:
            extra.append((cid, doc, m, dist))
    if extra:
        order = order[: max(0, top_k - len(extra))]
        ids, docs, metas, dists = list(ids), list(docs), list(metas), list(dists)
        for cid, doc, m, dist in extra:
            ids.append(cid)
            docs.append(doc)
            metas.append(m)
            dists.append(dist)
            order.append(len(ids) - 1)

    for rank, i in enumerate(order, start=2):
        m = metas[i]
        results.append(Evidence(
            n=rank, kind=m["source_type"], title=m["title"], url=m["url"], text=docs[i],
            license=m["license"], chunk_id=ids[i], score=round(1 - float(dists[i]), 4),
        ))
    return results
