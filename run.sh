#!/usr/bin/env bash
# Starts backend server only.
# Port defaults: BACKEND_PORT (default 5882).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_PORT="${BACKEND_PORT:-5882}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"

if [[ ! -x "$ROOT/.python/bin/python3" ]]; then
  echo "Python not found. Run ./install.sh first." >&2
  exit 1
fi

echo "==> Starting backend on :${BACKEND_PORT}"
cd "$ROOT/backend/src"
exec "$ROOT/.python/bin/python3" run.py
