# CLOUDLE RAG 엔진 (FastAPI + LangGraph + ChromaDB). 게이트웨이 뒤의 내부 서비스라 외부에 포트를 열지 않는다.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# 운영에는 과제용 UI(streamlit)와 테스트(pytest)가 필요 없다 → 이미지가 가벼워진다
COPY requirements.txt .
RUN grep -viE '^(streamlit|pytest)' requirements.txt > requirements.prod.txt \
 && pip install -r requirements.prod.txt

COPY cloudle ./cloudle
COPY data ./data
COPY scripts ./scripts
COPY docker-entrypoint.sh ./

# 색인·캐시·LLM 사용량은 볼륨(/app/storage)에 둔다 → 컨테이너를 다시 만들어도 토큰 사용량 기록이 유지된다
ENV STORAGE_DIR=/app/storage RATE_LIMIT_ENABLED=false
RUN useradd --create-home app && mkdir -p /app/storage && chown -R app:app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status==200 else 1)"
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
