import { useCallback } from "react"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { usePersistedItems } from "./usePersistedItems"

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

export function useSavedTemplates() {
  const { items: templates, persist } = usePersistedItems(STORAGE_KEY, load)

  const saveTemplate = useCallback(
    (name: string, template: string): SavedTemplate => {
      const trimmed = name.trim()
      const all = load()
      const existing = all.find((t) => t.name === trimmed)
      if (existing) {
        const updated = { ...existing, template, savedAt: Date.now() }
        persist(all.map((t) => (t.id === existing.id ? updated : t)))
        return updated
      } else {
        const next: SavedTemplate = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: trimmed,
          template,
          savedAt: Date.now(),
        }
        persist([...all, next])
        return next
      }
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
