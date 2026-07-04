/**
 * 백엔드 → 프론트 정규화 이벤트 타입.
 *
 * ComfyUI raw 메시지(`progress`, `executing`, `executed`, `execution_*` 등)는
 * 백엔드가 흡수해서 작업 단위로 추상화한다. 프론트는 작업/워커 단위만 본다.
 */

export type JobStatus =
  | "pending"
  | "queued"
  | "running"
  | "done"
  | "error"
  | "cancelled"

export interface JobView {
  id: string
  filename: string
  prompt: string
  status: JobStatus
  workerId: string | null
  error: string | null
  imageUrls: string[]
  savedImageHashes: string[]
  progressPercent: number
  currentNodeName: string
  totalNodeCount: number
  completedNodeCount: number
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  retryCount: number
  executionDurationMs: number | null
  meta?: Record<string, string>
  targetWorkerId?: string | null
}

export interface WorkerView {
  id: string
  url: string
  alive: boolean
  busy: boolean
  currentJobId: string | null
  workerType: string
}

export type CurationStatus = "pending" | "approved" | "rejected" | "trashed"

export const STATUS_LABEL: Record<CurationStatus | "all", string> = {
  all: "전체",
  pending: "대기",
  approved: "통과",
  rejected: "탈락",
  trashed: "휴지통",
}

export const STATUS_TINT: Record<CurationStatus, string> = {
  pending: "bg-info-bg text-info",
  approved: "bg-ok-bg text-ok",
  rejected: "bg-bad-bg text-bad",
  trashed: "bg-panel-2 text-ink-2",
}

export interface SavedImage {
  hash: string
  jobId: string
  originalFilename: string
  comfyFilename: string
  subfolder: string
  type: string
  workerId: string | null
  extension: string
  sizeBytes: number
  prompt: string
  createdAt: number
  status: CurationStatus
  note: string
  trashedAt: number | null
  tags: string[]
  cegTemplate?: string
  workflow?: Record<string, unknown>
  meta?: Record<string, string>
}

export interface AssetGroup {
  filename: string
  total: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  trashedCount: number
  latestCreatedAt: number | null
  sampleHash: string | null
}

export function hasApproved(images: SavedImage[]): boolean {
  return images.some((img) => img.status === "approved")
}

export function findApproved(images: SavedImage[]): SavedImage | undefined {
  return images.find((img) => img.status === "approved")
}

export type BackendEvent =
  | {
      type: "snapshot"
      jobs: JobView[]
      workers: WorkerView[]
      paused: boolean
    }
  | { type: "job.created"; job: JobView }
  | { type: "job.updated"; job: JobView }
  | { type: "worker.updated"; worker: WorkerView }
  | { type: "worker.added"; worker: WorkerView }
  | { type: "worker.removed"; workerId: string }
  | { type: "worker.preview"; workerId: string }
  | { type: "control.updated"; paused: boolean }
  | {
      type: "image.saved"
      jobId: string
      hash: string
      extension: string
      sizeBytes: number
      originalFilename: string
      status: CurationStatus
    }
  | {
      type: "image.curation"
      image?: SavedImage
      hash?: string
      tags?: string[]
    }
  | { type: "image.deleted"; hash: string }
  | { type: "job.deleted"; jobId: string }
  | {
      type: "settings.updated"
      key: string
      value: string | null
      sender?: string
    }
