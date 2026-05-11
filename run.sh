#!/usr/bin/env bash
# Starts backend (port 8000) + frontend preview (port 4173).
# Configure ComfyUI with COMFYUI_WORKERS env var (default http://localhost:8188).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

echo "==> Starting backend on :8000"
(cd "$ROOT/backend" && "$ROOT/backend/.venv/bin/python" run.py) &
BACKEND_PID=$!

echo "==> Starting frontend on :4173"
(cd "$ROOT/frontend/web" && npm run preview -- --host) &
FRONTEND_PID=$!

echo
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:4173"
echo "Press Ctrl-C to stop."
wait
