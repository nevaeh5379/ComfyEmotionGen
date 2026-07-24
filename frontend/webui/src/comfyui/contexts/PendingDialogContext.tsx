import { createContext } from "react"
import { useContextRequired } from "@/lib/context"
import type { SavedWorkflow } from "../hooks/useSavedWorkflows"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingDialogValue {
  pendingSave: {
    name: string
    type: "template" | "workflow" | "nodeMapping"
  } | null
  setPendingSave: (
    v: { name: string; type: "template" | "workflow" | "nodeMapping" } | null
  ) => void
  pendingDiff: {
    name: string
    type: "template" | "workflow"
    oldContent: string
    newContent: string
  } | null
  setPendingDiff: (
    v: {
      name: string
      type: "template" | "workflow"
      oldContent: string
      newContent: string
    } | null
  ) => void
  pendingPresetSelection: SavedWorkflow | null
  setPendingPresetSelection: (w: SavedWorkflow | null) => void
  handlePendingUpdate: (
    name: string,
    type: "template" | "workflow",
    oldContent: string,
    newContent: string
  ) => boolean | null
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const PendingDialogContext = createContext<PendingDialogValue | null>(
  null
)

export function usePendingDialog(): PendingDialogValue {
  return useContextRequired(PendingDialogContext, "usePendingDialog")
}
