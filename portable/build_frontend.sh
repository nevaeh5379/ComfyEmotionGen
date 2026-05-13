#!/usr/bin/env bash
# Builds the frontend-only portable executable (Linux/macOS).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend/web"
DIST_DIR="$SCRIPT_DIR/frontend_dist"

echo "Building ComfyEmotionGen Frontend Executable..."

# 1. Build Frontend
echo
echo "[1/2] Building React Frontend..."
(
  cd "$FRONTEND_DIR"
  echo "Installing frontend dependencies..."
  npm install
  npm run build
)

# 2. Copy Frontend Dist and package
echo
echo "[2/2] Preparing frontend assets and packaging..."
rm -rf "$DIST_DIR"
cp -r "$FRONTEND_DIR/dist" "$DIST_DIR"

VENV_PY="$(command -v python3 || command -v python)"
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
  --name "ComfyEmotionGen-frontend" \
  --noconfirm \
  --onefile \
  --add-data "$DIST_DIR:frontend_dist" \
  --clean \
  frontend_entry.py

echo
echo "Frontend executable: $SCRIPT_DIR/dist/ComfyEmotionGen-frontend"
