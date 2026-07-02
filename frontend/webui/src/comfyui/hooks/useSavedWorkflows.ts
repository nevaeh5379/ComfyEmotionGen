import { useCallback } from "react"
import { type NodeMapping } from "../../lib/workflow"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { usePersistedItems } from "./usePersistedItems"

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

const STORAGE_KEY = STORAGE_KEYS.savedWorkflows

interface RawSavedWorkflow {
  id?: string | number
  name?: string
  workflow?: string
  nodeMappings?: NodeMapping[]
  mappingPresets?: SavedNodeMappingPreset[]
  savedAt?: number
}

function load(): SavedWorkflow[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]"
    ) as unknown
    if (!Array.isArray(parsed)) return []
    const items = parsed as RawSavedWorkflow[]
    return items.map((w) => {
      let mappingPresets: SavedNodeMappingPreset[] = w.mappingPresets ?? []
      if (w.nodeMappings && mappingPresets.length === 0) {
        mappingPresets = [
          {
            id: `migrated-${typeof w.id === "string" || typeof w.id === "number" ? String(w.id) : ""}`,
            name: "기본 매핑",
            mappings: w.nodeMappings,
            savedAt: typeof w.savedAt === "number" ? w.savedAt : Date.now(),
          },
        ]
      }
      return {
        id:
          typeof w.id === "string" || typeof w.id === "number"
            ? String(w.id)
            : "",
        name: typeof w.name === "string" ? w.name : "",
        workflow: typeof w.workflow === "string" ? w.workflow : "",
        mappingPresets,
        savedAt: typeof w.savedAt === "number" ? w.savedAt : Date.now(),
      }
    })
  } catch {
    return []
  }
}

export function useSavedWorkflows(): {
  workflows: SavedWorkflow[]
  saveWorkflow: (name: string, workflow: string) => SavedWorkflow
  deleteWorkflow: (id: string) => void
  saveMappingPreset: (
    workflowId: string,
    name: string,
    mappings: NodeMapping[]
  ) => SavedWorkflow | null
  deleteMappingPreset: (
    workflowId: string,
    presetId: string
  ) => SavedWorkflow | null
} {
  const { items: workflows, persist } = usePersistedItems(STORAGE_KEY, load)

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
          id: `${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`,
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
    (
      workflowId: string,
      name: string,
      mappings: NodeMapping[]
    ): SavedWorkflow | null => {
      const trimmed = name.trim()
      const all = load()
      const wIdx = all.findIndex((w) => w.id === workflowId)
      if (wIdx === -1) return null

      const w = all[wIdx]
      if (w === undefined) return null
      const presets = w.mappingPresets
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
            id: `${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`,
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

      const w = all[wIdx]
      if (w === undefined) return null
      const nextPresets = w.mappingPresets.filter((p) => p.id !== presetId)
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
