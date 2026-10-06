#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
.venv/bin/python scripts/setup.py
docker compose --env-file .env.local -f compose.yaml -f compose.dev.yaml up -d --build postgres computer shell gateway
until docker compose --env-file .env.local -f compose.yaml -f compose.dev.yaml exec -T postgres pg_isready -U dots >/dev/null 2>&1; do sleep 1; done
DATABASE_URL=postgresql+psycopg://dots:local-demo-only@127.0.0.1:15432/dots PYTHONPATH=apps/api .venv/bin/uvicorn ohmydot.main:create_app --factory --host 127.0.0.1 --port 18000 --no-access-log &
DOT_API_PID=$!
npm run dev --prefix apps/web &
DOT_WEB_PID=$!
trap 'kill "$DOT_API_PID" "$DOT_WEB_PID" 2>/dev/null || true' EXIT INT TERM
printf '%s\n' 'OhMyDot: http://localhost:3080'
wait
