import { useCallback } from "react"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import type { ComfyWorkflowJSON } from "@/comfyui/types/workflow"
import { usePersistedItems } from "./usePersistedItems"

export interface EditorSavedWorkflow {
  id: string
  name: string
  /** EditorTab에서 편집 중인 UI workflow */
  workflow: ComfyWorkflowJSON
  savedAt: number
}

const STORAGE_KEY = STORAGE_KEYS.editorWorkflows

function load(): EditorSavedWorkflow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.map((w: unknown) => {
      const item = w as Partial<EditorSavedWorkflow>
      return {
        id: item.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: item.name ?? "Untitled",
        workflow: item.workflow ?? { nodes: [], links: [] },
        savedAt: item.savedAt ?? Date.now(),
      }
    })
  } catch {
    return []
  }
}

export function useEditorSavedWorkflows() {
  const { items: workflows, persist } = usePersistedItems<EditorSavedWorkflow>(
    STORAGE_KEY,
    load
  )

  const saveWorkflow = useCallback(
    (name: string, workflow: ComfyWorkflowJSON): EditorSavedWorkflow => {
      const trimmed = name.trim()
      const all = load()
      const existing = all.find((w) => w.name === trimmed)
      let nextW: EditorSavedWorkflow
      let nextAll: EditorSavedWorkflow[]

      if (existing) {
        nextW = { ...existing, workflow, savedAt: Date.now() }
        nextAll = all.map((w) => (w.id === existing.id ? nextW : w))
      } else {
        nextW = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: trimmed,
          workflow,
          savedAt: Date.now(),
        }
        nextAll = [...all, nextW]
      }
      persist(nextAll)
      return nextW
    },
    [persist]
  )

  const deleteWorkflow = useCallback(
    (id: string) => {
      persist(load().filter((w) => w.id !== id))
    },
    [persist]
  )

  return {
    workflows,
    saveWorkflow,
    deleteWorkflow,
  }
}
