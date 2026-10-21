"""LLM 호출 (OpenAI 호환). 키가 없으면 호출하지 않는다."""
from __future__ import annotations

import json
import logging
import re
from functools import lru_cache

from cloudle.config import get_settings

log = logging.getLogger("cloudle.llm")


class LLMUnavailable(RuntimeError):
    """키 누락 또는 호출 실패. 호출부는 오프라인 경로로 대체한다."""


@lru_cache
def _model(model: str, base_url: str, api_key: str):
    from langchain_openai import ChatOpenAI

    kwargs = {"model": model, "api_key": api_key, "temperature": 0.1, "timeout": 60}
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)


def chat_model():
    s = get_settings()
    if s.offline:
        raise LLMUnavailable("OPENAI_API_KEY가 설정되지 않았습니다.")
    return _model(s.llm_model, s.openai_base_url, s.openai_api_key)


def _parse_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("JSON 객체가 없습니다.")
    return json.loads(m.group(0))


def call_json(system: str, user: str) -> dict:
    """프롬프트 → JSON dict. 형식 오류는 1회 재요청한다."""
    model = chat_model().bind(response_format={"type": "json_object"})
    messages = [("system", system), ("human", user)]
    for attempt in range(2):
        try:
            out = model.invoke(messages)
            return _parse_json(out.content)
        except ValueError as e:
            log.warning("LLM JSON 파싱 실패(%d): %s", attempt + 1, e)
            messages.append(("human", "직전 응답이 JSON 형식이 아닙니다. JSON 객체만 다시 출력하세요."))
        except Exception as e:  # 네트워크·인증 오류 등
            log.warning("LLM 호출 실패: %s", type(e).__name__)
            raise LLMUnavailable("LLM 호출에 실패했습니다.") from e
    raise LLMUnavailable("LLM 응답을 해석하지 못했습니다.")


def call_text(system: str, user: str) -> str:
    try:
        return chat_model().invoke([("system", system), ("human", user)]).content
    except LLMUnavailable:
        raise
    except Exception as e:
        raise LLMUnavailable("LLM 호출에 실패했습니다.") from e
