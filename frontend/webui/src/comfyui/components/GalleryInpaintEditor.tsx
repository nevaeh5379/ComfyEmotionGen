import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Brush,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  Info,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
  X,
  ZoomIn,
  ZoomOut,
  ArrowLeftRight,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { API, HEADERS } from "@/lib/api"
import { MAX_RANDOM_SEED } from "@/lib/constants"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import type { ComfyWorkflow, NodeInputValue } from "@/lib/workflow"
import { useWorkflowContext } from "../contexts/WorkflowContext"
import { useBackend } from "../hooks/useBackend"
import { useWorkerPreviews } from "../hooks/useWorkerPreviews"
import type { BackendEvent } from "../types/Message"
import { triggerBlobDownload } from "../utils/downloadImages"
import { enforceImageDataHistoryLimit } from "../utils/imageDataHistory"
import { WorkerPreviewImage } from "./WorkerPreviewImage"

interface GalleryInpaintEditorProps {
  open: boolean
  backendUrl: string
  imageUrl: string
  filename: string
  sourcePrompt?: string
  sourceMeta?: Record<string, string> | undefined
  onOpenChange: (open: boolean) => void
}

type PaintMode = "paint" | "erase"

interface WorkflowInputCandidate {
  id: string
  nodeId: string
  inputKey: string
  label: string
  isNumeric: boolean
  isImage: boolean
}

type InpaintMappingSource =
  | "prompt"
  | "sourceImage"
  | "maskImage"
  | "maskRgbImage"
  | "sourceWithAlphaMask"
  | "filename"
  | "seed"
  | "fixed"

interface InpaintNodeMapping {
  id: string
  nodeId: string
  inputKey: string
  sourceType: InpaintMappingSource
  fixedValue?: string
  seedValue?: number
  seedRandom?: boolean
}

interface SavedInpaintWorkflow {
  id: string
  name: string
  workflow: string
  mappings: InpaintNodeMapping[]
  savedAt: number
}

const INPAINT_SOURCE_LABELS: Record<InpaintMappingSource, string> = {
  prompt: "프롬프트",
  sourceImage: "원본 이미지",
  maskImage: "마스크(LoadImage MASK)",
  maskRgbImage: "마스크 RGB(흰색=수정)",
  sourceWithAlphaMask: "원본+마스크(RGBA)",
  filename: "파일명",
  seed: "시드",
  fixed: "고정값",
}

const CANVAS_MAX_SIZE = 1600
const COMFY_DEFAULT_BRUSH_STEP_SIZE = 5
const HISTORY_MAX = 30
const MIN_ZOOM = 0.2
const MAX_ZOOM = 8

function getBrushSpacing(brushSize: number): number {
  const stepPercentage =
    Math.pow(100, COMFY_DEFAULT_BRUSH_STEP_SIZE / 100) / 100
  return Math.max(1, brushSize * stepPercentage)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getPoint(
  canvas: HTMLCanvasElement,
  event: React.PointerEvent<HTMLCanvasElement>,
  zoom: number,
  pan: { x: number; y: number }
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  }
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  mode: PaintMode,
  hardness: number,
  opacity: number
): void {
  const radius = Math.max(0.5, size / 2)
  ctx.save()
  ctx.globalCompositeOperation =
    mode === "paint" ? "source-over" : "destination-out"
  if (hardness >= 1 && opacity >= 1) {
    ctx.fillStyle = "rgb(255, 255, 255)"
  } else {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    const innerAlpha = Math.min(1, Math.max(0, opacity))
    const hardStop = Math.min(1, Math.max(0, hardness))
    const innerColor = `rgba(255, 255, 255, ${innerAlpha.toFixed(3)})`
    gradient.addColorStop(0, innerColor)
    gradient.addColorStop(hardStop, innerColor)
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)")
    ctx.fillStyle = gradient
  }
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function extractPositivePrompt(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === "") return raw
  if (!trimmed.startsWith("{")) return raw
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (typeof parsed === "string") return parsed
    if (typeof parsed !== "object" || parsed === null) return raw
    const nodes = parsed as Record<string, unknown>
    let fallback: string | null = null
    for (const node of Object.values(nodes)) {
      if (typeof node !== "object" || node === null) continue
      const n = node as {
        class_type?: unknown
        inputs?: unknown
        _meta?: unknown
      }
      if (n.class_type !== "CLIPTextEncode") continue
      const inputs = n.inputs
      if (typeof inputs !== "object" || inputs === null) continue
      const text = (inputs as Record<string, unknown>).text
      if (typeof text !== "string") continue
      const metaTitle = (n._meta as { title?: unknown } | undefined)?.title
      const title = (
        typeof metaTitle === "string" ? metaTitle : ""
      ).toLowerCase()
      if (/positive|prompt/.test(title)) return text
      fallback ??= text
    }
    return fallback ?? raw
  } catch {
    return raw
  }
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (blob) triggerBlobDownload(blob, filename)
  }, "image/png")
}

function baseName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "") || "image"
}

function loadInpaintWorkflows(): SavedInpaintWorkflow[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.inpaintWorkflows) ?? "[]"
    ) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const raw = item as Partial<SavedInpaintWorkflow>
        return {
          id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
          name: typeof raw.name === "string" ? raw.name : "",
          workflow: typeof raw.workflow === "string" ? raw.workflow : "",
          mappings: Array.isArray(raw.mappings) ? raw.mappings : [],
          savedAt: typeof raw.savedAt === "number" ? raw.savedAt : Date.now(),
        }
      })
      .filter((item) => item.name !== "" && item.workflow !== "")
  } catch {
    return []
  }
}

function persistInpaintWorkflows(workflows: SavedInpaintWorkflow[]): void {
  localStorage.setItem(STORAGE_KEYS.inpaintWorkflows, JSON.stringify(workflows))
}

function parseWorkflowDraft(workflow: string): ComfyWorkflow | null {
  try {
    return JSON.parse(workflow) as ComfyWorkflow
  } catch {
    return null
  }
}

function makeInputCandidates(
  workflow: ComfyWorkflow | null
): WorkflowInputCandidate[] {
  if (workflow === null) return []
  const candidates: WorkflowInputCandidate[] = []
  for (const [nodeId, node] of Object.entries(workflow)) {
    for (const [inputKey, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) || value === null || typeof value === "object") {
        continue
      }
      const label =
        `${node.class_type} ${node._meta?.title ?? ""} ${inputKey}`.toLowerCase()
      candidates.push({
        id: `${nodeId}.${inputKey}`,
        nodeId,
        inputKey,
        label: `#${nodeId} ${node._meta?.title ?? node.class_type} · ${inputKey}`,
        isNumeric: typeof value === "number",
        isImage: /image|mask/.test(label),
      })
    }
  }
  return candidates
}

function buildAutoInpaintMappings(
  workflow: ComfyWorkflow
): InpaintNodeMapping[] {
  const mappings: InpaintNodeMapping[] = []
  const used = new Set<string>()
  const add = (
    nodeId: string,
    inputKey: string,
    sourceType: InpaintMappingSource,
    patch: Partial<InpaintNodeMapping> = {}
  ): void => {
    const key = `${nodeId}.${inputKey}`
    if (used.has(key)) return
    used.add(key)
    mappings.push({
      id: crypto.randomUUID(),
      nodeId,
      inputKey,
      sourceType,
      ...patch,
    })
  }

  const entries = Object.entries(workflow)
  const promptNode =
    entries.find(([, node]) => {
      const title = node._meta?.title?.toLowerCase() ?? ""
      return (
        node.class_type === "CLIPTextEncode" && /positive|prompt/.test(title)
      )
    }) ?? entries.find(([, node]) => node.class_type === "CLIPTextEncode")
  if (promptNode && "text" in promptNode[1].inputs) {
    add(promptNode[0], "text", "prompt")
  }

  const imageCandidates: { nodeId: string; inputKey: string; score: number }[] =
    []
  for (const [nodeId, node] of entries) {
    for (const [inputKey, value] of Object.entries(node.inputs)) {
      if (typeof value !== "string") continue
      const label =
        `${node.class_type} ${node._meta?.title ?? ""} ${inputKey}`.toLowerCase()
      if (!/image|mask/.test(label)) continue
      imageCandidates.push({
        nodeId,
        inputKey,
        score: label.includes("mask")
          ? 10
          : /source|input|base|original/.test(label)
            ? 5
            : 1,
      })
    }
  }
  const maskCandidate =
    imageCandidates.find((candidate) => candidate.score >= 10) ??
    imageCandidates[1]
  if (imageCandidates.length === 1 && imageCandidates[0]) {
    add(
      imageCandidates[0].nodeId,
      imageCandidates[0].inputKey,
      "sourceWithAlphaMask"
    )
  } else {
    const sourceCandidate =
      imageCandidates.find(
        (candidate) =>
          `${candidate.nodeId}.${candidate.inputKey}` !==
          (maskCandidate
            ? `${maskCandidate.nodeId}.${maskCandidate.inputKey}`
            : "")
      ) ?? imageCandidates[0]
    if (sourceCandidate) {
      add(sourceCandidate.nodeId, sourceCandidate.inputKey, "sourceImage")
    }
    if (maskCandidate) {
      add(maskCandidate.nodeId, maskCandidate.inputKey, "maskImage")
    }
  }

  const saveNode = entries.find(([, node]) => node.class_type === "SaveImage")
  if (saveNode && "filename_prefix" in saveNode[1].inputs) {
    add(saveNode[0], "filename_prefix", "filename")
  }

  for (const [nodeId, node] of entries) {
    for (const [inputKey, value] of Object.entries(node.inputs)) {
      if (
        typeof value === "number" &&
        inputKey.toLowerCase().includes("seed")
      ) {
        add(nodeId, inputKey, "seed", { seedValue: value, seedRandom: true })
      }
    }
  }
  return mappings
}

function canvasToFile(
  canvas: HTMLCanvasElement,
  filename: string,
  errorMessage: string
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(errorMessage))
        return
      }
      resolve(new File([blob], filename, { type: "image/png" }))
    }, "image/png")
  })
}

function createMaskExportCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const output = document.createElement("canvas")
  output.width = canvas.width
  output.height = canvas.height
  const ctx = output.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, output.width, output.height)
  ctx.drawImage(canvas, 0, 0)
  return output
}

function canvasToMaskFile(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<File> {
  return canvasToFile(
    createMaskExportCanvas(canvas),
    `${baseName(filename)}-mask-rgb.png`,
    "RGB 마스크 생성 실패"
  )
}

function createAlphaMaskImageCanvas(
  canvas: HTMLCanvasElement
): HTMLCanvasElement {
  const output = document.createElement("canvas")
  output.width = canvas.width
  output.height = canvas.height
  const ctx = output.getContext("2d")
  const maskCtx = canvas.getContext("2d")
  if (!ctx || !maskCtx) {
    throw new Error("Canvas context unavailable")
  }
  ctx.fillStyle = "white"
  ctx.fillRect(0, 0, output.width, output.height)
  const imageData = ctx.getImageData(0, 0, output.width, output.height)
  const maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < imageData.data.length; i += 4) {
    const maskAlpha = maskData.data[i + 3] ?? 0
    imageData.data[i + 3] = 255 - maskAlpha
  }
  ctx.putImageData(imageData, 0, 0)
  return output
}

function canvasToAlphaMaskFile(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<File> {
  return canvasToFile(
    createAlphaMaskImageCanvas(canvas),
    `${baseName(filename)}-mask-alpha.png`,
    "알파 마스크 생성 실패"
  )
}

function canvasToImageFile(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<File> {
  return canvasToFile(
    canvas,
    `${baseName(filename)}-source.png`,
    "원본 이미지 생성 실패"
  )
}

function createAlphaMaskedImageCanvas(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const output = document.createElement("canvas")
  output.width = imageCanvas.width
  output.height = imageCanvas.height
  const ctx = output.getContext("2d")
  const maskCtx = maskCanvas.getContext("2d")
  if (!ctx || !maskCtx) {
    throw new Error("Canvas context unavailable")
  }
  ctx.drawImage(imageCanvas, 0, 0)
  const imageData = ctx.getImageData(0, 0, output.width, output.height)
  const maskData = maskCtx.getImageData(
    0,
    0,
    maskCanvas.width,
    maskCanvas.height
  )
  for (let i = 0; i < imageData.data.length; i += 4) {
    const maskAlpha = maskData.data[i + 3] ?? 0
    const nextAlpha = 255 - maskAlpha
    imageData.data[i + 3] = maskAlpha > 0 && nextAlpha === 0 ? 1 : nextAlpha
  }
  ctx.putImageData(imageData, 0, 0)
  return output
}

function canvasToAlphaMaskedImageFile(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  filename: string
): Promise<File> {
  return canvasToFile(
    createAlphaMaskedImageCanvas(imageCanvas, maskCanvas),
    `${baseName(filename)}-inpaint-rgba.png`,
    "RGBA 인페인팅 이미지 생성 실패"
  )
}

function formatComfyImageWidgetValue(data: {
  name?: string
  subfolder?: string
  type?: string
}): string {
  if (!data.name) throw new Error("업로드 응답에 파일명이 없습니다.")
  const path =
    data.subfolder && data.subfolder !== ""
      ? `${data.subfolder}/${data.name}`
      : data.name
  return `${path} [${data.type || "input"}]`
}

function createOverlayCanvas(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  maskOpacity: number
): HTMLCanvasElement {
  const output = document.createElement("canvas")
  output.width = imageCanvas.width
  output.height = imageCanvas.height
  const ctx = output.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")
  const tint = document.createElement("canvas")
  tint.width = maskCanvas.width
  tint.height = maskCanvas.height
  const tintCtx = tint.getContext("2d")
  if (!tintCtx) throw new Error("Canvas context unavailable")
  tintCtx.drawImage(maskCanvas, 0, 0)
  tintCtx.globalCompositeOperation = "source-in"
  tintCtx.fillStyle = "rgb(255, 64, 96)"
  tintCtx.fillRect(0, 0, tint.width, tint.height)

  ctx.drawImage(imageCanvas, 0, 0)
  ctx.globalAlpha = maskOpacity / 100
  ctx.drawImage(tint, 0, 0)
  ctx.globalAlpha = 1
  return output
}

function isMaskEmpty(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d")
  if (!ctx) return true
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false
  }
  return true
}

function getWorkflowJsonError(
  workflow: string
): { line: number; column: number; message: string } | null {
  if (workflow.trim() === "") return null
  try {
    JSON.parse(workflow)
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 파싱 실패"
    const posMatch = /position (\d+)/.exec(message)
    if (posMatch) {
      const pos = Number(posMatch[1])
      const before = workflow.slice(0, pos)
      const lines = before.split("\n")
      return {
        line: lines.length,
        column: (lines[lines.length - 1]?.length ?? 0) + 1,
        message,
      }
    }
    const lineMatch = /line (\d+)/.exec(message)
    if (lineMatch) {
      return {
        line: Number(lineMatch[1]),
        column: 0,
        message,
      }
    }
    return { line: 0, column: 0, message }
  }
}

export function GalleryInpaintEditor({
  open,
  backendUrl,
  imageUrl,
  filename,
  sourcePrompt,
  sourceMeta,
  onOpenChange,
}: GalleryInpaintEditorProps): React.JSX.Element {
  const { savedWorkflows } = useWorkflowContext()
  const { jobs } = useBackend()
  const workerPreviews = useWorkerPreviews()
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const paintingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const historyRef = useRef<ImageData[]>([])
  const futureRef = useRef<ImageData[]>([])
  const panningRef = useRef(false)
  const panStartRef = useRef<{
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [mode, setMode] = useState<PaintMode>("paint")
  const [brushSize, setBrushSize] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ceg_inpaint_brush_size")
      return saved ? Number(saved) : 56
    }
    return 56
  })
  const [brushHardness, setBrushHardness] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ceg_inpaint_brush_hardness")
      return saved ? Number(saved) : 1
    }
    return 1
  })
  const [brushOpacity, setBrushOpacity] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ceg_inpaint_brush_opacity")
      return saved ? Number(saved) : 1
    }
    return 1
  })
  const [cursorScale, setCursorScale] = useState(1)
  const [maskOpacity, setMaskOpacity] = useState(58)
  const [showMask, setShowMask] = useState(true)
  const [cursorVisible, setCursorVisible] = useState(false)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null
  )
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [spaceDown, setSpaceDown] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [resultTab, setResultTab] = useState<"edit" | "result">("edit")
  const [mappingSearch, setMappingSearch] = useState("")
  const [panning, setPanning] = useState(false)
  const [inpaintWorkflows, setInpaintWorkflows] = useState<
    SavedInpaintWorkflow[]
  >(() => loadInpaintWorkflows())
  const [selectedWorkflowId, setSelectedWorkflowIdState] = useState(
    () => localStorage.getItem(STORAGE_KEYS.inpaintActiveWorkflowId) ?? ""
  )
  const [workflowName, setWorkflowName] = useState("")
  const [workflowDraft, setWorkflowDraft] = useState("")
  const [nodeMappings, setNodeMappings] = useState<InpaintNodeMapping[]>([])
  const [promptText, setPromptText] = useState("")
  const [importWorkflowId, setImportWorkflowId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submittedJobIds, setSubmittedJobIds] = useState<string[]>([])
  const [finalImageUrls, setFinalImageUrls] = useState<string[]>([])
  // 결과 탭 비교용 원본 URL (CORS 버스팅이 적용된 표시용 URL)
  const [sourceDisplayUrl, setSourceDisplayUrl] = useState<string>("")
  // 현재 선택된 결과 이미지 인덱스 (여러 장일 때 전환)
  const [selectedResultIndex, setSelectedResultIndex] = useState(0)
  // 원본/결과 비교 뷰 토글
  const [compareMode, setCompareMode] = useState(false)

  const selectedWorkflow = useMemo(
    () =>
      inpaintWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ??
      null,
    [inpaintWorkflows, selectedWorkflowId]
  )

  const parsedWorkflow = useMemo<ComfyWorkflow | null>(() => {
    return parseWorkflowDraft(workflowDraft)
  }, [workflowDraft])

  const workflowError = useMemo(
    () =>
      parsedWorkflow === null ? getWorkflowJsonError(workflowDraft) : null,
    [parsedWorkflow, workflowDraft]
  )

  const inputCandidates = useMemo(
    () => makeInputCandidates(parsedWorkflow),
    [parsedWorkflow]
  )

  const availableInputCandidates = useMemo(() => {
    const used = new Set(
      nodeMappings.map((mapping) => `${mapping.nodeId}.${mapping.inputKey}`)
    )
    return inputCandidates.filter((candidate) => !used.has(candidate.id))
  }, [inputCandidates, nodeMappings])

  const filteredAvailableCandidates = useMemo(() => {
    const query = mappingSearch.trim().toLowerCase()
    if (query === "") return availableInputCandidates
    return availableInputCandidates.filter((candidate) =>
      candidate.label.toLowerCase().includes(query)
    )
  }, [availableInputCandidates, mappingSearch])

  const activeInpaintJob = useMemo(() => {
    return jobs.find((job) => submittedJobIds.includes(job.id)) ?? null
  }, [jobs, submittedJobIds])

  // 결과 썸네일 선택 인덱스 — finalImageUrls 범위를 벗어나면 마지막 인덱스로 보정.
  // setState-in-effect 회피를 위해 렌더 시점에 파생한다.
  const safeSelectedResultIndex =
    finalImageUrls.length === 0
      ? 0
      : Math.min(selectedResultIndex, finalImageUrls.length - 1)

  const livePreviewWorkerId = activeInpaintJob?.workerId ?? null
  const livePreviewToken =
    livePreviewWorkerId !== null
      ? workerPreviews[livePreviewWorkerId]
      : undefined
  const hasLivePreview = livePreviewToken !== undefined

  const hasSourceMapping = nodeMappings.some(
    (mapping) => mapping.sourceType === "sourceImage"
  )
  const hasMaskMapping = nodeMappings.some(
    (mapping) =>
      mapping.sourceType === "maskImage" ||
      mapping.sourceType === "maskRgbImage"
  )
  const hasAlphaMapping = nodeMappings.some(
    (mapping) => mapping.sourceType === "sourceWithAlphaMask"
  )
  const mappingValid = (hasSourceMapping && hasMaskMapping) || hasAlphaMapping

  const pushHistory = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
    historyRef.current.push(snapshot)
    futureRef.current = []
    enforceImageDataHistoryLimit(
      historyRef.current,
      futureRef.current,
      HISTORY_MAX
    )
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(false)
  }, [])

  const undo = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    if (historyRef.current.length === 0) return
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const previous = historyRef.current.pop()!
    futureRef.current.push(current)
    enforceImageDataHistoryLimit(
      historyRef.current,
      futureRef.current,
      HISTORY_MAX
    )
    ctx.putImageData(previous, 0, 0)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const redo = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    if (futureRef.current.length === 0) return
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const next = futureRef.current.pop()!
    historyRef.current.push(current)
    enforceImageDataHistoryLimit(
      historyRef.current,
      futureRef.current,
      HISTORY_MAX
    )
    ctx.putImageData(next, 0, 0)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  useEffect(() => {
    persistInpaintWorkflows(inpaintWorkflows)
  }, [inpaintWorkflows])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.inpaintActiveWorkflowId,
      selectedWorkflowId
    )
  }, [selectedWorkflowId])

  useEffect(() => {
    localStorage.setItem("ceg_inpaint_brush_size", String(brushSize))
  }, [brushSize])

  useEffect(() => {
    localStorage.setItem("ceg_inpaint_brush_hardness", String(brushHardness))
  }, [brushHardness])

  useEffect(() => {
    localStorage.setItem("ceg_inpaint_brush_opacity", String(brushOpacity))
  }, [brushOpacity])

  // nodeMappings 가 변경될 때마다 현재 활성 워크플로우에 오토세이브
  useEffect(() => {
    if (!selectedWorkflowId) return
    setInpaintWorkflows((prev) => {
      return prev.map((item) => {
        if (item.id === selectedWorkflowId) {
          if (JSON.stringify(item.mappings) === JSON.stringify(nodeMappings)) {
            return item
          }
          return {
            ...item,
            mappings: nodeMappings,
            savedAt: Date.now(),
          }
        }
        return item
      })
    })
  }, [nodeMappings, selectedWorkflowId])

  const setSelectedWorkflowId = useCallback(
    (workflowId: string) => {
      setSelectedWorkflowIdState(workflowId)
      const workflow =
        inpaintWorkflows.find((item) => item.id === workflowId) ?? null
      setWorkflowName(workflow?.name ?? "")
      setWorkflowDraft(workflow?.workflow ?? "")
      setNodeMappings(workflow?.mappings ?? [])
      historyRef.current = []
      futureRef.current = []
      setCanUndo(false)
      setCanRedo(false)
    },
    [inpaintWorkflows]
  )

  useEffect(() => {
    if (selectedWorkflowId === "") return
    const workflow =
      inpaintWorkflows.find((item) => item.id === selectedWorkflowId) ?? null
    if (workflow === null) {
      setSelectedWorkflowIdState("")
      return
    }
    setWorkflowName(workflow.name)
    setWorkflowDraft(workflow.workflow)
    setNodeMappings(workflow.mappings)
  }, [inpaintWorkflows, selectedWorkflowId])

  useEffect(() => {
    if (!open) return
    setReady(false)
    setLoadError(false)
    let disposed = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = (): void => {
      if (disposed) return
      const scale = Math.min(
        1,
        CANVAS_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight)
      )
      const width = Math.max(1, Math.round(img.naturalWidth * scale))
      const height = Math.max(1, Math.round(img.naturalHeight * scale))
      const imageCanvas = imageCanvasRef.current
      const maskCanvas = maskCanvasRef.current
      const imageCtx = imageCanvas?.getContext("2d")
      const maskCtx = maskCanvas?.getContext("2d")
      if (!imageCanvas || !maskCanvas || !imageCtx || !maskCtx) return
      imageCanvas.width = width
      imageCanvas.height = height
      maskCanvas.width = width
      maskCanvas.height = height
      imageCtx.clearRect(0, 0, width, height)
      imageCtx.drawImage(img, 0, 0, width, height)
      maskCtx.clearRect(0, 0, width, height)
      historyRef.current = []
      futureRef.current = []
      setCanUndo(false)
      setCanRedo(false)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setReady(true)
    }
    img.onerror = (): void => {
      if (disposed) return
      setLoadError(true)
      toast.error(
        "이미지를 불러오는데 실패했습니다. 네트워크 또는 CORS 설정을 확인해주세요."
      )
    }

    // CORS 캐시 문제를 방지하기 위해 캐시 버스팅 파라미터 추가
    let finalUrl = imageUrl
    try {
      const parsedUrl = new URL(imageUrl, window.location.origin)
      parsedUrl.searchParams.set("cors", "anonymous")
      finalUrl = parsedUrl.toString()
    } catch {
      finalUrl =
        imageUrl + (imageUrl.includes("?") ? "&" : "?") + "cors=anonymous"
    }
    setSourceDisplayUrl(finalUrl)
    img.src = finalUrl

    return (): void => {
      disposed = true
      img.onload = null
      img.onerror = null
      img.removeAttribute("src")
    }
  }, [imageUrl, open])

  const clearMask = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    pushHistory()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [pushHistory])

  const paintTo = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = maskCanvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!canvas || !ctx) return
      const point = getPoint(canvas, event, zoom, pan)
      const lastPoint = lastPointRef.current
      if (lastPoint === null) {
        drawDot(
          ctx,
          point.x,
          point.y,
          brushSize,
          mode,
          brushHardness,
          brushOpacity
        )
      } else {
        const distance = Math.hypot(
          point.x - lastPoint.x,
          point.y - lastPoint.y
        )
        const steps = Math.max(
          1,
          Math.ceil(distance / getBrushSpacing(brushSize))
        )
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          drawDot(
            ctx,
            lastPoint.x + (point.x - lastPoint.x) * t,
            lastPoint.y + (point.y - lastPoint.y) * t,
            brushSize,
            mode,
            brushHardness,
            brushOpacity
          )
        }
      }
      lastPointRef.current = point
    },
    [brushHardness, brushOpacity, brushSize, mode, pan, zoom]
  )

  const stopPaint = useCallback(() => {
    const wasPainting = paintingRef.current
    paintingRef.current = false
    lastPointRef.current = null
    if (wasPainting) {
      setCanUndo(historyRef.current.length > 0)
    }
  }, [])

  const resetResults = useCallback(() => {
    setFinalImageUrls([])
    setSelectedResultIndex(0)
    setCompareMode(false)
  }, [])

  useEffect(() => resetResults, [resetResults])

  // 결과 이미지 URL — 저장된 이미지(/saved-images/{hash})를 우선 사용하고,
  // 저장된 이미지가 없을 때만 ComfyUI worker view URL(/images/{worker}/view)를
  // 임시 프리뷰로 사용한다. 두 소스를 합치면 동일 이미지가 2개 표시되므로,
  // savedImageHashes가 존재하면 imageUrls는 무시한다.
  useEffect(() => {
    if (activeInpaintJob === null) return
    const savedUrls = activeInpaintJob.savedImageHashes.map(
      (hash) => `${backendUrl}/saved-images/${hash}`
    )
    const urls = savedUrls.length > 0 ? savedUrls : activeInpaintJob.imageUrls
    if (urls.length === 0) return
    setFinalImageUrls((prev) => {
      const merged = Array.from(new Set([...urls, ...prev]))
      // 저장된 이미지가 새로 들어오면 worker view 임시 URL을 제거해 중복 제거
      const next =
        savedUrls.length > 0
          ? merged.filter(
              (url) => !url.includes("/images/") || savedUrls.includes(url)
            )
          : merged
      const trimmed = next.slice(0, 8)
      // 내용이 동일하면 prev를 그대로 돌려 React 렌더를 건너뛴다 (무한 루프 방지)
      if (
        trimmed.length === prev.length &&
        trimmed.every((u, i) => u === prev[i])
      ) {
        return prev
      }
      return trimmed
    })
  }, [activeInpaintJob, backendUrl])

  useEffect(() => {
    const handleImageEvent = (event: Event): void => {
      const detail = (event as CustomEvent<BackendEvent>).detail
      if (detail.type !== "image.saved") return
      if (!submittedJobIds.includes(detail.jobId)) return
      const url = `${backendUrl}/saved-images/${detail.hash}`
      setFinalImageUrls((prev) => {
        // 이미 포함되어 있으면 아무 것도 하지 않는다 (무한 루프 방지)
        if (prev.includes(url)) return prev
        // 저장된 이미지가 도착하면 worker view URL(/images/)을 제거해
        // 동일한 결과가 두 번 표시되는 중복을 막는다.
        const filtered = prev.filter(
          (u) => !u.includes("/images/") || u === url
        )
        const next = Array.from(new Set([url, ...filtered])).slice(0, 8)
        return next
      })
    }
    window.addEventListener("ceg-image-event", handleImageEvent)
    return () => {
      window.removeEventListener("ceg-image-event", handleImageEvent)
    }
  }, [backendUrl, submittedJobIds])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const isEditable =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      if (isEditable) return

      if (event.code === "Space" && !event.repeat) {
        setSpaceDown(true)
        return
      }

      const ctrlOrMeta = event.ctrlKey || event.metaKey
      if (ctrlOrMeta && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }
      if (ctrlOrMeta && event.key.toLowerCase() === "y") {
        event.preventDefault()
        redo()
        return
      }
      if (ctrlOrMeta && event.key === "Enter") {
        event.preventDefault()
        const runButton = document.getElementById("ceg-inpaint-run")
        runButton?.click()
        return
      }

      if (event.key === "[") {
        setBrushSize((size) => clamp(size - 4, 4, 220))
      } else if (event.key === "]") {
        setBrushSize((size) => clamp(size + 4, 4, 220))
      } else if (event.key.toLowerCase() === "b") {
        setMode("paint")
      } else if (event.key.toLowerCase() === "e") {
        setMode("erase")
      } else if (event.key.toLowerCase() === "x") {
        setMode((m) => (m === "paint" ? "erase" : "paint"))
      } else if (event.key.toLowerCase() === "h") {
        setShowMask((v) => !v)
      } else if (event.key === "-" || event.key === "_") {
        setZoom((z) => clamp(z * 0.8, MIN_ZOOM, MAX_ZOOM))
      } else if (event.key === "+" || event.key === "=") {
        setZoom((z) => clamp(z * 1.25, MIN_ZOOM, MAX_ZOOM))
      } else if (event.key === "0" && ctrlOrMeta) {
        event.preventDefault()
        setZoom(1)
        setPan({ x: 0, y: 0 })
      }
    }
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code === "Space") {
        setSpaceDown(false)
        setPanning(false)
        panningRef.current = false
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [open, redo, undo])

  const downloadMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current
    if (!maskCanvas) return
    const output = document.createElement("canvas")
    output.width = maskCanvas.width
    output.height = maskCanvas.height
    const ctx = output.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "black"
    ctx.fillRect(0, 0, output.width, output.height)
    ctx.drawImage(maskCanvas, 0, 0)
    downloadCanvas(output, `${baseName(filename)}-inpaint-mask.png`)
  }, [filename])

  const downloadOverlay = useCallback(() => {
    const imageCanvas = imageCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!imageCanvas || !maskCanvas) return
    downloadCanvas(
      createOverlayCanvas(imageCanvas, maskCanvas, maskOpacity),
      `${baseName(filename)}-inpaint-overlay.png`
    )
  }, [filename, maskOpacity])

  const downloadFinalImage = useCallback((url: string) => {
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => {
        const name = url.split("/").pop() ?? "inpaint-result.png"
        triggerBlobDownload(blob, name.endsWith(".png") ? name : `${name}.png`)
      })
      .catch(() => toast.error("이미지 다운로드 실패"))
  }, [])

  const uploadComfyImage = useCallback(
    async (file: File): Promise<string> => {
      const formData = new FormData()
      formData.append("image", file, file.name)
      formData.append("type", "input")
      formData.append("overwrite", "true")
      const response = await fetch(`${backendUrl}/upload/image`, {
        method: "POST",
        body: formData,
      })
      if (!response.ok)
        throw new Error(`업로드 실패: HTTP ${String(response.status)}`)
      const data = (await response.json()) as {
        name?: string
        subfolder?: string
        type?: string
      }
      return formatComfyImageWidgetValue(data)
    },
    [backendUrl]
  )

  const handleImportWorkflow = useCallback(() => {
    const workflow = savedWorkflows.find((item) => item.id === importWorkflowId)
    if (!workflow) return
    setWorkflowName(workflow.name)
    setWorkflowDraft(workflow.workflow)
    const parsed = parseWorkflowDraft(workflow.workflow)
    setNodeMappings(parsed ? buildAutoInpaintMappings(parsed) : [])
    setSelectedWorkflowIdState("")
    setImportWorkflowId("")
  }, [importWorkflowId, savedWorkflows])

  const handleSaveWorkflow = useCallback(() => {
    const trimmedName = workflowName.trim()
    if (trimmedName === "") {
      toast.error("인페인팅 워크플로우 이름을 입력해주세요.")
      return
    }
    const parsed = parseWorkflowDraft(workflowDraft)
    if (parsed === null) {
      toast.error("워크플로우 JSON을 읽을 수 없습니다.")
      return
    }
    const next: SavedInpaintWorkflow = {
      id: selectedWorkflow?.id ?? crypto.randomUUID(),
      name: trimmedName,
      workflow: workflowDraft,
      mappings:
        nodeMappings.length > 0
          ? nodeMappings
          : buildAutoInpaintMappings(parsed),
      savedAt: Date.now(),
    }
    setInpaintWorkflows((prev) => {
      const exists = prev.some((item) => item.id === next.id)
      if (exists) return prev.map((item) => (item.id === next.id ? next : item))
      return [...prev, next]
    })
    setSelectedWorkflowIdState(next.id)
    setNodeMappings(next.mappings)
    toast.success("인페인팅 워크플로우가 저장되었습니다.")
  }, [nodeMappings, selectedWorkflow, workflowDraft, workflowName])

  const handleDeleteWorkflow = useCallback(() => {
    if (selectedWorkflow === null) return
    setInpaintWorkflows((prev) =>
      prev.filter((workflow) => workflow.id !== selectedWorkflow.id)
    )
    setSelectedWorkflowIdState("")
    setWorkflowName("")
    setWorkflowDraft("")
    setNodeMappings([])
  }, [selectedWorkflow])

  const handleAutoMap = useCallback(() => {
    if (parsedWorkflow === null) {
      toast.error("워크플로우 JSON을 먼저 선택하거나 입력해주세요.")
      return
    }
    setNodeMappings(buildAutoInpaintMappings(parsedWorkflow))
  }, [parsedWorkflow])

  const handleImportSourcePrompt = useCallback(() => {
    if (!sourcePrompt || sourcePrompt.trim() === "") {
      toast.error("원본 프롬프트 정보가 없습니다.")
      return
    }
    const extracted = extractPositivePrompt(sourcePrompt)
    setPromptText(extracted)
    toast.success("원본 프롬프트를 가져왔습니다.")
  }, [sourcePrompt])

  const updateMapping = useCallback(
    (id: string, patch: Partial<InpaintNodeMapping>) => {
      setNodeMappings((prev) =>
        prev.map((mapping) =>
          mapping.id === id ? { ...mapping, ...patch } : mapping
        )
      )
    },
    []
  )

  const addMapping = useCallback(
    (candidateId: string) => {
      const candidate = inputCandidates.find((item) => item.id === candidateId)
      if (!candidate) return
      setNodeMappings((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          nodeId: candidate.nodeId,
          inputKey: candidate.inputKey,
          sourceType: candidate.isNumeric
            ? "seed"
            : candidate.isImage
              ? "sourceImage"
              : "fixed",
          seedRandom: candidate.isNumeric,
          seedValue: 0,
        },
      ])
    },
    [inputCandidates]
  )

  const applyMappings = useCallback(
    (
      workflow: ComfyWorkflow,
      sourceName: string,
      maskAlphaName: string,
      maskRgbName: string,
      alphaSourceName: string
    ): {
      workflow: ComfyWorkflow
      imageUploads: Record<string, Record<string, string>>
      filename: string
      prompt: string
    } => {
      const next = JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow
      const imageUploads: Record<string, Record<string, string>> = {}
      const outputFilename = `${baseName(filename)}_inpaint`
      for (const mapping of nodeMappings) {
        const node = next[mapping.nodeId]
        if (!node) continue
        let value: NodeInputValue
        switch (mapping.sourceType) {
          case "prompt":
            value = promptText
            break
          case "sourceImage":
            value = sourceName
            imageUploads[mapping.nodeId] = {
              ...imageUploads[mapping.nodeId],
              [mapping.inputKey]: sourceName,
            }
            break
          case "maskImage":
            value = maskAlphaName
            imageUploads[mapping.nodeId] = {
              ...imageUploads[mapping.nodeId],
              [mapping.inputKey]: maskAlphaName,
            }
            break
          case "maskRgbImage":
            value = maskRgbName
            imageUploads[mapping.nodeId] = {
              ...imageUploads[mapping.nodeId],
              [mapping.inputKey]: maskRgbName,
            }
            break
          case "sourceWithAlphaMask":
            value = alphaSourceName
            imageUploads[mapping.nodeId] = {
              ...imageUploads[mapping.nodeId],
              [mapping.inputKey]: alphaSourceName,
            }
            break
          case "filename":
            value = outputFilename
            break
          case "seed":
            value =
              mapping.seedRandom === true
                ? Math.floor(Math.random() * MAX_RANDOM_SEED)
                : (mapping.seedValue ?? 0)
            break
          case "fixed":
            value = mapping.fixedValue ?? ""
            break
        }
        node.inputs[mapping.inputKey] = value
      }
      return {
        workflow: next,
        imageUploads,
        filename: outputFilename,
        prompt: promptText,
      }
    },
    [filename, nodeMappings, promptText]
  )

  const handleRunInpaint = useCallback(async () => {
    if (parsedWorkflow === null) {
      toast.error("인페인팅 워크플로우 JSON을 선택하거나 저장해주세요.")
      return
    }
    if (!mappingValid) {
      toast.error(
        "원본+마스크(RGBA) 매핑 또는 원본 이미지/마스크 매핑을 설정해주세요."
      )
      return
    }
    const maskCanvas = maskCanvasRef.current
    const imageCanvas = imageCanvasRef.current
    if (!maskCanvas || !imageCanvas) {
      toast.error("이미지/마스크 캔버스를 찾을 수 없습니다.")
      return
    }
    if (isMaskEmpty(maskCanvas)) {
      toast.error("마스크를 먼저 칠해주세요. (브러시로 수정할 영역 표시)")
      return
    }
    setSubmitting(true)
    setResultTab("result")
    try {
      const usedSources = new Set(nodeMappings.map((item) => item.sourceType))
      resetResults()
      const [sourceName, maskAlphaName, maskRgbName, alphaSourceName] =
        await Promise.all([
          usedSources.has("sourceImage")
            ? canvasToImageFile(imageCanvas, filename).then(uploadComfyImage)
            : Promise.resolve(""),
          usedSources.has("maskImage")
            ? canvasToAlphaMaskFile(maskCanvas, filename).then(uploadComfyImage)
            : Promise.resolve(""),
          usedSources.has("maskRgbImage")
            ? canvasToMaskFile(maskCanvas, filename).then(uploadComfyImage)
            : Promise.resolve(""),
          usedSources.has("sourceWithAlphaMask")
            ? canvasToAlphaMaskedImageFile(
                imageCanvas,
                maskCanvas,
                filename
              ).then(uploadComfyImage)
            : Promise.resolve(""),
        ])

      const built = applyMappings(
        parsedWorkflow,
        sourceName,
        maskAlphaName,
        maskRgbName,
        alphaSourceName
      )

      const response = await fetch(`${backendUrl}${API.jobs.root}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({
          items: [
            {
              filename: built.filename,
              prompt: built.prompt,
              workflow: built.workflow,
              meta: {
                ...(sourceMeta ?? {}),
                source: filename,
                mode: "inpaint",
              },
              cegTemplate: "",
              imageUploads: built.imageUploads,
              workerType: "comfyui",
            },
          ],
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text().catch(() => response.statusText))
      }
      const data = (await response.json().catch(() => ({}))) as {
        jobIds?: string[]
      }
      if (Array.isArray(data.jobIds) && data.jobIds.length > 0) {
        const jobIds = data.jobIds
        setSubmittedJobIds((prev) =>
          Array.from(new Set([...jobIds, ...prev])).slice(0, 12)
        )
      }
      toast.success("인페인팅 작업이 큐에 추가되었습니다.")
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : "인페인팅 작업 제출 실패"
      )
    } finally {
      setSubmitting(false)
    }
  }, [
    applyMappings,
    backendUrl,
    resetResults,
    filename,
    mappingValid,
    nodeMappings,
    parsedWorkflow,
    sourceMeta,
    uploadComfyImage,
  ])

  const cursorDiameter = brushSize * cursorScale
  const isPannable = spaceDown

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[94vh] max-h-[94vh] gap-3 overflow-hidden p-4 sm:max-w-[96vw]"
        onInteractOutside={(event) => {
          event.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate font-mono text-sm">
            인페인팅 편집 · {filename}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex max-h-full min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-md border bg-muted/20 p-3">
            <div className="grid gap-2 rounded-md border bg-background/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold">
                  인페인팅 전용 워크플로우
                </Label>
                {inpaintWorkflows.length === 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56 text-xs">
                      일반 워크플로우 가져오기로 시작해보세요. 마스크 관련
                      입력이 있는 ComfyUI API JSON이 필요합니다.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <Select
                value={selectedWorkflowId || "__none__"}
                onValueChange={(value) => {
                  setSelectedWorkflowId(value === "__none__" ? "" : value)
                }}
              >
                <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                  <SelectValue placeholder="워크플로우 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">선택 안 함</SelectItem>
                  {inpaintWorkflows.map((workflow) => (
                    <SelectItem key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {savedWorkflows.length > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                  <Select
                    value={importWorkflowId || "__none__"}
                    onValueChange={(value) => {
                      setImportWorkflowId(value === "__none__" ? "" : value)
                    }}
                  >
                    <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                      <SelectValue placeholder="일반 워크플로우 가져오기" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        가져올 워크플로우
                      </SelectItem>
                      {savedWorkflows.map((workflow) => (
                        <SelectItem key={workflow.id} value={workflow.id}>
                          {workflow.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    disabled={!importWorkflowId}
                    onClick={handleImportWorkflow}
                  >
                    가져오기
                  </Button>
                </div>
              )}

              <Input
                value={workflowName}
                onChange={(event) => {
                  setWorkflowName(event.target.value)
                }}
                className="h-8 text-xs"
                placeholder="전용 워크플로우 이름"
              />
              <Textarea
                value={workflowDraft}
                onChange={(event) => {
                  setWorkflowDraft(event.target.value)
                  setSelectedWorkflowIdState("")
                }}
                className="max-h-40 min-h-24 resize-y font-mono text-[11px]"
                placeholder="ComfyUI API workflow JSON"
                aria-invalid={workflowError !== null}
              />
              {workflowError !== null && workflowDraft !== "" && (
                <p className="text-xs text-destructive" role="alert">
                  JSON 파싱 실패
                  {workflowError.line > 0
                    ? ` (줄 ${String(workflowError.line)}${workflowError.column > 0 ? `:${String(workflowError.column)}` : ""})`
                    : ""}
                  : {workflowError.message}
                </p>
              )}
              <div className="grid grid-cols-3 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={handleAutoMap}
                  disabled={parsedWorkflow === null}
                  title="워크플로우의 프롬프트/이미지/마스크/시드 입력을 자동 매핑"
                >
                  <Plus className="size-3.5" />
                  자동
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={handleSaveWorkflow}
                >
                  <Save className="size-3.5" />
                  저장
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={selectedWorkflow === null}
                  onClick={handleDeleteWorkflow}
                >
                  <Trash2 className="size-3.5" />
                  삭제
                </Button>
              </div>
            </div>

            <div className="grid gap-2 rounded-md border bg-background/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold">프롬프트</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px]"
                  disabled={!sourcePrompt || sourcePrompt.trim() === ""}
                  onClick={handleImportSourcePrompt}
                  title="이미지 생성에 사용된 프롬프트 가져오기"
                >
                  <Sparkles className="size-3" />
                  원본 프롬프트
                </Button>
              </div>
              <Textarea
                value={promptText}
                onChange={(event) => {
                  setPromptText(event.target.value)
                }}
                className="max-h-28 min-h-16 resize-y text-xs"
                placeholder="인페인팅 프롬프트"
              />
            </div>

            <div className="grid gap-2 rounded-md border bg-background/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold">노드 매핑</Label>
                <span className="text-[10px] text-muted-foreground">
                  {nodeMappings.length}개
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-start gap-1.5 px-2 text-xs"
                    disabled={availableInputCandidates.length === 0}
                  >
                    <Plus className="size-3.5" />
                    매핑 추가 ({availableInputCandidates.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80">
                  <div className="border-b p-2">
                    <div className="relative">
                      <Search className="absolute top-1/2 left-1.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={mappingSearch}
                        onChange={(event) => {
                          setMappingSearch(event.target.value)
                        }}
                        placeholder="입력 검색..."
                        className="h-7 pl-7 text-xs"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredAvailableCandidates.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {availableInputCandidates.length === 0
                          ? "추가 가능한 입력이 없습니다"
                          : "검색 결과 없음"}
                      </div>
                    ) : (
                      filteredAvailableCandidates.map((candidate) => (
                        <DropdownMenuItem
                          key={candidate.id}
                          className="items-start gap-2 text-xs"
                          onSelect={() => {
                            addMapping(candidate.id)
                          }}
                        >
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{candidate.nodeId}
                          </span>
                          <span className="min-w-0 leading-snug break-all">
                            {candidate.label.replace(
                              `#${candidate.nodeId} `,
                              ""
                            )}
                          </span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {nodeMappings.length === 0 && parsedWorkflow !== null && (
                <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-2 text-[11px] text-muted-foreground">
                  <Info className="mb-1 inline size-3" /> 매핑이 없습니다.
                  "자동" 버튼으로 시작하거나 "매핑 추가"에서 입력을 선택하세요.
                </div>
              )}

              {nodeMappings.map((mapping) => {
                const candidate = inputCandidates.find(
                  (item) => item.id === `${mapping.nodeId}.${mapping.inputKey}`
                )
                return (
                  <div
                    key={mapping.id}
                    className="grid gap-1 rounded-md border bg-background/70 p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] leading-snug font-medium break-all">
                          {candidate?.label ??
                            `#${mapping.nodeId} · ${mapping.inputKey}`}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        aria-label="매핑 삭제"
                        onClick={() => {
                          setNodeMappings((prev) =>
                            prev.filter((item) => item.id !== mapping.id)
                          )
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <Select
                      value={mapping.sourceType}
                      onValueChange={(value) => {
                        updateMapping(mapping.id, {
                          sourceType: value as InpaintMappingSource,
                        })
                      }}
                    >
                      <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(
                            INPAINT_SOURCE_LABELS
                          ) as InpaintMappingSource[]
                        ).map((sourceType) => (
                          <SelectItem key={sourceType} value={sourceType}>
                            {INPAINT_SOURCE_LABELS[sourceType]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping.sourceType === "fixed" && (
                      <Input
                        value={mapping.fixedValue ?? ""}
                        onChange={(event) => {
                          updateMapping(mapping.id, {
                            fixedValue: event.target.value,
                          })
                        }}
                        className="h-8 text-xs"
                        placeholder="고정값"
                      />
                    )}
                    {mapping.sourceType === "seed" && (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                        <Input
                          type="number"
                          value={mapping.seedValue ?? 0}
                          disabled={mapping.seedRandom === true}
                          onChange={(event) => {
                            updateMapping(mapping.id, {
                              seedValue: Number(event.target.value),
                            })
                          }}
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          variant={
                            mapping.seedRandom === true ? "default" : "outline"
                          }
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => {
                            updateMapping(mapping.id, {
                              seedRandom: mapping.seedRandom !== true,
                            })
                          }}
                        >
                          랜덤
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}

              {parsedWorkflow !== null && inputCandidates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  매핑 가능한 입력을 찾지 못했습니다.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "paint" ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setMode("paint")
                }}
                aria-pressed={mode === "paint"}
              >
                <Brush className="size-4" />
                칠하기
              </Button>
              <Button
                type="button"
                variant={mode === "erase" ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setMode("erase")
                }}
                aria-pressed={mode === "erase"}
              >
                <Eraser className="size-4" />
                지우기
              </Button>
            </div>

            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>브러시 크기</span>
                <Kbd>[</Kbd>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={4}
                  max={220}
                  value={brushSize}
                  onChange={(event) => {
                    setBrushSize(Number(event.target.value))
                  }}
                  className="w-full accent-foreground"
                  aria-label="브러시 크기"
                />
                <span className="w-8 text-right font-mono">{brushSize}</span>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground/70">
                <span>4</span>
                <span>220</span>
              </div>
            </label>

            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              브러시 경도
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(brushHardness * 100)}
                  onChange={(event) => {
                    setBrushHardness(Number(event.target.value) / 100)
                  }}
                  className="w-full accent-foreground"
                  aria-label="브러시 경도"
                />
                <span className="w-8 text-right font-mono">
                  {Math.round(brushHardness * 100)}
                </span>
              </div>
            </label>

            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              브러시 농도
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={Math.round(brushOpacity * 100)}
                  onChange={(event) => {
                    setBrushOpacity(Number(event.target.value) / 100)
                  }}
                  className="w-full accent-foreground"
                  aria-label="브러시 농도"
                />
                <span className="w-8 text-right font-mono">
                  {Math.round(brushOpacity * 100)}
                </span>
              </div>
            </label>

            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              마스크 표시 불투명도
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={maskOpacity}
                  onChange={(event) => {
                    setMaskOpacity(Number(event.target.value))
                  }}
                  className="w-full accent-foreground"
                  aria-label="마스크 표시 불투명도"
                />
                <span className="w-8 text-right font-mono">{maskOpacity}</span>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-1.5"
                onClick={undo}
                disabled={!canUndo}
                aria-label="실행 취소"
                title="실행 취소 (Ctrl+Z)"
              >
                <Undo2 className="size-4" />
                취소
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-1.5"
                onClick={redo}
                disabled={!canRedo}
                aria-label="다시 실행"
                title="다시 실행 (Ctrl+Shift+Z)"
              >
                <Redo2 className="size-4" />
                재실행
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-1.5"
                onClick={() => {
                  setShowMask((value) => !value)
                }}
                aria-pressed={showMask}
                title="마스크 표시 토글 (H)"
              >
                {showMask ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
                {showMask ? "마스크 숨김" : "마스크 표시"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-1.5"
                onClick={clearMask}
                aria-label="마스크 초기화"
              >
                <RotateCcw className="size-4" />
                마스크 초기화
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-1 text-[11px]"
                onClick={() => {
                  setZoom((z) => clamp(z * 0.8, MIN_ZOOM, MAX_ZOOM))
                }}
                title="축소 (-)"
                aria-label="축소"
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <div className="flex items-center justify-center font-mono text-[11px] text-muted-foreground">
                {Math.round(zoom * 100)}%
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-1 text-[11px]"
                onClick={() => {
                  setZoom((z) => clamp(z * 1.25, MIN_ZOOM, MAX_ZOOM))
                }}
                title="확대 (+)"
                aria-label="확대"
              >
                <ZoomIn className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-1 text-[11px]"
                onClick={() => {
                  setZoom(1)
                  setPan({ x: 0, y: 0 })
                }}
                title="원본 크기 (Ctrl+0)"
                aria-label="원본 크기로"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              <Hand className="mr-1 inline size-3" />
              스페이스+드래그로 이동, 휠로 줌. 단축키: <Kbd>B</Kbd> 칠하기{" "}
              <Kbd>E</Kbd> 지우기 <Kbd>X</Kbd> 전환 <Kbd>H</Kbd> 마스크{" "}
              <Kbd>[</Kbd>
              <Kbd>]</Kbd> 브러시 크기 <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> 취소{" "}
              <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Z</Kbd> 재실행{" "}
              <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> 실행
            </p>
          </aside>

          <div className="relative min-h-0 overflow-hidden rounded-md border bg-neutral-950">
            <Tabs
              value={resultTab}
              onValueChange={(v) => {
                setResultTab(v as "edit" | "result")
              }}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-neutral-900/60 px-2 py-1">
                <TabsList className="h-8 bg-white/5">
                  <TabsTrigger value="edit" className="text-xs">
                    편집
                  </TabsTrigger>
                  <TabsTrigger value="result" className="text-xs">
                    결과
                    {finalImageUrls.length > 0 && (
                      <span className="ml-1 rounded bg-white/15 px-1 text-[9px]">
                        {finalImageUrls.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
                {resultTab === "edit" && (
                  <div className="flex items-center gap-2 text-[10px] text-white/50">
                    {isPannable && (
                      <span className="flex items-center gap-1">
                        <Hand className="size-3" /> 이동 모드
                      </span>
                    )}
                  </div>
                )}
              </div>

              <TabsContent
                value="edit"
                forceMount
                hidden={resultTab !== "edit"}
                className="mt-0 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
              >
                <div className="relative flex min-h-full items-center justify-center p-4">
                  {!ready && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-white/70">
                      {loadError ? (
                        <>
                          <AlertTriangle className="size-8 animate-pulse text-destructive" />
                          <span className="font-medium text-destructive">
                            이미지를 불러오는데 실패했습니다.
                          </span>
                          <span className="text-[11px] text-white/40">
                            CORS 설정 또는 네트워크 상태를 확인해주세요.
                          </span>
                        </>
                      ) : (
                        <>
                          <Spinner className="size-6 text-white/50" />
                          <span>이미지를 불러오는 중...</span>
                        </>
                      )}
                    </div>
                  )}
                  <div
                    className="relative w-fit min-w-0"
                    style={{
                      transform: `translate(${String(pan.x)}px, ${String(pan.y)}px) scale(${String(zoom)})`,
                      transformOrigin: "center center",
                      transition: panning ? "none" : "transform 80ms",
                    }}
                  >
                    <canvas
                      ref={imageCanvasRef}
                      className="block max-h-[78vh] max-w-full"
                    />
                    <canvas
                      ref={maskCanvasRef}
                      className="absolute inset-0 block max-h-[78vh] max-w-full touch-none"
                      style={{
                        opacity: showMask ? maskOpacity / 100 : 0,
                        filter:
                          "sepia(1) saturate(12) hue-rotate(300deg) brightness(1.2)",
                        cursor: isPannable ? "grab" : "none",
                      }}
                      onPointerDown={(event) => {
                        if (isPannable) {
                          setPanning(true)
                          panningRef.current = true
                          panStartRef.current = {
                            x: event.clientX,
                            y: event.clientY,
                            panX: pan.x,
                            panY: pan.y,
                          }
                          event.currentTarget.setPointerCapture(event.pointerId)
                          return
                        }
                        event.currentTarget.setPointerCapture(event.pointerId)
                        paintingRef.current = true
                        lastPointRef.current = null
                        pushHistory()
                        paintTo(event)
                      }}
                      onPointerMove={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect()
                        setCursorPos({
                          x: (event.clientX - rect.left) / zoom,
                          y: (event.clientY - rect.top) / zoom,
                        })
                        const currentScale =
                          rect.width / zoom / event.currentTarget.width
                        setCursorScale(currentScale)
                        if (
                          isPannable &&
                          panningRef.current &&
                          panStartRef.current
                        ) {
                          setPan({
                            x:
                              panStartRef.current.panX +
                              (event.clientX - panStartRef.current.x),
                            y:
                              panStartRef.current.panY +
                              (event.clientY - panStartRef.current.y),
                          })
                          return
                        }
                        if (paintingRef.current) paintTo(event)
                      }}
                      onPointerUp={(event) => {
                        if (isPannable) {
                          setPanning(false)
                          panningRef.current = false
                          panStartRef.current = null
                        }
                        stopPaint()
                        event.currentTarget.releasePointerCapture(
                          event.pointerId
                        )
                      }}
                      onPointerCancel={stopPaint}
                      onPointerEnter={(event) => {
                        setCursorVisible(true)
                        const rect = event.currentTarget.getBoundingClientRect()
                        setCursorPos({
                          x: (event.clientX - rect.left) / zoom,
                          y: (event.clientY - rect.top) / zoom,
                        })
                        const currentScale =
                          rect.width / zoom / event.currentTarget.width
                        setCursorScale(currentScale)
                      }}
                      onPointerLeave={() => {
                        setCursorVisible(false)
                        stopPaint()
                      }}
                      onWheel={(event) => {
                        event.preventDefault()
                        const delta = -event.deltaY
                        setZoom((z) =>
                          clamp(z * (delta > 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM)
                        )
                      }}
                    />
                    {cursorVisible && cursorPos !== null && !isPannable && (
                      <div
                        ref={cursorRef}
                        className="pointer-events-none absolute rounded-full border-2 mix-blend-difference"
                        style={{
                          left: cursorPos.x - cursorDiameter / 2,
                          top: cursorPos.y - cursorDiameter / 2,
                          width: cursorDiameter,
                          height: cursorDiameter,
                          borderColor:
                            mode === "paint"
                              ? "rgb(255, 200, 80)"
                              : "rgb(255, 80, 80)",
                          backgroundColor:
                            mode === "paint"
                              ? "rgba(255, 200, 80, 0.1)"
                              : "rgba(255, 80, 80, 0.1)",
                        }}
                      />
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="result"
                className="mt-0 min-h-0 flex-1 overflow-auto bg-neutral-950"
              >
                <div className="flex min-h-0 flex-col p-3">
                  {activeInpaintJob === null &&
                    !hasLivePreview &&
                    finalImageUrls.length === 0 && (
                      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-white/50">
                        <Info className="size-8 text-white/30" />
                        <div className="text-sm">
                          아직 실행된 인페인팅이 없습니다
                        </div>
                        <p className="max-w-sm text-xs text-white/40">
                          마스크를 칠하고 "인페인팅 실행" 버튼을 누르면 여기에
                          생성 결과가 표시됩니다.
                        </p>
                      </div>
                    )}

                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-white/85">
                      결과
                    </div>
                    <div className="flex items-center gap-2">
                      {finalImageUrls.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 border-white/15 bg-white/5 px-2 text-[11px] text-white/80 hover:bg-white/10"
                          onClick={() => {
                            setCompareMode((v) => !v)
                          }}
                          aria-pressed={compareMode}
                          title="편집 전 이미지와 결과를 나란히 비교"
                        >
                          <ArrowLeftRight className="size-3.5" />
                          {compareMode ? "비교 끄기" : "원본과 비교"}
                        </Button>
                      )}
                      {activeInpaintJob !== null && (
                        <div className="flex min-w-0 items-center gap-2 truncate text-[10px] text-white/60">
                          {activeInpaintJob.status === "running" && (
                            <Spinner className="size-3.5 text-white/70" />
                          )}
                          <span className="truncate">
                            {activeInpaintJob.currentNodeName
                              ? `${activeInpaintJob.currentNodeName} · `
                              : ""}
                            {Math.round(activeInpaintJob.progressPercent)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 메인 결과 영역 — 단일 결과는 크게, 비교 모드면 원본과 나란히 */}
                  <div className="min-h-0 flex-1">
                    {finalImageUrls.length > 0 ? (
                      (() => {
                        const currentUrl =
                          finalImageUrls[safeSelectedResultIndex] ??
                          finalImageUrls[0] ??
                          ""
                        if (currentUrl === "") return null
                        if (compareMode && sourceDisplayUrl !== "") {
                          return (
                            <div className="grid min-h-0 grid-cols-2 gap-2">
                              <div className="flex min-h-0 flex-col rounded-md border border-white/10 bg-white/5">
                                <div className="shrink-0 border-b border-white/10 px-2 py-1 text-[10px] font-medium text-white/70">
                                  편집 전
                                </div>
                                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b bg-black/40 p-2">
                                  <img
                                    src={sourceDisplayUrl}
                                    alt="편집 전 이미지"
                                    className="max-h-[72vh] max-w-full object-contain"
                                  />
                                </div>
                              </div>
                              <div className="group relative flex min-h-0 flex-col rounded-md border border-white/10 bg-white/5">
                                <div className="shrink-0 border-b border-white/10 px-2 py-1 text-[10px] font-medium text-white/70">
                                  완료 이미지
                                </div>
                                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b bg-black/40 p-2">
                                  <img
                                    src={currentUrl}
                                    alt="완료 이미지"
                                    className="max-h-[72vh] max-w-full object-contain"
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="absolute top-1 right-1 rounded bg-black/60 p-1 opacity-0 transition group-hover:opacity-100"
                                  onClick={() => {
                                    downloadFinalImage(currentUrl)
                                  }}
                                  aria-label="이 이미지 다운로드"
                                >
                                  <Download className="size-3 text-white" />
                                </button>
                              </div>
                            </div>
                          )
                        }
                        return (
                          <div className="group relative flex min-h-0 flex-col rounded-md border border-white/10 bg-white/5">
                            <div className="shrink-0 border-b border-white/10 px-2 py-1 text-[10px] font-medium text-white/70">
                              완료 이미지
                              {finalImageUrls.length > 1 && (
                                <span className="ml-2 text-white/45">
                                  {safeSelectedResultIndex + 1}/
                                  {finalImageUrls.length}
                                </span>
                              )}
                            </div>
                            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b bg-black/40 p-2">
                              <img
                                src={currentUrl}
                                alt="완료 이미지"
                                className="max-h-[74vh] max-w-full object-contain"
                              />
                            </div>
                            <button
                              type="button"
                              className="absolute top-1 right-1 rounded bg-black/60 p-1 opacity-0 transition group-hover:opacity-100"
                              onClick={() => {
                                downloadFinalImage(currentUrl)
                              }}
                              aria-label="이 이미지 다운로드"
                            >
                              <Download className="size-3 text-white" />
                            </button>
                          </div>
                        )
                      })()
                    ) : hasLivePreview ? (
                      <div className="group relative flex min-h-0 flex-col rounded-md border border-white/10 bg-white/5">
                        <div className="shrink-0 border-b border-white/10 px-2 py-1 text-[10px] font-medium text-white/70">
                          생성 중 프리뷰
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b bg-black/40 p-2">
                          <WorkerPreviewImage
                            backendUrl={backendUrl}
                            workerId={livePreviewWorkerId}
                            previewToken={livePreviewToken}
                            alt="생성 중 프리뷰"
                            className="max-h-[74vh] max-w-full object-contain"
                          />
                        </div>
                      </div>
                    ) : (
                      activeInpaintJob !== null && (
                        <div className="flex aspect-video min-h-[40vh] items-center justify-center rounded bg-black/40 text-[11px] text-white/45">
                          {activeInpaintJob.status === "running"
                            ? "생성 중..."
                            : "완료 이미지 대기 중"}
                        </div>
                      )
                    )}
                  </div>

                  {/* 썸네일 트레이 — 결과가 2장 이상일 때만 표시 */}
                  {finalImageUrls.length > 1 && (
                    <div className="mt-3 flex shrink-0 gap-2 overflow-x-auto rounded-md border border-white/10 bg-white/5 p-2">
                      {finalImageUrls.map((url, index) => {
                        const isActive = index === safeSelectedResultIndex
                        return (
                          <button
                            type="button"
                            key={url}
                            onClick={() => {
                              setSelectedResultIndex(index)
                            }}
                            className={`relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-black/40 transition ${
                              isActive
                                ? "border-white/70 ring-1 ring-white/40"
                                : "border-white/10 hover:border-white/30"
                            }`}
                            aria-pressed={isActive}
                            aria-label={`결과 ${String(index + 1)} 선택`}
                          >
                            <img
                              src={url}
                              alt={`결과 ${String(index + 1)}`}
                              className="max-h-full max-w-full object-contain"
                            />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            <X className="size-4" />
            닫기
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={!ready}
            onClick={downloadOverlay}
          >
            <Download className="size-4" />
            오버레이 저장
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={!ready}
            onClick={downloadMask}
          >
            <Download className="size-4" />
            마스크 저장
          </Button>
          <Button
            id="ceg-inpaint-run"
            type="button"
            className="gap-1.5"
            disabled={
              !ready || submitting || parsedWorkflow === null || !mappingValid
            }
            onClick={() => {
              void handleRunInpaint()
            }}
            title={
              !mappingValid
                ? "원본/마스크 또는 RGBA 매핑을 먼저 설정하세요"
                : "인페인팅 실행 (Ctrl+Enter)"
            }
          >
            {submitting ? (
              <>
                <Spinner className="size-4" />
                제출 중...
              </>
            ) : (
              <>
                <Play className="size-4" />
                인페인팅 실행
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
