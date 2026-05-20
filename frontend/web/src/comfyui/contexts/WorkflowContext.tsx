import { createContext, useContext, useMemo, useState } from "react"
import { useLocalStorage } from "../hooks/useLocalStorage"
import {
  useSavedWorkflows,
  type SavedWorkflow,
} from "../hooks/useSavedWorkflows"
import {
  ComfyWorkflowSchema,
  type NodeMapping,
  type ComfyWorkflow,
} from "@/lib/workflow"
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
  onPendingUpdate?: (
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
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WorkflowContext = createContext<WorkflowContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkflowContext(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext)
  if (!ctx)
    throw new Error("useWorkflowContext must be used within WorkflowProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface WorkflowProviderProps {
  onPendingSave: (name: string, type: "workflow") => void
  onPendingUpdate?: (
    name: string,
    type: "workflow",
    oldContent: string,
    newContent: string
  ) => boolean | null
  onPendingPresetSelection: (w: SavedWorkflow) => void
  children: React.ReactNode
}

export function WorkflowProvider({
  onPendingSave,
  onPendingUpdate,
  onPendingPresetSelection,
  children,
}: WorkflowProviderProps): React.JSX.Element {
  const [workflowJson, setWorkflowJson] = useLocalStorage(
    STORAGE_KEYS.workflow,
    ""
  )
  const [activeWorkflowId, setActiveWorkflowId] = useLocalStorage<
    string | null
  >(STORAGE_KEYS.activeWorkflowId, null)
  const [workflowResetKey, setWorkflowResetKey] = useState(0)
  const {
    workflows: savedWorkflows,
    saveWorkflow,
    deleteWorkflow,
    saveMappingPreset,
    deleteMappingPreset,
  } = useSavedWorkflows()

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
      return undefined
    }
  }, [workflowJson])

  const loadWorkflowItem = (
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
      onPendingPresetSelection(w)
    }
  }

  return (
    <WorkflowContext.Provider
      value={{
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
        ...(onPendingUpdate ? { onPendingUpdate } : {}),
        onPendingPresetSelection,
        loadWorkflowItem,
        saveMappingPreset,
        deleteMappingPreset,
      }}
    >
      {children}
    </WorkflowContext.Provider>
  )
}
