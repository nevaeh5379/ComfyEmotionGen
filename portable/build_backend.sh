#!/usr/bin/env bash
# Builds the backend-only portable executable (Linux/macOS).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "Building ComfyEmotionGen Backend Executable..."

# Resolve a Python that has PyInstaller (or install it)
PY=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [[ -z "$PY" ]]; then
  echo "ERROR: Python not found"
  exit 1
fi
echo "Using python: $PY"

if ! "$PY" -c "import PyInstaller" 2>/dev/null; then
  echo "PyInstaller not found. Installing..."
  "$PY" -m ensurepip --upgrade 2>/dev/null || true
  "$PY" -m pip install --user pyinstaller 2>/dev/null || \
  "$PY" -m pip install --break-system-packages pyinstaller 2>/dev/null || {
    echo "ERROR: Failed to install PyInstaller"
    exit 1
  }
fi

cd "$SCRIPT_DIR"
"$PY" -m PyInstaller \
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
