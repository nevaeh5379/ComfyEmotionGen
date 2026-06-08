FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . ./

ARG CEG_BUNDLE_VERSION=dev
ARG CEG_COMMIT=
ENV CEG_BUNDLE_VERSION=${CEG_BUNDLE_VERSION} \
    CEG_COMMIT=${CEG_COMMIT} \
    PYTHONPATH=/app \
    BACKEND_PORT=8000 \
    BACKEND_HOST=0.0.0.0

# Internal port set via BACKEND_PORT env var (default 8000).
# EXPOSE is informational — the actual port is determined by BACKEND_PORT.
EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.src.server:app --host ${BACKEND_HOST} --port ${BACKEND_PORT}"]