import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Brush,
  Crop,
  Eraser,
  Eye,
  EyeOff,
  Lasso,
  Layers as LayersIcon,
  Wand2 as MagicWandIcon,
  MousePointer2,
  Plus,
  Sparkles,
  SquareDashed,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Download,
  Save,
  CircleDashed,
  ArrowUp,
  ArrowDown,
  Sliders,
  HelpCircle,
  Info,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import {
  CANVAS_MAX_SIZE,
  DEFAULT_ADJUST,
  DEFAULT_BRUSH,
  DEFAULT_MAGIC_WAND,
  MAX_ZOOM,
  MIN_ZOOM,
  clamp,
  type AdjustSettings,
  type BrushSettings,
  type Layer,
  type MagicWandSettings,
  type Point,
  type ToolId,
  type ViewTransform,
  type Selection,
} from "./types"
import {
  clearSelectionArea,
  clientToImagePoint,
  compositeLayers,
  drawStroke,
  floodFill,
} from "./canvasUtils"
import { useCanvasHistory } from "./hooks/useCanvasHistory"
import { useLayerStack } from "./hooks/useLayerStack"
import { useSelection } from "./hooks/useSelection"
import {
  fetchInpaintCapabilities,
  removeObject,
  type InpaintCapabilities,
} from "./services/objectRemove"
import {
  baseName,
  downloadCanvas,
  uploadToSavedImages,
} from "./services/exportImage"

interface ImageEditorDialogProps {
  open: boolean
  backendUrl: string
  imageUrl: string
  filename: string
  parentHash?: string
  onOpenChange: (open: boolean) => void
  onSaveSuccess?: (savedImage: { hash: string; filename: string }) => void
}

const TOOL_LABELS: Record<ToolId, string> = {
  move: "이동 (V)",
  brush: "브러시 (B)",
  erase: "지우개 (E)",
  "rect-select": "사각 선택 (R)",
  "ellipse-select": "타원 선택",
  lasso: "라소 (L)",
  "magic-wand": "매직완드 (M)",
  clone: "복제 (C)",
  heal: "치유",
  crop: "자르기 (K)",
  "object-remove": "객체 제거",
  adjust: "색보정",
}

function drawStrokeWithSelection(
  activeCanvas: HTMLCanvasElement,
  from: Point,
  to: Point,
  brush: BrushSettings,
  mode: "paint" | "erase",
  selection: Selection | null
): void {
  const ctx = activeCanvas.getContext("2d")
  if (!ctx) return

  if (!selection) {
    drawStroke(
      ctx,
      from,
      to,
      brush.size,
      mode,
      brush.hardness,
      brush.opacity,
      brush.color
    )
    return
  }

  const w = activeCanvas.width
  const h = activeCanvas.height

  const tempCanvas = document.createElement("canvas")
  tempCanvas.width = w
  tempCanvas.height = h
  const tempCtx = tempCanvas.getContext("2d")
  if (!tempCtx) return

  drawStroke(
    tempCtx,
    from,
    to,
    brush.size,
    mode,
    brush.hardness,
    1.0,
    brush.color
  )

  tempCtx.globalCompositeOperation = "destination-in"

  const { type, rect, maskCanvas } = selection
  if (rect) {
    const { x, y, w: rw, h: rh } = rect
    tempCtx.beginPath()
    if (type === "ellipse") {
      tempCtx.ellipse(x + rw / 2, y + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2)
    } else {
      tempCtx.rect(x, y, rw, rh)
    }
    tempCtx.fill()
  } else if (maskCanvas) {
    tempCtx.drawImage(maskCanvas, 0, 0)
  }

  ctx.save()
  ctx.globalAlpha = brush.opacity
  if (mode === "erase") {
    ctx.globalCompositeOperation = "destination-out"
    ctx.drawImage(tempCanvas, 0, 0)
  } else {
    ctx.drawImage(tempCanvas, 0, 0)
  }
  ctx.restore()
}

export function ImageEditorDialog({
  open,
  backendUrl,
  imageUrl,
  filename,
  parentHash,
  onOpenChange,
  onSaveSuccess,
}: ImageEditorDialogProps): React.JSX.Element {
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const paintingRef = useRef(false)
  const lastPointRef = useRef<Point | null>(null)
  const panningRef = useRef(false)
  const panStartRef = useRef<{
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)
  const lassoPathRef = useRef<Point[]>([])
  const cloneSourceRef = useRef<Point | null>(null)
  const removeMaskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)

  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [tool, setTool] = useState<ToolId>("move")
  const [brush, setBrush] = useState<BrushSettings>(DEFAULT_BRUSH)
  const [magicWand, setMagicWand] =
    useState<MagicWandSettings>(DEFAULT_MAGIC_WAND)
  const [adjust, setAdjust] = useState<AdjustSettings>(DEFAULT_ADJUST)
  const [view, setView] = useState<ViewTransform>({
    zoom: 1,
    pan: { x: 0, y: 0 },
  })
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [cursorPos, setCursorPos] = useState<Point | null>(null)
  const [cursorScale, setCursorScale] = useState(1)
  const [removing, setRemoving] = useState(false)
  const [maskReady, setMaskReady] = useState(false)
  const [inpaintCaps, setInpaintCaps] = useState<InpaintCapabilities | null>(
    null
  )
  const [objectRemoveMode, setObjectRemoveMode] = useState<"paint" | "erase">(
    "paint"
  )
  const [maskVersion, setMaskVersion] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [cropRect, setCropRect] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)
  const [dragSelectionRect, setDragSelectionRect] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  useEffect(() => {
    setCropRect(null)
    setDragSelectionRect(null)
  }, [tool])

  const history = useCanvasHistory()
  const layerStack = useLayerStack(0, 0)
  const selection = useSelection()

  // 이미지 로드 — 첫 진입 시 배경 레이어 생성
  // deps를 최소화하여 레이어/히스토리/선택 변경으로 인한 재로드(깜빡임) 방지.
  const selectionClear = selection.clearSelection
  const layerStackReset = layerStack.resetLayers
  const layerStackAdd = layerStack.addLayer
  const historyReset = history.resetHistory
  useEffect(() => {
    if (!open) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = (): void => {
      const scale = Math.min(
        1,
        CANVAS_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight)
      )
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const display = displayCanvasRef.current
      if (!display) return
      display.width = w
      display.height = h
      setCanvasSize({ w, h })
      const bg = document.createElement("canvas")
      bg.width = w
      bg.height = h
      const bgCtx = bg.getContext("2d")
      if (!bgCtx) return
      bgCtx.drawImage(img, 0, 0, w, h)
      selectionClear()
      layerStackReset()
      historyReset()
      setTool("move")
      setView({ zoom: 1, pan: { x: 0, y: 0 } })
      layerStackAdd("image", { name: "배경", canvas: bg })
      setReady(true)
    }
    img.onerror = (): void => {
      setLoadError(true)
      toast.error("이미지를 불러오지 못했습니다.")
    }
    let src = imageUrl
    try {
      const u = new URL(imageUrl, window.location.origin)
      u.searchParams.set("cors", "anonymous")
      src = u.toString()
    } catch {
      src = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "cors=anonymous"
    }
    img.src = src
  }, [
    imageUrl,
    open,
    selectionClear,
    layerStackReset,
    layerStackAdd,
    historyReset,
  ])

  // capabilities 조회
  useEffect(() => {
    if (!open) return
    void fetchInpaintCapabilities(backendUrl).then(setInpaintCaps)
  }, [backendUrl, open])

  // 합성 렌더 — 레이어/뷰/마스크/선택 영역 변경 시
  const renderComposite = useCallback(() => {
    const display = displayCanvasRef.current
    if (!display) return

    // 1. 기본 레이어 합성
    compositeLayers(layerStack.layers, display)

    const ctx = display.getContext("2d")
    if (!ctx) return

    // 2. 객체 제거 마스크 그리기 (LaMa)
    const mc = removeMaskCanvasRef.current
    if (mc) {
      ctx.save()
      const overlayCanvas = document.createElement("canvas")
      overlayCanvas.width = display.width
      overlayCanvas.height = display.height
      const octx = overlayCanvas.getContext("2d")
      if (octx) {
        octx.drawImage(mc, 0, 0)
        octx.globalCompositeOperation = "source-in"
        octx.fillStyle = "rgba(239, 68, 68, 0.45)" // 붉은색 반투명 마스크
        octx.fillRect(0, 0, display.width, display.height)
        ctx.drawImage(overlayCanvas, 0, 0)
      }
      ctx.restore()
    }

    // 3. 선택 영역 가이드라인 그리기
    if (selection.selection) {
      ctx.save()
      const { type, rect, maskCanvas } = selection.selection
      if (rect) {
        const { x, y, w, h } = rect
        // 줌에 맞춰 일정한 굵기의 점선 그리기
        ctx.lineWidth = Math.max(1, 1.5 / view.zoom)

        // 흰색 점선
        ctx.strokeStyle = "#ffffff"
        ctx.setLineDash([4, 4])
        ctx.lineDashOffset = 0
        ctx.beginPath()
        if (type === "ellipse") {
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
        } else {
          ctx.rect(x, y, w, h)
        }
        ctx.stroke()

        // 검은색 점선 오버레이
        ctx.strokeStyle = "#000000"
        ctx.lineDashOffset = 4
        ctx.stroke()
      } else if (maskCanvas) {
        // 라소/매직완드 등은 파란색 반투명 오버레이로 그리기
        const overlayCanvas = document.createElement("canvas")
        overlayCanvas.width = display.width
        overlayCanvas.height = display.height
        const octx = overlayCanvas.getContext("2d")
        if (octx) {
          octx.drawImage(maskCanvas, 0, 0)
          octx.globalCompositeOperation = "source-in"
          octx.fillStyle = "rgba(59, 130, 246, 0.3)" // 파란색 반투명
          octx.fillRect(0, 0, display.width, display.height)
          ctx.drawImage(overlayCanvas, 0, 0)
        }
      }
      ctx.restore()
    }

    // 3.5 드래그 중인 선택 영역 및 올가미 임시 가이드라인 그리기
    if (
      (tool === "rect-select" || tool === "ellipse-select") &&
      dragSelectionRect
    ) {
      ctx.save()
      const { x, y, w, h } = dragSelectionRect
      ctx.lineWidth = Math.max(1, 1.5 / view.zoom)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)"
      ctx.setLineDash([4, 4])
      ctx.lineDashOffset = 0
      ctx.beginPath()
      if (tool === "ellipse-select") {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      } else {
        ctx.rect(x, y, w, h)
      }
      ctx.stroke()

      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)"
      ctx.lineDashOffset = 4
      ctx.stroke()
      ctx.restore()
    }

    if (tool === "lasso" && lassoPathRef.current.length > 1) {
      ctx.save()
      ctx.lineWidth = Math.max(1.5, 2 / view.zoom)
      ctx.strokeStyle = "#3b82f6" // 올가미 파란색
      ctx.beginPath()
      const first = lassoPathRef.current[0]
      if (first) {
        ctx.moveTo(first.x, first.y)
        for (let i = 1; i < lassoPathRef.current.length; i++) {
          const p = lassoPathRef.current[i]
          if (p) ctx.lineTo(p.x, p.y)
        }
      }
      ctx.stroke()
      ctx.restore()
    }

    // 4. 자르기(Crop) 가이드 오버레이 그리기
    if (tool === "crop" && cropRect) {
      ctx.save()
      // 가이드 영역 바깥을 어둡게 칠하기
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)"
      ctx.beginPath()
      ctx.rect(0, 0, display.width, display.height)
      ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.clip("evenodd")
      ctx.fillRect(0, 0, display.width, display.height)
      ctx.restore()

      // 가이드 영역 테두리 (노란색/검은색 교차 점선)
      ctx.save()
      ctx.lineWidth = Math.max(1.5, 2 / view.zoom)
      ctx.strokeStyle = "#eab308" // 노란색
      ctx.setLineDash([5, 5])
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.strokeStyle = "#000000"
      ctx.lineDashOffset = 5
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.restore()
    }
  }, [
    layerStack.layers,
    selection.selection,
    view.zoom,
    maskVersion,
    cropRect,
    tool,
    dragSelectionRect,
  ])

  useEffect(() => {
    renderComposite()
  }, [renderComposite])

  // 활성 레이어 캔버스
  const activeLayer = layerStack.getActiveLayer()
  const activeCanvas = activeLayer?.canvas ?? null

  // 줌
  const setZoomAt = useCallback((nextZoom: number) => {
    setView((v) => ({ ...v, zoom: clamp(nextZoom, MIN_ZOOM, MAX_ZOOM) }))
  }, [])

  // 휠 줌 — 커서 위치를 중심으로 확대/축소. deltaY<0 확대, >0 축소.
  // 캔버스는 margin(center) + transformOrigin center + translate(pan) scale(zoom)으로 렌더되므로
  // screen = center + zoom*(img - W/2) + pan  →  img = (px-pan)/zoom + W/2 (px=커서-컨테이너중앙)
  // 줌 전후로 동일 img 유지 → newPan = px - ratio*(px - pan)  (W/2 항 상쇄)
  const onWheelZoom = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>): void => {
      if (!ready) return
      e.preventDefault()
      const container = canvasContainerRef.current
      if (!container) return
      const cRect = container.getBoundingClientRect()
      const px = e.clientX - cRect.left - cRect.width / 2
      const py = e.clientY - cRect.top - cRect.height / 2
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setView((v) => {
        const nextZoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
        const ratio = nextZoom / v.zoom
        return {
          zoom: nextZoom,
          pan: {
            x: px - ratio * (px - v.pan.x),
            y: py - ratio * (py - v.pan.y),
          },
        }
      })
    },
    [ready]
  )

  // 브러시 커서 표시 — 컨테이너(absolute 오버레이 부모) 기준 좌표.
  // 캔버스 rect를 사용하면 transform scale이 반영된 화면 박스를 얻으므로
  // 커서 직경 = brush.size * (rect.width / canvas.width) 로 정확히 화면 크기 산출.
  const updateCursor = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const display = displayCanvasRef.current
      const container = canvasContainerRef.current
      if (!display || !container) return
      const cRect = container.getBoundingClientRect()
      const dRect = display.getBoundingClientRect()
      const sx = dRect.width / display.width
      setCursorScale(sx)
      setCursorPos({
        x: e.clientX - cRect.left,
        y: e.clientY - cRect.top,
      })
    },
    []
  )
  // 자르기 적용 — 모든 이미지 레이어를 rect 영역으로 자르고 캔버스 크기 축소
  const applyCrop = useCallback(
    (rect: { x: number; y: number; w: number; h: number }): void => {
      const display = displayCanvasRef.current
      if (!display) return
      const newW = rect.w
      const newH = rect.h
      const newDisplay = document.createElement("canvas")
      newDisplay.width = newW
      newDisplay.height = newH
      const ndCtx = newDisplay.getContext("2d")
      if (!ndCtx) return
      compositeLayers(layerStack.layers, display)
      ndCtx.drawImage(display, rect.x, rect.y, rect.w, rect.h, 0, 0, newW, newH)
      display.width = newW
      display.height = newH
      const dCtx = display.getContext("2d")
      if (!dCtx) return
      dCtx.clearRect(0, 0, newW, newH)
      dCtx.drawImage(newDisplay, 0, 0)
      // 레이어 재구성 — 단일 배경 레이어로 교체
      const bg = document.createElement("canvas")
      bg.width = newW
      bg.height = newH
      const bgCtx = bg.getContext("2d")
      if (bgCtx) bgCtx.drawImage(display, 0, 0)
      layerStack.resetLayers()
      layerStack.addLayer("image", { name: "배경", canvas: bg })
      selection.clearSelection()
      setView({ zoom: 1, pan: { x: 0, y: 0 } })
      toast.success(`잘림: ${newW}×${newH}`)
    },
    [layerStack, selection]
  )

  // 키보드 단축키
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return

      // 자르기 모드에서 Enter/Escape 확정/취소 처리
      if (e.key === "Enter" && tool === "crop" && cropRect) {
        e.preventDefault()
        applyCrop(cropRect)
        setCropRect(null)
        return
      }
      if (e.key === "Escape" && tool === "crop" && cropRect) {
        e.preventDefault()
        setCropRect(null)
        return
      }

      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) {
          if (activeCanvas) history.redo(activeCanvas)
        } else {
          if (activeCanvas) history.undo(activeCanvas)
        }
        renderComposite()
        return
      }
      if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault()
        if (activeCanvas) history.redo(activeCanvas)
        renderComposite()
        return
      }
      if (e.code === "Space" && !e.repeat) {
        setSpaceDown(true)
        return
      }
      if (e.key === "[")
        setBrush((b) => ({ ...b, size: clamp(b.size - 4, 4, 220) }))
      else if (e.key === "]")
        setBrush((b) => ({ ...b, size: clamp(b.size + 4, 4, 220) }))
      else if (e.key.toLowerCase() === "v") setTool("move")
      else if (e.key.toLowerCase() === "b") setTool("brush")
      else if (e.key.toLowerCase() === "e") setTool("erase")
      else if (e.key.toLowerCase() === "r") setTool("rect-select")
      else if (e.key.toLowerCase() === "l") setTool("lasso")
      else if (e.key.toLowerCase() === "m") setTool("magic-wand")
      else if (e.key.toLowerCase() === "c") setTool("clone")
      else if (e.key.toLowerCase() === "k") setTool("crop")
      else if (e.key === "-" || e.key === "_") setZoomAt(view.zoom * 0.8)
      else if (e.key === "+" || e.key === "=") setZoomAt(view.zoom * 1.25)
      else if (ctrl && e.key === "0") {
        e.preventDefault()
        setView({ zoom: 1, pan: { x: 0, y: 0 } })
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceDown(false)
        setPanning(false)
        panningRef.current = false
      }
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [
    open,
    activeCanvas,
    history,
    renderComposite,
    setZoomAt,
    view.zoom,
    cropRect,
    tool,
    applyCrop,
  ])

  // 포인터 다운 — 도구별 분기
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): void => {
      if (!ready) return
      const display = displayCanvasRef.current
      if (!display) return
      e.preventDefault()
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)

      // Space=팬 또는 휠클릭(1)/우클릭(2)=팬
      if (spaceDown || tool === "move" || e.button === 1 || e.button === 2) {
        panningRef.current = true
        setPanning(true)
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: view.pan.x,
          panY: view.pan.y,
        }
        return
      }

      const imgPt = clientToImagePoint(e.clientX, e.clientY, display, view)

      if (tool === "brush" || tool === "erase") {
        if (!activeCanvas) return
        history.pushHistory(activeCanvas)
        drawStrokeWithSelection(
          activeCanvas,
          imgPt,
          imgPt,
          brush,
          tool === "brush" ? "paint" : "erase",
          selection.selection
        )
        lastPointRef.current = imgPt
        paintingRef.current = true
        renderComposite()
        return
      }

      if (tool === "object-remove") {
        if (!removeMaskCanvasRef.current) {
          const mc = document.createElement("canvas")
          mc.width = display.width
          mc.height = display.height
          removeMaskCanvasRef.current = mc
          setMaskReady(true)
        }
        const mc = removeMaskCanvasRef.current
        history.pushHistory(mc)
        const ctx = mc.getContext("2d")
        if (!ctx) return
        drawStroke(
          ctx,
          imgPt,
          imgPt,
          brush.size,
          objectRemoveMode,
          brush.hardness,
          brush.opacity,
          "#ffffff"
        )
        lastPointRef.current = imgPt
        paintingRef.current = true
        setMaskVersion((v) => v + 1)
        return
      }

      if (tool === "clone" || tool === "heal") {
        // Alt+클릭 = source 설정, 일반 클릭 = 복제 실행
        if (e.altKey) {
          cloneSourceRef.current = imgPt
          toast.success("복제 소스점 설정")
          return
        }
        if (!cloneSourceRef.current || !activeCanvas) return
        history.pushHistory(activeCanvas)
        paintingRef.current = true
        lastPointRef.current = imgPt
        return
      }

      if (tool === "rect-select" || tool === "ellipse-select") {
        lassoPathRef.current = [imgPt]
        setDragSelectionRect(null)
        return
      }

      if (tool === "lasso") {
        lassoPathRef.current = [imgPt]
        return
      }

      if (tool === "magic-wand") {
        const mask = floodFill(
          display,
          imgPt.x,
          imgPt.y,
          magicWand.tolerance,
          magicWand.contiguous
        )
        selection.setMaskSelection("magic", mask)
        return
      }

      if (tool === "crop") {
        lassoPathRef.current = [imgPt]
        return
      }
    },
    [
      ready,
      spaceDown,
      tool,
      view,
      brush,
      activeCanvas,
      history,
      renderComposite,
      magicWand,
      selection,
      objectRemoveMode,
      drawStrokeWithSelection,
      setDragSelectionRect,
    ]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): void => {
      updateCursor(e)
      if (!ready) return
      const display = displayCanvasRef.current
      if (!display) return

      if (panningRef.current) {
        const start = panStartRef.current
        if (!start) return
        setView((v) => ({
          ...v,
          pan: {
            x: start.panX + (e.clientX - start.x),
            y: start.panY + (e.clientY - start.y),
          },
        }))
        return
      }

      const imgPt = clientToImagePoint(e.clientX, e.clientY, display, view)

      if (paintingRef.current && (tool === "brush" || tool === "erase")) {
        if (!activeCanvas) return
        const last = lastPointRef.current
        if (last)
          drawStrokeWithSelection(
            activeCanvas,
            last,
            imgPt,
            brush,
            tool === "brush" ? "paint" : "erase",
            selection.selection
          )
        lastPointRef.current = imgPt
        renderComposite()
        return
      }

      if (paintingRef.current && tool === "object-remove") {
        const mc = removeMaskCanvasRef.current
        if (!mc) return
        const ctx = mc.getContext("2d")
        if (!ctx) return
        const last = lastPointRef.current
        if (last)
          drawStroke(
            ctx,
            last,
            imgPt,
            brush.size,
            objectRemoveMode,
            brush.hardness,
            brush.opacity,
            "#ffffff"
          )
        lastPointRef.current = imgPt
        setMaskVersion((v) => v + 1)
        return
      }

      if (paintingRef.current && (tool === "clone" || tool === "heal")) {
        if (!cloneSourceRef.current || !activeCanvas) return
        const ctx = activeCanvas.getContext("2d")
        if (!ctx) return
        const src = cloneSourceRef.current
        const last = lastPointRef.current
        if (last) {
          const dx = imgPt.x - last.x
          const dy = imgPt.y - last.y
          ctx.save()
          ctx.globalAlpha = brush.opacity
          ctx.beginPath()
          ctx.arc(imgPt.x, imgPt.y, brush.size / 2, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(
            activeCanvas,
            src.x + dx,
            src.y + dy,
            1,
            1,
            imgPt.x - brush.size / 2,
            imgPt.y - brush.size / 2,
            brush.size,
            brush.size
          )
          ctx.restore()
        }
        lastPointRef.current = imgPt
        renderComposite()
        return
      }

      if (
        (tool === "rect-select" || tool === "ellipse-select") &&
        lassoPathRef.current.length > 0
      ) {
        const first = lassoPathRef.current[0]
        if (first) {
          lassoPathRef.current = [first, imgPt]
          setDragSelectionRect({
            x: Math.min(first.x, imgPt.x),
            y: Math.min(first.y, imgPt.y),
            w: Math.abs(imgPt.x - first.x),
            h: Math.abs(imgPt.y - first.y),
          })
          renderComposite()
        }
        return
      }

      if (
        tool === "lasso" &&
        lassoPathRef.current.length > 0 &&
        e.buttons > 0
      ) {
        lassoPathRef.current.push(imgPt)
        setMaskVersion((v) => v + 1)
        return
      }

      if (tool === "crop" && lassoPathRef.current.length > 0) {
        const first = lassoPathRef.current[0]
        if (first) {
          lassoPathRef.current = [first, imgPt]
          setCropRect({
            x: Math.round(Math.min(first.x, imgPt.x)),
            y: Math.round(Math.min(first.y, imgPt.y)),
            w: Math.round(Math.abs(imgPt.x - first.x)),
            h: Math.round(Math.abs(imgPt.y - first.y)),
          })
        }
        return
      }
    },
    [
      ready,
      tool,
      view,
      activeCanvas,
      brush,
      history,
      renderComposite,
      updateCursor,
      objectRemoveMode,
      setCropRect,
      selection,
      drawStrokeWithSelection,
      setDragSelectionRect,
      setMaskVersion,
    ]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): void => {
      if (!ready) return
      const display = displayCanvasRef.current
      if (!display) return

      if (panningRef.current) {
        panningRef.current = false
        setPanning(false)
        panStartRef.current = null
        return
      }

      const imgPt = clientToImagePoint(e.clientX, e.clientY, display, view)

      if (paintingRef.current) {
        paintingRef.current = false
        lastPointRef.current = null
        // 드로잉 종료 후 썸네일 업데이트
        if (
          (tool === "brush" ||
            tool === "erase" ||
            tool === "clone" ||
            tool === "heal") &&
          activeLayer
        ) {
          layerStack.updateLayer(activeLayer.id, { updatedAt: Date.now() })
        }
        return
      }

      if (tool === "rect-select" || tool === "ellipse-select") {
        const pts = lassoPathRef.current
        if (pts.length >= 2) {
          const a = pts[0]
          const b = pts[1]
          if (a && b) {
            const rect = {
              x: Math.min(a.x, b.x),
              y: Math.min(a.y, b.y),
              w: Math.abs(b.x - a.x),
              h: Math.abs(b.y - a.y),
            }
            if (rect.w > 2 && rect.h > 2) {
              selection.setRectSelection(
                tool === "rect-select" ? "rect" : "ellipse",
                rect
              )
            }
          }
        }
        lassoPathRef.current = []
        setDragSelectionRect(null)
        return
      }

      if (tool === "lasso") {
        const pts = lassoPathRef.current
        if (pts.length > 2) {
          const mc = document.createElement("canvas")
          mc.width = display.width
          mc.height = display.height
          const ctx = mc.getContext("2d")
          if (ctx) {
            ctx.fillStyle = "rgb(255,255,255)"
            ctx.beginPath()
            const first = pts[0]
            if (first) {
              ctx.moveTo(first.x, first.y)
              for (let i = 1; i < pts.length; i += 1) {
                const p = pts[i]
                if (p) ctx.lineTo(p.x, p.y)
              }
              ctx.closePath()
              ctx.fill()
              selection.setMaskSelection("lasso", mc)
            }
          }
        }
        lassoPathRef.current = []
        return
      }

      if (tool === "crop") {
        const pts = lassoPathRef.current
        if (pts.length >= 2) {
          const a = pts[0]
          const b = pts[1]
          if (a && b) {
            const rect = {
              x: Math.round(Math.min(a.x, b.x)),
              y: Math.round(Math.min(a.y, b.y)),
              w: Math.round(Math.abs(b.x - a.x)),
              h: Math.round(Math.abs(b.y - a.y)),
            }
            if (rect.w > 2 && rect.h > 2) {
              setCropRect(rect)
            } else {
              setCropRect(null)
            }
          }
        }
        lassoPathRef.current = []
        return
      }
    },
    [
      ready,
      tool,
      view,
      selection,
      applyCrop,
      activeLayer,
      layerStack,
      setCropRect,
      setDragSelectionRect,
    ]
  )

  // 선택 삭제
  const handleDeleteSelection = useCallback(() => {
    if (!selection.selection || !activeCanvas) return
    history.pushHistory(activeCanvas)
    const ctx = activeCanvas.getContext("2d")
    if (!ctx) return
    clearSelectionArea(
      ctx,
      selection.selection,
      activeCanvas.width,
      activeCanvas.height
    )
    renderComposite()
    selection.clearSelection()
  }, [selection, activeCanvas, history, renderComposite])

  // 조정 레이어 추가
  const handleAddAdjustLayer = useCallback(() => {
    layerStack.addLayer("adjustment", { name: "색보정", adjust })
  }, [layerStack, adjust])

  // 객체 제거 실행
  const handleRunRemove = useCallback(async () => {
    const display = displayCanvasRef.current
    const mc = removeMaskCanvasRef.current
    if (!display || !mc) {
      toast.error("마스크를 먼저 칠해주세요.")
      return
    }
    if (inpaintCaps && !inpaintCaps.enabled) {
      toast.error("백엔드에 LaMa 의존성이 설치되어 있지 않습니다.")
      return
    }
    setRemoving(true)
    try {
      compositeLayers(layerStack.layers, display)
      const result = await removeObject(backendUrl, display, mc)
      const url = URL.createObjectURL(result)
      const img = new Image()
      img.onload = (): void => {
        const out = document.createElement("canvas")
        out.width = display.width
        out.height = display.height
        out
          .getContext("2d")!
          .drawImage(img, 0, 0, display.width, display.height)
        layerStack.addLayer("image", { name: "객체 제거 결과", canvas: out })
        URL.revokeObjectURL(url)
        // 마스크 초기화
        const mcCtx = mc.getContext("2d")
        if (mcCtx) mcCtx.clearRect(0, 0, mc.width, mc.height)
        setMaskVersion((v) => v + 1)
        toast.success("객체 제거 완료")
      }
      img.onerror = (): void => {
        URL.revokeObjectURL(url)
        toast.error("결과 이미지 로드 실패")
      }
      img.src = url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "객체 제거 실패")
    } finally {
      setRemoving(false)
    }
  }, [backendUrl, inpaintCaps, layerStack])

  // 마스크 전체 지우기
  const handleClearMask = useCallback(() => {
    const mc = removeMaskCanvasRef.current
    if (!mc) return
    const ctx = mc.getContext("2d")
    if (!ctx) return
    history.pushHistory(mc)
    ctx.clearRect(0, 0, mc.width, mc.height)
    setMaskVersion((v) => v + 1)
    toast.success("마스크가 초기화되었습니다.")
  }, [history])

  // 갤러리에 저장
  const handleSaveToGallery = useCallback(async () => {
    const display = displayCanvasRef.current
    if (!display) return
    try {
      compositeLayers(layerStack.layers, display)
      const name = `${baseName(filename)}-edit-${Date.now()}.png`
      const res = await uploadToSavedImages(
        backendUrl,
        display,
        name,
        parentHash
      )
      toast.success(`갤러리에 저장됨: ${res.hash.slice(0, 8)}`)
      onSaveSuccess?.(res)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패")
    }
  }, [backendUrl, filename, layerStack, onSaveSuccess, parentHash])

  // 로컬 다운로드
  const handleDownload = useCallback(() => {
    const display = displayCanvasRef.current
    if (!display) return
    compositeLayers(layerStack.layers, display)
    downloadCanvas(display, `${baseName(filename)}-edit-${Date.now()}.png`)
  }, [filename, layerStack, renderComposite])

  const cursorDiameter = brush.size * cursorScale

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="h-[94vh] max-h-[94vh] gap-3 overflow-hidden border-zinc-800 bg-zinc-950 p-4 text-zinc-50 sm:max-w-[96vw]"
          onInteractOutside={(e) => {
            e.preventDefault()
          }}
        >
          <DialogHeader className="shrink-0 flex-row items-center justify-between space-y-0 border-b border-zinc-800 pb-1">
            <div className="flex flex-col gap-0.5">
              <DialogTitle className="flex items-center gap-1.5 truncate font-mono text-sm tracking-tight text-zinc-100">
                <Sparkles className="size-4 animate-pulse text-primary" />
                이미지 편집 · {filename}
              </DialogTitle>
              <DialogDescription className="text-[10px] text-zinc-400">
                인페인팅, 브러시 페인팅, 색보정 및 선택 편집 도구입니다.
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-full p-0 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              onClick={() => setShowShortcuts(true)}
            >
              <HelpCircle className="size-4" />
            </Button>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)_240px]">
            {/* 좌측 툴바 */}
            <aside className="flex max-h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
              {/* 도구 분류 1: 이동 및 선택 */}
              <div className="flex flex-col gap-1.5">
                <span className="pl-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                  이동 & 선택
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  <ToolButton
                    tool="move"
                    current={tool}
                    setTool={setTool}
                    icon={<MousePointer2 className="size-4" />}
                    label={TOOL_LABELS.move}
                  />
                  <ToolButton
                    tool="rect-select"
                    current={tool}
                    setTool={setTool}
                    icon={<SquareDashed className="size-4" />}
                    label={TOOL_LABELS["rect-select"]}
                  />
                  <ToolButton
                    tool="ellipse-select"
                    current={tool}
                    setTool={setTool}
                    icon={<CircleDashed className="size-4" />}
                    label={TOOL_LABELS["ellipse-select"]}
                  />
                  <ToolButton
                    tool="lasso"
                    current={tool}
                    setTool={setTool}
                    icon={<Lasso className="size-4" />}
                    label={TOOL_LABELS.lasso}
                  />
                  <ToolButton
                    tool="magic-wand"
                    current={tool}
                    setTool={setTool}
                    icon={<MagicWandIcon className="size-4" />}
                    label={TOOL_LABELS["magic-wand"]}
                  />
                  <ToolButton
                    tool="crop"
                    current={tool}
                    setTool={setTool}
                    icon={<Crop className="size-4" />}
                    label={TOOL_LABELS.crop}
                  />
                </div>
              </div>

              {/* 도구 분류 2: 그리기 */}
              <div className="flex flex-col gap-1.5 border-t border-zinc-800/60 pt-2.5">
                <span className="pl-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                  그리기
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  <ToolButton
                    tool="brush"
                    current={tool}
                    setTool={setTool}
                    icon={<Brush className="size-4" />}
                    label={TOOL_LABELS.brush}
                  />
                  <ToolButton
                    tool="erase"
                    current={tool}
                    setTool={setTool}
                    icon={<Eraser className="size-4" />}
                    label={TOOL_LABELS.erase}
                  />
                </div>
              </div>

              {/* 도구 분류 3: 리터칭 & 보정 */}
              <div className="flex flex-col gap-1.5 border-t border-zinc-800/60 pt-2.5">
                <span className="pl-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                  리터칭 & 보정
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  <ToolButton
                    tool="clone"
                    current={tool}
                    setTool={setTool}
                    icon={<Plus className="size-4" />}
                    label={TOOL_LABELS.clone}
                  />
                  <ToolButton
                    tool="object-remove"
                    current={tool}
                    setTool={setTool}
                    icon={<Sparkles className="size-4" />}
                    label={TOOL_LABELS["object-remove"]}
                    disabled={!inpaintCaps?.enabled}
                  />
                  <ToolButton
                    tool="adjust"
                    current={tool}
                    setTool={setTool}
                    icon={<Sliders className="size-4" />}
                    label={TOOL_LABELS.adjust}
                  />
                </div>
              </div>

              {/* 도구별 상세 설정 패널 */}
              <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
                <span className="border-t border-zinc-800/60 pt-2.5 pl-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                  도구 설정
                </span>

                {/* 브러시, 지우개, 복제 도구 설정 */}
                {(tool === "brush" || tool === "erase" || tool === "clone") && (
                  <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
                    <div className="border-b border-zinc-900 pb-1 font-semibold text-zinc-300">
                      {TOOL_LABELS[tool]}
                    </div>
                    {(tool === "brush" || tool === "clone") && (
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-zinc-400">
                          브러시 색상
                        </Label>
                        <input
                          type="color"
                          value={brush.color}
                          onChange={(e) => {
                            setBrush((b) => ({ ...b, color: e.target.value }))
                          }}
                          className="h-6 w-11 cursor-pointer rounded border border-zinc-800 bg-transparent"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <Label>크기</Label>
                        <span className="font-mono text-zinc-500">
                          {brush.size}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={220}
                        value={brush.size}
                        onChange={(e) => {
                          setBrush((b) => ({
                            ...b,
                            size: Number(e.target.value),
                          }))
                        }}
                        className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-primary"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <Label>경도</Label>
                        <span className="font-mono text-zinc-500">
                          {Math.round(brush.hardness * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={brush.hardness}
                        onChange={(e) => {
                          setBrush((b) => ({
                            ...b,
                            hardness: Number(e.target.value),
                          }))
                        }}
                        className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-primary"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <Label>불투명도</Label>
                        <span className="font-mono text-zinc-500">
                          {Math.round(brush.opacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={brush.opacity}
                        onChange={(e) => {
                          setBrush((b) => ({
                            ...b,
                            opacity: Number(e.target.value),
                          }))
                        }}
                        className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-primary"
                      />
                    </div>
                  </div>
                )}

                {/* 매직완드 설정 */}
                {tool === "magic-wand" && (
                  <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
                    <div className="border-b border-zinc-900 pb-1 font-semibold text-zinc-300">
                      매직완드 설정
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <Label>허용 오차 (Tolerance)</Label>
                        <span className="font-mono text-zinc-500">
                          {magicWand.tolerance}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={128}
                        value={magicWand.tolerance}
                        onChange={(e) => {
                          setMagicWand((m) => ({
                            ...m,
                            tolerance: Number(e.target.value),
                          }))
                        }}
                        className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-primary"
                      />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400 select-none">
                      <input
                        type="checkbox"
                        checked={magicWand.contiguous}
                        onChange={(e) => {
                          setMagicWand((m) => ({
                            ...m,
                            contiguous: e.target.checked,
                          }))
                        }}
                        className="rounded border-zinc-800 bg-zinc-900 text-primary focus:ring-primary"
                      />
                      인접 영역만 선택 (Contiguous)
                    </label>
                  </div>
                )}

                {/* 색보정 설정 */}
                {tool === "adjust" && (
                  <div className="grid max-h-[220px] gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs lg:max-h-none">
                    <div className="border-b border-zinc-900 pb-1 font-semibold text-zinc-300">
                      색보정 설정
                    </div>
                    {(["brightness", "contrast", "saturation"] as const).map(
                      (k) => (
                        <div key={k} className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-zinc-400">
                            <Label>
                              {k === "brightness"
                                ? "밝기"
                                : k === "contrast"
                                  ? "대비"
                                  : "채도"}
                            </Label>
                            <span className="font-mono text-zinc-500">
                              {adjust[k]}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            value={adjust[k]}
                            onChange={(e) => {
                              setAdjust((a) => ({
                                ...a,
                                [k]: Number(e.target.value),
                              }))
                            }}
                            className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-primary"
                          />
                        </div>
                      )
                    )}
                    {(["blur", "sharpen"] as const).map((k) => (
                      <div key={k} className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-zinc-400">
                          <Label>{k === "blur" ? "블러" : "샤픈"}</Label>
                          <span className="font-mono text-zinc-500">
                            {adjust[k]}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={20}
                          value={adjust[k]}
                          onChange={(e) => {
                            setAdjust((a) => ({
                              ...a,
                              [k]: Number(e.target.value),
                            }))
                          }}
                          className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-primary"
                        />
                      </div>
                    ))}
                    <Button
                      size="sm"
                      onClick={handleAddAdjustLayer}
                      className="mt-1 w-full"
                    >
                      조정 레이어 추가
                    </Button>
                  </div>
                )}

                {/* 객체 제거 (LaMa) 설정 */}
                {tool === "object-remove" && (
                  <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
                    <div className="border-b border-zinc-900 pb-1 font-semibold text-zinc-300">
                      객체 제거 (AI 인페인트)
                    </div>
                    <p className="text-[11px] leading-relaxed text-zinc-400">
                      브러시로 제거하고 싶은 대상 영역을 칠한 후 제거 실행
                      버튼을 누르세요.
                    </p>

                    {/* 브러시 vs 지우개 모드 토글 */}
                    <div className="flex overflow-hidden rounded border border-zinc-800">
                      <Button
                        type="button"
                        variant={
                          objectRemoveMode === "paint" ? "default" : "ghost"
                        }
                        size="sm"
                        className="h-8 flex-1 rounded-none p-0 text-[11px]"
                        onClick={() => setObjectRemoveMode("paint")}
                      >
                        <Brush className="mr-1 size-3.5" />
                        마스크 추가
                      </Button>
                      <Button
                        type="button"
                        variant={
                          objectRemoveMode === "erase" ? "default" : "ghost"
                        }
                        size="sm"
                        className="h-8 flex-1 rounded-none p-0 text-[11px]"
                        onClick={() => setObjectRemoveMode("erase")}
                      >
                        <Eraser className="mr-1 size-3.5" />
                        마스크 지우개
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <Label>브러시 크기</Label>
                        <span className="font-mono text-zinc-500">
                          {brush.size}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={220}
                        value={brush.size}
                        onChange={(e) => {
                          setBrush((b) => ({
                            ...b,
                            size: Number(e.target.value),
                          }))
                        }}
                        className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-primary"
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleClearMask}
                        className="h-8 flex-1 border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-300 hover:bg-zinc-800"
                      >
                        마스크 초기화
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleRunRemove}
                        disabled={removing || !inpaintCaps?.enabled}
                        className="h-8 flex-1 text-[11px]"
                      >
                        <Sparkles className="mr-1 size-3.5" />
                        {removing ? "제거 중..." : "제거 실행"}
                      </Button>
                    </div>

                    {!inpaintCaps?.enabled && (
                      <p className="rounded border border-destructive/20 bg-destructive/5 p-2 text-[10px] leading-tight text-destructive">
                        {inpaintCaps?.reason ??
                          "LaMa 미지원 (requirements-inpaint.txt 설치 필요)"}
                      </p>
                    )}
                  </div>
                )}

                {tool === "crop" && (
                  <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
                    <div className="border-b border-zinc-900 pb-1 font-semibold text-zinc-300">
                      자르기 옵션
                    </div>
                    <p className="text-[11px] leading-relaxed text-zinc-400">
                      화면에서 잘라낼 영역을 마우스로 드래그하여 지정하세요.
                    </p>
                    {cropRect ? (
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="font-mono text-[10px] text-zinc-500">
                          선택 크기: {cropRect.w} × {cropRect.h} px
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setCropRect(null)}
                            className="h-8 flex-1 border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-300 hover:bg-zinc-800"
                          >
                            취소 (Esc)
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              applyCrop(cropRect)
                              setCropRect(null)
                            }}
                            className="h-8 flex-1 text-[11px]"
                          >
                            적용 (Enter)
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-2 text-center text-[10px] text-zinc-500 italic">
                        영역을 드래그하면 세부 조정이 가능합니다.
                      </div>
                    )}
                  </div>
                )}

                {selection.selection && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteSelection}
                    className="mt-2 w-full"
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    선택 영역 내용 삭제
                  </Button>
                )}
              </div>

              {/* 하단 히스토리 / 줌 액션바 */}
              <div className="mt-auto flex items-center justify-between border-t border-zinc-800/60 pt-3">
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
                        onClick={() =>
                          activeCanvas && history.undo(activeCanvas)
                        }
                        disabled={!history.canUndo}
                      >
                        <Undo2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>실행 취소 (Ctrl+Z)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
                        onClick={() =>
                          activeCanvas && history.redo(activeCanvas)
                        }
                        disabled={!history.canRedo}
                      >
                        <Redo2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>다시 실행 (Ctrl+Y)</TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                        onClick={() => {
                          setZoomAt(view.zoom * 0.8)
                        }}
                      >
                        <ZoomOut className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>축소 (-)</TooltipContent>
                  </Tooltip>
                  <span className="w-10 text-center font-mono text-[11px] text-zinc-400 select-none">
                    {Math.round(view.zoom * 100)}%
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                        onClick={() => {
                          setZoomAt(view.zoom * 1.25)
                        }}
                      >
                        <ZoomIn className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>확대 (+)</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </aside>

            {/* 캔버스 영역 */}
            <div
              ref={canvasContainerRef}
              className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-[repeating-conic-gradient(#222_0%_25%,#161618_0%_50%)] bg-[length:16px_16px]"
            >
              <canvas
                ref={displayCanvasRef}
                className={cn(
                  "block touch-none transition-shadow select-none",
                  spaceDown || panning
                    ? "cursor-grab"
                    : tool === "brush" ||
                        tool === "erase" ||
                        tool === "object-remove"
                      ? "cursor-none"
                      : "cursor-crosshair"
                )}
                style={{
                  transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
                  transformOrigin: "center",
                  imageRendering: "pixelated",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => {
                  setCursorPos(null)
                }}
                onWheel={onWheelZoom}
                onContextMenu={(e) => e.preventDefault()}
              />
              {/* 커서 오버레이 */}
              {(tool === "brush" ||
                tool === "erase" ||
                tool === "object-remove") &&
                cursorPos &&
                !spaceDown &&
                !panning && (
                  <div
                    ref={cursorRef}
                    className={cn(
                      "pointer-events-none absolute rounded-full border border-white mix-blend-difference shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                    )}
                    style={{
                      width: `${cursorDiameter}px`,
                      height: `${cursorDiameter}px`,
                      left: `${cursorPos.x - cursorDiameter / 2}px`,
                      top: `${cursorPos.y - cursorDiameter / 2}px`,
                    }}
                  />
                )}
              {loadError && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 text-sm font-medium text-destructive">
                  이미지 로드 실패
                </div>
              )}
              {!ready && !loadError && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 text-sm font-medium text-zinc-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>이미지 로딩 중...</span>
                  </div>
                </div>
              )}
              {tool === "object-remove" && maskReady && (
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[10px] text-zinc-300 backdrop-blur">
                  AI 마스크 모드 활성화됨
                </div>
              )}
              {tool === "clone" && cloneSourceRef.current === null && (
                <div className="absolute top-3 left-1/2 flex -translate-x-1/2 animate-bounce items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/90 px-3 py-1 text-xs text-yellow-500 shadow-lg backdrop-blur select-none">
                  <Info className="size-3.5" />
                  <span>Alt + 클릭으로 복사할 소스점을 먼저 지정하세요.</span>
                </div>
              )}
            </div>

            {/* 우측 레이어 패널 */}
            <aside className="flex max-h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <Label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                  <LayersIcon className="size-3.5 text-zinc-400" />
                  레이어 스택
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-7 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      onClick={() =>
                        layerStack.addLayer("image", {
                          name: `레이어 ${layerStack.layers.length + 1}`,
                        })
                      }
                    >
                      <Plus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>새 이미지 레이어 추가</TooltipContent>
                </Tooltip>
              </div>

              {/* 레이어 리스트 */}
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
                {[...layerStack.layers].reverse().map((layer) => (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    active={layer.id === layerStack.activeLayerId}
                    onSelect={() => {
                      layerStack.setActiveLayerId(layer.id)
                    }}
                    onToggleVisible={() => {
                      layerStack.updateLayer(layer.id, {
                        visible: !layer.visible,
                      })
                    }}
                    onOpacity={(v) => {
                      layerStack.updateLayer(layer.id, { opacity: v })
                    }}
                    onRemove={() => {
                      layerStack.removeLayer(layer.id)
                    }}
                    onMoveUp={() => {
                      layerStack.moveLayer(layer.id, "up")
                    }}
                    onMoveDown={() => {
                      layerStack.moveLayer(layer.id, "down")
                    }}
                  />
                ))}
                {layerStack.layers.length === 0 && (
                  <div className="py-8 text-center text-[11px] text-zinc-500">
                    레이어가 없습니다.
                  </div>
                )}
              </div>

              {/* 레이어 스택 아래의 액션 */}
              <div className="mt-auto flex flex-col gap-2 border-t border-zinc-800/60 pt-3">
                <Button
                  size="sm"
                  onClick={handleDownload}
                  disabled={!ready}
                  className="w-full border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  <Download className="mr-1.5 size-3.5 text-zinc-400" />
                  로컬 다운로드
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveToGallery}
                  disabled={!ready}
                  className="w-full text-[11px]"
                >
                  <Save className="mr-1.5 size-3.5" />
                  갤러리에 저장
                </Button>
              </div>
            </aside>
          </div>
        </DialogContent>
      </Dialog>

      {/* 단축키 도움말 모달 */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 text-zinc-50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <HelpCircle className="size-5 text-primary" />
              에디터 단축키 도움말
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              이미지 편집 도구에서 활용할 수 있는 유용한 단축키들입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2 border-b border-zinc-900 pb-2">
              <div className="font-semibold text-zinc-400">동작</div>
              <div className="text-right font-semibold text-zinc-400">
                단축키
              </div>
            </div>

            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">이동 도구 (Move)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                V
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">브러시 도구 (Brush)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                B
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">지우개 도구 (Erase)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                E
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">사각 선택 도구 (Rect)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                R
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">라소 선택 도구 (Lasso)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                L
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">매직완드 도구 (Magic)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                M
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">복제 도구 (Clone Source)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                C
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">자르기 도구 (Crop)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                K
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center border-t border-zinc-900 pt-2">
              <span className="text-zinc-300">실행 취소 (Undo)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                Ctrl + Z
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">다시 실행 (Redo)</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                Ctrl + Y
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center border-t border-zinc-900 pt-2">
              <span className="text-zinc-300">브러시 크기 조절</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                [ 또는 ]
              </kbd>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">화면 이동 (Panning)</span>
              <span className="justify-self-end font-sans text-[11px] text-zinc-400">
                Space + 드래그
              </span>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">확대/축소 (Zoom)</span>
              <span className="justify-self-end font-sans text-[11px] text-zinc-400">
                마우스 휠 굴리기
              </span>
            </div>
            <div className="grid grid-cols-2 items-center">
              <span className="text-zinc-300">화면 뷰 초기화</span>
              <kbd className="justify-self-end rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                Ctrl + 0
              </kbd>
            </div>
          </div>
          <div className="flex justify-end border-t border-zinc-900 pt-2">
            <Button
              size="sm"
              onClick={() => setShowShortcuts(false)}
              className="h-8"
            >
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ToolButton({
  tool,
  current,
  setTool,
  icon,
  label,
  disabled,
}: {
  tool: ToolId
  current: ToolId
  setTool: (t: ToolId) => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={current === tool ? "default" : "ghost"}
          size="sm"
          className="aspect-square p-0"
          disabled={disabled}
          onClick={() => {
            setTool(tool)
          }}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function LayerThumbnail({
  canvas,
  updatedAt,
}: {
  canvas: HTMLCanvasElement
  updatedAt?: number | undefined
}): React.JSX.Element {
  const thumbRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const thumb = thumbRef.current
    if (!thumb) return
    const ctx = thumb.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, thumb.width, thumb.height)

    // 격자 투명 배경 그리기
    const size = 3
    for (let y = 0; y < thumb.height; y += size) {
      for (let x = 0; x < thumb.width; x += size) {
        ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#262626" : "#1a1a1a"
        ctx.fillRect(x, y, size, size)
      }
    }

    // 캔버스 그리기
    const scale = Math.min(
      thumb.width / canvas.width,
      thumb.height / canvas.height
    )
    const w = canvas.width * scale
    const h = canvas.height * scale
    const dx = (thumb.width - w) / 2
    const dy = (thumb.height - h) / 2
    ctx.drawImage(canvas, dx, dy, w, h)
  }, [canvas, updatedAt])

  return (
    <canvas
      ref={thumbRef}
      width={28}
      height={28}
      className="size-7 shrink-0 rounded border border-neutral-800 bg-neutral-950 object-contain"
    />
  )
}

function LayerRow({
  layer,
  active,
  onSelect,
  onToggleVisible,
  onOpacity,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  layer: Layer
  active: boolean
  onSelect: () => void
  onToggleVisible: () => void
  onOpacity: (v: number) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-2 text-xs transition-all duration-150",
        active
          ? "border-primary bg-primary/5 shadow-[0_0_8px_rgba(59,130,246,0.15)]"
          : "border-border/50 bg-background/30 hover:bg-background/55"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onSelect}
        >
          <LayerThumbnail canvas={layer.canvas} updatedAt={layer.updatedAt} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{layer.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {layer.kind === "image" ? "이미지 레이어" : "색보정 레이어"}
            </span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="size-6 p-0 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              onToggleVisible()
            }}
          >
            {layer.visible ? (
              <Eye className="size-3.5 text-muted-foreground" />
            ) : (
              <EyeOff className="size-3.5 text-muted-foreground/50" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-6 text-right font-mono text-[10px] text-muted-foreground">
          {Math.round(layer.opacity * 100)}%
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layer.opacity}
          onChange={(e) => {
            onOpacity(Number(e.target.value))
          }}
          className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
        />
      </div>

      <div className="flex justify-end gap-1 border-t border-border/20 pt-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px] text-muted-foreground"
          onClick={onMoveUp}
        >
          <ArrowUp className="mr-0.5 size-3" />
          위로
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px] text-muted-foreground"
          onClick={onMoveDown}
        >
          <ArrowDown className="mr-0.5 size-3" />
          아래로
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
          onClick={onRemove}
        >
          <Trash2 className="mr-0.5 size-3" />
          삭제
        </Button>
      </div>
    </div>
  )
}
