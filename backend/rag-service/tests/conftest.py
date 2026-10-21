import pytest

from cloudle.config import get_settings
from cloudle.rag import embeddings, store


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path, monkeypatch):
    """테스트마다 임시 저장소 + 오프라인 모드로 실행한다 (외부 키·네트워크 불필요)."""
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    get_settings.cache_clear()
    store.reset_client_cache()
    embeddings._cache.clear()
    yield
    get_settings.cache_clear()
    store.reset_client_cache()
