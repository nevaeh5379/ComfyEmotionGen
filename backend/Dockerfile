FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . ./

# Runtime data (images/, jobs.db) lives in /data. Mount a volume here.
RUN mkdir -p /data
WORKDIR /data

ARG CEG_BUNDLE_VERSION=dev
ARG CEG_COMMIT=
ENV CEG_BUNDLE_VERSION=${CEG_BUNDLE_VERSION} \
    CEG_COMMIT=${CEG_COMMIT} \
    PYTHONPATH=/app/backend

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
