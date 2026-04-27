#!/usr/bin/env bash
set -euo pipefail

echo "[codespaces-demo] Starting local infra (Postgres + Redis)..."
docker compose up -d

echo "[codespaces-demo] Preparing backend environment..."
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
fi

echo "[codespaces-demo] Preparing frontend environment..."
if [ ! -f frontend/.env ]; then
  cp frontend/.env.example frontend/.env
fi

echo "[codespaces-demo] Installing dependencies..."
npm --prefix backend ci
npm --prefix frontend ci

echo "[codespaces-demo] Starting backend and frontend..."
npm --prefix backend run start:dev &
BACK_PID=$!
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173 &
FRONT_PID=$!

echo "[codespaces-demo] Backend PID: $BACK_PID"
echo "[codespaces-demo] Frontend PID: $FRONT_PID"
echo "[codespaces-demo] Frontend URL: forwarded port 5173"
echo "[codespaces-demo] Backend URL: forwarded port 3000"

wait
