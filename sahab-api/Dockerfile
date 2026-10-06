FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1

# libgomp is needed by XGBoost
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# xgboost-cpu is the same `xgboost` module without the GPU libraries (hundreds of MB that a CPU server
# never uses). The pip cache is kept between builds, and slow connections get long timeouts and retries.
RUN --mount=type=cache,target=/root/.cache/pip     sed -i 's/^xgboost==/xgboost-cpu==/' requirements.txt &&     pip install --default-timeout=120 --retries 5 -r requirements.txt

COPY . .
ENV RESULTS_DIR=/app/results
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=4).status == 200 else 1)"

# --proxy-headers so links to generated maps use the public address and scheme seen by the proxy
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
