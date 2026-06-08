#!/usr/bin/env bash
# Starts backend + frontend preview.
# Port defaults: BACKEND_PORT (default 8000), FRONTEND_PORT (default 4173).
# Configure ComfyUI with COMFYUI_WORKERS env var (default http://localhost:8188).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"

if [[ ! -x "$ROOT/backend/.venv/bin/python" ]]; then
  echo "Backend venv missing. Run ./install.sh first." >&2
  exit 1
fi
if [[ ! -d "$ROOT/frontend/web/dist" ]]; then
  echo "Frontend build missing. Run ./install.sh first." >&2
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting backend on :${BACKEND_PORT}"
(cd "$ROOT/backend" && BACKEND_PORT="$BACKEND_PORT" BACKEND_HOST="$BACKEND_HOST" "$ROOT/backend/.venv/bin/python" run.py) &
BACKEND_PID=$!

echo "==> Starting frontend on :${FRONTEND_PORT}"
(cd "$ROOT/frontend/web" && FRONTEND_PORT="$FRONTEND_PORT" npm run preview -- --host --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

echo
echo "Backend:  http://localhost:${BACKEND_PORT}"
echo "Frontend: http://localhost:${FRONTEND_PORT}"
echo "Press Ctrl-C to stop."
wait