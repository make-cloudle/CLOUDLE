"""프론트엔드 지구본용 국가 GeoJSON(속성 축소)을 frontend/public에 내보낸다."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from cloudle.sources.geo import _iso  # noqa: E402

src = json.loads((ROOT / "backend/data/geo/countries.geojson").read_text(encoding="utf-8"))
features = []
for f in src["features"]:
    p = f["properties"]
    features.append({
        "type": "Feature",
        "properties": {
            "iso3": _iso(p, "ISO_A3", "ADM0_A3"), "iso2": _iso(p, "ISO_A2", "ISO_A2"),
            "ko": p.get("NAME_KO") or p["NAME"], "en": p.get("NAME_EN") or p["NAME"],
            "ja": p.get("NAME_JA") or p["NAME"], "zh": p.get("NAME_ZH") or p["NAME"],
            "lat": p.get("LABEL_Y"), "lng": p.get("LABEL_X"),
        },
        "geometry": f["geometry"],
    })
out = ROOT / "frontend/public/countries.geojson"
out.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                          ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(features)} countries → {out} ({out.stat().st_size // 1024} KB)")
