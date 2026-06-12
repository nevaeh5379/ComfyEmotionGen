import asyncio
import os
import sys

# Add project root to Python path so 'backend.src.*' imports work
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn  # noqa: E402


async def main():
    try:
        port = int(os.environ.get("BACKEND_PORT", "8000"))
    except ValueError:
        print("WARNING: BACKEND_PORT is not a valid integer, using 8000", file=sys.stderr)
        port = 8000
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    config = uvicorn.Config("backend.src.server:app", host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())