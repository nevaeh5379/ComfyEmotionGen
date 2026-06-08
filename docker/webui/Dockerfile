# All-in-one image: backend + frontend in a single container.
# Exposes a single port serving both static files and API requests via Nginx proxy.

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

# Install nginx, bash, and gettext (for envsubst)
RUN apt-get update && apt-get install -y nginx bash gettext-base && rm -rf /var/lib/apt/lists/*

# Remove default site config
RUN rm -f /etc/nginx/sites-enabled/default
COPY docker/webui/nginx.conf.template /etc/nginx/nginx.conf.template

WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./

# Copy static frontend assets
COPY --from=frontend /app/dist /app/static

COPY docker/webui/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ARG CEG_BUNDLE_VERSION=dev
ARG CEG_COMMIT=
ENV CEG_BUNDLE_VERSION=${CEG_BUNDLE_VERSION} \
    CEG_COMMIT=${CEG_COMMIT} \
    PYTHONPATH=/app

# Default ports
ENV PORT=6974
ENV BACKEND_PORT=5882

EXPOSE 6974

CMD ["/app/entrypoint.sh"]
