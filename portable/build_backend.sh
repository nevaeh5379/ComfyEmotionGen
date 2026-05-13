#!/usr/bin/env bash
# Builds the backend-only portable executable (Linux/macOS).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "Building ComfyEmotionGen Backend Executable..."

cd "$SCRIPT_DIR"
python -m PyInstaller \
  --name "ComfyEmotionGen-backend" \
  --noconfirm \
  --onefile \
  --paths "$BACKEND_DIR" \
  --add-data "$BACKEND_DIR:backend" \
  --hidden-import "uvicorn.logging" \
  --hidden-import "uvicorn.loops" \
  --hidden-import "uvicorn.loops.auto" \
  --hidden-import "uvicorn.protocols" \
  --hidden-import "uvicorn.protocols.http" \
  --hidden-import "uvicorn.protocols.http.auto" \
  --hidden-import "uvicorn.protocols.websockets" \
  --hidden-import "uvicorn.protocols.websockets.auto" \
  --hidden-import "uvicorn.lifespan" \
  --hidden-import "uvicorn.lifespan.on" \
  --clean \
  backend_entry.py

echo
echo "Backend executable: $SCRIPT_DIR/dist/ComfyEmotionGen-backend"
