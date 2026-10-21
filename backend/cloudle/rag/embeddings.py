"""임베딩 모델. 키가 있으면 OpenAI, 없으면 로컬 해싱 임베딩(오프라인 데모)."""
from __future__ import annotations

import hashlib
import math
import re
from typing import Protocol

from cloudle.config import Settings, get_settings


class Embedder(Protocol):
    id: str

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...


_TOKEN = re.compile(r"[0-9A-Za-z]+|[぀-ヿ㐀-鿿가-힣]+")


class HashingEmbedder:
    """문자 n-gram을 해싱한 결정적 임베딩.

    의미 검색 품질은 OpenAI 임베딩보다 낮지만, 키 없이도 색인·검색 파이프라인을
    실행·테스트할 수 있게 한다. 한국어·일본어·중국어를 위해 문자 2/3-gram을 쓴다.
    """

    def __init__(self, dim: int = 768):
        self.dim = dim
        self.id = f"hash{dim}"

    def _features(self, text: str):
        for tok in _TOKEN.findall(text.lower()):
            yield tok, 1.0
            for n in (2, 3):
                for i in range(len(tok) - n + 1):
                    yield tok[i : i + n], 0.6

    def _embed(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for feat, w in self._features(text):
            h = int.from_bytes(hashlib.md5(feat.encode()).digest()[:8], "little")
            vec[h % self.dim] += w if (h >> 63) & 1 else -w
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


class OpenAIEmbedder:
    def __init__(self, settings: Settings):
        from langchain_openai import OpenAIEmbeddings

        kwargs = {"model": settings.embedding_model, "api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        self._impl = OpenAIEmbeddings(**kwargs)
        self.id = f"openai-{settings.embedding_model}"

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._impl.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._impl.embed_query(text)


_cache: dict[str, Embedder] = {}


def get_embedder(settings: Settings | None = None) -> Embedder:
    settings = settings or get_settings()
    key = "hash" if settings.offline else f"openai:{settings.embedding_model}"
    if key not in _cache:
        _cache[key] = HashingEmbedder() if settings.offline else OpenAIEmbedder(settings)
    return _cache[key]
