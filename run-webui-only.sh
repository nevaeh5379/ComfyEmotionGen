#!/usr/bin/env bash
# Starts frontend preview server only.
# Port defaults: FRONTEND_PORT (default 6974).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-6974}"

if [[ ! -x "$ROOT/.node/bin/node" ]]; then
  echo "Node.js not found. Run ./install.sh first." >&2
  exit 1
fi
if [[ ! -d "$ROOT/frontend/webui/dist" ]]; then
  echo "Frontend build missing. Run ./install.sh first." >&2
  exit 1
fi

echo "==> Starting frontend preview on :${FRONTEND_PORT}"
cd "$ROOT/frontend/webui"
exec "$ROOT/.node/bin/pnpm" preview --host --port "$FRONTEND_PORT"
