FROM node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt && npm install -g @openai/codex@0.160.0
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1
COPY apps/api/ /app/
RUN useradd -m -u 1001 api && mkdir -p /data && chown api:api /data
USER api
EXPOSE 18000
CMD ["uvicorn", "ohmydot.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "18000", "--no-access-log"]
