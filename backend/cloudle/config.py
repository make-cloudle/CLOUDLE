"""환경변수 기반 설정. API 키는 코드에 두지 않는다 (NF2003)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env",), env_file_encoding="utf-8", extra="ignore"
    )

    openai_api_key: str = ""
    openai_base_url: str = ""
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"

    chunk_size: int = 1000
    chunk_overlap: int = 200
    top_k: int = 5
    use_mmr: bool = False
    mmr_fetch_k: int = 20
    mmr_lambda: float = 0.5

    openaq_api_key: str = ""
    wiki_user_agent: str = "CLOUDLE/0.1 (SSAFY AI core project)"
    http_timeout: float = 12.0

    rate_limit_per_min: int = 20
    session_ttl_hours: int = 24
    cors_origins: str = "http://localhost:3000"

    data_dir: Path = BACKEND_DIR / "data"
    storage_dir: Path = BACKEND_DIR / "storage"

    @property
    def offline(self) -> bool:
        """LLM 키가 없으면 규칙 기반 오프라인 모드로 동작한다."""
        return not self.openai_api_key.strip()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cache_dir(self) -> Path:
        return self.storage_dir / "cache"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.storage_dir.mkdir(parents=True, exist_ok=True)
    s.cache_dir.mkdir(parents=True, exist_ok=True)
    return s
