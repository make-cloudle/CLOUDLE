"""CLOUDLE FastAPI 서버 (Next.js 프론트엔드용).

실행: uvicorn cloudle.api.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import logging
import queue
import threading
from dataclasses import fields

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from cloudle.api.session import forget, guarded_session, session_id
from cloudle.config import get_settings
from cloudle.data.items import CATEGORY_LABELS, item_index
from cloudle.rag import uploads, vision
from cloudle.rag.chat import chat_store
from cloudle.rag.country import ask_country
from cloudle.rag.factcheck import factcheck
from cloudle.rag.pipeline import Paper, UserFacingError, analyze, ask
from cloudle.rag.search import condition_search
from cloudle.rag.store import evidence_collection, item_collection
from cloudle.sources.environment import INDICATORS, briefing, global_sos, wb_series
from cloudle.sources.geo import get_country

log = logging.getLogger("cloudle.api")
LANGS = ("ko", "en", "ja", "zh")

app = FastAPI(title="CLOUDLE API", version="0.2.0")
app.add_middleware(
    CORSMiddleware, allow_origins=get_settings().cors_origin_list, allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"],
)


@app.exception_handler(Exception)
async def hide_internal_errors(request: Request, exc: Exception):
    """스택트레이스·키를 사용자에게 노출하지 않는다 (NF2004)."""
    log.exception("처리되지 않은 오류: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"code": "internal", "message": "잠시 후 다시 시도해 주세요."})


def _user_error(e: UserFacingError, status: int = 422) -> HTTPException:
    return HTTPException(status, detail={"code": e.code, "message": e.message, **e.extra})


def _lang(v: str) -> str:
    return v if v in LANGS else "ko"


# ── 조회 ─────────────────────────────────────────────────────────────
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


@app.get("/api/country/{iso3}")
def country(iso3: str, lang: str = "ko", detail: bool = False):
    c = get_country(iso3)
    if not c:
        raise HTTPException(404, detail={"code": "unknown_country", "message": "국가를 찾을 수 없어요."})
    return briefing(c, _lang(lang), detail)


@app.get("/api/sos")
def sos():
    """Earth SOS: 전 세계 PM2.5 연평균 + 최근 30일 자연현상."""
    return global_sos()


@app.get("/api/country/{iso3}/series")
def country_series(iso3: str, indicator: str = "pm25"):
    """Time Machine: 연도별 지표 변화."""
    if not get_country(iso3) or indicator not in INDICATORS:
        raise HTTPException(404, detail={"code": "not_found", "message": "지표를 찾을 수 없어요."})
    return wb_series(iso3, indicator)


class FactBody(BaseModel):
    claim: str = Field(min_length=4, max_length=300)
    lang: str = "ko"


@app.post("/api/factcheck")
def fact(body: FactBody, sid: str = Depends(guarded_session)):
    """Eco Detective: 환경 주장 → 문서 수집 → 근거 기반 판정."""
    return factcheck(body.claim, _lang(body.lang))


class CountryAskBody(BaseModel):
    topic: str = Field(pattern="^(air|waste|help)$")
    lang: str = "ko"


@app.post("/api/country/{iso3}/ask")
def country_ask(iso3: str, body: CountryAskBody, sid: str = Depends(guarded_session)):
    """질문 칩 → 국가 관련 문서 수집·검색 → 근거 번호가 달린 답변."""
    c = get_country(iso3)
    if not c:
        raise HTTPException(404, detail={"code": "unknown_country", "message": "국가를 찾을 수 없어요."})
    return ask_country(c, body.topic, _lang(body.lang))


# ── 분석 (SSE) ───────────────────────────────────────────────────────
class AnalyzeBody(BaseModel):
    paper: dict


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/analyze")
def analyze_endpoint(body: AnalyzeBody, sid: str = Depends(guarded_session)):
    """종이 정보 → 분석. 수집·검색·생성 단계를 SSE 진행 이벤트로 보낸다 (F2012)."""
    allowed = {f.name for f in fields(Paper)}
    paper = Paper(**{k: v for k, v in body.paper.items() if k in allowed})
    paper.lang = _lang(paper.lang)
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


# ── 후속 질문 (F2009) ────────────────────────────────────────────────
class ChatBody(BaseModel):
    item_id: str
    question: str = Field(max_length=1000)
    lang: str = "ko"


@app.post("/api/chat")
def chat(body: ChatBody, sid: str = Depends(guarded_session)):
    try:
        return ask(body.item_id, body.question, sid, _lang(body.lang))
    except UserFacingError as e:
        raise _user_error(e) from e


@app.get("/api/chat/{item_id}")
def chat_history(item_id: str, sid: str = Depends(session_id)):
    return {"history": chat_store.history(sid, item_id)}


# ── 업로드 · 사진 인식 ───────────────────────────────────────────────
async def _read_limited(file: UploadFile) -> bytes:
    data = await file.read(uploads.MAX_BYTES + 1)
    if len(data) > uploads.MAX_BYTES:
        raise HTTPException(413, detail={"code": "too_large", "message": "파일은 5MB 이하만 올릴 수 있어요."})
    return data


@app.post("/api/upload")
async def upload_doc(file: UploadFile = File(...), sid: str = Depends(guarded_session)):
    """문서는 이 세션의 근거로만 쓰이고 세션 만료 시 삭제된다."""
    data = await _read_limited(file)
    try:
        n = uploads.add_session_document(sid, file.filename or "document.txt", data)
    except uploads.UploadRejected as e:
        raise HTTPException(415, detail={"code": "rejected", "message": str(e)}) from e
    return {"name": file.filename, "chunks": n}


@app.post("/api/vision")
async def vision_identify(file: UploadFile = File(...), sid: str = Depends(guarded_session)):
    """이미지는 저장하지 않고 인식 호출에만 사용한다."""
    data = await _read_limited(file)
    try:
        uploads.check_image(file.filename or "image.jpg", data)
    except uploads.UploadRejected as e:
        raise HTTPException(415, detail={"code": "rejected", "message": str(e)}) from e
    return vision.identify(data, file.content_type or "image/jpeg")


# ── 조건 탐색 (F2011) ────────────────────────────────────────────────
class SearchBody(BaseModel):
    query: str = Field(min_length=1, max_length=300)


@app.post("/api/search")
def search(body: SearchBody, sid: str = Depends(guarded_session)):
    return condition_search(body.query)


@app.delete("/api/session")
def delete_session(sid: str = Depends(session_id)):
    """사용자가 원하면 대화·업로드를 즉시 지운다."""
    forget(sid)
    return {"ok": True}
