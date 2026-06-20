import { createContext } from "react"
import { useContextRequired } from "@/lib/context"
import type { NodeMapping } from "@/lib/workflow"
import type { ObjectInfo } from "../types/renderTypes"
import type {
  SavedNodeMappingPreset,
  SavedWorkflow,
} from "../hooks/useSavedWorkflows"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageUploadState {
  uploadedName: string | null
  error: string | null
  uploading: boolean
  previewUrl: string | null
}

interface AvailableNodeOption {
  nodeId: string
  title: string
  inputKey: string
  isNumeric: boolean
  isLoadImage: boolean
}

export interface NodeMappingContextValue {
  nodeMappings: NodeMapping[]
  setNodeMappings: (
    value: NodeMapping[] | ((prev: NodeMapping[]) => NodeMapping[])
  ) => void
  updateMapping: (id: string, patch: Partial<NodeMapping>) => void
  handleAutoMap: () => void
  handleImageUpload: (file: File, nodeId: string, inputKey: string) => void
  imageUploads: Record<string, ImageUploadState>
  availableNodeOptions: AvailableNodeOption[]
  objectInfo: ObjectInfo | null
  setObjectInfo: (info: ObjectInfo | null) => void
  savedNodeMappings: SavedNodeMappingPreset[]
  activeNodeMappingPresetId: string | null
  setActiveNodeMappingPresetId: (id: string | null) => void
  activeNodeMappingPreset: SavedNodeMappingPreset | null
  nodeMappingResetKey: number
  setNodeMappingResetKey: (key: number | ((prev: number) => number)) => void
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

export const NodeMappingContext = createContext<NodeMappingContextValue | null>(null)

export function useNodeMappingContext(): NodeMappingContextValue {
  return useContextRequired(NodeMappingContext, "useNodeMappingContext")
}
