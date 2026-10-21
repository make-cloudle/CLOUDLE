"""CLOUDLE FastAPI 서버 (Next.js 프론트엔드용).

실행: uvicorn cloudle.api.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import logging
import queue
import threading
from dataclasses import fields

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from cloudle.config import get_settings
from cloudle.data.items import CATEGORY_LABELS, item_index
from cloudle.rag.pipeline import Paper, UserFacingError, analyze
from cloudle.rag.store import evidence_collection, item_collection
from cloudle.sources.environment import briefing
from cloudle.sources.geo import get_country

log = logging.getLogger("cloudle.api")

app = FastAPI(title="CLOUDLE API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=get_settings().cors_origin_list, allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"],
)


@app.exception_handler(Exception)
async def hide_internal_errors(request: Request, exc: Exception):
    """스택트레이스·키를 사용자에게 노출하지 않는다 (NF2004)."""
    log.exception("처리되지 않은 오류: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"code": "internal", "message": "잠시 후 다시 시도해 주세요."})


@app.get("/api/health")
def health():
    s = get_settings()
    return {"ok": True, "offline": s.offline, "item_meta": item_collection().count(),
            "evidence_docs": evidence_collection().count()}


@app.get("/api/items")
def items():
    return {
        "categories": CATEGORY_LABELS,
        "items": [{"item_id": i.item_id, "names": i.names, "category": i.category,
                   "has_battery": i.has_battery, "recycling_category": i.recycling_category}
                  for i in item_index().values()],
    }


class AnalyzeBody(BaseModel):
    paper: dict


def _session(request: Request) -> str:
    sid = request.headers.get("X-Session-Id", "")
    return sid if sid.isalnum() and 8 <= len(sid) <= 64 else "anonymous"


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/analyze")
def analyze_endpoint(body: AnalyzeBody, request: Request):
    """종이 정보 → 분석. 수집·검색·생성 단계를 SSE 진행 이벤트로 보낸다 (F2012)."""
    sid = _session(request)
    allowed = {f.name for f in fields(Paper)}
    paper = Paper(**{k: v for k, v in body.paper.items() if k in allowed})
    q: queue.Queue = queue.Queue()

    def worker():
        try:
            res = analyze(paper, sid, emit=lambda k, d: q.put(("progress", {"step": k, **d})))
            q.put(("result", res))
        except UserFacingError as e:
            q.put(("error", {"code": e.code, "message": e.message, **e.extra}))
        except Exception:
            log.exception("분석 실패")
            q.put(("error", {"code": "internal", "message": "잠시 후 다시 시도해 주세요."}))
        finally:
            q.put(None)

    threading.Thread(target=worker, daemon=True).start()

    def stream():
        while (msg := q.get()) is not None:
            yield _sse(*msg)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/country/{iso3}")
def country(iso3: str, lang: str = "ko"):
    c = get_country(iso3)
    if not c:
        raise HTTPException(404, detail={"code": "unknown_country", "message": "국가를 찾을 수 없어요."})
    return briefing(c, lang if lang in ("ko", "en", "ja", "zh") else "ko")
