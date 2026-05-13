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

cd "$SCRIPT_DIR"
python -m PyInstaller \
  --name "ComfyEmotionGen-frontend" \
  --noconfirm \
  --onefile \
  --add-data "$DIST_DIR:frontend_dist" \
  --clean \
  frontend_entry.py

echo
echo "Frontend executable: $SCRIPT_DIR/dist/ComfyEmotionGen-frontend"
