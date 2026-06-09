import os
import sys
import threading
import time
import webbrowser
import socket
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import uvicorn

# Add backend directory to sys.path so we can import from it
# When frozen, sys._MEIPASS is the root directory
if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
    backend_dir = os.path.join(base_dir, 'backend')
else:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backend_dir = os.path.join(base_dir, 'backend')

sys.path.insert(0, backend_dir)

# Persist runtime data (jobs.db, images/) next to the executable instead of
# the user's launch cwd (Desktop/Downloads). Honour CEG_DATA_DIR for overrides.
# This must run BEFORE importing server, since JobStore/JobManager resolve
# their default paths at import/construction time relative to cwd.
if getattr(sys, 'frozen', False):
    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    default_data_dir = os.path.join(exe_dir, 'data')
else:
    default_data_dir = os.getcwd()
data_dir = os.environ.get('CEG_DATA_DIR') or default_data_dir
os.makedirs(data_dir, exist_ok=True)
os.chdir(data_dir)

# Now we can import the FastAPI app from backend/server.py
from server import app

# Path to the frontend dist folder
if getattr(sys, 'frozen', False):
    dist_dir = os.path.join(base_dir, 'frontend_dist')
else:
    # Resolve project root and portable directory
    portable_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(portable_dir)
    
    # Try multiple common locations in development:
    # 1. portable/frontend_dist (where build.ps1 stages it)
    # 2. frontend/webui/dist (where Vite builds it directly)
    # 3. frontend_dist in project root
    paths_to_try = [
        os.path.join(portable_dir, 'frontend_dist'),
        os.path.join(root_dir, 'frontend', 'web', 'dist'),
        os.path.join(root_dir, 'frontend_dist')
    ]
    
    dist_dir = None
    for path in paths_to_try:
        if os.path.isdir(path):
            dist_dir = path
            break
            
    if not dist_dir:
        dist_dir = os.path.join(root_dir, 'frontend_dist')

def find_next_free_port(host, start_port):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                print(f"Port {port} is already in use on {host}, trying next port...")
                port += 1

# Configure a simple HTTP server for the frontend
class FrontendHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, backend_port=5882, default_host='127.0.0.1', **kwargs):
        self._backend_port = backend_port
        self._default_host = default_host
        super().__init__(*args, directory=dist_dir, **kwargs)
        
    def end_headers(self):
        # Add CORS headers just in case
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
        
    def do_GET(self):
        # Dynamically serve a configuration script
        if self.path == '/config.js':
            self.send_response(200)
            self.send_header('Content-type', 'application/javascript')
            self.end_headers()
            
            # Dynamically resolve client-facing hostname from HTTP request Host header
            host_header = self.headers.get('Host', '')
            if host_header:
                if host_header.startswith('[') and ']' in host_header:
                    client_host = host_header.split(']')[0] + ']'
                else:
                    client_host = host_header.split(':')[0]
            else:
                client_host = self._default_host
                
            client_backend_url = f"http://{client_host}:{self._backend_port}"
            self.wfile.write(f'window.COMFY_EMOTION_GEN_BACKEND_URL = "{client_backend_url}";'.encode('utf-8'))
            return

        # SPA support: route 404s to index.html if needed
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not path.endswith('.html') and not path.endswith('.js') and not path.endswith('.css'):
            self.path = '/index.html'
            
        # If serving index.html, inject the config script
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            
            index_path = os.path.join(dist_dir, 'index.html')
            if os.path.exists(index_path):
                with open(index_path, 'rb') as f:
                    content = f.read().decode('utf-8')
                
                self.wfile.write(content.encode('utf-8'))
            return
            
        super().do_GET()

def start_frontend_server(host, port, backend_port):
    if not os.path.isdir(dist_dir):
        print(f"Warning: Frontend directory not found at {dist_dir}")
        return
        
    handler = lambda *args, **kwargs: FrontendHandler(*args, backend_port=backend_port, default_host=host, **kwargs)
    server = ThreadingHTTPServer((host, port), handler)
    print(f"Serving frontend at http://{host}:{port}")
    if host == '0.0.0.0':
        print(f"Also accessible locally at http://127.0.0.1:{port}")
    server.serve_forever()

def open_browser(port):
    # Wait a moment for servers to start
    time.sleep(2)
    webbrowser.open(f"http://127.0.0.1:{port}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="ComfyEmotionGen Portable Launcher")
    parser.add_argument('--host', type=str, default='127.0.0.1', help="Host to bind the servers to (default: 127.0.0.1)")
    parser.add_argument('--port', type=int, default=6974, help="Port to run the frontend server on (default: 6974)")
    parser.add_argument('--backend-port', type=int, default=5882, help="Port to run the backend server on (default: 5882)")
    parser.add_argument('--no-browser', action='store_true', help="Do not open browser automatically")
    args = parser.parse_args()

    print("Starting ComfyEmotionGen Portable Launcher...")
    
    # Resolve actual ports to prevent conflicts
    actual_frontend_port = find_next_free_port(args.host, args.port)
    actual_backend_port = find_next_free_port(args.host, args.backend_port)
    
    print(f"Allocated backend port: {actual_backend_port}")
    print(f"Allocated frontend port: {actual_frontend_port}")
    
    # Start frontend server in a background thread
    frontend_thread = threading.Thread(
        target=start_frontend_server, 
        args=(args.host, actual_frontend_port, actual_backend_port), 
        daemon=True
    )
    frontend_thread.start()
    
    # Start browser auto-opener in a background thread if not disabled
    if not args.no_browser:
        browser_thread = threading.Thread(target=open_browser, args=(actual_frontend_port,), daemon=True)
        browser_thread.start()
    
    # Start backend server in the main thread (blocks until exit)
    print(f"Serving backend at http://{args.host}:{actual_backend_port}")
    uvicorn.run(app, host=args.host, port=actual_backend_port, log_level="info")
