/**
 * Canvas Store (Zustand)
 * ComfyUI_frontend: src/renderer/core/canvas/canvasStore.ts
 */

import { create } from "zustand"
import type { LGraphCanvas, LGraph } from "@comfy-graph/core/litegraph"
import type { ComfyAppService } from "../services/appService"

interface CanvasState {
  canvas: LGraphCanvas | null
  currentGraph: LGraph | null
  appService: ComfyAppService | null
  scale: number
  offset: [number, number]
  selectedNodes: Set<number>
  isDragging: boolean
  isInSubgraph: boolean
  dirty: boolean

  // Actions
  setCanvas: (canvas: LGraphCanvas | null) => void
  setCurrentGraph: (graph: LGraph | null) => void
  setAppService: (appService: ComfyAppService | null) => void
  setScale: (scale: number) => void
  setOffset: (offset: [number, number]) => void
  updateSelectedItems: () => void
  setIsDragging: (dragging: boolean) => void
  setIsInSubgraph: (inSubgraph: boolean) => void
  setDirty: (dirty: boolean) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvas: null,
  currentGraph: null,
  appService: null,
  scale: 1,
  offset: [0, 0],
  selectedNodes: new Set(),
  isDragging: false,
  isInSubgraph: false,
  dirty: false,

  setCanvas: (canvas) => set({ canvas }),
  setCurrentGraph: (graph) => set({ currentGraph: graph }),
  setAppService: (appService: ComfyAppService | null) => set({ appService }),
  setScale: (scale) => set({ scale }),
  setOffset: (offset) => set({ offset }),

  updateSelectedItems: () => {
    const canvas = get().canvas
    if (!canvas?.graph) return

    const selected = new Set<number>()
    for (const node of canvas.graph.nodes) {
      if (node.is_selected) {
        selected.add(Number(node.id))
      }
    }
    set({ selectedNodes: selected })
  },

  setIsDragging: (isDragging) => set({ isDragging }),
  setIsInSubgraph: (isInSubgraph) => set({ isInSubgraph }),
  setDirty: (dirty) => set({ dirty }),
}))
