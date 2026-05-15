import { useCallback, useEffect, useState } from "react"
import { type NodeMapping } from "../lib/workflow"

export interface SavedNodeMappingPreset {
  id: string
  name: string
  mappings: NodeMapping[]
  savedAt: number
}

export interface SavedWorkflow {
  id: string
  name: string
  workflow: string
  mappingPresets: SavedNodeMappingPreset[]
  savedAt: number
}

const STORAGE_KEY = "saved_workflows"

function load(): SavedWorkflow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    // Migrate old format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return parsed.map((w: any) => {
      let mappingPresets = w.mappingPresets ?? []
      // Migrate old nodeMappings to a default preset
      if (w.nodeMappings && mappingPresets.length === 0) {
        mappingPresets = [
          {
            id: `migrated-${w.id}`,
            name: "기본 매핑",
            mappings: w.nodeMappings,
            savedAt: w.savedAt,
          },
        ]
      }
      return {
        id: w.id,
        name: w.name,
        workflow: w.workflow,
        mappingPresets,
        savedAt: w.savedAt,
      }
    })
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
    (name: string, workflow: string): SavedWorkflow => {
      const trimmed = name.trim()
      const all = load()
      const existing = all.find((w) => w.name === trimmed)
      let nextW: SavedWorkflow
      let nextAll: SavedWorkflow[]

      if (existing) {
        nextW = { ...existing, workflow, savedAt: Date.now() }
        nextAll = all.map((w) => (w.id === existing.id ? nextW : w))
      } else {
        nextW = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: trimmed,
          workflow,
          mappingPresets: [],
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

  const saveMappingPreset = useCallback(
    (workflowId: string, name: string, mappings: NodeMapping[]): SavedWorkflow | null => {
      const trimmed = name.trim()
      const all = load()
      const wIdx = all.findIndex((w) => w.id === workflowId)
      if (wIdx === -1) return null

      const w = all[wIdx]!
      const presets = w.mappingPresets || []
      const existing = presets.find((p) => p.name === trimmed)

      let nextPresets: SavedNodeMappingPreset[]
      if (existing) {
        nextPresets = presets.map((p) =>
          p.id === existing.id ? { ...p, mappings, savedAt: Date.now() } : p
        )
      } else {
        nextPresets = [
          ...presets,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: trimmed,
            mappings,
            savedAt: Date.now(),
          },
        ]
      }
      const nextW = { ...w, mappingPresets: nextPresets }
      persist(all.map((item, i) => (i === wIdx ? nextW : item)))
      return nextW
    },
    [persist]
  )

  const deleteMappingPreset = useCallback(
    (workflowId: string, presetId: string): SavedWorkflow | null => {
      const all = load()
      const wIdx = all.findIndex((w) => w.id === workflowId)
      if (wIdx === -1) return null

      const w = all[wIdx]!
      const nextPresets = (w.mappingPresets || []).filter((p) => p.id !== presetId)
      const nextW = { ...w, mappingPresets: nextPresets }
      persist(all.map((item, i) => (i === wIdx ? nextW : item)))
      return nextW
    },
    [persist]
  )

  return {
    workflows,
    saveWorkflow,
    deleteWorkflow,
    saveMappingPreset,
    deleteMappingPreset,
  }
}
