"""검증 리포트 생성: F2015(RAG 전/후) · F2014(유사도 vs MMR) · NF2001(응답 시간).

사용법: python scripts/compare_rag.py   →  docs/05-verification/RAG_COMPARISON.md
LLM 키가 없으면 'RAG 미사용' 답변은 생성할 수 없으므로 미실행으로 기록한다(값을 만들지 않음).
"""
from __future__ import annotations

import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend" / "rag-service"))

from cloudle.config import get_settings  # noqa: E402
from cloudle.data.items import get_item  # noqa: E402
from cloudle.rag import prompts  # noqa: E402
from cloudle.rag.llm import LLMUnavailable, call_text  # noqa: E402
from cloudle.rag.pipeline import Paper, analyze, ask  # noqa: E402
from cloudle.rag.retrieve import retrieve  # noqa: E402

QUESTIONS = [
    ("E001", "배터리가 내장된 무선 이어폰은 일반쓰레기로 버려도 되나요?"),
    ("E010", "부풀어 오른 보조배터리는 어떻게 버려야 하나요?"),
    ("H004", "깨지지 않은 형광등은 어디에 배출하나요?"),
    ("P001", "투명 페트병은 어떻게 분리배출하나요?"),
    ("E002", "중고로 스마트폰을 팔기 전에 무엇을 해야 하나요?"),
    ("G002", "소주병은 그냥 유리병으로 버리면 되나요?"),
]
OUT = ROOT / "docs" / "05-verification" / "RAG_COMPARISON.md"


def short(s: str, n: int = 220) -> str:
    s = " ".join(s.split()).replace("|", "/")
    return s if len(s) <= n else s[: n - 1] + "…"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    s = get_settings()
    rows, timing, mmr_rows = [], [], []
    for item_id, q in QUESTIONS:
        item = get_item(item_id)
        t0 = time.perf_counter()
        analyze(Paper(product_name=item.name("ko"), item_id=item_id, purpose="all"), "verify")
        cold = time.perf_counter() - t0
        t0 = time.perf_counter()
        analyze(Paper(product_name=item.name("ko"), item_id=item_id, purpose="all"), "verify")
        warm = time.perf_counter() - t0
        timing.append((item.name("ko"), cold, warm))

        rag = ask(item_id, q, "verify")
        a = rag["answer"]
        try:
            no_rag = call_text(prompts.NO_RAG_SYSTEM, q)
        except LLMUnavailable:
            no_rag = "미실행 — LLM 키 없음"
        rows.append((item.name("ko"), q, short(no_rag), short(a.get("answer", "")),
                     ", ".join(f"[{x['n']}] {x['title']}" for x in a["sources"]) or "없음"))

        sim = retrieve(item, q, top_k=4, use_mmr=False)
        mmr = retrieve(item, q, top_k=4, use_mmr=True)
        uniq = lambda ev: len({e.title for e in ev[1:]})  # noqa: E731
        mmr_rows.append((item.name("ko"), uniq(sim), uniq(mmr),
                         " / ".join(short(e.title, 30) for e in sim[1:]),
                         " / ".join(short(e.title, 30) for e in mmr[1:])))

    engine = "오프라인(규칙·발췌)" if s.offline else f"LLM {s.llm_model}"
    lines = [
        "# 🔬 RAG 검증 리포트",
        "",
        "[README](../../README.md) · [검증 결과](./VERIFICATION.md) · **RAG 비교**",
        "",
        f"생성일 {date.today()} · 생성 엔진: {engine} · 임베딩: {'해싱(오프라인)' if s.offline else s.embedding_model} · "
        f"`top_k={s.top_k}` `chunk_size={s.chunk_size}` · `scripts/compare_rag.py`로 재생성",
        "",
        "## 1. RAG 사용 전/후 (F2015)",
        "| 품목 | 질문 | RAG 미사용 | RAG 사용 | 인용 근거 |",
        "|---|---|---|---|---|",
        *[f"| {a} | {b} | {c} | {d} | {e} |" for a, b, c, d, e in rows],
        "",
        "## 2. 유사도 vs MMR (F2014, top_k=4)",
        "| 품목 | 서로 다른 문서 수 (유사도) | (MMR) | 유사도 결과 | MMR 결과 |",
        "|---|---|---|---|---|",
        *[f"| {a} | {b} | {c} | {d} | {e} |" for a, b, c, d, e in mmr_rows],
        "",
        "## 3. 응답 시간 (NF2001)",
        "| 품목 | 첫 분석 (수집 포함) | 재분석 (캐시) |",
        "|---|---|---|",
        *[f"| {a} | {b:.1f}s | {c:.2f}s |" for a, b, c in timing],
        "",
        "> 첫 분석은 위키백과 수집·색인 시간이 포함된다. 같은 검색어는 캐시되어 외부 호출 없이 응답한다(NF2002).",
    ]
    if s.offline:
        lines += ["", "> ⚠️ LLM 키가 없어 'RAG 미사용' 열은 실행하지 않았다. `.env`에 키를 넣고 다시 실행하면 채워진다."]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"저장: {OUT}")
    for name, cold, warm in timing:
        print(f"  {name}: {cold:.1f}s → {warm:.2f}s")


if __name__ == "__main__":
    main()
