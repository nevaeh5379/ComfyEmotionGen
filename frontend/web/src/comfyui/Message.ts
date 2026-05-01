/**
 * 백엔드 → 프론트 정규화 이벤트 타입.
 *
 * ComfyUI raw 메시지(`progress`, `executing`, `executed`, `execution_*` 등)는
 * 백엔드가 흡수해서 잡 단위로 추상화한다. 프론트는 잡/워커 단위만 본다.
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
  progressPercent: number
  currentNodeName: string
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  retryCount: number
}

export interface WorkerView {
  id: string
  url: string
  alive: boolean
  busy: boolean
  currentJobId: string | null
}

export type BackendEvent =
  | { type: "snapshot"; jobs: JobView[]; workers: WorkerView[]; paused: boolean }
  | { type: "job.created"; job: JobView }
  | { type: "job.updated"; job: JobView }
  | { type: "worker.updated"; worker: WorkerView }
  | { type: "control.updated"; paused: boolean }
