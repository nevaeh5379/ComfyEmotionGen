#!/bin/bash
set -e

# Start Python backend on localhost:8002
echo "Starting ComfyEmotionGen Backend on port 8002..."
python -m uvicorn backend.src.server:app --host 127.0.0.1 --port 8002 &
BACKEND_PID=$!

# Start Nginx
echo "Starting Nginx on port 8000..."
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
