import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { useLocalStorage } from "../useLocalStorage"
import type { NodeMapping } from "@/lib/workflow"
import { buildAutoMappings } from "@/lib/workflowUtils"
import type { ObjectInfo } from "../renderTypes"
import type {
  SavedNodeMappingPreset,
  SavedWorkflow,
} from "../useSavedWorkflows"
import { useWorkflowContext } from "./WorkflowContext"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageUploadState {
  uploadedName: string | null
  error: string | null
  uploading: boolean
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

const NodeMappingContext = createContext<NodeMappingContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useNodeMappingContext(): NodeMappingContextValue {
  const ctx = useContext(NodeMappingContext)
  if (!ctx)
    throw new Error(
      "useNodeMappingContext must be used within NodeMappingProvider"
    )
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface NodeMappingProviderProps {
  workers: { url: string; alive: boolean }[]
  children: React.ReactNode
}

export function NodeMappingProvider({
  workers,
  children,
}: NodeMappingProviderProps): React.JSX.Element {
  const {
    parsedWorkflow,
    activeWorkflow,
    saveMappingPreset,
    deleteMappingPreset,
  } = useWorkflowContext()

  const [nodeMappings, setNodeMappings] = useLocalStorage<NodeMapping[]>(
    "nodeMappings",
    []
  )
  const [activeNodeMappingPresetId, setActiveNodeMappingPresetId] =
    useLocalStorage<string | null>("activeNodeMappingPresetId", null)
  const [nodeMappingResetKey, setNodeMappingResetKey] = useState(0)
  const [objectInfo, setObjectInfo] = useState<ObjectInfo | null>(null)
  const [imageUploads, setImageUploads] = useState<
    Record<string, ImageUploadState>
  >({})

  const savedNodeMappings = useMemo(
    () => activeWorkflow?.mappingPresets ?? [],
    [activeWorkflow]
  )

  const activeNodeMappingPreset = useMemo(
    () =>
      savedNodeMappings.find((m) => m.id === activeNodeMappingPresetId) ?? null,
    [savedNodeMappings, activeNodeMappingPresetId]
  )

  const availableNodeOptions = useMemo<AvailableNodeOption[]>(() => {
    if (!parsedWorkflow?.success) return []
    const inUse = new Set(nodeMappings.map((m) => `${m.nodeId}.${m.inputKey}`))
    const opts: AvailableNodeOption[] = []
    Object.entries(parsedWorkflow.data).forEach(([nodeId, node]) => {
      Object.entries(node.inputs).forEach(([inputKey, value]) => {
        if (
          !inUse.has(`${nodeId}.${inputKey}`) &&
          (typeof value === "string" || typeof value === "number")
        ) {
          opts.push({
            nodeId,
            title: node._meta?.title || node.class_type,
            inputKey,
            isNumeric: typeof value === "number",
            isLoadImage:
              node.class_type === "LoadImage" && inputKey === "image",
          })
        }
      })
    })
    return opts
  }, [parsedWorkflow, nodeMappings])

  const updateMapping = (id: string, patch: Partial<NodeMapping>) =>
    setNodeMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )

  const handleAutoMap = () => {
    if (!parsedWorkflow?.success) return
    setNodeMappings(buildAutoMappings(parsedWorkflow.data))
  }

  // 워크플로우 로드 시 nodeMappings 자동 감지 (비어있을 때만)
  useEffect(() => {
    if (!parsedWorkflow?.success || nodeMappings.length > 0) return
    const auto = buildAutoMappings(parsedWorkflow.data)
    if (auto.length > 0) setNodeMappings(auto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedWorkflow, nodeMappings])

  const handleImageUpload = async (
    file: File,
    nodeId: string,
    inputKey: string
  ) => {
    const key = `${nodeId}.${inputKey}`
    setImageUploads((prev) => ({
      ...prev,
      [key]: { uploadedName: null, error: null, uploading: true },
    }))
    const workerUrl = workers.find((w) => w.alive)?.url
    if (!workerUrl) {
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploadedName: null,
          error: "업로드 가능한 ComfyUI 워커가 없습니다.",
          uploading: false,
        },
      }))
      return
    }
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res = await fetch(`${workerUrl}/upload/image`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { name: string }
      setImageUploads((prev) => ({
        ...prev,
        [key]: { uploadedName: data.name, error: null, uploading: false },
      }))
    } catch (err) {
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploadedName: null,
          error: `업로드 실패: ${err instanceof Error ? err.message : String(err)}`,
          uploading: false,
        },
      }))
    }
  }

  return (
    <NodeMappingContext.Provider
      value={{
        nodeMappings,
        setNodeMappings,
        updateMapping,
        handleAutoMap,
        handleImageUpload,
        imageUploads,
        availableNodeOptions,
        objectInfo,
        setObjectInfo,
        savedNodeMappings,
        activeNodeMappingPresetId,
        setActiveNodeMappingPresetId,
        activeNodeMappingPreset,
        nodeMappingResetKey,
        setNodeMappingResetKey,
        saveMappingPreset,
        deleteMappingPreset,
      }}
    >
      {children}
    </NodeMappingContext.Provider>
  )
}
