#!/bin/sh
# Writes /config.js with the runtime backend URL so the SPA can reach the API
# without a rebuild. Read by frontend at boot (see runtime.ts).
set -e

BACKEND_PORT="${BACKEND_PORT:-5882}"
BACKEND_URL="${BACKEND_URL:-http://localhost:${BACKEND_PORT}}"

cat > /usr/share/nginx/html/config.js << EOF
window.COMFY_EMOTION_GEN_BACKEND_URL = "${BACKEND_URL}";
EOF