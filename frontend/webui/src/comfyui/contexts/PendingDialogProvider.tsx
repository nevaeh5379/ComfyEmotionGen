import { useState, useCallback, type ReactNode } from "react"
import type { SavedWorkflow } from "../hooks/useSavedWorkflows"
import {
  PendingDialogContext,
} from "./PendingDialogContext"

export function PendingDialogProvider({
  children,
}: {
  children: ReactNode
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
