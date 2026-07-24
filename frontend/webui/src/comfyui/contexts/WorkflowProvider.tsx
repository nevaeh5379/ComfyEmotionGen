import { useState, useCallback, useMemo, type ReactNode } from "react"
import { useSyncedStorage } from "../hooks/useSyncedStorage"
import {
  useSavedWorkflows,
  type SavedWorkflow,
} from "../hooks/useSavedWorkflows"
import { ComfyWorkflowSchema, type NodeMapping } from "@/lib/workflow"
import { usePendingDialog } from "./PendingDialogContext"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import {
  type ParsedWorkflow,
  type WorkflowContextValue,
  WorkflowContext,
} from "./WorkflowContext"

export function WorkflowProvider({
  children,
}: {
  children: ReactNode
}): React.JSX.Element {
  const { setPendingSave, handlePendingUpdate, setPendingPresetSelection } =
    usePendingDialog()

  const [
    workflowJson,
    setWorkflowJson,
    {
      isDirty: isWorkflowDirty,
      saveToServer: saveWorkflowToServer,
      revert: revertWorkflow,
    },
  ] = useSyncedStorage(STORAGE_KEYS.workflow, "", { manual: true })
  const [activeWorkflowId, setActiveWorkflowId] = useSyncedStorage<
    string | null
  >(STORAGE_KEYS.activeWorkflowId, null)
  const [workflowResetKey, setWorkflowResetKey] = useState(0)

  const {
    workflows: savedWorkflows,
    saveWorkflow: originalSaveWorkflow,
    deleteWorkflow,
    saveMappingPreset,
    deleteMappingPreset,
  } = useSavedWorkflows()

  const saveWorkflow = useCallback(
    (name: string, workflowContent: string) => {
      const res = originalSaveWorkflow(name, workflowContent)
      void saveWorkflowToServer()
      return res
    },
    [originalSaveWorkflow, saveWorkflowToServer]
  )

  const activeWorkflow = useMemo(
    () => savedWorkflows.find((w) => w.id === activeWorkflowId) ?? null,
    [savedWorkflows, activeWorkflowId]
  )

  const parsedWorkflow = useMemo<ParsedWorkflow | undefined>(() => {
    if (!workflowJson) return undefined
    try {
      const result = ComfyWorkflowSchema.safeParse(JSON.parse(workflowJson))
      if (result.success) {
        return result
      }
      return { success: false, error: { message: result.error.message } }
    } catch (error) {
      console.error("Workflow parsing error:", error)
      return { success: false, error: { message: String(error) } }
    }
  }, [workflowJson])

  const loadWorkflowItem = useCallback(
    (
      w: SavedWorkflow,
      onClearMappings: () => void,
      onSetMappings: (m: NodeMapping[], presetId: string) => void
    ) => {
      setWorkflowJson(w.workflow)
      setActiveWorkflowId(w.id)
      if (w.mappingPresets.length === 0) {
        onClearMappings()
      } else if (w.mappingPresets.length === 1) {
        const first = w.mappingPresets[0]
        if (first !== undefined) {
          onSetMappings(first.mappings, first.id)
        }
      } else {
        setPendingPresetSelection(w)
      }
    },
    [setWorkflowJson, setActiveWorkflowId, setPendingPresetSelection]
  )

  const onPendingSave = useCallback(
    (name: string, type: "workflow") => {
      setPendingSave({ name, type })
    },
    [setPendingSave]
  )

  const onPendingUpdate = useCallback(
    (name: string, type: "workflow", oldContent: string, newContent: string) =>
      handlePendingUpdate(name, type, oldContent, newContent),
    [handlePendingUpdate]
  )

  const value = useMemo<WorkflowContextValue>(
    () => ({
      workflowJson,
      setWorkflowJson,
      parsedWorkflow,
      activeWorkflowId,
      setActiveWorkflowId,
      activeWorkflow,
      savedWorkflows,
      saveWorkflow,
      deleteWorkflow,
      workflowResetKey,
      setWorkflowResetKey,
      onPendingSave,
      onPendingUpdate,
      onPendingPresetSelection: setPendingPresetSelection,
      loadWorkflowItem,
      saveMappingPreset,
      deleteMappingPreset,
      isDirty: isWorkflowDirty,
      saveToServer: saveWorkflowToServer,
      revert: revertWorkflow,
    }),
    [
      workflowJson,
      setWorkflowJson,
      parsedWorkflow,
      activeWorkflowId,
      setActiveWorkflowId,
      activeWorkflow,
      savedWorkflows,
      saveWorkflow,
      deleteWorkflow,
      workflowResetKey,
      setWorkflowResetKey,
      onPendingSave,
      onPendingUpdate,
      setPendingPresetSelection,
      loadWorkflowItem,
      saveMappingPreset,
      deleteMappingPreset,
      isWorkflowDirty,
      saveWorkflowToServer,
      revertWorkflow,
    ]
  )

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  )
}
