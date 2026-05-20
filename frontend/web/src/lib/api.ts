/**
 * API 엔드포인트 및 공통 fetch 유틸리티 중앙 집중화.
 */

export const API = {
  health: "/health",
  objectInfo: "/object_info",
  jobs: {
    root: "/jobs",
    detail: (id: string) => `/jobs/${id}`,
    pause: "/jobs/pause",
    resume: "/jobs/resume",
    cancelAll: "/jobs/cancel-all",
    retry: (id: string) => `/jobs/${id}/retry`,
    delete: "/jobs/delete",
    savedImages: (id: string) => `/jobs/${id}/saved-images`,
  },
  render: "/render",
  savedImages: {
    root: "/saved-images",
    detail: (hash: string) => `/saved-images/${hash}`,
    tags: (hash: string) => `/saved-images/${hash}/tags`,
    tag: (hash: string, tag: string) => `/saved-images/${hash}/tags/${encodeURIComponent(tag)}`,
    restore: (hash: string) => `/saved-images/${hash}/restore`,
  },
  assetGroups: {
    root: "/asset-groups",
    detail: (filename: string) => `/asset-groups/${encodeURIComponent(filename)}`,
    regenerate: (filename: string) => `/asset-groups/${encodeURIComponent(filename)}/regenerate`,
  },
  trash: {
    empty: "/trash/empty",
  },
  export: "/export",
  workers: {
    root: "/workers",
    detail: (id: string) => `/workers/${id}`,
  },
  webhooks: {
    root: "/webhooks",
    detail: (id: string) => `/webhooks/${id}`,
    test: (id: string) => `/webhooks/${id}/test`,
    batchComplete: "/webhooks/batch-complete",
  },
  ws: {
    events: "/ws/events",
  },
  upload: {
    image: "/upload/image",
  },
} as const

export const HEADERS = {
  json: { "Content-Type": "application/json" },
} as const

export const HTTP_STATUS = {
  conflict: 409,
} as const

export const DEFAULT_WORKER_URL = "http://localhost:8188"

export const DEFAULT_DOWNLOAD_FILENAME = "dataset.zip"
