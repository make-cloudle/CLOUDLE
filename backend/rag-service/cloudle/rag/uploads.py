"""사용자 업로드 문서 → 세션 전용 근거 (F2016). 세션 만료 시 삭제한다."""
from __future__ import annotations

import hashlib
import io

from cloudle.rag.indexing import Doc, index_documents
from cloudle.rag.store import evidence_collection

MAX_BYTES = 5 * 1024 * 1024
DOC_TYPES = {".txt", ".md", ".pdf"}
IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".webp"}


class UploadRejected(ValueError):
    pass


def _ext(name: str) -> str:
    return "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""


def extract_text(name: str, data: bytes) -> str:
    ext = _ext(name)
    if ext not in DOC_TYPES:
        raise UploadRejected("txt, md, pdf 문서만 올릴 수 있어요.")
    if len(data) > MAX_BYTES:
        raise UploadRejected("파일은 5MB 이하만 올릴 수 있어요.")
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((p.extract_text() or "") for p in reader.pages[:30])
    return data.decode("utf-8", errors="ignore")


def add_session_document(session_id: str, name: str, data: bytes) -> int:
    text = extract_text(name, data).strip()
    if len(text) < 20:
        raise UploadRejected("문서에서 읽을 수 있는 글자를 찾지 못했어요.")
    digest = hashlib.sha1(data).hexdigest()[:12]
    doc = Doc(source_id=f"upload-{digest}", title=f"업로드 문서: {name}", url="", text=text,
              source_type="user_upload", license="사용자 제공 (세션 내 사용)",
              item_id="general", session_id=session_id)
    return index_documents([doc])


def session_documents(session_id: str) -> list[str]:
    got = evidence_collection().get(where={"session_id": session_id}, include=["metadatas"])
    return sorted({m["title"] for m in got["metadatas"]})


def purge_session(session_id: str) -> None:
    if session_id and session_id != "public":
        evidence_collection().delete(where={"session_id": session_id})


def check_image(name: str, data: bytes) -> None:
    if _ext(name) not in IMAGE_TYPES:
        raise UploadRejected("png, jpg, webp 이미지만 올릴 수 있어요.")
    if len(data) > MAX_BYTES:
        raise UploadRejected("이미지는 5MB 이하만 올릴 수 있어요.")
