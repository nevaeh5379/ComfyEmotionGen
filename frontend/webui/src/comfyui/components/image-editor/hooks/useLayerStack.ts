/**
 * 레이어 스택 관리 — 추가/삭제/순서/가시성/불투명도/활성 레이어.
 * 각 레이어는 off-screen HTMLCanvasElement + 메타데이터.
 */

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import type { AdjustSettings, Layer, LayerKind } from "../types"

function createLayerCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  return canvas
}

interface LayerStackController {
  layers: Layer[]
  activeLayerId: string | null
  setActiveLayerId: Dispatch<SetStateAction<string | null>>
  addLayer: (
    kind: LayerKind,
    opts?: {
      name?: string
      canvas?: HTMLCanvasElement
      adjust?: AdjustSettings
      opacity?: number
      offsetX?: number
      offsetY?: number
    }
  ) => Layer
  removeLayer: (id: string) => void
  updateLayer: (id: string, patch: Partial<Layer>) => void
  moveLayer: (id: string, direction: "up" | "down") => void
  getActiveLayer: () => Layer | null
  resetLayers: () => void
}

export function useLayerStack(
  width: number,
  height: number
): LayerStackController {
  const [layers, setLayers] = useState<Layer[]>([])
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
  const idCounter = useRef(0)

  const addLayer = useCallback(
    (
      kind: LayerKind,
      opts: {
        name?: string
        canvas?: HTMLCanvasElement
        adjust?: AdjustSettings
        opacity?: number
        offsetX?: number
        offsetY?: number
      } = {}
    ): Layer => {
      const id = `layer-${String(Date.now())}-${String((idCounter.current += 1))}`
      const canvas = opts.canvas ?? createLayerCanvas(width, height)
      const layer: Layer = {
        id,
        name: opts.name ?? (kind === "image" ? "레이어" : "조정"),
        kind,
        canvas,
        visible: true,
        opacity: opts.opacity ?? 1,
        offsetX: opts.offsetX ?? 0,
        offsetY: opts.offsetY ?? 0,
        adjust: opts.adjust,
        updatedAt: Date.now(),
      }
      setLayers((prev) => [...prev, layer])
      setActiveLayerId(id)
      return layer
    },
    [height, width]
  )

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => {
      const next = prev.filter((l) => l.id !== id)
      setActiveLayerId((curr) =>
        curr === id ? (next[next.length - 1]?.id ?? null) : curr
      )
      return next
    })
  }, [])

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  const moveLayer = useCallback((id: string, direction: "up" | "down") => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id)
      if (idx === -1) return prev
      const targetIdx = direction === "up" ? idx + 1 : idx - 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(idx, 1)
      if (moved === undefined) return prev
      next.splice(targetIdx, 0, moved)
      return next
    })
  }, [])

  const getActiveLayer = useCallback(
    () => layers.find((l) => l.id === activeLayerId) ?? null,
    [layers, activeLayerId]
  )

  const resetLayers = useCallback(() => {
    setLayers([])
    setActiveLayerId(null)
  }, [])

  return {
    layers,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    removeLayer,
    updateLayer,
    moveLayer,
    getActiveLayer,
    resetLayers,
  }
}
