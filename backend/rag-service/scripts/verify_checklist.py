"""2회차 셀프·상호 체크리스트 자동 점검 (옆 교육생도 같은 명령으로 재현할 수 있다).

사용법 (rag-service 폴더에서, cmd + .venv):
    python scripts\\verify_checklist.py                # 결과를 화면과 docs/05-verification/evidence/ 에 기록

- 임시 저장소(STORAGE_DIR)에서 **오프라인(LLM 키 없음)** 으로 돌린다 → 내 색인·토큰 사용량·키를 건드리지 않는다.
- 위키백과 수집은 실제 네트워크를 쓴다. 네트워크가 안 되면 해당 항목은 '미확인'으로 기록한다(값을 만들지 않음).
- 결과는 evidence/results.json 과 항목별 텍스트 증빙(NN-*.txt)으로 남는다.
LLM이 필요한 F2015(RAG 미사용 답변)는 compare_rag.py가 따로 다룬다.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAG = HERE.parent
ROOT = RAG.parent.parent
EVID = ROOT / "docs" / "05-verification" / "evidence"

# ── 임시 저장소 + 오프라인 강제 (cloudle 모듈을 import하기 전에) ──────────────────
TMP = Path(tempfile.mkdtemp(prefix="cloudle-verify-"))
os.environ.update(STORAGE_DIR=str(TMP / "storage"), OPENAI_API_KEY="", GMS_KEY="", OPENAI_BASE_URL="")
sys.path.insert(0, str(RAG))

from cloudle.config import get_settings  # noqa: E402
from cloudle.data.items import get_item, load_items  # noqa: E402
from cloudle.rag import uploads  # noqa: E402
from cloudle.rag.chat import chat_store  # noqa: E402
from cloudle.rag.collect import ensure_evidence  # noqa: E402
from cloudle.rag.graph import build_graph  # noqa: E402
from cloudle.rag.indexing import chunk_doc, index_guides, index_items, load_guide_docs  # noqa: E402
from cloudle.rag.pipeline import Paper, UserFacingError, analyze, ask  # noqa: E402
from cloudle.rag.retrieve import retrieve  # noqa: E402
from cloudle.rag.search import _satisfies, condition_search, parse_conditions  # noqa: E402
from cloudle.rag.store import evidence_collection, item_collection  # noqa: E402
from cloudle.sources import http as http_mod  # noqa: E402

RESULTS: dict[int, dict] = {}


def save(name: str, lines: list[str]) -> str:
    EVID.mkdir(parents=True, exist_ok=True)
    (EVID / name).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return name


def rec(no: int, result: str, note: str, evidence: str = "", **extra) -> None:
    RESULTS[no] = {"result": result, "note": note, "evidence": evidence, **extra}
    mark = {"pass": "✅ 통과", "fail": "❌ 실패", "unchecked": "⚪ 미확인", "na": "➖ 해당없음"}[result]
    print(f"[{no:>2}] {mark}  {note}")


@contextlib.contextmanager
def env(**kv):
    old = {k: os.environ.get(k) for k in kv}
    os.environ.update({k: str(v) for k, v in kv.items()})
    get_settings.cache_clear()
    try:
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        get_settings.cache_clear()


def wiki_calls() -> int:
    return sum(v for k, v in http_mod.CALL_COUNTER.items() if "wikipedia" in k)


def reindex_guides() -> int:
    evidence_collection().delete(where={"source_type": "guide"})
    index_guides()
    return evidence_collection().count()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"임시 저장소: {TMP}\n오프라인(LLM 키 없음) · 임베딩 hash\n")

    # ── 1·2 데이터와 색인 ────────────────────────────────────────────────────────
    items = load_items()
    n_meta = index_items()
    sample = items[0].search_text()
    need = ["품목명:", "별칭:", "분류:", "재질:", "배터리 내장:", "유해·위험성:", "배출 분류:", "특성:", "처리 안내"]
    missing = [k for k in need if k not in sample]
    rec(1, "pass" if len(items) == n_meta and not missing else "fail",
        f"로드 {len(items)}건 = 색인 {n_meta}건, 색인 텍스트에 속성 {len(need) - len(missing)}/{len(need)}개 포함",
        save("01-items-index.txt", [f"로드한 품목 수: {len(items)}", f"item_meta 컬렉션 건수: {n_meta}", f"일치: {len(items) == n_meta}",
                                     "", "── 품목 1건의 색인 텍스트 ──", sample, "", f"누락된 속성: {missing or '없음'}"]))

    c1 = index_items()
    c2 = index_items()
    g_first = reindex_guides()
    g_again = (index_guides(), evidence_collection().count())[1]
    rec(2, "pass" if c1 == c2 == n_meta and g_first == g_again else "fail",
        f"품목 색인 {c1}→{c2}, 안내 문서 청크 {g_first}→{g_again} (재실행해도 늘지 않음)",
        save("02-idempotent.txt", [f"index_items() 1회: {c1}건", f"index_items() 2회: {c2}건",
                                    f"안내 문서 색인 후 청크 수: {g_first}", f"안내 문서 다시 색인 후 청크 수: {g_again}"]))

    # ── 5 청크 설정 ──────────────────────────────────────────────────────────────
    docs = load_guide_docs()
    default_n = sum(len(chunk_doc(d)) for d in docs)
    default_idx = reindex_guides()
    with env(CHUNK_SIZE=300, CHUNK_OVERLAP=60):
        small_n = sum(len(chunk_doc(d)) for d in docs)
        small_idx = reindex_guides()
    after_idx = reindex_guides()
    rec(5, "pass" if small_n > default_n and small_idx > default_idx and after_idx == default_idx else "fail",
        f"CHUNK_SIZE 1000→300: 청크 {default_n}→{small_n}, 색인 {default_idx}→{small_idx} (되돌리면 {after_idx})",
        save("05-chunk-size.txt", [f"안내 문서 {len(docs)}건(범위별 복제 포함)", f"기본값(size=1000, overlap=200): 청크 {default_n}, 색인 {default_idx}",
                                    f"변경(size=300, overlap=60): 청크 {small_n}, 색인 {small_idx}", f"설정 복원 후 색인: {after_idx}"]))

    # ── 3·4 수집 (P1 검색어 · P2 선별 · 캐시) ───────────────────────────────────
    item = get_item("E002")
    events: list[tuple[str, dict]] = []
    t0 = time.perf_counter()
    r1 = ensure_evidence(item, "중고로 팔기 전에 스마트폰은 무엇을 해야 하나요?", "대한민국", "disposal", lambda e, d: events.append((e, d)))
    cold = time.perf_counter() - t0
    calls_after_first = wiki_calls()
    t0 = time.perf_counter()
    r2 = ensure_evidence(item, "중고로 팔기 전에 스마트폰은 무엇을 해야 하나요?", "대한민국", "disposal")
    warm = time.perf_counter() - t0
    calls_second = wiki_calls() - calls_after_first
    net_ok = bool(r1.candidates)
    lines = [f"품목: {item.name('ko')}", f"검색어(P1, {r1.query_source}): {r1.queries}", "", f"후보 {len(r1.candidates)}건:"]
    lines += [f"  - {c['title']}  {c['url']}" for c in r1.candidates]
    lines += ["", f"선별(P2, {r1.select_source}) 채택 {len(r1.selected)}건: {r1.selected}", f"버려진 문서 {len(r1.rejected)}건:"]
    lines += [f"  - {x.get('id')}: {x.get('reason')}" for x in r1.rejected]
    lines += ["", f"색인된 청크: {r1.indexed_chunks}", f"오류: {r1.errors or '없음'}"]
    rec(3, "pass" if net_ok and r1.queries and r1.selected else ("unchecked" if not net_ok else "fail"),
        f"검색어 {len(r1.queries)}개, 후보 {len(r1.candidates)}건 중 채택 {len(r1.selected)}건·버림 {len(r1.rejected)}건" if net_ok
        else "위키백과에 연결하지 못해 확인하지 못함(네트워크)", save("03-collect-p1-p2.txt", lines))
    rec(4, "pass" if net_ok and calls_second == 0 and r2.indexed_chunks == 0 and r2.cache_hits >= len(r2.queries) else ("unchecked" if not net_ok else "fail"),
        f"같은 질문 2회차: 외부 호출 {calls_second}회, 새 색인 {r2.indexed_chunks}청크, 캐시 적중 {r2.cache_hits}/{len(r2.queries)}, {cold:.2f}s→{warm:.2f}s",
        save("04-collect-cache.txt", [f"1회차: {cold:.2f}s, 위키백과 호출 누적 {calls_after_first}회, 색인 {r1.indexed_chunks}청크",
                                       f"2회차: {warm:.2f}s, 추가 위키백과 호출 {calls_second}회, 색인 {r2.indexed_chunks}청크, 캐시 적중 {r2.cache_hits}/{len(r2.queries)}"]))

    # ── 6 Top-k ─────────────────────────────────────────────────────────────────
    q = "중고로 팔기 전에 스마트폰은 무엇을 해야 하나요?"
    with env(TOP_K=2):
        a = retrieve(item, q)
    with env(TOP_K=6):
        b = retrieve(item, q)
    rec(6, "pass" if len(a) != len(b) and {e.chunk_id for e in a} != {e.chunk_id for e in b} else "fail",
        f"TOP_K 2→6: 근거 {len(a)}건→{len(b)}건",
        save("06-top-k.txt", [f"TOP_K=2 ({len(a)}건)"] + [f"  [{e.n}] {e.kind} · {e.title}" for e in a]
             + [f"TOP_K=6 ({len(b)}건)"] + [f"  [{e.n}] {e.kind} · {e.title}" for e in b]))

    # ── 7 그래프 ────────────────────────────────────────────────────────────────
    nodes = sorted(k for k in build_graph().get_graph().nodes if not k.startswith("__"))
    rec(7, "pass" if nodes == ["generate", "retrieve"] else "fail", f"LangGraph 노드: {nodes} (START→retrieve→generate→END)",
        save("07-graph.txt", ["노드: " + ", ".join(nodes), "", build_graph().get_graph().draw_mermaid()]))

    # ── 8·12·19 분석 결과: 근거 번호·출처 종류·특화 기능 ─────────────────────────────
    res = analyze(Paper(product_name=item.name("ko"), item_id=item.item_id, purpose="all"), "verify", collect=False)
    ans, ev = res["answer"], res["evidence"]
    cited_in_text = {int(n) for k, v in ans.items() if isinstance(v, str) for n in re.findall(r"\[근거\s*(\d+)\]", v)}
    cited_in_text |= {int(n) for v in ans.values() if isinstance(v, list) for x in v if isinstance(x, str) for n in re.findall(r"\[근거\s*(\d+)\]", x)}
    src_ns = {s["n"] for s in ans["sources"]}
    ev_ns = {e["n"] for e in ev}
    kinds = sorted({e["kind_label"] for e in ev})
    ok8 = cited_in_text == src_ns == set(ans["citations"]) and src_ns <= ev_ns and "품목 메타데이터" in kinds
    rec(8, "pass" if ok8 else "fail",
        f"본문 인용 {sorted(cited_in_text)} = 근거 목록 {sorted(src_ns)}, 구분: {kinds}",
        save("08-citations.txt", [f"본문에서 인용한 번호: {sorted(cited_in_text)}", f"답변의 citations: {ans['citations']}", f"근거 목록 번호: {sorted(src_ns)}", f"전체 후보 근거 번호: {sorted(ev_ns)}", ""]
             + [f"[{e['n']}] ({e['kind_label']}) {e['title']}  {e['license']}" for e in ev]))
    sections = {k: ans.get(k, "") for k in ("summary", "basic_info", "reuse", "repair", "disposal")}
    has_cite = {k: bool(re.search(r"\[근거\s*\d+\]", v)) or "확인할 수 없음" in v for k, v in sections.items()}
    rec(12, "pass" if all(has_cite.values()) and ans.get("next_actions") else "fail",
        "수리·재사용·분리배출·다음 선택 각 항목에 근거 번호 또는 '확인할 수 없음' 표시",
        save("12-domain-feature.txt", [f"{k}: {v}" for k, v in sections.items()] + ["next_actions:"] + [f"  - {x}" for x in ans.get("next_actions", [])]
             + ["", f"항목별 근거 표시: {has_cite}"]))

    # 업로드 문서까지 4종류 출처가 구분되는지
    note = ("스마트폰은 초기화한 뒤 통신사 회수 프로그램이나 소형가전 수거함에 맡긴다. " * 4).encode()
    uploads.add_session_document("verify-up", "내-메모.txt", note)
    with env(TOP_K=8):
        mixed = retrieve(item, "스마트폰은 초기화한 뒤 통신사 회수 프로그램이나 소형가전 수거함에 맡긴다", "verify-up")
    kinds_all = {e.kind: e.to_dict()["kind_label"] for e in mixed}
    rec(19, "pass" if {"item_meta", "guide", "user_upload"} <= set(kinds_all) else "fail",
        f"출처 종류 구분: {sorted(kinds_all.values())} (위키백과는 3번 수집 결과에 포함)",
        save("19-source-kinds.txt", [f"[{e.n}] kind={e.kind} → 표시 '{e.to_dict()['kind_label']}' · {e.title}" for e in mixed]))
    uploads.purge_session("verify-up")

    # ── 9 근거 없는 질문 ────────────────────────────────────────────────────────
    r_out = ask("E002", "달 탐사선의 연료 비용은 얼마인가요?", "verify-9")
    ao = r_out["answer"]
    ok9 = ao.get("answer") == "확인할 수 없음" and not ao["citations"]
    rec(9, "pass" if ok9 else "fail", f"색인에 없는 질문 → 답변 '{ao.get('answer')}', 인용 {ao['citations']} (화면 안내는 UI 점검에서 확인)",
        save("09-unanswerable.txt", [f"질문: 달 탐사선의 연료 비용은 얼마인가요?", f"답변: {ao.get('answer')}", f"인용 번호: {ao['citations']}", f"불확실한 점: {ao.get('uncertainties')}"]))

    # ── 10 항목 전환 시 대화 분리 ───────────────────────────────────────────────
    ask("E001", "무선 이어폰 배터리는 어떻게 버려요?", "verify-10")
    ask("G002", "소주병은 어디에 버려요?", "verify-10")
    ha, hb = chat_store.history("verify-10", "E001"), chat_store.history("verify-10", "G002")
    mix = [m for m in ha if "소주" in m["content"]] + [m for m in hb if "이어폰" in m["content"] and m["role"] == "user"]
    rec(10, "pass" if ha and hb and not mix else "fail", f"E001 기록 {len(ha)}건, G002 기록 {len(hb)}건, 섞인 메시지 {len(mix)}건",
        save("10-chat-isolation.txt", ["[E001 무선 이어폰]"] + [f"  {m['role']}: {m['content'][:80]}" for m in ha] + ["[G002 소주병·맥주병]"] + [f"  {m['role']}: {m['content'][:80]}" for m in hb]))

    # ── 11 조건 기반 탐색 ───────────────────────────────────────────────────────
    lines, bad = [], 0
    for text in ("배터리가 내장된 소형 전자제품", "대형 가구", "유리 소재"):
        out = condition_search(text, limit=30)
        cond = parse_conditions(text)
        wrong = [i["item_id"] for i in out["items"] if not _satisfies(get_item(i["item_id"]), cond)]
        bad += len(wrong)
        lines += [f"조건: {text}  → 해석 {out['conditions']}  결과 {len(out['items'])}건  조건 불일치 {wrong or '없음'}"]
        lines += [f"    {i['item_id']} {i['names']['ko']} / {i['recycling_category']} / 배터리={i['has_battery']}" for i in out["items"][:8]]
    rec(11, "pass" if bad == 0 else "fail", f"조건 3개 검색, 조건과 맞지 않는 항목 {bad}건", save("11-condition-search.txt", lines))

    # ── 13 진행 상태 · 색인 없음 · 키 없음 ──────────────────────────────────────
    order = [e for e, _ in events] + ["retrieve"]
    prog: list[str] = []
    analyze(Paper(product_name="스마트폰", item_id="E002", purpose="disposal"), "verify-13", lambda e, d: prog.append(e))
    expected = ["item", "extract", "extract_done", "collect", "collect_done", "select", "select_done", "index", "index_done", "retrieve", "generate_done"]
    empty = TMP / "empty-storage"
    code = (f"import sys; sys.path.insert(0, r'{RAG}')\n"
            "from cloudle.rag.pipeline import Paper, analyze, UserFacingError\n"
            "try:\n analyze(Paper(product_name='스마트폰', item_id='E002'), 'x', collect=False)\n"
            "except UserFacingError as e:\n print(e.code, '|', e.message)\n")
    sub = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, encoding="utf-8",
                         env={**os.environ, "STORAGE_DIR": str(empty), "PYTHONIOENCODING": "utf-8"}).stdout.strip()
    offline_flag = res["offline"] and res["engine"] == "offline"
    ok13 = prog == expected and sub.startswith("index_missing") and offline_flag
    rec(13, "pass" if ok13 else "fail", f"진행 이벤트 {len(prog)}단계 순서 일치, 색인 없음 → '{sub}', 키 없음 → offline={res['offline']}(화면 안내는 UI 점검)",
        save("13-progress-errors.txt", [f"진행 이벤트(서버가 실제로 보낸 것): {prog}", f"기대 순서: {expected}", f"일치: {prog == expected}", "",
                                         f"색인이 없는 저장소로 실행 → {sub}", f"키가 없는 실행 → offline={res['offline']}, engine={res['engine']}"]))
    rec(14, "na", "환경·분리배출 도메인이라 건강·금융 면책 대상이 아님 (배터리·유해물은 안전 안내 `safety`가 별도로 표시됨 — UI 점검 참고)", "")

    # ── 16 유사도 vs MMR ────────────────────────────────────────────────────────
    sim = retrieve(item, q, top_k=4, use_mmr=False)
    mmr = retrieve(item, q, top_k=4, use_mmr=True)
    same = [e.chunk_id for e in sim] == [e.chunk_id for e in mmr]
    rec(16, "pass", f"유사도 {len(sim)}건·MMR {len(mmr)}건 나란히 기록 (이 질문에서는 {'동일' if same else '순서·구성이 다름'})",
        save("16-similarity-vs-mmr.txt", ["유사도"] + [f"  [{e.n}] {e.title} score={e.score}" for e in sim] + ["MMR"] + [f"  [{e.n}] {e.title} score={e.score}" for e in mmr]))

    # ── 20 처리 시간 ────────────────────────────────────────────────────────────
    rows = []
    for iid in ("P001", "G002", "H004"):
        it = get_item(iid)
        a1 = analyze(Paper(product_name=it.name("ko"), item_id=iid, purpose="all"), "verify-20")
        a2 = analyze(Paper(product_name=it.name("ko"), item_id=iid, purpose="all"), "verify-20")
        rows.append((it.name("ko"), a1["timings"]["total"], a2["timings"]["total"]))
    worst = max(r[1] for r in rows)
    rec(20, "pass" if worst < 15 else "fail", "첫 분석 " + ", ".join(f"{n} {a}s" for n, a, _ in rows) + " / 재분석 " + ", ".join(f"{b}s" for *_, b in rows)
        + " (오프라인·위키백과 수집 포함, LLM 시간은 미포함)", save("20-timings.txt", [f"{n}: 첫 분석 {a}s → 재분석 {b}s" for n, a, b in rows]))

    # ── 21 키 · 오류 노출 ───────────────────────────────────────────────────────
    git = lambda *a: subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, encoding="utf-8").stdout  # noqa: E731
    pattern = r"(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|glpat-[A-Za-z0-9_-]{15,}|(OPENAI_API_KEY|GMS_KEY|OPENAQ_API_KEY)=[A-Za-z0-9_-]{8,})"
    hits = git("grep", "-nIE", pattern, "HEAD", "--", ".").strip().splitlines()
    tracked_env = [f for f in git("ls-files").splitlines() if re.search(r"(^|/)\.env($|\.local)", f)]
    from fastapi.testclient import TestClient
    from cloudle.api.main import app
    client = TestClient(app, raise_server_exceptions=False)
    h = {"X-Session-Id": "verifysession123"}
    probes = {"알 수 없는 품목 채팅": client.post("/api/chat", headers=h, json={"item_id": "ZZZ", "question": "?"}),
              "빈 종이 분석": client.post("/api/analyze", headers=h, json={"paper": {"product_name": ""}})}
    leaks = [name for name, r in probes.items() if re.search(r"Traceback|File \"|sk-|gms_key", r.text, re.I)]
    rec(21, "pass" if not hits and not tracked_env and not leaks else "fail",
        f"저장소(HEAD 전체)에서 키 패턴 {len(hits)}건, 추적 중인 .env 파일 {len(tracked_env)}개, 오류 응답의 내부 정보 노출 {len(leaks)}건",
        save("21-secrets-errors.txt", [f"git grep 키 패턴 일치(값 제외): {len(hits)}건", f"추적 중인 .env/.env.local: {tracked_env or '없음'}", ""]
             + [f"{n}: HTTP {r.status_code} → {r.text[:160]}" for n, r in probes.items()] + [f"내부 정보 노출: {leaks or '없음'}"]))

    # ── 22 모듈 분리 ────────────────────────────────────────────────────────────
    mods = {"수집": "cloudle/rag/collect.py", "색인": "cloudle/rag/indexing.py", "검색": "cloudle/rag/retrieve.py",
            "생성(LangGraph)": "cloudle/rag/graph.py", "UI(Streamlit)": "streamlit_app.py", "UI(Next.js)": "../../frontend/src/app/bin/page.tsx",
            "API": "cloudle/api/main.py", "외부 출처": "cloudle/sources/", "프롬프트": "cloudle/rag/prompts.py", "LLM·예산": "cloudle/rag/llm.py"}
    miss = [k for k, v in mods.items() if not (RAG / v).exists()]
    rec(22, "pass" if not miss else "fail", f"수집·색인·검색·생성·UI가 파일로 분리됨 (없는 것: {miss or '없음'})",
        save("22-modules.txt", [f"{k:<16} {v}  {'있음' if (RAG / v).exists() else '없음'}" for k, v in mods.items()]))

    # ── 23 외부 호출 예의 ───────────────────────────────────────────────────────
    ua = get_settings().wiki_user_agent
    stamps = []
    for _ in range(4):
        http_mod._throttle("verify.test")
        stamps.append(time.time())
    gaps = [round(b - a, 2) for a, b in zip(stamps, stamps[1:])]
    src = (RAG / "cloudle/sources/http.py").read_text(encoding="utf-8")
    ok23 = min(gaps) >= 0.24 and "retries" in src and "429" in src and "Retry-After" in src and "http" in ua and "CLOUDLE" in ua
    rec(23, "pass" if ok23 else "fail", f"호출 간격 {gaps}초(≥0.25), 429·5xx 재시도(지수 백오프·Retry-After), User-Agent='{ua}'",
        save("23-http-etiquette.txt", [f"User-Agent: {ua}", f"연속 호출 간격(초): {gaps}", "재시도: 최대 3회, 지연 1→2→4초, 429/5xx에서 Retry-After 존중", "같은 요청은 디스크 캐시(NF2002)"]))

    # ── 24~27 제출물 ───────────────────────────────────────────────────────────
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    rec(24, "pass" if all(k in readme for k in ("출처", "CC BY", "World Bank")) else "fail", "README에 사용 데이터의 출처·이용 조건이 있는지",
        save("24-readme-sources.txt", [f"README에 '출처' 포함: {'출처' in readme}", f"'CC BY' 포함: {'CC BY' in readme}", f"'World Bank' 포함: {'World Bank' in readme}"]))
    need_docs = {"요구사항 정의서": "docs/02-requirements/SRS.md", "RAG 파이프라인 설계문서": "docs/03-design/RAG_PIPELINE.md", "README": "README.md",
                 "요구사항 대조표": "docs/02-requirements/TRACEABILITY.md", "테스트 결과표": "docs/05-verification/VERIFICATION.md",
                 "RAG 비교 문서": "docs/05-verification/RAG_COMPARISON.md", "데이터 출처": "docs/04-data/DATA_SOURCES.md"}
    miss = [k for k, v in need_docs.items() if not (ROOT / v).exists()]
    rec(27, "pass" if not miss else "fail", f"제출 문서 {len(need_docs) - len(miss)}/{len(need_docs)} 존재 (셀프 체크리스트는 CHECKLIST.md로 별도)",
        save("27-deliverables.txt", [f"{k:<22} {v}  {'있음' if (ROOT / v).exists() else '없음'}" for k, v in need_docs.items()]))

    (EVID / "results.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding="utf-8")
    cnt = {k: sum(1 for v in RESULTS.values() if v["result"] == k) for k in ("pass", "fail", "unchecked", "na")}
    print(f"\n요약: {cnt}  (증빙 폴더: {EVID})")


if __name__ == "__main__":
    main()
