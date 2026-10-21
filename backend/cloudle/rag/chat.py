"""품목별 대화 기록 (F2009). (세션, 품목) 단위로 분리해 다른 물건과 섞이지 않는다."""
from __future__ import annotations

import threading
import time

from cloudle.config import get_settings


class ChatStore:
    def __init__(self):
        self._data: dict[tuple[str, str], list[dict]] = {}
        self._touched: dict[tuple[str, str], float] = {}
        self._lock = threading.Lock()

    def history(self, session_id: str, item_id: str) -> list[dict]:
        with self._lock:
            return list(self._data.get((session_id, item_id), []))

    def append(self, session_id: str, item_id: str, role: str, content: str, **extra) -> None:
        with self._lock:
            key = (session_id, item_id)
            self._data.setdefault(key, []).append({"role": role, "content": content, **extra})
            self._touched[key] = time.time()

    def clear(self, session_id: str, item_id: str | None = None) -> None:
        with self._lock:
            for key in [k for k in self._data if k[0] == session_id and (item_id is None or k[1] == item_id)]:
                self._data.pop(key, None)
                self._touched.pop(key, None)

    def purge_expired(self) -> int:
        """세션 TTL이 지난 대화는 삭제한다 (개인정보 최소 보관)."""
        ttl = get_settings().session_ttl_hours * 3600
        now = time.time()
        with self._lock:
            old = [k for k, t in self._touched.items() if now - t > ttl]
            for k in old:
                self._data.pop(k, None)
                self._touched.pop(k, None)
        return len(old)


chat_store = ChatStore()
