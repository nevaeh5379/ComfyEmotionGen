#!/bin/bash
cd /workspaces/ComfyEmotionGen/frontend/webui && pnpm install
cd /workspaces/ComfyEmotionGen/backend && rm -rf .venv && uv venv && source .venv/bin/activate && uv pip install -r requirements.txt