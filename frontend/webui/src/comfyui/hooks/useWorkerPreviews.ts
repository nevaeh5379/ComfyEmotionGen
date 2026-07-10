import { WorkerPreviewContext } from "../contexts/WorkerPreviewContext"
import { useContextRequired } from "@/lib/context"

export function useWorkerPreviews(): Record<string, number> {
  return useContextRequired(WorkerPreviewContext, "useWorkerPreviews")
}
