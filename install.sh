#!/usr/bin/env bash
# One-time setup: download Python + Node.js, install deps, build frontend.
# No system prerequisites required.
set -euo pipefail
export PIP_REQUIRE_VIRTUALENV=false

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- Python ----------
PYTHON_VERSION="3.14.6"
PYTHON_BUILD="20260623"
PYTHON_DIR="$ROOT/.python"

if [[ ! -x "$PYTHON_DIR/bin/python3" ]]; then
    echo "==> Downloading Python ${PYTHON_VERSION} (standalone)"
    case "$(uname -s)-$(uname -m)" in
        Linux-x86_64)    ARCH="x86_64-unknown-linux-gnu" ;;
        Linux-aarch64)   ARCH="aarch64-unknown-linux-gnu" ;;
        Darwin-x86_64)   ARCH="x86_64-apple-darwin" ;;
        Darwin-arm64)    ARCH="aarch64-apple-darwin" ;;
        *)               echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
    esac

    URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD}/cpython-${PYTHON_VERSION}+${PYTHON_BUILD}-${ARCH}-install_only.tar.gz"
    curl -fsSL "$URL" | tar -xzf - -C "$ROOT"
    mv "python" "$PYTHON_DIR"
fi

PY="$PYTHON_DIR/bin/python3"

echo "==> Installing backend dependencies"
"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r "$ROOT/backend/requirements.txt"

# ---------- Node.js ----------
NODE_VERSION="26.4.0"
NODE_DIR="$ROOT/.node"

if [[ ! -x "$NODE_DIR/bin/node" ]]; then
    echo "==> Downloading Node.js ${NODE_VERSION} (standalone)"
    case "$(uname -s)-$(uname -m)" in
        Linux-x86_64)       NODE_ARCH="linux-x64" ;;
        Linux-aarch64)      NODE_ARCH="linux-arm64" ;;
        Darwin-x86_64)      NODE_ARCH="darwin-x64" ;;
        Darwin-arm64)       NODE_ARCH="darwin-arm64" ;;
        *)                  echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
    esac

    URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
    curl -fsSL "$URL" | tar -xzf - -C "$ROOT"
    mv "node-v${NODE_VERSION}-${NODE_ARCH}" "$NODE_DIR"
fi

NODE="$NODE_DIR/bin/node"
NPM="$NODE_DIR/bin/npm"
PNPM="$NODE_DIR/bin/pnpm"

# pnpm 자체 설치 (Node에는 기본 미포함)
if [[ ! -x "$PNPM" ]]; then
    echo "==> Installing pnpm"
    "$NPM" install -g pnpm --prefix "$NODE_DIR"
fi

echo "==> Installing frontend dependencies"
(cd "$ROOT/frontend/webui" && "$PNPM" install)

echo "==> Building frontend"
(cd "$ROOT/frontend/webui" && "$PNPM" build)

echo
echo "✅ Install complete. Run ./run.sh to start."
