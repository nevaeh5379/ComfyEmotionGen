import { createContext } from "react"

/**
 * Worker preview frames update much more frequently than jobs or workers.
 * Keeping their tokens in a separate context prevents every backend consumer
 * (including the app root) from re-rendering for each preview frame.
 */
export const WorkerPreviewContext = createContext<Record<
  string,
  number
> | null>(null)
