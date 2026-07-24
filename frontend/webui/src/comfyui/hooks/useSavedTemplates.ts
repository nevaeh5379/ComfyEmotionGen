import { useCallback } from "react"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { usePersistedItems } from "./usePersistedItems"
import { upsertNamedItem } from "../utils/persistedItems"

export interface SavedTemplate {
  id: string
  name: string
  template: string
  savedAt: number
}

const STORAGE_KEY = STORAGE_KEYS.savedTemplates

function load(): SavedTemplate[] {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]"
    ) as SavedTemplate[]
  } catch {
    return []
  }
}

export function useSavedTemplates(): {
  templates: SavedTemplate[]
  saveTemplate: (name: string, template: string) => SavedTemplate
  deleteTemplate: (id: string) => void
} {
  const { items: templates, persist } = usePersistedItems(STORAGE_KEY, load)

  const saveTemplate = useCallback(
    (name: string, template: string): SavedTemplate => {
      const all = load()
      const result = upsertNamedItem(all, name, (fields, existing) => ({
        ...existing,
        ...fields,
        template,
      }))
      persist(result.items)
      return result.item
    },
    [persist]
  )

  const deleteTemplate = useCallback(
    (id: string) => {
      persist(load().filter((t) => t.id !== id))
    },
    [persist]
  )

  return { templates, saveTemplate, deleteTemplate }
}
