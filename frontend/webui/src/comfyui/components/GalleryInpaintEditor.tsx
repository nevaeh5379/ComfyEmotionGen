import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Brush,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { API, HEADERS } from "@/lib/api"
import { MAX_RANDOM_SEED } from "@/lib/constants"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import type { ComfyWorkflow, NodeInputValue } from "@/lib/workflow"
import { useWorkflowContext } from "../contexts/WorkflowContext"
import { useBackend } from "../hooks/useBackend"
import type { BackendEvent } from "../types/Message"
import { triggerBlobDownload } from "../utils/downloadImages"

interface GalleryInpaintEditorProps {
  open: boolean
  backendUrl: string
  imageUrl: string
  filename: string
  onOpenChange: (open: boolean) => void
}

type PaintMode = "paint" | "erase"

interface WorkflowInputCandidate {
  id: string
  nodeId: string
  inputKey: string
  label: string
  isNumeric: boolean
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

interface GeneratedInpaintPreview {
  sourceUrl: string
  maskAlphaUrl: string
  maskRgbUrl: string
  alphaUrl: string
  overlayUrl: string
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

function getBrushSpacing(brushSize: number): number {
  const stepPercentage =
    Math.pow(100, COMFY_DEFAULT_BRUSH_STEP_SIZE / 100) / 100
  return Math.max(1, brushSize * stepPercentage)
}

function getPoint(
  canvas: HTMLCanvasElement,
  event: React.PointerEvent<HTMLCanvasElement>
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
  mode: PaintMode
): void {
  ctx.save()
  ctx.globalCompositeOperation =
    mode === "paint" ? "source-over" : "destination-out"
  ctx.fillStyle = "rgb(255, 255, 255)"
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
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

function makeInputCandidates(workflow: ComfyWorkflow | null): WorkflowInputCandidate[] {
  if (workflow === null) return []
  const candidates: WorkflowInputCandidate[] = []
  for (const [nodeId, node] of Object.entries(workflow)) {
    for (const [inputKey, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) || value === null || typeof value === "object") {
        continue
      }
      candidates.push({
        id: `${nodeId}.${inputKey}`,
        nodeId,
        inputKey,
        label: `#${nodeId} ${node._meta?.title ?? node.class_type} · ${inputKey}`,
        isNumeric: typeof value === "number",
      })
    }
  }
  return candidates
}

function buildAutoInpaintMappings(workflow: ComfyWorkflow): InpaintNodeMapping[] {
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
      return node.class_type === "CLIPTextEncode" && /positive|prompt/.test(title)
    }) ?? entries.find(([, node]) => node.class_type === "CLIPTextEncode")
  if (promptNode && "text" in promptNode[1].inputs) {
    add(promptNode[0], "text", "prompt")
  }

  const imageCandidates: { nodeId: string; inputKey: string; score: number }[] = []
  for (const [nodeId, node] of entries) {
    for (const [inputKey, value] of Object.entries(node.inputs)) {
      if (typeof value !== "string") continue
      const label = `${node.class_type} ${node._meta?.title ?? ""} ${inputKey}`.toLowerCase()
      if (!/image|mask/.test(label)) continue
      imageCandidates.push({
        nodeId,
        inputKey,
        score: /mask/.test(label) ? 10 : /source|input|base|original/.test(label) ? 5 : 1,
      })
    }
  }
  const maskCandidate =
    imageCandidates.find((candidate) => candidate.score >= 10) ?? imageCandidates[1]
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
          (maskCandidate ? `${maskCandidate.nodeId}.${maskCandidate.inputKey}` : "")
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
      if (typeof value === "number" && inputKey.toLowerCase().includes("seed")) {
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

function canvasToMaskFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return canvasToFile(
    createMaskExportCanvas(canvas),
    `${baseName(filename)}-mask-rgb.png`,
    "RGB 마스크 생성 실패"
  )
}

function createAlphaMaskImageCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
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
  const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
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

export function GalleryInpaintEditor({
  open,
  backendUrl,
  imageUrl,
  filename,
  onOpenChange,
}: GalleryInpaintEditorProps): React.JSX.Element {
  const { savedWorkflows } = useWorkflowContext()
  const { jobs, workerPreviews } = useBackend()
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const paintingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<PaintMode>("paint")
  const [brushSize, setBrushSize] = useState(56)
  const [maskOpacity, setMaskOpacity] = useState(58)
  const [showMask, setShowMask] = useState(true)
  const [inpaintWorkflows, setInpaintWorkflows] = useState<SavedInpaintWorkflow[]>(() =>
    loadInpaintWorkflows()
  )
  const [selectedWorkflowId, setSelectedWorkflowIdState] = useState(
    () => localStorage.getItem(STORAGE_KEYS.inpaintActiveWorkflowId) ?? ""
  )
  const [workflowName, setWorkflowName] = useState("")
  const [workflowDraft, setWorkflowDraft] = useState("")
  const [nodeMappings, setNodeMappings] = useState<InpaintNodeMapping[]>([])
  const [promptText, setPromptText] = useState("")
  const [importWorkflowId, setImportWorkflowId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [generatedPreview, setGeneratedPreview] =
    useState<GeneratedInpaintPreview | null>(null)
  const [submittedJobIds, setSubmittedJobIds] = useState<string[]>([])
  const [finalImageUrls, setFinalImageUrls] = useState<string[]>([])
  const generatedPreviewUrlsRef = useRef<string[]>([])

  const selectedWorkflow = useMemo(
    () =>
      inpaintWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ??
      null,
    [inpaintWorkflows, selectedWorkflowId]
  )

  const parsedWorkflow = useMemo<ComfyWorkflow | null>(() => {
    return parseWorkflowDraft(workflowDraft)
  }, [workflowDraft])

  const inputCandidates = useMemo(
    () => makeInputCandidates(parsedWorkflow),
    [parsedWorkflow]
  )

  const availableInputCandidates = useMemo(() => {
    const used = new Set(nodeMappings.map((mapping) => `${mapping.nodeId}.${mapping.inputKey}`))
    return inputCandidates.filter((candidate) => !used.has(candidate.id))
  }, [inputCandidates, nodeMappings])

  const activeInpaintJob = useMemo(() => {
    return (
      jobs.find((job) => submittedJobIds.includes(job.id)) ?? null
    )
  }, [jobs, submittedJobIds])

  const livePreviewUrl = useMemo(() => {
    const workerId = activeInpaintJob?.workerId
    if (!workerId) return null
    const previewToken = workerPreviews[workerId]
    if (previewToken === undefined) return null
    return `${backendUrl}/workers/${workerId}/preview?t=${String(previewToken)}`
  }, [activeInpaintJob?.workerId, backendUrl, workerPreviews])

  useEffect(() => {
    persistInpaintWorkflows(inpaintWorkflows)
  }, [inpaintWorkflows])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.inpaintActiveWorkflowId, selectedWorkflowId)
  }, [selectedWorkflowId])

  const setSelectedWorkflowId = useCallback(
    (workflowId: string) => {
      setSelectedWorkflowIdState(workflowId)
      const workflow =
        inpaintWorkflows.find((item) => item.id === workflowId) ?? null
      setWorkflowName(workflow?.name ?? "")
      setWorkflowDraft(workflow?.workflow ?? "")
      setNodeMappings(workflow?.mappings ?? [])
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
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
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
      setReady(true)
    }
    img.src = imageUrl
  }, [imageUrl, open])

  const clearMask = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const paintTo = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = maskCanvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!canvas || !ctx) return
      const point = getPoint(canvas, event)
      const lastPoint = lastPointRef.current
      if (lastPoint === null) {
        drawDot(ctx, point.x, point.y, brushSize, mode)
      } else {
        const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y)
        const steps = Math.max(1, Math.ceil(distance / getBrushSpacing(brushSize)))
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          drawDot(
            ctx,
            lastPoint.x + (point.x - lastPoint.x) * t,
            lastPoint.y + (point.y - lastPoint.y) * t,
            brushSize,
            mode
          )
        }
      }
      lastPointRef.current = point
    },
    [brushSize, mode]
  )

  const stopPaint = useCallback(() => {
    paintingRef.current = false
    lastPointRef.current = null
  }, [])

  const clearGeneratedPreview = useCallback(() => {
    generatedPreviewUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    generatedPreviewUrlsRef.current = []
    setGeneratedPreview(null)
  }, [])

  useEffect(() => clearGeneratedPreview, [clearGeneratedPreview])

  useEffect(() => {
    if (activeInpaintJob === null) return
    const urls = [
      ...activeInpaintJob.savedImageHashes.map(
        (hash) => `${backendUrl}/saved-images/${hash}`
      ),
      ...activeInpaintJob.imageUrls,
    ]
    if (urls.length === 0) return
    setFinalImageUrls((prev) => Array.from(new Set([...urls, ...prev])).slice(0, 8))
  }, [activeInpaintJob, backendUrl])

  useEffect(() => {
    const handleImageEvent = (event: Event): void => {
      const detail = (event as CustomEvent<BackendEvent>).detail
      if (detail.type !== "image.saved") return
      if (!submittedJobIds.includes(detail.jobId)) return
      const url = `${backendUrl}/saved-images/${detail.hash}`
      setFinalImageUrls((prev) => Array.from(new Set([url, ...prev])).slice(0, 8))
    }
    window.addEventListener("ceg-image-event", handleImageEvent)
    return () => {
      window.removeEventListener("ceg-image-event", handleImageEvent)
    }
  }, [backendUrl, submittedJobIds])

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

  const buildGeneratedPreview = useCallback(
    async (
      sourceFile: File,
      maskAlphaFile: File,
      maskRgbFile: File,
      alphaSourceFile: File,
      imageCanvas: HTMLCanvasElement,
      maskCanvas: HTMLCanvasElement
    ): Promise<void> => {
      clearGeneratedPreview()
      const overlayFile = await canvasToFile(
        createOverlayCanvas(imageCanvas, maskCanvas, maskOpacity),
        `${baseName(filename)}-inpaint-overlay.png`,
        "오버레이 이미지 생성 실패"
      )
      const urls = [
        URL.createObjectURL(sourceFile),
        URL.createObjectURL(maskAlphaFile),
        URL.createObjectURL(maskRgbFile),
        URL.createObjectURL(alphaSourceFile),
        URL.createObjectURL(overlayFile),
      ]
      generatedPreviewUrlsRef.current = urls
      setGeneratedPreview({
        sourceUrl: urls[0] ?? "",
        maskAlphaUrl: urls[1] ?? "",
        maskRgbUrl: urls[2] ?? "",
        alphaUrl: urls[3] ?? "",
        overlayUrl: urls[4] ?? "",
      })
    },
    [clearGeneratedPreview, filename, maskOpacity]
  )

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
      if (!response.ok) throw new Error(`업로드 실패: HTTP ${String(response.status)}`)
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
      mappings: nodeMappings.length > 0 ? nodeMappings : buildAutoInpaintMappings(parsed),
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
          sourceType: candidate.isNumeric ? "seed" : "fixed",
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
    const hasSource = nodeMappings.some((mapping) => mapping.sourceType === "sourceImage")
    const hasMask = nodeMappings.some(
      (mapping) =>
        mapping.sourceType === "maskImage" ||
        mapping.sourceType === "maskRgbImage"
    )
    const hasAlphaSource = nodeMappings.some(
      (mapping) => mapping.sourceType === "sourceWithAlphaMask"
    )
    if ((!hasSource || !hasMask) && !hasAlphaSource) {
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
    setSubmitting(true)
    try {
      const sourceFile = await canvasToImageFile(imageCanvas, filename)
      const maskAlphaFile = await canvasToAlphaMaskFile(maskCanvas, filename)
      const maskRgbFile = await canvasToMaskFile(maskCanvas, filename)
      const alphaSourceFile = await canvasToAlphaMaskedImageFile(
        imageCanvas,
        maskCanvas,
        filename
      )
      await buildGeneratedPreview(
        sourceFile,
        maskAlphaFile,
        maskRgbFile,
        alphaSourceFile,
        imageCanvas,
        maskCanvas
      )
      setFinalImageUrls([])
      const [sourceName, maskAlphaName, maskRgbName, alphaSourceName] = await Promise.all([
        uploadComfyImage(sourceFile),
        uploadComfyImage(maskAlphaFile),
        uploadComfyImage(maskRgbFile),
        uploadComfyImage(alphaSourceFile),
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
              meta: { source: filename, mode: "inpaint" },
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
        setSubmittedJobIds((prev) =>
          Array.from(new Set([...data.jobIds!, ...prev])).slice(0, 12)
        )
      }
      toast.success("인페인팅 작업이 큐에 추가되었습니다.")
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "인페인팅 작업 제출 실패")
    } finally {
      setSubmitting(false)
    }
  }, [
    backendUrl,
    applyMappings,
    buildGeneratedPreview,
    filename,
    nodeMappings,
    parsedWorkflow,
    uploadComfyImage,
  ])

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

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-0 max-h-full flex-col gap-3 overflow-y-auto overflow-x-hidden rounded-md border bg-muted/20 p-3">
            <div className="grid gap-2 rounded-md border bg-background/60 p-2">
              <Label className="text-xs font-semibold">
                인페인팅 전용 워크플로우
              </Label>
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
                      <SelectItem value="__none__">가져올 워크플로우</SelectItem>
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
                className="max-h-28 min-h-20 resize-none font-mono text-[11px]"
                placeholder="ComfyUI API workflow JSON"
              />
              <div className="grid grid-cols-3 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={handleAutoMap}
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
              {workflowDraft !== "" && parsedWorkflow === null && (
                <p className="text-xs text-destructive">
                  워크플로우 JSON을 읽을 수 없습니다.
                </p>
              )}
            </div>

            <div className="grid gap-2 rounded-md border bg-background/60 p-2">
              <Label className="text-xs font-semibold">프롬프트</Label>
              <Textarea
                value={promptText}
                onChange={(event) => {
                  setPromptText(event.target.value)
                }}
                className="max-h-28 min-h-16 resize-none text-xs"
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
                    매핑 추가
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-72 w-80 overflow-y-auto"
                >
                  {availableInputCandidates.map((candidate) => (
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
                      <span className="min-w-0 break-all leading-snug">
                        {candidate.label.replace(`#${candidate.nodeId} `, "")}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

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
                        <div className="break-all text-[11px] leading-snug font-medium">
                          {candidate?.label ??
                            `#${mapping.nodeId} · ${mapping.inputKey}`}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
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
              >
                <Eraser className="size-4" />
                지우기
              </Button>
            </div>

            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              브러시 크기
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
                />
                <span className="w-8 text-right font-mono">{brushSize}</span>
              </div>
            </label>

            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              마스크 불투명도
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
                />
                <span className="w-8 text-right font-mono">{maskOpacity}</span>
              </div>
            </label>

            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-1.5"
                onClick={() => {
                  setShowMask((value) => !value)
                }}
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
              >
                <RotateCcw className="size-4" />
                마스크 초기화
              </Button>
            </div>
          </aside>

          <div className="relative min-h-0 overflow-auto rounded-md border bg-neutral-950">
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
                이미지를 불러오는 중...
              </div>
            )}
            <div className="relative mx-auto w-fit min-w-0">
              <canvas ref={imageCanvasRef} className="block max-h-[78vh] max-w-full" />
              <canvas
                ref={maskCanvasRef}
                className="absolute inset-0 block max-h-[78vh] max-w-full cursor-crosshair touch-none"
                style={{
                  opacity: showMask ? maskOpacity / 100 : 0,
                  filter:
                    "sepia(1) saturate(12) hue-rotate(300deg) brightness(1.2)",
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  paintingRef.current = true
                  lastPointRef.current = null
                  paintTo(event)
                }}
                onPointerMove={(event) => {
                  if (paintingRef.current) paintTo(event)
                }}
                onPointerUp={stopPaint}
                onPointerCancel={stopPaint}
                onPointerLeave={stopPaint}
              />
            </div>
            {generatedPreview !== null && (
              <div className="sticky bottom-0 border-t border-white/10 bg-neutral-950/95 p-3 backdrop-blur">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-white/85">
                    업로드 입력 확인
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/20 bg-white/10 px-2 text-xs text-white hover:bg-white/20"
                    onClick={clearGeneratedPreview}
                  >
                    숨김
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  {[
                    ["원본", generatedPreview.sourceUrl],
                    ["마스크(LoadImage MASK)", generatedPreview.maskAlphaUrl],
                    ["마스크 RGB", generatedPreview.maskRgbUrl],
                    ["원본+마스크(RGBA · 투명부=마스크)", generatedPreview.alphaUrl],
                    ["오버레이", generatedPreview.overlayUrl],
                  ].map(([label, url]) => (
                    <div
                      key={label}
                      className="min-w-0 rounded-md border border-white/10 bg-white/5 p-2"
                    >
                      <div className="mb-1 truncate text-[10px] font-medium text-white/70">
                        {label}
                      </div>
                      <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-[linear-gradient(45deg,#555_25%,transparent_25%),linear-gradient(-45deg,#555_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#555_75%),linear-gradient(-45deg,transparent_75%,#555_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]">
                        <img
                          src={url}
                          alt={label}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {(activeInpaintJob !== null ||
                  livePreviewUrl !== null ||
                  finalImageUrls.length > 0) && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-white/85">
                        생성 프리뷰 / 완료 이미지
                      </div>
                      {activeInpaintJob !== null && (
                        <div className="min-w-0 truncate text-[10px] text-white/60">
                          {activeInpaintJob.currentNodeName
                            ? `${activeInpaintJob.currentNodeName} · `
                            : ""}
                          {Math.round(activeInpaintJob.progressPercent)}%
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className="min-w-0 rounded-md border border-white/10 bg-white/5 p-2">
                        <div className="mb-1 truncate text-[10px] font-medium text-white/70">
                          생성 중 프리뷰
                        </div>
                        <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-black/40">
                          {livePreviewUrl !== null ? (
                            <img
                              src={livePreviewUrl}
                              alt="생성 중 프리뷰"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span className="text-[11px] text-white/45">
                              프리뷰 대기 중
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 rounded-md border border-white/10 bg-white/5 p-2">
                        <div className="mb-1 truncate text-[10px] font-medium text-white/70">
                          완료 이미지
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {finalImageUrls.length > 0 ? (
                            finalImageUrls.map((url) => (
                              <div
                                key={url}
                                className="flex aspect-square items-center justify-center overflow-hidden rounded bg-black/40"
                              >
                                <img
                                  src={url}
                                  alt="완료 이미지"
                                  className="max-h-full max-w-full object-contain"
                                />
                              </div>
                            ))
                          ) : (
                            <div className="col-span-2 flex aspect-video items-center justify-center rounded bg-black/40 text-[11px] text-white/45">
                              완료 이미지 대기 중
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
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
            type="button"
            className="gap-1.5"
            disabled={
              !ready ||
              submitting ||
              parsedWorkflow === null
            }
            onClick={() => {
              void handleRunInpaint()
            }}
          >
            <Play className="size-4" />
            {submitting ? "제출 중..." : "인페인팅 실행"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
