import os
import sys
import threading
import time
import webbrowser
import socket
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

# Now we can import the FastAPI app from backend/server.py
from server import app

# Path to the frontend dist folder
dist_dir = os.path.join(base_dir, 'frontend_dist')

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]

# Dynamic ports
backend_port = find_free_port()
frontend_port = find_free_port()
backend_url = f"http://127.0.0.1:{backend_port}"

# Configure a simple HTTP server for the frontend
class FrontendHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
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
            self.wfile.write(f'window.COMFY_EMOTION_GEN_BACKEND_URL = "{backend_url}";'.encode('utf-8'))
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
                
                # index.html already references /config.js; we serve it
                # dynamically above. No injection needed.
                
                self.wfile.write(content.encode('utf-8'))
            return
            
        super().do_GET()

def start_frontend_server():
    if not os.path.isdir(dist_dir):
        print(f"Warning: Frontend directory not found at {dist_dir}")
        return
        
    server = ThreadingHTTPServer(('127.0.0.1', frontend_port), FrontendHandler)
    print(f"Serving frontend at http://127.0.0.1:{frontend_port}")
    server.serve_forever()

def open_browser():
    # Wait a moment for servers to start
    time.sleep(2)
    webbrowser.open(f"http://127.0.0.1:{frontend_port}")

if __name__ == '__main__':
    print("Starting ComfyEmotionGen Portable Launcher...")
    print(f"Allocated backend port: {backend_port}")
    print(f"Allocated frontend port: {frontend_port}")
    
    # Start frontend server in a background thread
    frontend_thread = threading.Thread(target=start_frontend_server, daemon=True)
    frontend_thread.start()
    
    # Start browser auto-opener in a background thread
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    
    # Start backend server in the main thread (blocks until exit)
    # We use uvicorn to run the imported app directly
    print(f"Serving backend at {backend_url}")
    uvicorn.run(app, host='127.0.0.1', port=backend_port, log_level="info")
