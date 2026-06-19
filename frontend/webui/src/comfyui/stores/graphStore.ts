/**
 * Graph Store (Zustand)
 * 그래프 상태 관리: 노드, 링크, 변경 추적
 */

import { create } from "zustand"
import type { ComfyWorkflowJSON } from "@/comfyui/types/workflow"

interface GraphState {
  workflow: ComfyWorkflowJSON | null
  isDirty: boolean
  undoStack: ComfyWorkflowJSON[]
  redoStack: ComfyWorkflowJSON[]

  // Actions
  setWorkflow: (workflow: ComfyWorkflowJSON | null) => void
  markDirty: () => void
  saveState: () => void
  undo: () => ComfyWorkflowJSON | null
  redo: () => ComfyWorkflowJSON | null
  canUndo: () => boolean
  canRedo: () => boolean
}

export const useGraphStore = create<GraphState>((set, get) => ({
  workflow: null,
  isDirty: false,
  undoStack: [],
  redoStack: [],

  setWorkflow: (workflow): void => { set({ workflow, isDirty: false }); },

  markDirty: (): void => { set({ isDirty: true }); },

  saveState: (): void => {
    const { workflow, undoStack } = get()
    if (!workflow) return
    set({
      undoStack: [...undoStack, workflow],
      redoStack: [],
    })
  },

  undo: (): ComfyWorkflowJSON | null => {
    const { undoStack, redoStack, workflow } = get()
    if (undoStack.length === 0) return null

    const previous = undoStack[undoStack.length - 1]
    if (previous === undefined) return null
    const newUndo = undoStack.slice(0, -1)

    set({
      undoStack: newUndo,
      redoStack: workflow ? [workflow, ...redoStack] : redoStack,
      workflow: previous,
      isDirty: true,
    })

    return previous
  },

  redo: (): ComfyWorkflowJSON | null => {
    const { undoStack, redoStack, workflow } = get()
    if (redoStack.length === 0) return null

    const next = redoStack[0]
    if (next === undefined) return null
    const newRedo = redoStack.slice(1)

    set({
      undoStack: workflow ? [...undoStack, workflow] : undoStack,
      redoStack: newRedo,
      workflow: next,
      isDirty: true,
    })

    return next
  },

  canUndo: (): boolean => get().undoStack.length > 0,
  canRedo: (): boolean => get().redoStack.length > 0,
}))
