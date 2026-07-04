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
  Wand2,
  CircleDashed,
  ArrowUp,
  ArrowDown,
  Sliders,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  onOpenChange: (open: boolean) => void
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

export function ImageEditorDialog({
  open,
  backendUrl,
  imageUrl,
  filename,
  onOpenChange,
}: ImageEditorDialogProps): React.JSX.Element {
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const paintingRef = useRef(false)
  const lastPointRef = useRef<Point | null>(null)
  const panningRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const lassoPathRef = useRef<Point[]>([])
  const cloneSourceRef = useRef<Point | null>(null)
  const removeMaskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)

  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [tool, setTool] = useState<ToolId>("move")
  const [brush, setBrush] = useState<BrushSettings>(DEFAULT_BRUSH)
  const [magicWand, setMagicWand] = useState<MagicWandSettings>(DEFAULT_MAGIC_WAND)
  const [adjust, setAdjust] = useState<AdjustSettings>(DEFAULT_ADJUST)
  const [view, setView] = useState<ViewTransform>({ zoom: 1, pan: { x: 0, y: 0 } })
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [cursorPos, setCursorPos] = useState<Point | null>(null)
  const [cursorScale, setCursorScale] = useState(1)
  const [removing, setRemoving] = useState(false)
  const [maskReady, setMaskReady] = useState(false)
  const [inpaintCaps, setInpaintCaps] = useState<InpaintCapabilities | null>(null)

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
      const scale = Math.min(1, CANVAS_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight))
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
  }, [imageUrl, open, selectionClear, layerStackReset, layerStackAdd, historyReset])

  // capabilities 조회
  useEffect(() => {
    if (!open) return
    void fetchInpaintCapabilities(backendUrl).then(setInpaintCaps)
  }, [backendUrl, open])

  // 합성 렌더 — 레이어/뷰 변경 시
  const renderComposite = useCallback(() => {
    const display = displayCanvasRef.current
    if (!display) return
    compositeLayers(layerStack.layers, display)
  }, [layerStack.layers])

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

  // 키보드 단축키
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
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
      if (e.key === "[") setBrush((b) => ({ ...b, size: clamp(b.size - 4, 4, 220) }))
      else if (e.key === "]") setBrush((b) => ({ ...b, size: clamp(b.size + 4, 4, 220) }))
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
  }, [open, activeCanvas, history, renderComposite, setZoomAt, view.zoom])

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

  // 포인터 다운 — 도구별 분기
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): void => {
      if (!ready) return
      const display = displayCanvasRef.current
      if (!display) return
      e.preventDefault()
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)

      // Space=팬
      if (spaceDown || tool === "move") {
        panningRef.current = true
        setPanning(true)
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: view.pan.x, panY: view.pan.y }
        return
      }

      const imgPt = clientToImagePoint(e.clientX, e.clientY, display, view)

      if (tool === "brush" || tool === "erase") {
        if (!activeCanvas) return
        history.pushHistory(activeCanvas)
        const ctx = activeCanvas.getContext("2d")
        if (!ctx) return
        drawStroke(ctx, imgPt, imgPt, brush.size, tool === "brush" ? "paint" : "erase", brush.hardness, brush.opacity, brush.color)
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
        drawStroke(ctx, imgPt, imgPt, brush.size, "paint", brush.hardness, brush.opacity, "#ffffff")
        lastPointRef.current = imgPt
        paintingRef.current = true
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
        return
      }

      if (tool === "lasso") {
        lassoPathRef.current = [imgPt]
        return
      }

      if (tool === "magic-wand") {
        const mask = floodFill(display, imgPt.x, imgPt.y, magicWand.tolerance, magicWand.contiguous)
        selection.setMaskSelection("magic", mask)
        return
      }

      if (tool === "crop") {
        lassoPathRef.current = [imgPt]
        return
      }
    },
    [ready, spaceDown, tool, view, brush, activeCanvas, history, renderComposite, magicWand, selection]
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
          pan: { x: start.panX + (e.clientX - start.x), y: start.panY + (e.clientY - start.y) },
        }))
        return
      }

      const imgPt = clientToImagePoint(e.clientX, e.clientY, display, view)

      if (paintingRef.current && (tool === "brush" || tool === "erase")) {
        if (!activeCanvas) return
        const ctx = activeCanvas.getContext("2d")
        if (!ctx) return
        const last = lastPointRef.current
        if (last) drawStroke(ctx, last, imgPt, brush.size, tool === "brush" ? "paint" : "erase", brush.hardness, brush.opacity, brush.color)
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
        if (last) drawStroke(ctx, last, imgPt, brush.size, "paint", brush.hardness, brush.opacity, "#ffffff")
        lastPointRef.current = imgPt
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
          ctx.drawImage(activeCanvas, src.x + dx, src.y + dy, 1, 1, imgPt.x - brush.size / 2, imgPt.y - brush.size / 2, brush.size, brush.size)
          ctx.restore()
        }
        lastPointRef.current = imgPt
        renderComposite()
        return
      }

      if ((tool === "rect-select" || tool === "ellipse-select") && lassoPathRef.current.length > 0) {
        const first = lassoPathRef.current[0]
        if (first) lassoPathRef.current = [first, imgPt]
        return
      }

      if (tool === "lasso" && lassoPathRef.current.length > 0 && e.buttons > 0) {
        lassoPathRef.current.push(imgPt)
        return
      }

      if (tool === "crop" && lassoPathRef.current.length > 0) {
        const first = lassoPathRef.current[0]
        if (first) lassoPathRef.current = [first, imgPt]
        return
      }
    },
    [ready, tool, view, activeCanvas, brush, history, renderComposite, updateCursor]
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
              selection.setRectSelection(tool === "rect-select" ? "rect" : "ellipse", rect)
            }
          }
        }
        lassoPathRef.current = []
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
              applyCrop(rect)
            }
          }
        }
        lassoPathRef.current = []
        return
      }
    },
    [ready, tool, view, selection, applyCrop]
  )

  // 선택 삭제
  const handleDeleteSelection = useCallback(() => {
    if (!selection.selection || !activeCanvas) return
    history.pushHistory(activeCanvas)
    const ctx = activeCanvas.getContext("2d")
    if (!ctx) return
    clearSelectionArea(ctx, selection.selection, activeCanvas.width, activeCanvas.height)
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
        out.getContext("2d")!.drawImage(img, 0, 0, display.width, display.height)
        layerStack.addLayer("image", { name: "객체 제거 결과", canvas: out })
        URL.revokeObjectURL(url)
        // 마스크 초기화
        const mcCtx = mc.getContext("2d")
        if (mcCtx) mcCtx.clearRect(0, 0, mc.width, mc.height)
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
  }, [backendUrl, inpaintCaps, layerStack, renderComposite])

  // 갤러리에 저장
  const handleSaveToGallery = useCallback(async () => {
    const display = displayCanvasRef.current
    if (!display) return
    try {
      compositeLayers(layerStack.layers, display)
      const name = `${baseName(filename)}-edit-${Date.now()}.png`
      const res = await uploadToSavedImages(backendUrl, display, name)
      toast.success(`갤러리에 저장됨: ${res.hash.slice(0, 8)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패")
    }
  }, [backendUrl, filename, layerStack, renderComposite])

  // 로컬 다운로드
  const handleDownload = useCallback(() => {
    const display = displayCanvasRef.current
    if (!display) return
    compositeLayers(layerStack.layers, display)
    downloadCanvas(display, `${baseName(filename)}-edit-${Date.now()}.png`)
  }, [filename, layerStack, renderComposite])

  const cursorDiameter = brush.size * cursorScale

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[94vh] max-h-[94vh] gap-3 overflow-hidden p-4 sm:max-w-[96vw]"
        onInteractOutside={(e) => { e.preventDefault(); }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate font-mono text-sm">
            이미지 편집 · {filename}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)_220px]">
          {/* 좌측 툴바 */}
          <aside className="flex max-h-full min-h-0 flex-col gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
            <div className="grid grid-cols-4 gap-1">
              <ToolButton tool="move" current={tool} setTool={setTool} icon={<MousePointer2 className="size-4" />} label={TOOL_LABELS.move} />
              <ToolButton tool="brush" current={tool} setTool={setTool} icon={<Brush className="size-4" />} label={TOOL_LABELS.brush} />
              <ToolButton tool="erase" current={tool} setTool={setTool} icon={<Eraser className="size-4" />} label={TOOL_LABELS.erase} />
              <ToolButton tool="rect-select" current={tool} setTool={setTool} icon={<SquareDashed className="size-4" />} label={TOOL_LABELS["rect-select"]} />
              <ToolButton tool="ellipse-select" current={tool} setTool={setTool} icon={<CircleDashed className="size-4" />} label={TOOL_LABELS["ellipse-select"]} />
              <ToolButton tool="lasso" current={tool} setTool={setTool} icon={<Lasso className="size-4" />} label={TOOL_LABELS.lasso} />
              <ToolButton tool="magic-wand" current={tool} setTool={setTool} icon={<MagicWandIcon className="size-4" />} label={TOOL_LABELS["magic-wand"]} />
              <ToolButton tool="clone" current={tool} setTool={setTool} icon={<Plus className="size-4" />} label={TOOL_LABELS.clone} />
              <ToolButton tool="crop" current={tool} setTool={setTool} icon={<Crop className="size-4" />} label={TOOL_LABELS.crop} />
              <ToolButton tool="object-remove" current={tool} setTool={setTool} icon={<Wand2 className="size-4" />} label={TOOL_LABELS["object-remove"]} disabled={!inpaintCaps?.enabled} />
              <ToolButton tool="adjust" current={tool} setTool={setTool} icon={<Sliders className="size-4" />} label={TOOL_LABELS.adjust} />
            </div>

            {(tool === "brush" || tool === "erase" || tool === "object-remove" || tool === "clone") && (
              <div className="grid gap-2 rounded-md border bg-background/60 p-2">
                {(tool === "brush" || tool === "clone") && (
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">색상</Label>
                    <input
                      type="color"
                      value={brush.color}
                      onChange={(e) => { setBrush((b) => ({ ...b, color: e.target.value })); }}
                      className="h-7 w-12 cursor-pointer rounded border bg-transparent"
                    />
                  </div>
                )}
                <Label className="text-xs">브러시 크기</Label>
                <input
                  type="range"
                  min={4}
                  max={220}
                  value={brush.size}
                  onChange={(e) => { setBrush((b) => ({ ...b, size: Number(e.target.value) })); }}
                  className="w-full"
                />
                <div className="flex items-center justify-between">
                  <Label className="text-xs">경도</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={brush.hardness}
                    onChange={(e) => { setBrush((b) => ({ ...b, hardness: Number(e.target.value) })); }}
                    className="h-7 w-16 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">불투명도</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={brush.opacity}
                    onChange={(e) => { setBrush((b) => ({ ...b, opacity: Number(e.target.value) })); }}
                    className="h-7 w-16 text-xs"
                  />
                </div>
              </div>
            )}

            {tool === "magic-wand" && (
              <div className="grid gap-2 rounded-md border bg-background/60 p-2">
                <Label className="text-xs">허용 오차</Label>
                <input
                  type="range"
                  min={0}
                  max={128}
                  value={magicWand.tolerance}
                  onChange={(e) => { setMagicWand((m) => ({ ...m, tolerance: Number(e.target.value) })); }}
                  className="w-full"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={magicWand.contiguous}
                    onChange={(e) => { setMagicWand((m) => ({ ...m, contiguous: e.target.checked })); }}
                  />
                  인접 영역만
                </label>
              </div>
            )}

            {tool === "adjust" && (
              <div className="grid gap-2 rounded-md border bg-background/60 p-2">
                {(["brightness", "contrast", "saturation"] as const).map((k) => (
                  <div key={k}>
                    <Label className="text-xs">{k === "brightness" ? "밝기" : k === "contrast" ? "대비" : "채도"}</Label>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={adjust[k]}
                      onChange={(e) => { setAdjust((a) => ({ ...a, [k]: Number(e.target.value) })); }}
                      className="w-full"
                    />
                  </div>
                ))}
                {(["blur", "sharpen"] as const).map((k) => (
                  <div key={k}>
                    <Label className="text-xs">{k === "blur" ? "블러" : "샤픈"}</Label>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      value={adjust[k]}
                      onChange={(e) => { setAdjust((a) => ({ ...a, [k]: Number(e.target.value) })); }}
                      className="w-full"
                    />
                  </div>
                ))}
                <Button size="sm" onClick={handleAddAdjustLayer} className="w-full">
                  조정 레이어 추가
                </Button>
              </div>
            )}

            {tool === "object-remove" && (
              <div className="grid gap-2 rounded-md border bg-background/60 p-2">
                <p className="text-xs text-muted-foreground">
                  브러시로 제거할 객체를 칠하고 실행 버튼을 누르세요. (LaMa)
                </p>
                <Button size="sm" onClick={handleRunRemove} disabled={removing || !inpaintCaps?.enabled}>
                  <Sparkles className="mr-1 size-3.5" />
                  {removing ? "제거 중..." : "객체 제거 실행"}
                </Button>
                {!inpaintCaps?.enabled && (
                  <p className="text-xs text-destructive">
                    {inpaintCaps?.reason ?? "LaMa 미지원"}
                  </p>
                )}
              </div>
            )}

            {selection.selection && (
              <Button size="sm" variant="destructive" onClick={handleDeleteSelection}>
                <Trash2 className="mr-1 size-3.5" />
                선택 삭제
              </Button>
            )}

            <div className="mt-auto grid grid-cols-4 gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => activeCanvas && history.undo(activeCanvas)} disabled={!history.canUndo}>
                    <Undo2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>실행 취소 (Ctrl+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => activeCanvas && history.redo(activeCanvas)} disabled={!history.canRedo}>
                    <Redo2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>다시 실행 (Ctrl+Y)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => { setZoomAt(view.zoom * 0.8); }}>
                    <ZoomOut className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>축소</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => { setZoomAt(view.zoom * 1.25); }}>
                    <ZoomIn className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>확대</TooltipContent>
              </Tooltip>
            </div>
          </aside>

          {/* 캔버스 영역 */}
          <div ref={canvasContainerRef} className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#444_0%_25%,#333_0%_50%)] bg-[length:20px_20px]">
            <canvas
              ref={displayCanvasRef}
              className={cn(
                "block touch-none select-none",
                (spaceDown || panning) && "cursor-grab",
                tool === "brush" || tool === "erase" || tool === "object-remove" ? "cursor-none" : "cursor-crosshair"
              )}
              style={{
                transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
                transformOrigin: "center",
                imageRendering: "pixelated",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => { setCursorPos(null); }}
              onWheel={onWheelZoom}
            />
            {(tool === "brush" || tool === "erase" || tool === "object-remove") && cursorPos && (
              <div
                ref={cursorRef}
                className="pointer-events-none absolute rounded-full border border-white/80 mix-blend-difference"
                style={{
                  width: `${cursorDiameter}px`,
                  height: `${cursorDiameter}px`,
                  left: `${cursorPos.x - cursorDiameter / 2}px`,
                  top: `${cursorPos.y - cursorDiameter / 2}px`,
                }}
              />
            )}
            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive">
                이미지 로드 실패
              </div>
            )}
            {!ready && !loadError && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                로드 중...
              </div>
            )}
            {tool === "object-remove" && maskReady && (
              <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
                마스크 준비됨
              </div>
            )}
          </div>

          {/* 우측 레이어 패널 */}
          <aside className="flex max-h-full min-h-0 flex-col gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">레이어</Label>
              <Button size="sm" variant="ghost" onClick={() => layerStack.addLayer("image", { name: `레이어 ${layerStack.layers.length + 1}` })}>
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="grid gap-1">
              {[...layerStack.layers].reverse().map((layer) => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  active={layer.id === layerStack.activeLayerId}
                  onSelect={() => { layerStack.setActiveLayerId(layer.id); }}
                  onToggleVisible={() => { layerStack.updateLayer(layer.id, { visible: !layer.visible }); }}
                  onOpacity={(v) => { layerStack.updateLayer(layer.id, { opacity: v }); }}
                  onRemove={() => { layerStack.removeLayer(layer.id); }}
                  onMoveUp={() => { layerStack.moveLayer(layer.id, "up"); }}
                  onMoveDown={() => { layerStack.moveLayer(layer.id, "down"); }}
                />
              ))}
            </div>
            <div className="mt-auto grid gap-2">
              <Button size="sm" onClick={handleDownload} disabled={!ready}>
                <Download className="mr-1 size-3.5" />
                다운로드
              </Button>
              <Button size="sm" onClick={handleSaveToGallery} disabled={!ready}>
                <Save className="mr-1 size-3.5" />
                갤러리에 저장
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
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
          onClick={() => { setTool(tool); }}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
        "rounded border p-1 text-xs",
        active ? "border-primary bg-primary/10" : "border-border"
      )}
    >
      <button className="flex w-full items-center gap-1" onClick={onSelect}>
        <span onClick={(e) => { e.stopPropagation(); onToggleVisible() }} className="cursor-pointer">
          {layer.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
        </span>
        <LayersIcon className="size-3" />
        <span className="truncate">{layer.name}</span>
      </button>
      <div className="mt-1 flex items-center gap-1">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layer.opacity}
          onChange={(e) => { onOpacity(Number(e.target.value)); }}
          className="w-full"
        />
      </div>
      <div className="mt-1 flex gap-1">
        <Button size="sm" variant="ghost" className="h-6 flex-1" onClick={onMoveUp}>
          <ArrowUp className="size-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 flex-1" onClick={onMoveDown}>
          <ArrowDown className="size-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 flex-1" onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  )
}