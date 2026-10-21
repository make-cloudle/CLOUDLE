"""ChromaDB 벡터 저장소. 임베딩 모델별로 저장 폴더를 분리해 차원 충돌을 막는다."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings

from cloudle.config import get_settings
from cloudle.rag.embeddings import get_embedder

ITEM_COLLECTION = "item_meta"
EVIDENCE_COLLECTION = "evidence_docs"


@lru_cache
def _client(path: str) -> chromadb.ClientAPI:
    Path(path).mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(
        path=path, settings=ChromaSettings(anonymized_telemetry=False)
    )


def chroma_path() -> Path:
    return get_settings().storage_dir / "chroma" / get_embedder().id


def get_collection(name: str):
    # 임베딩은 항상 직접 계산해 넘기므로 Chroma 기본 임베딩 함수는 쓰지 않는다.
    return _client(str(chroma_path())).get_or_create_collection(
        name=name, metadata={"hnsw:space": "cosine"}, embedding_function=None
    )


def item_collection():
    return get_collection(ITEM_COLLECTION)


def evidence_collection():
    return get_collection(EVIDENCE_COLLECTION)


def reset_client_cache() -> None:
    """테스트에서 저장 경로를 바꿀 때 사용."""
    _client.cache_clear()
