import argparse
import os
import sys

import uvicorn

# Add backend directory to sys.path so we can import from it
if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
    backend_dir = os.path.join(base_dir, 'backend')
else:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backend_dir = os.path.join(base_dir, 'backend')

sys.path.insert(0, backend_dir)

# Persist runtime data (jobs.db, images/) next to the executable.
# Honour CEG_DATA_DIR for overrides. Must run BEFORE importing server.
if getattr(sys, 'frozen', False):
    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    default_data_dir = os.path.join(exe_dir, 'data')
else:
    default_data_dir = os.getcwd()
data_dir = os.environ.get('CEG_DATA_DIR') or default_data_dir
os.makedirs(data_dir, exist_ok=True)
os.chdir(data_dir)

from server import app

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ComfyEmotionGen Backend Server')
    default_port = int(os.environ.get('BACKEND_PORT', '8000'))
    default_host = os.environ.get('BACKEND_HOST', '127.0.0.1')
    parser.add_argument('--port', type=int, default=default_port, help=f'Port to listen on (default: {default_port})')
    parser.add_argument('--host', type=str, default=default_host, help=f'Host to bind to (default: {default_host})')
    args = parser.parse_args()

    print(f"Starting ComfyEmotionGen Backend on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
