#!/usr/bin/env bash
# Builds the portable ComfyEmotionGen executable (Linux/macOS).
# Windows: use build.ps1.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend/web"
BACKEND_DIR="$PROJECT_ROOT/backend"
DIST_DIR="$SCRIPT_DIR/frontend_dist"

echo "🚀 Building ComfyEmotionGen Portable Executable..."

# 1. Build Frontend
echo
echo "[1/3] Building React Frontend..."
(
  cd "$FRONTEND_DIR"
  echo "Installing frontend dependencies..."
  npm install
  npm run build
)

# 2. Copy Frontend Dist
echo
echo "[2/3] Preparing frontend assets..."
rm -rf "$DIST_DIR"
cp -r "$FRONTEND_DIR/dist" "$DIST_DIR"

# 3. Build Backend using PyInstaller
echo
echo "[3/3] Packaging with PyInstaller..."

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
  --name "ComfyEmotionGen" \
  --noconfirm \
  --onefile \
  --paths "$BACKEND_DIR" \
  --add-data "$BACKEND_DIR:backend" \
  --add-data "$DIST_DIR:frontend_dist" \
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
  launcher.py

echo
echo "✅ Build Complete!"
echo "Portable executable: $SCRIPT_DIR/dist/ComfyEmotionGen"
