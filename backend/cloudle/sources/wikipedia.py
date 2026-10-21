"""위키백과 MediaWiki API (CC BY-SA 4.0). 출처·라이선스를 결과에 표기한다."""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote

from cloudle.sources.http import get_json

LICENSE = "CC BY-SA 4.0 (Wikipedia)"
MAX_CHARS = 8000  # 문서 1건에서 색인할 최대 길이


@dataclass
class WikiCandidate:
    id: str
    pageid: int
    lang: str
    title: str
    snippet: str

    @property
    def url(self) -> str:
        return f"https://{self.lang}.wikipedia.org/wiki/{quote(self.title.replace(' ', '_'))}"


def _api(lang: str) -> str:
    return f"https://{lang}.wikipedia.org/w/api.php"


def _strip_html(s: str) -> str:
    import re

    return re.sub(r"<[^>]+>", "", s).replace("&quot;", '"').replace("&amp;", "&")


def search(query: str, lang: str = "ko", limit: int = 5) -> list[WikiCandidate]:
    data = get_json(_api(lang), {
        "action": "query", "list": "search", "srsearch": query, "srlimit": limit,
        "format": "json", "utf8": 1,
    }, namespace="wiki-search", ttl=7 * 86400)
    return [
        WikiCandidate(id=f"wiki-{lang}-{r['pageid']}", pageid=r["pageid"], lang=lang,
                      title=r["title"], snippet=_strip_html(r.get("snippet", "")))
        for r in data.get("query", {}).get("search", [])
    ]


def extract(pageid: int, lang: str = "ko") -> str:
    data = get_json(_api(lang), {
        "action": "query", "prop": "extracts", "explaintext": 1, "pageids": pageid,
        "format": "json", "utf8": 1,
    }, namespace="wiki-extract", ttl=30 * 86400)
    page = data.get("query", {}).get("pages", {}).get(str(pageid), {})
    return (page.get("extract") or "")[:MAX_CHARS]


def summary(title: str, lang: str = "en") -> dict | None:
    """REST 요약 (국가 환경 브리핑의 관련 자료용)."""
    try:
        data = get_json(
            f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{quote(title.replace(' ', '_'))}",
            namespace="wiki-summary", ttl=7 * 86400, retries=1,
        )
    except Exception:
        return None
    if data.get("type") == "disambiguation" or not data.get("extract"):
        return None
    return {
        "title": data.get("title"), "extract": data.get("extract"),
        "url": data.get("content_urls", {}).get("desktop", {}).get("page"),
        "license": LICENSE,
    }
