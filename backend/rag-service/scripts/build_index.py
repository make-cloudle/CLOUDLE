"""품목(RAG 1)과 기본 안내 문서(RAG 2)를 색인한다.

사용법:
    python scripts/build_index.py              # item_meta + 안내 문서
    python scripts/build_index.py --show 3     # 색인 텍스트 샘플 출력 (F2001 확인)
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cloudle.config import get_settings  # noqa: E402
from cloudle.data.items import load_items  # noqa: E402
from cloudle.rag.embeddings import get_embedder  # noqa: E402
from cloudle.rag.indexing import index_guides, index_items  # noqa: E402
from cloudle.rag.store import evidence_collection  # noqa: E402


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", type=int, default=0, help="색인 텍스트 샘플 개수")
    args = ap.parse_args()

    s = get_settings()
    print(f"모드: {'오프라인(해싱 임베딩)' if s.offline else 'OpenAI'} · 임베딩: {get_embedder().id}")
    items = load_items()
    print(f"품목 로드: {len(items)}건")
    for it in items[: args.show]:
        print("─" * 40 + f"\n{it.item_id}\n{it.search_text()}")

    t = time.perf_counter()
    n = index_items(items)
    print(f"item_meta 색인: {n}건 (품목 {len(items)}건과 일치: {n == len(items)})")
    c = index_guides()
    print(f"evidence_docs 안내 문서 청크 upsert: {c}건 · 컬렉션 총 {evidence_collection().count()}건")
    print(f"소요: {time.perf_counter() - t:.1f}s")


if __name__ == "__main__":
    main()
