import { createContext, useContext, useState, useCallback } from "react"
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

const PendingDialogContext = createContext<PendingDialogValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function usePendingDialog(): PendingDialogValue {
  const ctx = useContext(PendingDialogContext)
  if (!ctx)
    throw new Error(
      "usePendingDialog must be used within PendingDialogProvider"
    )
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PendingDialogProvider({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [pendingSave, setPendingSave] = useState<{
    name: string
    type: "template" | "workflow" | "nodeMapping"
  } | null>(null)

  const [pendingDiff, setPendingDiff] = useState<{
    name: string
    type: "template" | "workflow"
    oldContent: string
    newContent: string
  } | null>(null)

  const [pendingPresetSelection, setPendingPresetSelection] =
    useState<SavedWorkflow | null>(null)

  const handlePendingUpdate = useCallback(
    (
      name: string,
      type: "template" | "workflow",
      oldContent: string,
      newContent: string
    ) => {
      if (oldContent === newContent) return null
      setPendingDiff({ name, type, oldContent, newContent })
      return true
    },
    []
  )

  return (
    <PendingDialogContext.Provider
      value={{
        pendingSave,
        setPendingSave,
        pendingDiff,
        setPendingDiff,
        pendingPresetSelection,
        setPendingPresetSelection,
        handlePendingUpdate,
      }}
    >
      {children}
    </PendingDialogContext.Provider>
  )
}
