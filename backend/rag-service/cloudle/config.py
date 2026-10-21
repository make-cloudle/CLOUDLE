"""환경변수 기반 설정. API 키는 코드에 두지 않는다 (NF2003)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

GMS_BASE_URL = "https://gms.ssafy.io/gmsapi/api.openai.com/v1"
BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env.local", BACKEND_DIR / ".env", BACKEND_DIR / ".env.local"), env_file_encoding="utf-8", extra="ignore"
    )

    gms_key: str = ""  # SSAFY GMS 키 (OpenAI 호환 프록시)
    openai_api_key: str = ""
    openai_base_url: str = ""
    llm_model: str = "gpt-4o-mini"  # GMS 경유, 저비용·RAG 지시 준수
    embedding_model: str = "text-embedding-3-small"
    embedding_provider: str = "local"  # local(내장, 토큰 0) | openai
    llm_stages: str = "generate"  # LLM을 쓸 단계: query,select,generate,vision
    token_budget: int = 70000  # 누적 토큰 상한. 넘으면 오프라인 모드
    llm_max_output_tokens: int = 450
    evidence_chars: int = 600  # 프롬프트에 넣는 근거 1건의 최대 길이

    chunk_size: int = 1000
    chunk_overlap: int = 200
    top_k: int = 4
    use_mmr: bool = False
    mmr_fetch_k: int = 20
    mmr_lambda: float = 0.5

    openaq_api_key: str = ""
    wiki_user_agent: str = "CLOUDLE/0.2 (https://lab.ssafy.com/s16/a11/ai_day/CLOUDLE; SSAFY education project)"
    http_timeout: float = 12.0

    rate_limit_per_min: int = 20
    rate_limit_enabled: bool = True  # 게이트웨이 뒤에서 내부 서비스로 돌 때는 false
    session_ttl_hours: int = 24
    cors_origins: str = "http://localhost:3000"

    data_dir: Path = BACKEND_DIR / "data"
    storage_dir: Path = BACKEND_DIR / "storage"

    @model_validator(mode="after")
    def _use_gms(self):
        """GMS_KEY가 있으면 SSAFY GMS(OpenAI 호환) 엔드포인트로 LLM·임베딩을 호출한다."""
        if self.gms_key and not self.openai_api_key:
            self.openai_api_key = self.gms_key
        # OpenAI 키(sk-)가 아니면 SSAFY GMS 키로 보고 GMS 엔드포인트를 쓴다
        key = self.openai_api_key.strip()
        if key and not key.startswith("sk-") and not self.openai_base_url:
            self.openai_base_url = GMS_BASE_URL
        return self

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
