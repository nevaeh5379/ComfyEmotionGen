import { useCallback, useEffect, useRef, useState } from "react"
import {
  Brush,
  Download,
  Eraser,
  Eye,
  EyeOff,
  RotateCcw,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { triggerBlobDownload } from "../utils/downloadImages"

interface GalleryInpaintEditorProps {
  open: boolean
  imageUrl: string
  filename: string
  onOpenChange: (open: boolean) => void
}

type PaintMode = "paint" | "erase"

const CANVAS_MAX_SIZE = 1600

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

export function GalleryInpaintEditor({
  open,
  imageUrl,
  filename,
  onOpenChange,
}: GalleryInpaintEditorProps): React.JSX.Element {
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const paintingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<PaintMode>("paint")
  const [brushSize, setBrushSize] = useState(56)
  const [maskOpacity, setMaskOpacity] = useState(58)
  const [showMask, setShowMask] = useState(true)

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
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, brushSize / 5)))
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
    const output = document.createElement("canvas")
    output.width = imageCanvas.width
    output.height = imageCanvas.height
    const ctx = output.getContext("2d")
    if (!ctx) return
    const tint = document.createElement("canvas")
    tint.width = maskCanvas.width
    tint.height = maskCanvas.height
    const tintCtx = tint.getContext("2d")
    if (!tintCtx) return
    tintCtx.drawImage(maskCanvas, 0, 0)
    tintCtx.globalCompositeOperation = "source-in"
    tintCtx.fillStyle = "rgb(255, 64, 96)"
    tintCtx.fillRect(0, 0, tint.width, tint.height)

    ctx.drawImage(imageCanvas, 0, 0)
    ctx.globalAlpha = maskOpacity / 100
    ctx.drawImage(tint, 0, 0)
    ctx.globalAlpha = 1
    downloadCanvas(output, `${baseName(filename)}-inpaint-overlay.png`)
  }, [filename, maskOpacity])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[94vh] max-h-[94vh] gap-3 overflow-hidden p-4 sm:max-w-[96vw]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate font-mono text-sm">
            인페인팅 편집 · {filename}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-3 rounded-md border bg-muted/20 p-3">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
