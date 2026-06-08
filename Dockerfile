# All-in-one image: backend + frontend in a single container.
# Frontend dist is served by FastAPI as static files (CEG_STATIC_DIR).
# Use this when you want one container instead of two.

FROM node:22-alpine AS frontend
WORKDIR /app
ARG CEG_BUNDLE_VERSION=dev
ARG CEG_COMMIT=
ENV CEG_BUNDLE_VERSION=${CEG_BUNDLE_VERSION} \
    CEG_COMMIT=${CEG_COMMIT}
COPY frontend/web/package.json frontend/web/package-lock.json ./
RUN npm ci
COPY frontend/web/ ./
RUN npm run build


FROM python:3.14-slim AS final

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Install nginx and bash
RUN apt-get update && apt-get install -y nginx bash && rm -rf /var/lib/apt/lists/*

# Replace default nginx config
RUN rm -f /etc/nginx/sites-enabled/default
COPY nginx.conf /etc/nginx/sites-enabled/default

WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./

COPY --from=frontend /app/dist /app/static

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ARG CEG_BUNDLE_VERSION=dev
ARG CEG_COMMIT=
ENV CEG_BUNDLE_VERSION=${CEG_BUNDLE_VERSION} \
    CEG_COMMIT=${CEG_COMMIT} \
    PYTHONPATH=/app

EXPOSE 8000

CMD ["/app/entrypoint.sh"]