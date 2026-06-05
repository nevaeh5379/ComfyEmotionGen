import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn


async def main():
    port = int(os.environ.get("BACKEND_PORT", "8000"))
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    config = uvicorn.Config("backend.src.server:app", host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())