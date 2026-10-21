"""비회원 세션 · 요청 제한 (C01, API 사용량 보호)."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from cloudle.config import get_settings
from cloudle.rag import uploads
from cloudle.rag.chat import chat_store


class SessionRegistry:
    """세션별 마지막 사용 시각. TTL이 지나면 대화·업로드 문서를 지운다."""

    def __init__(self):
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()
        self._last_purge = 0.0

    def touch(self, sid: str) -> None:
        with self._lock:
            self._seen[sid] = time.time()
        if time.time() - self._last_purge > 600:
            self.purge_expired()

    def purge_expired(self) -> int:
        ttl = get_settings().session_ttl_hours * 3600
        now = time.time()
        self._last_purge = now
        with self._lock:
            old = [s for s, t in self._seen.items() if now - t > ttl]
            for s in old:
                self._seen.pop(s, None)
        for s in old:
            forget(s)
        chat_store.purge_expired()
        return len(old)


def forget(sid: str) -> None:
    chat_store.clear(sid)
    uploads.purge_session(sid)


class RateLimiter:
    """세션·IP 각각 분당 요청 수를 제한하는 슬라이딩 윈도."""

    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, *keys: str, limit: int | None = None, window: float = 60.0) -> None:
        limit = limit or get_settings().rate_limit_per_min
        now = time.time()
        with self._lock:
            for key in keys:
                q = self._hits[key]
                while q and now - q[0] > window:
                    q.popleft()
                if len(q) >= limit:
                    raise HTTPException(429, detail={"code": "rate_limited",
                                                     "message": "요청이 너무 많아요. 잠시 후 다시 시도해 주세요."})
            for key in keys:
                self._hits[key].append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


registry = SessionRegistry()
limiter = RateLimiter()


def session_id(request: Request) -> str:
    sid = request.headers.get("X-Session-Id", "")
    if not (sid.isalnum() and 8 <= len(sid) <= 64):
        raise HTTPException(400, detail={"code": "no_session", "message": "세션 정보가 없어요. 새로고침해 주세요."})
    registry.touch(sid)
    return sid


def guarded_session(request: Request) -> str:
    """세션 확인 + 요청 제한. 비용이 드는 엔드포인트에 사용."""
    sid = session_id(request)
    ip = request.client.host if request.client else "unknown"
    limit = get_settings().rate_limit_per_min
    limiter.check(f"sid:{sid}", limit=limit)
    limiter.check(f"ip:{ip}", limit=limit * 3)  # 같은 IP를 여러 사람이 쓸 수 있어 여유를 둔다
    return sid
