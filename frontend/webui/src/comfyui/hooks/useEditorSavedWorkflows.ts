import { useCallback } from "react"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import type { ComfyWorkflowJSON } from "@/comfyui/types/workflow"
import { usePersistedItems } from "./usePersistedItems"
import { createPersistedId, upsertNamedItem } from "../utils/persistedItems"

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
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]"
    ) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((w: unknown) => {
      const item = w as Partial<EditorSavedWorkflow>
      return {
        id: item.id ?? createPersistedId(),
        name: item.name ?? "Untitled",
        workflow: item.workflow ?? { nodes: [], links: [] },
        savedAt: item.savedAt ?? Date.now(),
      }
    })
  } catch {
    return []
  }
}

export function useEditorSavedWorkflows(): {
  workflows: EditorSavedWorkflow[]
  saveWorkflow: (
    name: string,
    workflow: ComfyWorkflowJSON
  ) => EditorSavedWorkflow
  deleteWorkflow: (id: string) => void
} {
  const { items: workflows, persist } = usePersistedItems<EditorSavedWorkflow>(
    STORAGE_KEY,
    load
  )

  const saveWorkflow = useCallback(
    (name: string, workflow: ComfyWorkflowJSON): EditorSavedWorkflow => {
      const all = load()
      const result = upsertNamedItem(all, name, (fields, existing) => ({
        ...existing,
        ...fields,
        workflow,
      }))
      persist(result.items)
      return result.item
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
