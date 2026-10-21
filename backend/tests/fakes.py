"""네트워크 없이 수집 파이프라인을 테스트하기 위한 가짜 위키백과."""
from cloudle.sources import wikipedia
from cloudle.sources.wikipedia import WikiCandidate

PAGES = {
    101: ("에어팟", "에어팟은 애플의 무선 이어폰이다. 배터리가 내장되어 있어 수리가 어렵고 교체 프로그램이 있다. "
                   "중고 거래 시 배터리 상태를 확인하는 것이 좋다. " * 6),
    102: ("에어 (밴드)", "에어는 프랑스의 음악 그룹이다. " * 10),
    103: ("리튬 이온 전지", "리튬 이온 전지는 충전식 전지이다. 파손되면 화재 위험이 있다. " * 8),
}


def install(monkeypatch, calls: list):
    def search(q, lang="ko", limit=4):
        calls.append(("search", q))
        return [WikiCandidate(id=f"wiki-ko-{pid}", pageid=pid, lang="ko", title=t, snippet=t)
                for pid, (t, _) in PAGES.items()]

    def extract(pageid, lang="ko"):
        calls.append(("extract", pageid))
        return PAGES[pageid][1]

    monkeypatch.setattr(wikipedia, "search", search)
    monkeypatch.setattr(wikipedia, "extract", extract)
