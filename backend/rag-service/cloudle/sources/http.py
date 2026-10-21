"""외부 HTTP 호출 공통: 디스크 캐시(NF2002), 호출 간격·재시도·User-Agent(NF2006)."""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from collections import Counter
from urllib.parse import urlparse

import httpx

from cloudle.config import get_settings

log = logging.getLogger("cloudle.http")

CALL_COUNTER: Counter[str] = Counter()  # 호스트별 실제 네트워크 호출 수 (테스트·로그용)
_MIN_INTERVAL = 0.25  # 같은 호스트 연속 호출 최소 간격(초)
_last_call: dict[str, float] = {}
_lock = threading.Lock()


class ExternalAPIError(RuntimeError):
    """외부 API 실패. 사용자에게는 원인만 짧게 보여준다 (NF2004)."""


def _cache_path(namespace: str, key: str):
    d = get_settings().cache_dir / namespace
    d.mkdir(parents=True, exist_ok=True)
    return d / (hashlib.sha1(key.encode()).hexdigest() + ".json")


def cache_get(namespace: str, key: str, ttl: float | None):
    p = _cache_path(namespace, key)
    if not p.exists():
        return None
    if ttl is not None and time.time() - p.stat().st_mtime > ttl:
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def cache_put(namespace: str, key: str, value) -> None:
    _cache_path(namespace, key).write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def _throttle(host: str) -> None:
    with _lock:
        wait = _MIN_INTERVAL - (time.time() - _last_call.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last_call[host] = time.time()


def get_json(url: str, params: dict | None = None, *, namespace: str = "http",
             ttl: float | None = 86400, headers: dict | None = None, retries: int = 3):
    """GET → JSON. 같은 요청은 ttl 동안 캐시에서 돌려준다."""
    key = url + "?" + json.dumps(params or {}, sort_keys=True, ensure_ascii=False)
    cached = cache_get(namespace, key, ttl)
    if cached is not None:
        return cached

    s = get_settings()
    host = urlparse(url).netloc
    hdrs = {"User-Agent": s.wiki_user_agent, "Accept": "application/json", **(headers or {})}
    delay = 1.0
    last_err: Exception | None = None
    for attempt in range(retries):
        _throttle(host)
        try:
            CALL_COUNTER[host] += 1
            r = httpx.get(url, params=params, headers=hdrs, timeout=s.http_timeout,
                          follow_redirects=True)
            if r.status_code == 429 or r.status_code >= 500:
                retry_after = float(r.headers.get("Retry-After", delay))
                log.warning("%s %s → %s, %.1fs 후 재시도", host, url, r.status_code, retry_after)
                time.sleep(min(retry_after, 10))
                delay *= 2
                last_err = ExternalAPIError(f"{host} 응답 {r.status_code}")
                continue
            r.raise_for_status()
            data = r.json()
            cache_put(namespace, key, data)
            return data
        except (httpx.HTTPError, json.JSONDecodeError) as e:
            last_err = e
            log.warning("%s 호출 실패(%d/%d): %s", host, attempt + 1, retries, e)
            time.sleep(delay)
            delay *= 2
    raise ExternalAPIError(f"{host} 호출 실패") from last_err
