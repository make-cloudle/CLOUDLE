"""LLM 호출 (OpenAI 호환 · SSAFY GMS). 토큰 예산을 지키도록 최소한으로만 쓴다.

- 같은 프롬프트는 디스크 캐시로 응답해 토큰을 쓰지 않는다.
- 누적 사용량이 TOKEN_BUDGET에 닿으면 LLMUnavailable → 호출부는 오프라인(규칙·발췌)으로 대체.
- LLM_STAGES로 LLM을 쓸 단계를 고른다 (기본: 최종 답변 생성만).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
from functools import lru_cache

from cloudle.config import get_settings

log = logging.getLogger("cloudle.llm")
_lock = threading.Lock()


class LLMUnavailable(RuntimeError):
    """키 누락 · 예산 소진 · 호출 실패. 호출부는 오프라인 경로로 대체한다."""


# ── 토큰 예산 ────────────────────────────────────────────────────────
def _usage_path():
    return get_settings().storage_dir / "llm_usage.json"


def usage() -> dict:
    try:
        return json.loads(_usage_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"total_tokens": 0, "calls": 0, "cache_hits": 0}


def _record(tokens: int = 0, cache_hit: bool = False) -> None:
    with _lock:
        u = usage()
        u["total_tokens"] += tokens
        u["calls"] += 0 if cache_hit else 1
        u["cache_hits"] += 1 if cache_hit else 0
        _usage_path().write_text(json.dumps(u), encoding="utf-8")


def budget_left() -> int:
    return max(0, get_settings().token_budget - usage()["total_tokens"])


def stage_enabled(stage: str) -> bool:
    """stage: query(P1) | select(P2) | generate(P3) | vision"""
    s = get_settings()
    return not s.offline and stage in {x.strip() for x in s.llm_stages.split(",")}


# ── 호출 ─────────────────────────────────────────────────────────────
@lru_cache
def _model(model: str, base_url: str, api_key: str, max_tokens: int):
    from langchain_openai import ChatOpenAI

    kwargs = {"model": model, "api_key": api_key, "temperature": 0.1, "timeout": 60, "max_tokens": max_tokens}
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)


def chat_model():
    s = get_settings()
    if s.offline:
        raise LLMUnavailable("GMS_KEY가 설정되지 않았습니다.")
    if budget_left() <= s.llm_max_output_tokens * 2:
        raise LLMUnavailable("토큰 예산을 모두 사용했습니다.")
    return _model(s.llm_model, s.openai_base_url, s.openai_api_key, s.llm_max_output_tokens)


def _parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text.strip(), re.S)
    if not m:
        raise ValueError("JSON 객체가 없습니다.")
    return json.loads(m.group(0))


def _cache_file(system: str, user: str):
    s = get_settings()
    key = hashlib.sha256(f"{s.llm_model}\n{system}\n{user}".encode()).hexdigest()[:24]
    d = s.cache_dir / "llm"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{key}.json"


def call_json(system: str, user: str, stage: str = "generate") -> dict:
    """프롬프트 → JSON. 단계가 꺼져 있거나 예산이 없으면 LLMUnavailable."""
    if not stage_enabled(stage):
        raise LLMUnavailable(f"LLM 단계 '{stage}' 비활성")
    cache = _cache_file(system, user)
    if cache.exists():
        _record(cache_hit=True)
        return json.loads(cache.read_text(encoding="utf-8"))
    model = chat_model().bind(response_format={"type": "json_object"})
    try:
        out = model.invoke([("system", system), ("human", user)])
    except Exception as e:  # 네트워크·인증 오류 등
        log.warning("LLM 호출 실패: %s", type(e).__name__)
        raise LLMUnavailable("LLM 호출에 실패했습니다.") from e
    meta = getattr(out, "usage_metadata", None) or {}
    _record(int(meta.get("total_tokens") or (len(system) + len(user)) // 2))
    try:
        data = _parse_json(out.content)
    except (ValueError, json.JSONDecodeError) as e:
        raise LLMUnavailable("LLM 응답을 해석하지 못했습니다.") from e  # 재요청하지 않는다 (토큰 절약)
    cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def call_text(system: str, user: str, stage: str = "generate") -> str:
    data = call_json(system + "\nJSON {\"text\": \"...\"} 형식으로만 답하세요.", user, stage)
    return str(data.get("text", ""))
