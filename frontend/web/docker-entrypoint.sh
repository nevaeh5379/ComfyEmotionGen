#!/bin/sh
# Writes /config.js with the runtime backend URL so the SPA can reach the API
# without a rebuild. Read by frontend at boot (see WebSocketProvider.tsx).
set -e

BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:${BACKEND_PORT}}"

cat > /usr/share/nginx/html/config.js <<EOF
window.COMFY_EMOTION_GEN_BACKEND_URL = "${BACKEND_URL}";
EOF