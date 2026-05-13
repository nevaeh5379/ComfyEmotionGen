#!/usr/bin/env bash
# Builds the backend-only portable executable (Linux/macOS).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "Building ComfyEmotionGen Backend Executable..."

VENV_PY="$BACKEND_DIR/.venv/bin/python"
if [[ ! -x "$VENV_PY" ]]; then
  echo "Virtual environment not found at $VENV_PY. Using system python..."
  VENV_PY="$(command -v python3 || command -v python)"
fi
echo "Using python: $VENV_PY"

if ! "$VENV_PY" -m pip --version >/dev/null 2>&1; then
  echo "pip not found. Bootstrapping..."
  "$VENV_PY" -m ensurepip --upgrade
fi

if ! "$VENV_PY" -m PyInstaller --version >/dev/null 2>&1; then
  echo "Installing PyInstaller..."
  "$VENV_PY" -m pip install pyinstaller
fi

cd "$SCRIPT_DIR"
"$VENV_PY" -m PyInstaller \
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
