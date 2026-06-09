import { createContext, useMemo, useState, useCallback } from "react"
import { useContextRequired } from "@/lib/context"
import { useSyncedStorage } from "../hooks/useSyncedStorage"
import {
  useSavedWorkflows,
  type SavedWorkflow,
} from "../hooks/useSavedWorkflows"
import {
  ComfyWorkflowSchema,
  type NodeMapping,
  type ComfyWorkflow,
} from "@/lib/workflow"
import { usePendingDialog } from "./PendingDialogContext"
import { STORAGE_KEYS } from "@/lib/storageKeys"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedWorkflow =
  | { success: true; data: ComfyWorkflow }
  | { success: false; error: { message: string } }

export interface WorkflowContextValue {
  workflowJson: string
  setWorkflowJson: (value: string) => void
  parsedWorkflow: ParsedWorkflow | undefined
  activeWorkflowId: string | null
  setActiveWorkflowId: (id: string | null) => void
  activeWorkflow: SavedWorkflow | null
  savedWorkflows: SavedWorkflow[]
  saveWorkflow: (name: string, workflow: string) => SavedWorkflow
  deleteWorkflow: (id: string) => void
  workflowResetKey: number
  setWorkflowResetKey: (key: number | ((prev: number) => number)) => void
  /** Called when a name conflict needs App-level resolution */
  onPendingSave: (name: string, type: "workflow") => void
  /** Called when updating a saved item; shows diff if content changed */
  onPendingUpdate: (
    name: string,
    type: "workflow",
    oldContent: string,
    newContent: string
  ) => boolean | null
  /** Called when a workflow has multiple mapping presets */
  onPendingPresetSelection: (w: SavedWorkflow) => void
  /** Load a workflow item — coordinates with node mappings */
  loadWorkflowItem: (
    w: SavedWorkflow,
    onClearMappings: () => void,
    onSetMappings: (m: NodeMapping[], presetId: string) => void
  ) => void
  saveMappingPreset: (
    workflowId: string,
    name: string,
    mappings: NodeMapping[]
  ) => SavedWorkflow | null
  deleteMappingPreset: (
    workflowId: string,
    presetId: string
  ) => SavedWorkflow | null
  isDirty?: boolean
  saveToServer?: () => Promise<boolean>
  revert?: () => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WorkflowContext = createContext<WorkflowContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkflowContext(): WorkflowContextValue {
  return useContextRequired(WorkflowContext, "useWorkflowContext")
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface WorkflowProviderProps {
  children: React.ReactNode
}

export function WorkflowProvider({
  children,
}: WorkflowProviderProps): React.JSX.Element {
  const { setPendingSave, handlePendingUpdate, setPendingPresetSelection } =
    usePendingDialog()

  const [workflowJson, setWorkflowJson, { isDirty: isWorkflowDirty, saveToServer: saveWorkflowToServer, revert: revertWorkflow }] = useSyncedStorage(
    STORAGE_KEYS.workflow,
    "",
    { manual: true }
  )
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
      saveWorkflowToServer()
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
        return result as ParsedWorkflow
      }
      return { success: false, error: { message: result.error.message } }
    } catch (error) {
      console.error("Workflow parsing error:", error)
      return { success: false, error: { message: String(error) } }
    }
  }, [workflowJson])

  const loadWorkflowItem = useCallback((
    w: SavedWorkflow,
    onClearMappings: () => void,
    onSetMappings: (m: NodeMapping[], presetId: string) => void
  ) => {
    setWorkflowJson(w.workflow)
    setActiveWorkflowId(w.id)
    if (!w.mappingPresets || w.mappingPresets.length === 0) {
      onClearMappings()
    } else if (w.mappingPresets.length === 1) {
      onSetMappings(w.mappingPresets[0]!.mappings, w.mappingPresets[0]!.id)
    } else {
      setPendingPresetSelection(w)
    }
  }, [setWorkflowJson, setActiveWorkflowId, setPendingPresetSelection])

  const onPendingSave = useCallback(
    (name: string, type: "workflow") => setPendingSave({ name, type }),
    [setPendingSave]
  )

  const onPendingUpdate = useCallback(
    (
      name: string,
      type: "workflow",
      oldContent: string,
      newContent: string
    ) => handlePendingUpdate(name, type, oldContent, newContent),
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
