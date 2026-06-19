/**
 * Canvas Store (Zustand)
 * ComfyUI_frontend: src/renderer/core/canvas/canvasStore.ts
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

import { create } from "zustand"
// import type { LGraphCanvas, LGraph } from "comfy-litegraph"
type LGraphCanvas = any
type LGraph = any
import type { ComfyAppService } from "../services/appService"

interface CanvasState {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  canvas: LGraphCanvas | null
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  currentGraph: LGraph | null
  appService: ComfyAppService | null
  scale: number
  offset: [number, number]
  selectedNodes: Set<number>
  isDragging: boolean
  isInSubgraph: boolean
  dirty: boolean

  // Actions
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  setCanvas: (canvas: LGraphCanvas | null) => void
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  setCurrentGraph: (graph: LGraph | null) => void
  setAppService: (appService: ComfyAppService | null) => void
  setScale: (scale: number) => void
  setOffset: (offset: [number, number]) => void
  updateSelectedItems: () => void
  setIsDragging: (isDragging: boolean) => void
  setIsInSubgraph: (isInSubgraph: boolean) => void
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

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  setCanvas: (canvas: LGraphCanvas | null): void => { set({ canvas }); },
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  setCurrentGraph: (graph: LGraph | null): void => { set({ currentGraph: graph }); },
  setAppService: (appService: ComfyAppService | null): void => { set({ appService }); },
  setScale: (scale: number): void => { set({ scale }); },
  setOffset: (offset: [number, number]): void => { set({ offset }); },

   
  updateSelectedItems: (): void => {
    const canvas = get().canvas
    if (canvas === null || canvas.graph === null) return

    const selected = new Set<number>()
    for (const node of canvas.graph.nodes) {
       
      if (node.is_selected === true) {
        selected.add(Number(node.id))
      }
    }
    set({ selectedNodes: selected })
  },

  setIsDragging: (isDragging: boolean): void => { set({ isDragging }); },
  setIsInSubgraph: (isInSubgraph: boolean): void => { set({ isInSubgraph }); },
  setDirty: (dirty: boolean): void => { set({ dirty }); },
}))
