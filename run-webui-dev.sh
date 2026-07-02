#!/usr/bin/env bash
# Starts backend server and frontend dev server (pnpm dev).
# Port defaults: BACKEND_PORT (default 5882), FRONTEND_PORT (default 6974).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_PORT="${BACKEND_PORT:-5882}"
FRONTEND_PORT="${FRONTEND_PORT:-6974}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"

if [[ ! -x "$ROOT/.python/bin/python3" ]]; then
  echo "Python not found. Run ./install.sh first." >&2
  exit 1
fi
if [[ ! -x "$ROOT/.node/bin/node" ]]; then
  echo "Node.js not found. Run ./install.sh first." >&2
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting backend on :${BACKEND_PORT}"
(cd "$ROOT/backend/src" && BACKEND_PORT="$BACKEND_PORT" BACKEND_HOST="$BACKEND_HOST" "$ROOT/.python/bin/python3" run.py) &
BACKEND_PID=$!

echo "==> Starting frontend dev server on :${FRONTEND_PORT}"
(cd "$ROOT/frontend/webui" && "$ROOT/.node/bin/pnpm" dev --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

echo
echo "Backend:      http://localhost:${BACKEND_PORT}"
echo "Frontend dev: http://localhost:${FRONTEND_PORT}"
echo "Press Ctrl-C to stop."
wait
