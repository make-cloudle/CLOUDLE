"""World Bank What a Waste 국가별 CSV를 data/raw/에 적재한다 (CC BY 4.0).

데이터 카탈로그 API는 요청 제한(429)이 잦아 자동 다운로드가 실패할 수 있다.
그 경우 아래 페이지에서 country-level CSV를 직접 받아 경로에 저장한다.
  https://datacatalog.worldbank.org/search/dataset/0039597
  → backend/data/raw/what_a_waste_country.csv
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import httpx

DEST = Path(__file__).resolve().parents[1] / "data" / "raw" / "what_a_waste_country.csv"
VIEW = "https://datacatalogapi.worldbank.org/ddhxext/DatasetView?dataset_unique_id=0039597"


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    DEST.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        r = httpx.get(VIEW, timeout=30)
        if r.status_code == 429:
            print(f"요청 제한(429). {attempt + 1}/3, 60초 후 재시도")
            time.sleep(60)
            continue
        links = sorted(set(re.findall(r'https://[^"\s]+?country[^"\s]*?\.csv', r.text)))
        if not links:
            print("CSV 링크를 찾지 못했습니다. 위 안내대로 직접 내려받아 주세요.")
            return 1
        print("다운로드:", links[0])
        DEST.write_bytes(httpx.get(links[0], timeout=60, follow_redirects=True).content)
        print("저장:", DEST)
        return 0
    print("요청 제한이 계속됩니다. 위 안내대로 직접 내려받아 주세요.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
