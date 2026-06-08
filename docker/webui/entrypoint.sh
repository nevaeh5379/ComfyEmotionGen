#!/bin/bash
set -e

# Use default ports if not set
PORT="${PORT:-6974}"
BACKEND_PORT="${BACKEND_PORT:-5882}"
BACKEND_URL="${BACKEND_URL:-http://localhost:${BACKEND_PORT}}"

# Write config.js with the public backend URL so the browser can connect directly
cat > /app/static/config.js << EOF
window.COMFY_EMOTION_GEN_BACKEND_URL = "${BACKEND_URL}";
EOF

# Substitute PORT in Nginx config
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start Python backend on 0.0.0.0 (so it can be exposed to the host)
echo "Starting ComfyEmotionGen Backend on port ${BACKEND_PORT}..."
python -m uvicorn backend.src.server:app --host 0.0.0.0 --port "${BACKEND_PORT}" &
BACKEND_PID=$!

# Start Nginx
echo "Starting Nginx on port ${PORT}..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Handle shutdown signals gracefully
cleanup() {
    echo "Shutting down..."
    kill -TERM "$BACKEND_PID" 2>/dev/null || true
    kill -TERM "$NGINX_PID" 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Periodically check if either process died
while true; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Backend process died. Exiting."
        cleanup
        exit 1
    fi
    if ! kill -0 "$NGINX_PID" 2>/dev/null; then
        echo "Nginx process died. Exiting."
        cleanup
        exit 1
    fi
    sleep 2
done
