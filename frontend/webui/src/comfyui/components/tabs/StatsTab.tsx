import { type ReactNode } from "react"
import { StatisticsPanel } from "../StatisticsPanel"
import type { JobView, WorkerView } from "../../types/Message"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatsTabProps {
  jobs: JobView[]
  workers: WorkerView[]
}

// ---------------------------------------------------------------------------
// StatsTab
// ---------------------------------------------------------------------------

export function StatsTab({ jobs, workers }: StatsTabProps): ReactNode {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
      <StatisticsPanel jobs={jobs} workers={workers} />
    </div>
  )
}