import argparse
import os
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
    dist_dir = os.path.join(base_dir, 'frontend_dist')
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(base_dir, 'frontend_dist')


class FrontendHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, backend_url='', **kwargs):
        self._backend_url = backend_url
        super().__init__(*args, directory=dist_dir, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        if self.path == '/config.js':
            self.send_response(200)
            self.send_header('Content-type', 'application/javascript')
            self.end_headers()
            self.wfile.write(
                f'window.COMFY_EMOTION_GEN_BACKEND_URL = "{self._backend_url}";'.encode('utf-8')
            )
            return

        path = self.translate_path(self.path)
        if not os.path.exists(path) and not path.endswith('.html') and not path.endswith('.js') and not path.endswith('.css'):
            self.path = '/index.html'

        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            index_path = os.path.join(dist_dir, 'index.html')
            if os.path.exists(index_path):
                with open(index_path, 'rb') as f:
                    content = f.read()
                self.wfile.write(content)
            return

        super().do_GET()


def start_frontend_server(port, backend_url):
    if not os.path.isdir(dist_dir):
        print(f"Warning: Frontend directory not found at {dist_dir}")
        return

    handler = lambda *args, **kwargs: FrontendHandler(*args, backend_url=backend_url, **kwargs)
    server = ThreadingHTTPServer(('0.0.0.0', port), handler)
    print(f"Serving frontend at http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ComfyEmotionGen Frontend Server')
    parser.add_argument('--port', type=int, default=8000, help='Port to listen on (default: 8000)')
    parser.add_argument('--backend-url', type=str, default='',
                        help='Backend API URL exposed to the frontend (default: empty)')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser automatically')
    args = parser.parse_args()

    frontend_thread = threading.Thread(
        target=start_frontend_server, args=(args.port, args.backend_url), daemon=True
    )
    frontend_thread.start()

    if not args.no_browser:
        time.sleep(1.5)
        webbrowser.open(f"http://127.0.0.1:{args.port}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down frontend server...")
