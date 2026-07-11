import {
  CheckIcon,
  CheckSquareIcon,
  FolderIcon,
  RefreshCwIcon,
  SquareIcon,
  Clock,
  Tag,
  FileText,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"

import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HoverCardContent } from "@/components/ui/hover-card"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  type ComponentProps,
} from "react"
import type { SavedImage } from "../../types/Message"
import type { SavedTemplate } from "../../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../../hooks/useSavedWorkflows"
import { API, HEADERS } from "@/lib/api"
import { toast } from "sonner"
import { buildWorkflowForItem } from "@/lib/workflowUtils"
import type { ComfyWorkflow, NodeMapping } from "@/lib/workflow"
import { NodeMappingSection } from "../NodeMappingSection"
import type { ObjectInfo } from "../../types/renderTypes"
import type { RenderItem } from "../../types/renderTypes"
import { useLocalStorage } from "../../hooks/useLocalStorage"
import { useLatestRef } from "../../hooks/useLatestRef"
import { STORAGE_KEYS } from "@/lib/storageKeys"

export type { RenderItem }

export interface CombinationViewProps {
  items: RenderItem[]
  imagesByFilename: Map<string, SavedImage[]>
  backendUrl: string
  onSelect: (filename: string) => void
  onOpen: (filename: string) => void
  selectionMode: boolean
  selectedFilenames: Set<string>
  onToggleSelect: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
  enableHover?: boolean
}

export function ImagePreviewHoverCard({
  filename,
  images,
  backendUrl,
}: {
  filename: string
  images: SavedImage[]
  backendUrl: string
}): React.JSX.Element {
  const approvedCount = images.filter((img) => img.status === "approved").length
  const rejectedCount = images.filter((img) => img.status === "rejected").length
  const pendingCount = images.filter((img) => img.status === "pending").length
  const trashedCount = images.filter((img) => img.status === "trashed").length

  const allTags = Array.from(new Set(images.flatMap((img) => img.tags))).slice(
    0,
    4
  )

  const sortedImages = useMemo(() => {
    return [...images].sort((a, b) => b.createdAt - a.createdAt)
  }, [images])

  const latestImage = sortedImages[0]
  const latestPrompt = latestImage?.prompt ?? ""
  const latestNote = latestImage?.note ?? ""
  const latestDate =
    latestImage?.createdAt !== undefined
      ? new Date(latestImage.createdAt).toLocaleString("ko-KR", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : ""

  return (
    <HoverCardContent
      className="w-80 animate-in rounded-xl border border-border/80 bg-popover/95 p-4 shadow-2xl backdrop-blur-md transition-all duration-300 fade-in-50 zoom-in-95"
      side="right"
      align="start"
    >
      {/* Title & Info Header */}
      <div className="mb-3 flex flex-col gap-2 border-b border-border/40 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="max-w-[200px] truncate rounded border border-border/50 bg-muted px-2 py-0.5 font-mono text-xs font-black tracking-tight text-foreground">
            {filename}
          </span>
          <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-black tracking-wider text-primary uppercase">
            {images.length}장
          </span>
        </div>

        {/* Curation Stat Pills */}
        {images.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {approvedCount > 0 && (
              <Badge
                variant="default"
                className="h-auto items-center gap-1 border border-ok/20 bg-ok-bg px-1.5 py-0.5 text-[9px] font-extrabold text-ok"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
                통과 {approvedCount}
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge
                variant="default"
                className="h-auto items-center gap-1 border border-warn/20 bg-warn-bg px-1.5 py-0.5 text-[9px] font-extrabold text-warn"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                대기 {pendingCount}
              </Badge>
            )}
            {rejectedCount > 0 && (
              <Badge
                variant="default"
                className="h-auto items-center gap-1 border border-bad/20 bg-bad-bg px-1.5 py-0.5 text-[9px] font-extrabold text-bad"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-bad" />
                탈락 {rejectedCount}
              </Badge>
            )}
            {trashedCount > 0 && (
              <Badge
                variant="default"
                className="h-auto items-center gap-1 border border-border/30 bg-muted px-1.5 py-0.5 text-[9px] font-extrabold text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                휴지통 {trashedCount}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Grid of Images */}
      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <FolderIcon className="mb-2 h-8 w-8 stroke-1 text-muted-foreground/30" />
          <p className="text-[10px] italic">저장된 이미지가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {images.slice(0, 12).map((img) => (
              <div
                key={img.hash}
                className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-border/40 bg-muted transition-all duration-200 hover:scale-105 hover:shadow-md hover:ring-2 hover:ring-primary/20"
              >
                {/* Blurred Background to eliminate empty margins */}
                <img
                  src={`${backendUrl}/saved-images/${img.hash}`}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-md select-none"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  aria-hidden="true"
                />
                <img
                  src={`${backendUrl}/saved-images/${img.hash}`}
                  className="relative z-10 h-full w-full object-contain"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />

                {/* Status Overlays */}
                {img.status === "approved" && (
                  <div className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-ok text-white shadow-md">
                    <CheckIcon className="h-3 w-3 stroke-[3]" />
                  </div>
                )}
                {img.status === "rejected" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[0.5px]">
                    <span className="scale-90 rounded bg-bad/80 px-1 text-[8px] font-black tracking-widest text-white/90">
                      탈락
                    </span>
                  </div>
                )}
                {img.status === "trashed" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-[0.5px]">
                    <Trash2 className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {images.length > 12 && (
              <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted text-[11px] font-black text-muted-foreground transition-colors hover:bg-muted/80">
                +{images.length - 12}
              </div>
            )}
          </div>

          {/* Expanded Prompt & Metadata Details */}
          {(allTags.length > 0 || latestPrompt || latestNote || latestDate) && (
            <div className="space-y-2.5 border-t border-border/30 pt-3">
              {/* Tags Capsules */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {allTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="h-auto items-center gap-0.5 rounded-full border border-border/20 bg-muted/65 px-1.5 py-0.5 text-[9px] font-black tracking-tight text-muted-foreground"
                    >
                      <Tag className="h-2 w-2 stroke-[2.5]" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Prompt Block */}
              {latestPrompt && (
                <div className="relative rounded-lg border border-border/20 bg-muted/30 p-2 text-left">
                  <div className="mb-1 flex items-center gap-1.5 text-[8px] font-bold tracking-wider text-muted-foreground uppercase">
                    <FileText className="h-2.5 w-2.5" />
                    최근 프롬프트
                  </div>
                  <p className="line-clamp-3 font-mono text-[9px] leading-normal text-muted-foreground select-all">
                    {latestPrompt}
                  </p>
                </div>
              )}

              {/* Note / Memo Block */}
              {latestNote && (
                <div className="border-l-2 border-warn/45 py-0.5 pl-2 text-left">
                  <p className="text-[9px] leading-normal font-medium text-foreground/80 italic">
                    💡 {latestNote}
                  </p>
                </div>
              )}

              {/* Latest update timestamp */}
              {latestDate && (
                <div className="flex items-center justify-end gap-1 text-[8.5px] font-semibold text-muted-foreground/60">
                  <Clock className="h-2.5 w-2.5" />
                  <span>최근 저장: {latestDate}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </HoverCardContent>
  )
}

export function CombinationContextMenu({
  filename,
  isSelected,
  selectionMode,
  onOpen,
  onToggleSelect,
  onLongPress,
  onRegenerate,
}: {
  filename: string
  isSelected: boolean
  selectionMode: boolean
  onOpen: (filename: string) => void
  onToggleSelect: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
}): React.JSX.Element {
  return (
    <ContextMenuContent className="w-52">
      <ContextMenuLabel className="truncate font-mono text-[10px]">
        {filename}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => {
          onOpen(filename)
        }}
      >
        <FolderIcon className="h-4 w-4" /> 열기
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          if (selectionMode) {
            onToggleSelect(filename)
          } else {
            onLongPress(filename)
          }
        }}
      >
        {isSelected ? (
          <CheckSquareIcon className="h-4 w-4" />
        ) : (
          <SquareIcon className="h-4 w-4" />
        )}
        {isSelected ? "선택 해제" : "선택하기"}
      </ContextMenuItem>
      {onRegenerate && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              onRegenerate(filename)
            }}
          >
            <RefreshCwIcon className="h-4 w-4" /> 재생성
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )
}

interface LoadingButtonProps extends ComponentProps<typeof Button> {
  isLoading: boolean
  icon: React.ComponentType<{ className?: string }>
}

export function LoadingButton({
  isLoading,
  icon: Icon,
  children,
  disabled,
  ...props
}: LoadingButtonProps): React.JSX.Element {
  return (
    <Button {...props} disabled={isLoading || disabled}>
      {isLoading ? <Spinner /> : <Icon />}
      {children}
    </Button>
  )
}

export interface RegenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceImages: SavedImage[]
  targetItem?: RenderItem
  targetItems?: RenderItem[]
  backendUrl: string
  currentCegTemplate: string
  preferCurrentTemplate?: boolean
  savedTemplates: SavedTemplate[]
  savedWorkflows: SavedWorkflow[]
  saveMappingPreset: (
    workflowId: string,
    name: string,
    mappings: NodeMapping[]
  ) => SavedWorkflow | null
  deleteMappingPreset: (
    workflowId: string,
    presetId: string
  ) => SavedWorkflow | null
  onSubmit: (
    items: {
      filename: string
      prompt: string
      workflow: ComfyWorkflow
      meta: Record<string, string>
      cegTemplate: string
      imageUploads: Record<string, Record<string, string>>
      workerType: string
    }[]
  ) => Promise<void>
  isLoading: boolean
}

export function RegenerateDialog({
  open,
  onOpenChange,
  sourceImages,
  targetItem,
  targetItems,
  backendUrl,
  currentCegTemplate,
  preferCurrentTemplate = false,
  savedTemplates,
  savedWorkflows,
  saveMappingPreset,
  deleteMappingPreset,
  onSubmit,
  isLoading,
}: RegenerateDialogProps): React.JSX.Element {
  const [count, setCount] = useLocalStorage<number>(STORAGE_KEYS.regenCount, 4)
  const [countInput, setCountInput] = useState(() => String(count))
  const [selectedTemplateId, setSelectedTemplateId] = useLocalStorage<string>(
    STORAGE_KEYS.regenTemplateId,
    "__current__"
  )
  const [selectedWorkflowId, setSelectedWorkflowId] = useLocalStorage<string>(
    STORAGE_KEYS.regenWorkflowId,
    ""
  )
  const [nodeMappings, setNodeMappings] = useLocalStorage<NodeMapping[]>(
    STORAGE_KEYS.regenNodeMappings,
    []
  )
  const [objectInfo, setObjectInfo] = useState<ObjectInfo | null>(null)
  const [imageUploads, setImageUploads] = useState(
    {} as Record<
      string,
      {
        uploadedName: string | null
        error: string | null
        uploading: boolean
        previewUrl: string | null
      }
    >
  )
  const dialogActiveRef = useRef(open)
  const countInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef(new Set<string>())

  const revokePreviewUrl = useCallback(
    (url: string | null | undefined): void => {
      if (url === null || url === undefined) return
      URL.revokeObjectURL(url)
      previewUrlsRef.current.delete(url)
    },
    []
  )

  const revokeAllPreviewUrls = useCallback(() => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    previewUrlsRef.current.clear()
  }, [])

  useEffect(() => {
    dialogActiveRef.current = open
    if (open) {
      setCountInput(String(Math.min(64, Math.max(1, count || 1))))
      window.setTimeout(() => {
        countInputRef.current?.focus()
        countInputRef.current?.select()
      }, 0)
    }
    return (): void => {
      dialogActiveRef.current = false
    }
  }, [count, open])

  useEffect(() => {
    if (open && preferCurrentTemplate) {
      setSelectedTemplateId("__current__")
    }
  }, [open, preferCurrentTemplate, setSelectedTemplateId])

  const historicalTemplates = useMemo(() => {
    const templates = new Set<string>()
    for (const img of sourceImages) {
      if (img.cegTemplate !== undefined) {
        templates.add(img.cegTemplate)
      }
    }
    return Array.from(templates)
  }, [sourceImages])

  const historicalWorkflows = useMemo(() => {
    const items: {
      id: string
      name: string
      workflow: string
      createdAt: number
    }[] = []
    const seen = new Set<string>()
    let idx = 0
    for (const img of sourceImages) {
      if (!img.workflow) continue
      const wf = JSON.stringify(img.workflow)
      if (seen.has(wf)) continue
      seen.add(wf)
      idx++
      const d = new Date(img.createdAt)
      const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      items.push({
        id: `__history_wf__${String(idx)}`,
        name: `기록 ${String(idx)} · ${dateStr}`,
        workflow: wf,
        createdAt: img.createdAt,
      })
    }
    return items
  }, [sourceImages])

  const selectedWorkflow = useMemo(() => {
    const sw = savedWorkflows.find((w) => w.id === selectedWorkflowId)
    if (sw) return { id: sw.id, name: sw.name, workflow: sw.workflow }
    return historicalWorkflows.find((w) => w.id === selectedWorkflowId)
  }, [selectedWorkflowId, savedWorkflows, historicalWorkflows])

  const parsedWorkflowData = useMemo(() => {
    const wf =
      selectedWorkflow?.workflow ??
      (sourceImages[0]?.workflow
        ? JSON.stringify(sourceImages[0].workflow)
        : null)
    if (wf === null) return null
    try {
      return JSON.parse(wf) as ComfyWorkflow
    } catch {
      return null
    }
  }, [selectedWorkflow, sourceImages])

  const sourceFilename = sourceImages[0]?.originalFilename ?? ""
  const targetFilename = targetItem?.filename ?? sourceFilename

  const resolvedTemplate = useMemo(() => {
    if (selectedTemplateId === "__current__") return currentCegTemplate
    if (selectedTemplateId.startsWith("history-")) {
      const idx = parseInt(selectedTemplateId.replace("history-", ""), 10)
      return historicalTemplates[idx] ?? ""
    }
    const st = savedTemplates.find((t) => t.id === selectedTemplateId)
    return st?.template ?? ""
  }, [
    selectedTemplateId,
    currentCegTemplate,
    savedTemplates,
    historicalTemplates,
  ])

  // Fetch object_info when workflow changes
  useEffect(() => {
    if (!open || !backendUrl) return
    const controller = new AbortController()
    fetch(`${backendUrl}/object_info`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setObjectInfo(d as ObjectInfo | null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setObjectInfo(null)
      })
    return (): void => {
      controller.abort()
    }
  }, [open, backendUrl])

  const availableNodeOptions = useMemo(() => {
    if (!parsedWorkflowData) return []
    const inUse = new Set(nodeMappings.map((m) => `${m.nodeId}.${m.inputKey}`))
    const opts: {
      nodeId: string
      title: string
      inputKey: string
      isNumeric: boolean
      isLoadImage: boolean
    }[] = []
    Object.entries(parsedWorkflowData).forEach(([nodeId, node]) => {
      Object.entries(node.inputs).forEach(([inputKey, value]) => {
        if (
          !inUse.has(`${nodeId}.${inputKey}`) &&
          (typeof value === "string" || typeof value === "number")
        ) {
          opts.push({
            nodeId,
            title: node._meta?.title ?? node.class_type,
            inputKey,
            isNumeric: typeof value === "number",
            isLoadImage:
              node.class_type === "LoadImage" && inputKey === "image",
          })
        }
      })
    })
    return opts
  }, [parsedWorkflowData, nodeMappings])

  const updateMapping = useCallback(
    (id: string, patch: Partial<NodeMapping>) => {
      setNodeMappings((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m
          if (
            patch.sourceType !== undefined &&
            m.sourceType === "image" &&
            patch.sourceType !== "image"
          ) {
            const next = { ...m, ...patch }
            delete (next as NodeMapping & { imageValue?: string }).imageValue
            return next
          }
          return { ...m, ...patch }
        })
      )
    },
    [setNodeMappings]
  )

  const handleImageUpload = useCallback(
    (file: File, nodeId: string, inputKey: string) => {
      const key = `${nodeId}.${inputKey}`
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploading: true,
          error: null,
          uploadedName: null,
          previewUrl: null,
        },
      }))
      const formData = new FormData()
      formData.append("image", file)
      formData.append("overwrite", "true")
      fetch(`${backendUrl}/upload/image`, {
        method: "POST",
        body: formData,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${String(r.status)}`)
          const data = (await r.json()) as { name: string }
          if (!dialogActiveRef.current) return
          const previewUrl = URL.createObjectURL(file)
          previewUrlsRef.current.add(previewUrl)
          setImageUploads((prev) => {
            revokePreviewUrl(prev[key]?.previewUrl)
            return {
              ...prev,
              [key]: {
                uploading: false,
                error: null,
                uploadedName: data.name,
                previewUrl,
              },
            }
          })
          updateMapping(
            nodeMappings.find(
              (m) => m.nodeId === nodeId && m.inputKey === inputKey
            )?.id ?? "",
            { sourceType: "image", imageValue: data.name }
          )
        })
        .catch((e: unknown) => {
          if (!dialogActiveRef.current) return
          setImageUploads((prev) => {
            revokePreviewUrl(prev[key]?.previewUrl)
            const errorMessage = e instanceof Error ? e.message : String(e)
            return {
              ...prev,
              [key]: {
                uploading: false,
                error: errorMessage,
                uploadedName: null,
                previewUrl: null,
              },
            }
          })
        })
    },
    [backendUrl, nodeMappings, revokePreviewUrl, updateMapping]
  )

  useEffect(() => {
    if (!open) return
    const resetTimer = window.setTimeout(() => {
      revokeAllPreviewUrls()
      setImageUploads({})
    }, 0)
    return (): void => {
      window.clearTimeout(resetTimer)
    }
  }, [open, revokeAllPreviewUrls])

  useEffect(() => revokeAllPreviewUrls, [revokeAllPreviewUrls])

  // ── Refs for latest values ────────────────────────────────────────
  const isLoadingRef = useLatestRef(isLoading)
  const sourceImagesRef = useLatestRef(sourceImages)
  const selectedWorkflowRef = useLatestRef(selectedWorkflow)
  const nodeMappingsRef = useLatestRef(nodeMappings)
  const resolvedTemplateRef = useLatestRef(resolvedTemplate)
  const sourceFilenameRef = useLatestRef(sourceFilename)
  const targetItemRef = useLatestRef(targetItem)
  const targetItemsRef = useLatestRef(targetItems)
  const targetFilenameRef = useLatestRef(targetFilename)
  const backendUrlRef = useLatestRef(backendUrl)
  const onSubmitRef = useLatestRef(onSubmit)

  const handleConfirm = useCallback(async () => {
    const explicitTargets =
      targetItemsRef.current ??
      (targetItemRef.current !== undefined ? [targetItemRef.current] : [])
    if (
      isLoadingRef.current ||
      (sourceImagesRef.current.length === 0 && explicitTargets.length === 0)
    )
      return
    const normalizedCount = Math.min(
      64,
      Math.max(1, parseInt(countInputRef.current?.value ?? "", 10) || 1)
    )
    setCount(normalizedCount)
    setCountInput(String(normalizedCount))

    const workflowJson =
      selectedWorkflowRef.current?.workflow ??
      (sourceImagesRef.current[0]?.workflow
        ? JSON.stringify(sourceImagesRef.current[0].workflow)
        : null)
    if (workflowJson === null) {
      return
    }

    if (nodeMappingsRef.current.length === 0) {
      toast.error("노드매핑이 설정되지 않았습니다. 매핑을 추가해주세요.")
      return
    }

    // Build imageNameMap for buildWorkflowForItem
    const imageNameMap: Record<string, string> = {}
    const imageUploadsNested: Record<string, Record<string, string>> = {}
    for (const m of nodeMappingsRef.current) {
      if (m.sourceType === "image" && m.imageValue !== undefined) {
        imageNameMap[`${m.nodeId}.${m.inputKey}`] = m.imageValue
        imageUploadsNested[m.nodeId] = {
          ...imageUploadsNested[m.nodeId],
          [m.inputKey]: m.imageValue,
        }
      }
    }

    let renderItems: RenderItem[]
    if (resolvedTemplateRef.current) {
      const res = await fetch(`${backendUrlRef.current}${API.render}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ template: resolvedTemplateRef.current }),
      })
      if (!res.ok) throw new Error(`Render failed: HTTP ${String(res.status)}`)
      const data = (await res.json()) as { items: RenderItem[] }
      if (targetItemRef.current !== undefined) {
        const matchedItems: RenderItem[] = []
        const seen = new Set<string>()
        for (const target of explicitTargets) {
          const sameMeta = (item: RenderItem): boolean =>
            Object.entries(target.meta).every(
              ([key, value]) => item.meta[key] === value
            )
          const matched =
            data.items.find((item) => item.filename === target.filename) ??
            data.items.find(sameMeta) ??
            null
          if (matched === null) {
            toast.error("현재 조합을 새 템플릿 결과에서 찾지 못했습니다.")
            return
          }
          if (!seen.has(matched.filename)) {
            seen.add(matched.filename)
            matchedItems.push(matched)
          }
        }
        renderItems = matchedItems
      } else if (explicitTargets.length > 0) {
        const matchedItems: RenderItem[] = []
        const seen = new Set<string>()
        for (const target of explicitTargets) {
          const sameMeta = (item: RenderItem): boolean =>
            Object.entries(target.meta).every(
              ([key, value]) => item.meta[key] === value
            )
          const matched =
            data.items.find((item) => item.filename === target.filename) ??
            data.items.find(sameMeta) ??
            null
          if (matched === null) {
            toast.error("재생성할 조합을 새 템플릿 결과에서 찾지 못했습니다.")
            return
          }
          if (!seen.has(matched.filename)) {
            seen.add(matched.filename)
            matchedItems.push(matched)
          }
        }
        renderItems = matchedItems
      } else {
        renderItems = data.items.filter((item) =>
          sourceImagesRef.current.some(
            (image) => image.originalFilename === item.filename
          )
        )
        if (renderItems.length === 0) {
          toast.error("재생성할 조합을 찾지 못했습니다.")
          return
        }
      }
    } else {
      renderItems =
        explicitTargets.length > 0
          ? explicitTargets
          : [
              {
                filename: targetFilenameRef.current,
                prompt: "",
                meta: targetItemRef.current?.meta ?? {},
              },
            ]
    }

    const allItems: {
      filename: string
      prompt: string
      workflow: ComfyWorkflow
      meta: Record<string, string>
      cegTemplate: string
      imageUploads: Record<string, Record<string, string>>
      workerType: string
    }[] = []

    for (let i = 0; i < normalizedCount; i++) {
      for (const item of renderItems) {
        const wf = buildWorkflowForItem(
          workflowJson,
          item,
          nodeMappingsRef.current,
          imageNameMap
        )
        allItems.push({
          filename: item.filename,
          prompt: item.prompt,
          workflow: wf,
          meta: item.meta,
          cegTemplate: resolvedTemplateRef.current || "",
          imageUploads: imageUploadsNested,
          workerType: "comfyui",
        })
      }
    }

    await onSubmitRef.current(allItems)
  }, [
    backendUrlRef,
    isLoadingRef,
    nodeMappingsRef,
    onSubmitRef,
    resolvedTemplateRef,
    selectedWorkflowRef,
    setCount,
    sourceImagesRef,
    targetFilenameRef,
    targetItemRef,
    targetItemsRef,
  ])

  const hasWorkflowForRegeneration = parsedWorkflowData !== null
  const canConfirm = isLoading || !hasWorkflowForRegeneration
  const normalizeCountInput = useCallback(
    (value: string): number => Math.min(64, Math.max(1, parseInt(value, 10) || 1)),
    []
  )
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.nativeEvent.isComposing) return
      const target = e.target
      const isControlTarget =
        target instanceof HTMLElement &&
        target.closest(
          "button, input, textarea, [role='button'], [role='combobox'], [role='listbox'], [role='menuitem'], .cm-editor"
        ) !== null

      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        if (isControlTarget) return
        if (canConfirm) return
        e.preventDefault()
        void handleConfirm()
        return
      }

      if (!e.altKey || e.ctrlKey || e.metaKey) {
        return
      }

      const key = e.key.toLowerCase()
      const shortcutTarget = (() => {
        if (key === "c") return "[data-regen-shortcut='count']"
        if (key === "w") return "[data-regen-shortcut='workflow']"
        if (key === "m") return "[data-regen-shortcut='mapping']"
        if (key === "t") return "[data-regen-shortcut='template']"
        return null
      })()
      if (shortcutTarget === null) return

      const el = e.currentTarget.querySelector<HTMLElement>(shortcutTarget)
      if (el === null) return
      e.preventDefault()
      el.focus()
      if (key !== "c") el.click()
    },
    [canConfirm, handleConfirm]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCwIcon className="h-5 w-5" />
            재생성 설정
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
            <Kbd>Alt+C</Kbd>
            <span>갯수</span>
            <Kbd>Alt+W</Kbd>
            <span>워크플로우</span>
            <Kbd>Alt+M</Kbd>
            <span>매핑</span>
            <Kbd>Alt+T</Kbd>
            <span>템플릿</span>
            <Kbd>Enter</Kbd>
            <span>시작</span>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="regen-count"
              className="flex items-center gap-1.5 text-xs font-bold uppercase"
            >
              <span>생성 갯수 (Count)</span>
              <Kbd>Alt+C</Kbd>
            </Label>
            <Input
              ref={countInputRef}
              data-regen-shortcut="count"
              id="regen-count"
              type="number"
              min={1}
              max={64}
              inputMode="numeric"
              pattern="[0-9]*"
              value={countInput}
              onChange={(e) => {
                setCountInput(e.target.value.replace(/\D/g, ""))
              }}
              onBlur={() => {
                const normalizedCount = normalizeCountInput(countInput)
                setCount(normalizedCount)
                setCountInput(String(normalizedCount))
              }}
              onCompositionEnd={(e) => {
                setCountInput(e.currentTarget.value.replace(/\D/g, ""))
              }}
              onBeforeInput={(e) => {
                const data = e.nativeEvent.data
                if (data !== null && /\D/.test(data)) {
                  e.preventDefault()
                }
              }}
              onKeyDown={(e) => {
                const allowedKeys = new Set([
                  "Backspace",
                  "Delete",
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "Tab",
                  "Enter",
                ])
                if (
                  !allowedKeys.has(e.key) &&
                  !/^\d$/.test(e.key) &&
                  !e.ctrlKey &&
                  !e.metaKey
                ) {
                  e.preventDefault()
                  return
                }
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.altKey &&
                  !e.ctrlKey &&
                  !e.metaKey &&
                  !canConfirm
                ) {
                  e.preventDefault()
                  void handleConfirm()
                }
              }}
              className="font-mono font-bold"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="workflow-select"
              className="flex items-center gap-1.5 text-xs font-bold uppercase"
            >
              <span>ComfyUI 워크플로우 선택</span>
              <Kbd>Alt+W</Kbd>
            </Label>
            <Select
              value={selectedWorkflowId || "__none__"}
              onValueChange={(v) => {
                setSelectedWorkflowId(v === "__none__" ? "" : v)
                setNodeMappings([])
              }}
            >
              <SelectTrigger
                data-regen-shortcut="workflow"
                className="w-full max-w-full truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-60 w-[var(--radix-select-trigger-width)] overflow-y-auto"
              >
                <SelectItem value="__none__">
                  {selectedWorkflowId
                    ? "워크플로우 해제"
                    : "소스 이미지의 워크플로우 사용"}
                </SelectItem>
                {savedWorkflows.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>저장된 워크플로우</SelectLabel>
                      {savedWorkflows.map((sw) => (
                        <SelectItem key={sw.id} value={sw.id}>
                          {sw.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
                {historicalWorkflows.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>과거 사용 내역 (History)</SelectLabel>
                      {historicalWorkflows.map((hw) => (
                        <SelectItem key={hw.id} value={hw.id}>
                          {hw.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Node Mapping Editor */}
          {parsedWorkflowData && (
            <NodeMappingSection
              nodeMappings={nodeMappings}
              setNodeMappings={setNodeMappings}
              updateMapping={updateMapping}
              availableNodeOptions={availableNodeOptions}
              parsedWorkflowData={parsedWorkflowData}
              objectInfo={objectInfo}
              activeWorkflowId={selectedWorkflow?.id ?? null}
              savedNodeMappings={
                savedWorkflows.find((w) => w.id === selectedWorkflow?.id)
                  ?.mappingPresets ?? []
              }
              savedWorkflows={savedWorkflows}
              onSaveNodeMapping={(name) => {
                if (selectedWorkflow === undefined) return false
                const trimmed = name.trim()
                const result = saveMappingPreset(selectedWorkflow.id, trimmed, [
                  ...nodeMappings,
                ])
                return result !== null
              }}
              onLoadNodeMapping={(m) => {
                setNodeMappings(m.mappings)
              }}
              onDeleteNodeMapping={(presetId) => {
                if (selectedWorkflow === undefined) return
                deleteMappingPreset(selectedWorkflow.id, presetId)
              }}
              onUpdateNodeMapping={() => {
                /* no-op */
              }}
              onImportFromPreset={(mappings) => {
                setNodeMappings(mappings)
              }}
              handleImageUpload={handleImageUpload}
              imageUploads={imageUploads}
            />
          )}

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="template-select"
              className="flex items-center gap-1.5 text-xs font-bold uppercase"
            >
              <span>사용할 템플릿 (CEG Template)</span>
              <Kbd>Alt+T</Kbd>
            </Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
            >
              <SelectTrigger
                data-regen-shortcut="template"
                className="w-full max-w-full truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-60 w-[var(--radix-select-trigger-width)] overflow-y-auto"
              >
                <SelectItem value="__current__">
                  현재 편집 중인 템플릿
                </SelectItem>
                {savedTemplates.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>저장된 프리셋</SelectLabel>
                      {savedTemplates.map((st) => (
                        <SelectItem key={st.id} value={st.id}>
                          {st.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
                {historicalTemplates.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>과거 사용 내역</SelectLabel>
                      {historicalTemplates.map((_t, i) => (
                        <SelectItem key={i} value={`history-${String(i)}`}>
                          기록 {i + 1}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {resolvedTemplate && !selectedWorkflowId && (
            <div className="rounded-md bg-muted p-3">
              <div className="mb-1 text-[10px] font-bold text-muted-foreground uppercase">
                Template Preview
              </div>
              <pre className="max-h-32 overflow-y-auto font-mono text-[11px] leading-tight whitespace-pre-wrap">
                {resolvedTemplate}
              </pre>
            </div>
          )}

          {!sourceImages[0]?.workflow && selectedWorkflow === undefined && (
            <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-600">
              소스 이미지에 워크플로우 정보가 없습니다. 저장된 워크플로우를
              선택하면 재생성할 수 있습니다.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            취소
          </Button>
          <Button
            onClick={() => {
              void handleConfirm()
            }}
            disabled={canConfirm}
          >
            {isLoading && <Spinner className="mr-2 h-4 w-4" />}
            재생성 시작
            <Kbd className="ml-2 border-white/20 bg-white/15 text-white">
              Enter
            </Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
