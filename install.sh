#!/usr/bin/env bash
# One-time setup: create backend venv, install Python deps, build frontend.
# Prereqs: Python 3.10+, Node 20+.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PY="${PYTHON:-python3}"
echo "==> Creating backend venv ($PY)"
"$PY" -m venv "$ROOT/backend/.venv"

echo "==> Installing backend dependencies"
"$ROOT/backend/.venv/bin/pip" install --upgrade pip
"$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"

echo "==> Installing frontend dependencies"
(cd "$ROOT/frontend/web" && npm install)

echo "==> Building frontend"
(cd "$ROOT/frontend/web" && npm run build)

echo
echo "✅ Install complete. Run ./run.sh to start."
