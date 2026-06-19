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

function load(): SavedWorkflow[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    // Migrate old format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return parsed.map((w: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      let mappingPresets: SavedNodeMappingPreset[] = w.mappingPresets ?? []
      // Migrate old nodeMappings to a default preset
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (w.nodeMappings !== null && mappingPresets.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const nodeMappings: unknown[] = w.nodeMappings
        mappingPresets = [
          {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            id: `migrated-${String(w.id)}`,
            name: "기본 매핑",
            mappings: nodeMappings as NodeMapping[],
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            savedAt: w.savedAt,
          },
        ]
      }
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        id: w.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        name: w.name,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        workflow: w.workflow,
        mappingPresets,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        savedAt: w.savedAt,
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
  saveMappingPreset: (workflowId: string, name: string, mappings: NodeMapping[]) => SavedWorkflow | null
  deleteMappingPreset: (workflowId: string, presetId: string) => SavedWorkflow | null
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
      const nextPresets = w.mappingPresets.filter(
        (p) => p.id !== presetId
      )
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
