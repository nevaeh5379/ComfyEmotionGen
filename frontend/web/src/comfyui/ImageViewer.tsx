import { useState, useCallback, useRef, useEffect } from "react"
import { XIcon } from "lucide-react"

/* ------------------------------------------------------------------ */
/*  ImageViewer – reusable full-screen image popup with:               */
/*    • scroll‑wheel    → zoom in/out (centred on cursor)              */
/*    • left‑click      → zoom‑in one step                             */
/*    • right‑click     → zoom‑out one step                            */
/*    • drag            → pan (always, even at 100 %)                  */
/*    • Shift + drag    → rubber‑band select → zoom‑to‑region          */
/*    • mouse hover     → floating magnifying‑lens near cursor         */
/* ------------------------------------------------------------------ */

const ZOOM_STEPS: number[] = [1, 1.5, 2, 3, 4, 6]
const MAX_ZOOM = 6
const MIN_ZOOM = 1
const WHEEL_ZOOM_FACTOR = 1.12

const LENS_SIZE = 140
const LENS_ZOOM = 2.5
const LENS_OFFSET = 18
const CLICK_THRESHOLD = 6

interface ImageViewerProps {
  src: string
  isOpen: boolean
  onClose: () => void
  children?: React.ReactNode
}

export function ImageViewer({ src, isOpen, onClose, children }: ImageViewerProps) {
  /* ---- zoom & pan – refs are the source of truth for event handlers ---- */
  const zoomRef = useRef(MIN_ZOOM)
  const panRef = useRef({ x: 0, y: 0 })
  const imgNaturalRef = useRef({ w: 0, h: 0 })

  /* ---- zoom & pan – React state only for rendering ---- */
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })

  const setImgNaturalAndRef = useCallback((s: { w: number; h: number }) => {
    imgNaturalRef.current = s
    setImgNatural(s)
  }, [])

  /* ---- update both ref + state together ---- */
  const setZoomAndRef = useCallback((z: number) => {
    zoomRef.current = z
    setZoom(z)
  }, [])

  const setPanAndRef = useCallback((p: { x: number; y: number }) => {
    panRef.current = p
    setPan(p)
  }, [])

  /* ---- drag refs ---- */
  const draggingRef = useRef(false)
  const shiftSelectRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragCurrentRef = useRef({ x: 0, y: 0 })
  const panStartRef = useRef({ x: 0, y: 0 })
  const shiftHeldRef = useRef(false)
  const suppressCloseRef = useRef(false)

  /* ---- window-level drag handlers (refs for stable add/remove) ---- */
  const windowMoveRef = useRef<((e: MouseEvent) => void) | null>(null)
  const windowUpRef = useRef<((e: MouseEvent) => void) | null>(null)

  /* ---- drag state (for rendering) ---- */
  const [dragging, setDragging] = useState(false)
  const [shiftSelect, setShiftSelect] = useState(false)
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 })

  /* ---- magnifier lens ---- */
  const [showLens, setShowLens] = useState(false)
  const [lensBgPos, setLensBgPos] = useState({ x: 0, y: 0 })
  const [lensScreenPos, setLensScreenPos] = useState({ x: 0, y: 0 })
  const lensSizeRef = useRef(LENS_SIZE)
  const lensZoomRef = useRef(LENS_ZOOM)
  const [lensSize, setLensSize] = useState(LENS_SIZE)
  const [lensZoom, setLensZoom] = useState(LENS_ZOOM)

  const setLensSizeAndRef = useCallback((s: number) => {
    lensSizeRef.current = s
    setLensSize(s)
  }, [])
  const setLensZoomAndRef = useCallback((z: number) => {
    lensZoomRef.current = z
    setLensZoom(z)
  }, [])
  const [lensShape, setLensShape] = useState<"circle" | "square">("circle")
  const [showLensSettings, setShowLensSettings] = useState(false)

  /* ---- window size (for fitting container to image ratio) ---- */
  const [winSize, setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)

  /* reset on close */
  useEffect(() => {
    if (!isOpen) {
      setZoomAndRef(MIN_ZOOM)
      setPanAndRef({ x: 0, y: 0 })
      setDragging(false)
      setShiftSelect(false)
      // Clean up window-level drag listeners if still active
      if (draggingRef.current) {
        window.removeEventListener("mousemove", windowMoveRef.current!)
        window.removeEventListener("mouseup", windowUpRef.current!)
        draggingRef.current = false
        shiftSelectRef.current = false
      }
    }
  }, [isOpen, setZoomAndRef, setPanAndRef])

  /* track Shift key globally */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  /* ---- helpers (read from refs) ---- */

  /** Return the actual displayed image rect, accounting for max‑h/max‑w constraints. */
  const getImageRect = (z?: number) => {
    const el = containerRef.current
    const nat = imgNaturalRef.current
    if (!el || nat.w === 0) return null
    const cw = el.clientWidth
    const ch = el.clientHeight
    const fitScale = Math.min(cw / nat.w, ch / nat.h, 1)
    const baseW = nat.w * fitScale
    const baseH = nat.h * fitScale
    const zoom = z ?? zoomRef.current
    const p = panRef.current
    const imgW = baseW * zoom
    const imgH = baseH * zoom
    return {
      cw,
      ch,
      imgW,
      imgH,
      imgLeft: (cw - imgW) / 2 + p.x,
      imgTop: (ch - imgH) / 2 + p.y,
    }
  }

  const clampPan = useCallback(
    (z: number, p: { x: number; y: number }) => {
      const r = getImageRect(z)
      if (!r) return p
      const maxX = Math.max(0, (r.imgW - r.cw) / 2)
      const maxY = Math.max(0, (r.imgH - r.ch) / 2)
      return {
        x: Math.max(-maxX, Math.min(maxX, p.x)),
        y: Math.max(-maxY, Math.min(maxY, p.y)),
      }
    },
    [],
  )

  const nextZoomStep = useCallback((current: number) => {
    for (const s of ZOOM_STEPS) if (s > current) return s
    return MIN_ZOOM
  }, [])

  const prevZoomStep = useCallback((current: number) => {
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
      if (ZOOM_STEPS[i]! < current) return ZOOM_STEPS[i]!
    }
    return MIN_ZOOM
  }, [])

  /* ---- zoom in/out (read & write refs directly) ---- */

  const zoomIn = useCallback(
    (pt: { clientX: number; clientY: number }) => {
      const el = containerRef.current
      if (!el || imgNaturalRef.current.w === 0) return
      const z = zoomRef.current
      const p = panRef.current
      const newZoom = nextZoomStep(z)
      const rect = el.getBoundingClientRect()
      const cx = pt.clientX - rect.left - el.clientWidth / 2 - p.x
      const cy = pt.clientY - rect.top - el.clientHeight / 2 - p.y
      const scale = newZoom / z
      const newPan = clampPan(newZoom, {
        x: p.x - cx * (scale - 1),
        y: p.y - cy * (scale - 1),
      })
      setZoomAndRef(newZoom)
      setPanAndRef(newPan)
    },
    [clampPan, nextZoomStep, setZoomAndRef, setPanAndRef],
  )

  const zoomOut = useCallback(
    (pt: { clientX: number; clientY: number }) => {
      const el = containerRef.current
      if (!el || imgNaturalRef.current.w === 0) return
      const z = zoomRef.current
      const p = panRef.current
      const newZoom = prevZoomStep(z)
      if (newZoom === z) return
      const rect = el.getBoundingClientRect()
      const cx = pt.clientX - rect.left - el.clientWidth / 2 - p.x
      const cy = pt.clientY - rect.top - el.clientHeight / 2 - p.y
      const scale = newZoom / z
      const newPan = clampPan(newZoom, {
        x: p.x - cx * (1 - scale),
        y: p.y - cy * (1 - scale),
      })
      setZoomAndRef(newZoom)
      setPanAndRef(newPan)
    },
    [clampPan, prevZoomStep, setZoomAndRef, setPanAndRef],
  )

  const zoomToRegion = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      const r = getImageRect()
      if (!r) return

      // Convert container‑space drag coords → image‑space (0..1)
      const toImg = (cx: number, cy: number) => ({
        x: (cx - r.imgLeft) / r.imgW,
        y: (cy - r.imgTop) / r.imgH,
      })
      const a = toImg(x1, y1)
      const b = toImg(x2, y2)

      const rx1 = Math.min(a.x, b.x)
      const ry1 = Math.min(a.y, b.y)
      const rx2 = Math.max(a.x, b.x)
      const ry2 = Math.max(a.y, b.y)

      const selW = (rx2 - rx1) * imgNatural.w
      const selH = (ry2 - ry1) * imgNatural.h
      if (selW < 4 || selH < 4) return

      const zoomX = r.cw / selW
      const zoomY = r.ch / selH
      const newZoom = Math.min(Math.max(zoomX, zoomY), MAX_ZOOM)
      const cxPct = (rx1 + rx2) / 2
      const cyPct = (ry1 + ry2) / 2
      const newPan = clampPan(newZoom, {
        x: (0.5 - cxPct) * newZoom * imgNatural.w,
        y: (0.5 - cyPct) * newZoom * imgNatural.h,
      })
      setZoomAndRef(newZoom)
      setPanAndRef(newPan)
    },
    [clampPan, setZoomAndRef, setPanAndRef],
  )

  /* ---- window-level drag continue / end (stable refs → same identity for add/remove) ---- */
  windowMoveRef.current = (e: MouseEvent) => {
    if (!draggingRef.current) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    dragCurrentRef.current = { x: px, y: py }
    setDragCurrent({ x: px, y: py })

    if (shiftSelectRef.current) return

    const dx = px - dragStartRef.current.x
    const dy = py - dragStartRef.current.y
    const newPan = clampPan(zoomRef.current, {
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    })
    setPanAndRef(newPan)
  }

  windowUpRef.current = (_e: MouseEvent) => {
    if (!draggingRef.current) return

    const dx = dragCurrentRef.current.x - dragStartRef.current.x
    const dy = dragCurrentRef.current.y - dragStartRef.current.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (shiftSelectRef.current) {
      if (dist > CLICK_THRESHOLD) {
        zoomToRegion(
          dragStartRef.current.x, dragStartRef.current.y,
          dragCurrentRef.current.x, dragCurrentRef.current.y,
        )
      } else {
        const el = containerRef.current
        if (el) {
          const rect = el.getBoundingClientRect()
          zoomIn({ clientX: dragStartRef.current.x + rect.left, clientY: dragStartRef.current.y + rect.top })
        }
      }
    } else if (dist <= CLICK_THRESHOLD) {
      const el = containerRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        zoomIn({ clientX: dragStartRef.current.x + rect.left, clientY: dragStartRef.current.y + rect.top })
      }
    }

    draggingRef.current = false
    shiftSelectRef.current = false
    setDragging(false)
    setShiftSelect(false)

    window.removeEventListener("mousemove", windowMoveRef.current!)
    window.removeEventListener("mouseup", windowUpRef.current!)
    // Suppress the click that fires after mouseup on the overlay
    setTimeout(() => { suppressCloseRef.current = false }, 0)
  }

  /* ---- mouse handlers (all logic via refs, zero stale closures) ---- */

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    draggingRef.current = true
    shiftSelectRef.current = shiftHeldRef.current
    suppressCloseRef.current = true
    dragStartRef.current = { x: px, y: py }
    dragCurrentRef.current = { x: px, y: py }
    panStartRef.current = { x: panRef.current.x, y: panRef.current.y }

    setDragging(true)
    setShiftSelect(shiftHeldRef.current)
    setDragCurrent({ x: px, y: py })

    window.addEventListener("mousemove", windowMoveRef.current!)
    window.addEventListener("mouseup", windowUpRef.current!)
  }, [setShiftSelect])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    // magnifier lens
    setLensScreenPos({ x: e.clientX + LENS_OFFSET, y: e.clientY + LENS_OFFSET })
    const r = getImageRect()
    if (r) {
      const imgX = ((px - r.imgLeft) / r.imgW) * imgNatural.w
      const imgY = ((py - r.imgTop) / r.imgH) * imgNatural.h
      setLensBgPos({
        x: lensSizeRef.current / 2 - imgX * lensZoomRef.current,
        y: lensSizeRef.current / 2 - imgY * lensZoomRef.current,
      })
    }
  }, [imgNatural])



  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      zoomOut({ clientX: e.clientX, clientY: e.clientY })
    },
    [zoomOut],
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const el = containerRef.current
      if (!el || imgNaturalRef.current.w === 0) return
      const z = zoomRef.current
      const p = panRef.current
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor))
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left - el.clientWidth / 2 - p.x
      const cy = e.clientY - rect.top - el.clientHeight / 2 - p.y
      const scale = newZoom / z
      const newPan = clampPan(newZoom, {
        x: p.x - cx * (scale - 1),
        y: p.y - cy * (scale - 1),
      })
      setZoomAndRef(newZoom)
      setPanAndRef(newPan)
    },
    [clampPan, setZoomAndRef, setPanAndRef],
  )

  /* ---- render ---- */

  if (!isOpen) return null

  const shiftHeld = shiftHeldRef.current
  const cursor = dragging
    ? shiftSelect
      ? "crosshair"
      : "grabbing"
    : shiftHeld
      ? "crosshair"
      : "grab"

  const selRect: React.CSSProperties | undefined =
    dragging && shiftSelect
      ? {
          left: `${Math.min(dragStartRef.current.x, dragCurrent.x)}px`,
          top: `${Math.min(dragStartRef.current.y, dragCurrent.y)}px`,
          width: `${Math.abs(dragCurrent.x - dragStartRef.current.x)}px`,
          height: `${Math.abs(dragCurrent.y - dragStartRef.current.y)}px`,
        }
      : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={() => {
        if (suppressCloseRef.current) {
          suppressCloseRef.current = false
          return
        }
        onClose()
      }}
    >
      <div
        className="relative flex max-h-[92vh] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-red-600"
          onClick={onClose}
        >
          <XIcon className="h-5 w-5" />
        </button>

        <div
          ref={containerRef}
          className="relative flex-shrink-0 overflow-hidden"
          style={(() => {
            const base: React.CSSProperties = { cursor }
            if (imgNatural.w === 0 || imgNatural.h === 0) return base
            const aspect = imgNatural.w / imgNatural.h
            const barH = children ? 50 : 0
            const maxW = Math.round(winSize.w * 0.92)
            const maxH = Math.round(winSize.h * 0.92) - barH
            let w = maxW
            let h = Math.round(w / aspect)
            if (h > maxH) {
              h = maxH
              w = Math.round(h * aspect)
            }
            return { ...base, width: w, height: h }
          })()}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setShowLens(true)}
          onMouseLeave={() => setShowLens(false)}
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
        >
          <div className="flex h-full w-full items-center justify-center">
            <img
              src={src}
              alt=""
              className="max-h-full max-w-full select-none"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: dragging ? "none" : "transform 0.15s ease-out",
              }}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onLoad={(e) => {
                const img = e.currentTarget
                setImgNaturalAndRef({ w: img.naturalWidth, h: img.naturalHeight })
              }}
            />
          </div>

          {selRect && (
            <div
              className="pointer-events-none absolute border-2 border-blue-400 bg-blue-400/20"
              style={selRect}
            />
          )}

          {showLens && !dragging && (
            <div
              className="pointer-events-none fixed z-30 border-2 border-white/60 shadow-lg"
              style={{
                left: lensScreenPos.x,
                top: lensScreenPos.y,
                width: lensSize,
                height: lensSize,
                backgroundImage: `url(${src})`,
                backgroundPosition: `${lensBgPos.x}px ${lensBgPos.y}px`,
                backgroundSize: `${imgNatural.w * lensZoom}px ${imgNatural.h * lensZoom}px`,
                backgroundRepeat: "no-repeat",
                borderRadius: lensShape === "circle" ? "50%" : "4px",
              }}
            />
          )}

          <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-3 rounded bg-black/50 px-2.5 py-1 font-mono text-xs font-bold text-white/80 backdrop-blur-sm">
              <span>{Math.round(zoom * 100)}%</span>
              {!dragging && (
                <span className="text-white/40">Shift+드래그: 영역 확대</span>
              )}
            </div>

            {/* Lens settings toggle & panel */}
            <div className="pointer-events-auto">
              {!showLensSettings && (
                <button
                  className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-[10px] font-bold text-white/60 backdrop-blur-sm hover:text-white/90"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setShowLensSettings(true) }}
                >
                  🔍 렌즈 설정
                </button>
              )}
              {showLensSettings && (
                <div
                  className="flex flex-col gap-2 rounded bg-black/70 px-3 py-2 text-[10px] font-bold text-white/80 backdrop-blur-sm"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8">크기</span>
                    <input
                      type="range"
                      min={80}
                      max={300}
                      value={lensSize}
                      onChange={(e) => setLensSizeAndRef(Number(e.target.value))}
                      className="h-1 w-20 accent-blue-400"
                    />
                    <span className="w-6 text-right">{lensSize}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-8">확대</span>
                    <input
                      type="range"
                      min={1.5}
                      max={5}
                      step={0.5}
                      value={lensZoom}
                      onChange={(e) => setLensZoomAndRef(Number(e.target.value))}
                      className="h-1 w-20 accent-blue-400"
                    />
                    <span className="w-6 text-right">{lensZoom}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-8">모양</span>
                    <button
                      className={`rounded px-2 py-0.5 ${lensShape === "circle" ? "bg-blue-500 text-white" : "bg-white/10 text-white/50"}`}
                      onClick={() => setLensShape("circle")}
                    >
                      ⭕
                    </button>
                    <button
                      className={`rounded px-2 py-0.5 ${lensShape === "square" ? "bg-blue-500 text-white" : "bg-white/10 text-white/50"}`}
                      onClick={() => setLensShape("square")}
                    >
                      ⬜
                    </button>
                  </div>
                  <button
                    className="self-end text-[9px] text-white/40 hover:text-white/80"
                    onClick={() => setShowLensSettings(false)}
                  >
                    닫기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {children && (
          <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/60 px-6 py-4">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
