import { createContext } from "react"
import type { JobView, WorkerView } from "./Message"

export interface BackendContextValue {
  isConnected: boolean
  jobs: JobView[]
  workers: WorkerView[]
  paused: boolean
  sessionStartedAt: number
}

export const BackendContext = createContext<BackendContextValue | null>(null)
