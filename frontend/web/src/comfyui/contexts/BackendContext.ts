import { createContext } from "react"
import type { JobView, WorkerView } from "../types/Message"

export interface JobMeta {
  id: string
  createdAt: number
}

export interface BackendContextValue {
  isConnected: boolean
  jobs: JobView[]
  jobMetas: JobMeta[]
  workers: WorkerView[]
  paused: boolean
  sessionStartedAt: number
}

export const BackendContext = createContext<BackendContextValue | null>(null)
