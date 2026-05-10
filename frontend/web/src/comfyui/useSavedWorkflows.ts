import { useCallback, useEffect, useState } from "react"

export interface SavedWorkflow {
  id: string
  name: string
  workflow: string
  savedAt: number
}

const STORAGE_KEY = "saved_workflows"

function load(): SavedWorkflow[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedWorkflow[]
  } catch {
    return []
  }
}

export function useSavedWorkflows() {
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>(load)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setWorkflows(load())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const persist = useCallback((next: SavedWorkflow[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setWorkflows(next)
  }, [])

  const saveWorkflow = useCallback(
    (name: string, workflow: string) => {
      const next: SavedWorkflow = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim(),
        workflow,
        savedAt: Date.now(),
      }
      persist([...load(), next])
    },
    [persist]
  )

  const deleteWorkflow = useCallback(
    (id: string) => {
      persist(load().filter((w) => w.id !== id))
    },
    [persist]
  )

  return { workflows, saveWorkflow, deleteWorkflow }
}
