"""색인: RAG 1 품목(F2001·F2002), RAG 2 문서 청킹·색인(F2005)."""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

from cloudle.config import get_settings
from cloudle.data.items import Item, load_items
from cloudle.rag.embeddings import get_embedder
from cloudle.rag.store import evidence_collection, item_collection

BATCH = 64


# ── RAG 1 ────────────────────────────────────────────────────────────────
def index_items(items: list[Item] | None = None) -> int:
    """품목 1건 = 문서 1건. 같은 item_id로 upsert하므로 재실행해도 중복이 없다."""
    items = items or load_items()
    col = item_collection()
    emb = get_embedder()
    for i in range(0, len(items), BATCH):
        part = items[i : i + BATCH]
        texts = [it.search_text() for it in part]
        col.upsert(
            ids=[it.item_id for it in part],
            documents=texts,
            embeddings=emb.embed_documents(texts),
            metadatas=[it.metadata() for it in part],
        )
    return col.count()


# ── RAG 2 ────────────────────────────────────────────────────────────────
@dataclass
class Doc:
    """수집된 외부 문서 1건 (청킹 전)."""

    source_id: str  # 출처 내 고유 ID (예: wiki-ko-12345)
    title: str
    url: str
    text: str
    source_type: str  # wikipedia | guide | user_upload
    license: str
    item_id: str = "general"  # 품목 ID, cat:<분류>, general
    lang: str = "ko"
    session_id: str = "public"
    query: str = ""
    collected_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )


def _norm_hash(text: str) -> str:
    return hashlib.sha1(re.sub(r"\s+", " ", text).strip().encode()).hexdigest()[:16]


def chunk_doc(doc: Doc, chunk_size: int | None = None, chunk_overlap: int | None = None):
    s = get_settings()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size or s.chunk_size,
        chunk_overlap=chunk_overlap if chunk_overlap is not None else s.chunk_overlap,
        separators=["\n\n", "\n", ". ", "다. ", "。", " ", ""],
    )
    return [c for c in splitter.split_text(doc.text) if c.strip()]


def index_documents(docs: list[Doc], chunk_size: int | None = None,
                    chunk_overlap: int | None = None) -> int:
    """청크 ID = item_id:source_id:index → upsert로 중복 방지. 반환: 새로 쓴 청크 수."""
    col = evidence_collection()
    emb = get_embedder()
    ids, texts, metas = [], [], []
    seen: set[tuple[str, str]] = set()
    for doc in docs:
        for idx, chunk in enumerate(chunk_doc(doc, chunk_size, chunk_overlap)):
            h = _norm_hash(chunk)
            if (doc.item_id, h) in seen:  # 같은 범위 안 동일 텍스트 제거
                continue
            seen.add((doc.item_id, h))
            ids.append(f"{doc.item_id}:{doc.source_id}:{idx}")
            texts.append(chunk)
            metas.append({
                "item_id": doc.item_id, "source_id": doc.source_id, "title": doc.title,
                "url": doc.url, "source_type": doc.source_type, "license": doc.license,
                "lang": doc.lang, "session_id": doc.session_id, "query": doc.query,
                "collected_at": doc.collected_at, "chunk_index": idx, "content_hash": h,
            })
    for i in range(0, len(ids), BATCH):
        col.upsert(
            ids=ids[i : i + BATCH], documents=texts[i : i + BATCH],
            embeddings=emb.embed_documents(texts[i : i + BATCH]),
            metadatas=metas[i : i + BATCH],
        )
    _write_ledger(docs)
    return len(ids)


def _write_ledger(docs: list[Doc]) -> None:
    """출처 대장 (NF2007). 사용자 업로드는 개인 자료이므로 기록하지 않는다."""
    path = get_settings().storage_dir / "sources_ledger.jsonl"
    with path.open("a", encoding="utf-8") as f:
        for d in docs:
            if d.source_type == "user_upload":
                continue
            row = {k: v for k, v in asdict(d).items() if k not in ("text", "session_id")}
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


# ── 팀 작성 배출 안내 문서 (data/docs/*.md) ───────────────────────────────
def _parse_front_matter(raw: str) -> tuple[dict, str]:
    meta: dict[str, str] = {}
    if raw.startswith("---"):
        _, head, body = raw.split("---", 2)
        for line in head.strip().splitlines():
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
        return meta, body.strip()
    return meta, raw


def load_guide_docs(folder: Path | None = None) -> list[Doc]:
    folder = folder or get_settings().data_dir / "docs"
    docs = []
    for path in sorted(folder.glob("*.md")):
        meta, body = _parse_front_matter(path.read_text(encoding="utf-8"))
        scopes = [s.strip() for s in meta.get("scope", "general").split(",") if s.strip()]
        for scope in scopes:
            docs.append(Doc(
                source_id=f"guide-{path.stem}", title=meta.get("title", path.stem),
                url=meta.get("url", ""), text=body, source_type="guide",
                license=meta.get("license", "CLOUDLE 팀 작성 요약"), item_id=scope,
            ))
    return docs


def index_guides() -> int:
    return index_documents(load_guide_docs())
