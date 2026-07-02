import { createContext } from "react"
import { useContextRequired } from "@/lib/context"
import type { SavedWorkflow } from "../hooks/useSavedWorkflows"
import type { NodeMapping, ComfyWorkflow } from "@/lib/workflow"

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

export const WorkflowContext = createContext<WorkflowContextValue | null>(null)

export function useWorkflowContext(): WorkflowContextValue {
  return useContextRequired(WorkflowContext, "useWorkflowContext")
}
