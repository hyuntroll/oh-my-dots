FROM python:3.13-slim@sha256:bb2988715db2cf7ace7b53f38f3cffbef7c7046a656bee66245eb0ed386e2e81
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git nodejs npm build-essential pkg-config && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir fastapi==0.142.2 uvicorn==0.54.0
RUN useradd -m -u 1000 dot && mkdir -p /workspace/artifacts /workspace/.tools && chown -R dot:dot /workspace
COPY shell/daemon.py /app/daemon.py
USER dot
WORKDIR /workspace
EXPOSE 8766
CMD ["uvicorn", "daemon:app", "--app-dir", "/app", "--host", "0.0.0.0", "--port", "8766", "--no-access-log"]
