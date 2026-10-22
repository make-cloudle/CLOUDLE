#!/bin/sh
set -e
# 품목(152건)·안내 문서 색인은 upsert라 매번 돌려도 안전하고 몇 초면 끝난다 (해싱 임베딩, 모델 다운로드 없음)
python scripts/build_index.py
exec python -m uvicorn cloudle.api.main:app --host 0.0.0.0 --port 8000
