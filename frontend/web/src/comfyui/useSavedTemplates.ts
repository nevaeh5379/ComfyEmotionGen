import { useCallback, useEffect, useState } from "react"

export interface SavedTemplate {
  id: string
  name: string
  template: string
  savedAt: number
}

const STORAGE_KEY = "ceg_saved_templates"

function load(): SavedTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedTemplate[]
  } catch {
    return []
  }
}

export function useSavedTemplates() {
  const [templates, setTemplates] = useState<SavedTemplate[]>(load)

  // 다른 탭에서 변경 시 동기화
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setTemplates(load())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const persist = useCallback((next: SavedTemplate[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setTemplates(next)
  }, [])

  const saveTemplate = useCallback(
    (name: string, template: string) => {
      const next: SavedTemplate = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim(),
        template,
        savedAt: Date.now(),
      }
      persist([...load(), next])
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
