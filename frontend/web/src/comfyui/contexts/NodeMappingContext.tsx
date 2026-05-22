import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { useSyncedStorage } from "../hooks/useSyncedStorage"
import type { NodeMapping } from "@/lib/workflow"
import { buildAutoMappings } from "@/lib/workflowUtils"
import type { ObjectInfo } from "../types/renderTypes"
import type {
  SavedNodeMappingPreset,
  SavedWorkflow,
} from "../hooks/useSavedWorkflows"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { useWorkflowContext } from "./WorkflowContext"
import { API } from "@/lib/api"

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
  backendUrl: string
  children: React.ReactNode
}

export function NodeMappingProvider({
  backendUrl,
  children,
}: NodeMappingProviderProps): React.JSX.Element {
  const {
    parsedWorkflow,
    activeWorkflow,
    saveMappingPreset,
    deleteMappingPreset,
  } = useWorkflowContext()

  const [nodeMappings, setNodeMappings] = useSyncedStorage<NodeMapping[]>(
    STORAGE_KEYS.nodeMappings,
    []
  )
  const [activeNodeMappingPresetId, setActiveNodeMappingPresetId] =
    useSyncedStorage<string | null>(
      STORAGE_KEYS.activeNodeMappingPresetId,
      null
    )
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
      prev.map((m) => {
        if (m.id !== id) return m
        // sourceType가 image에서 다른 값으로 변경되면 imageValue 초기화
        if (
          patch.sourceType !== undefined &&
          m.sourceType === "image" &&
          patch.sourceType !== "image"
        ) {
          const next = { ...m, ...patch }
          delete next.imageValue
          return next
        }
        return { ...m, ...patch }
      })
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

  // 새로고침 후 imageValue에서 previewUrl 복원
  useEffect(() => {
    const markerRe = /^__upload__([a-f0-9]{64})\.(png|jpg|jpeg|webp)$/
    const next: Record<string, ImageUploadState> = {}
    nodeMappings.forEach((m) => {
      if (m.sourceType !== "image" || !m.imageValue) return
      const match = markerRe.exec(m.imageValue)
      if (!match) return
      const [, hash, ext] = match
      if (!hash || !ext) return
      const key = `${m.nodeId}.${m.inputKey}`
      next[key] = {
        uploadedName: hash,
        error: null,
        uploading: false,
        previewUrl: `${backendUrl}/uploaded_images/${hash}.${ext}`,
      }
    })
    setImageUploads((prev) => ({ ...prev, ...next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeMappings])

  const handleImageUpload = async (
    file: File,
    nodeId: string,
    inputKey: string
  ) => {
    const key = `${nodeId}.${inputKey}`
    const previewUrl = URL.createObjectURL(file)
    setImageUploads((prev) => ({
      ...prev,
      [key]: { uploadedName: null, error: null, uploading: true, previewUrl },
    }))
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`${backendUrl}${API.images.upload}`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { hash: string; filename: string }
      // imageValue에 __upload__{hash}.{ext} 마커 저장
      const ext = file.name.split(".").pop() ?? "png"
      updateMapping(
        nodeMappings.find((m) => m.nodeId === nodeId && m.inputKey === inputKey)
          ?.id ?? "",
        { imageValue: `__upload__${data.hash}.${ext}` }
      )
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploadedName: data.hash,
          error: null,
          uploading: false,
          previewUrl,
        },
      }))
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploadedName: null,
          error: `업로드 실패: ${err instanceof Error ? err.message : String(err)}`,
          uploading: false,
          previewUrl: null,
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
