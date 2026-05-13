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

# 2. Copy Frontend Dist
echo
echo "[2/2] Preparing frontend assets and packaging..."
rm -rf "$DIST_DIR"
cp -r "$FRONTEND_DIR/dist" "$DIST_DIR"

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
  --name "ComfyEmotionGen-frontend" \
  --noconfirm \
  --onefile \
  --add-data "$DIST_DIR:frontend_dist" \
  --clean \
  frontend_entry.py

echo
echo "Frontend executable: $SCRIPT_DIR/dist/ComfyEmotionGen-frontend"
