/**
 * NodeDef Store (Zustand)
 * ComfyUI_frontend: src/stores/nodeDefStore.ts
 */

import { create } from "zustand"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"

interface NodeDefState {
  nodeDefs: Record<string, ComfyNodeDef>
  nodeDefsByCategory: Record<string, ComfyNodeDef[]>
  showDeprecated: boolean
  showExperimental: boolean
  isLoading: boolean
  error: string | null

  // Actions
  setNodeDefs: (defs: Record<string, ComfyNodeDef>) => void
  registerNodeDef: (def: ComfyNodeDef) => void
  getNodeDef: (type: string) => ComfyNodeDef | undefined
  setShowDeprecated: (show: boolean) => void
  setShowExperimental: (show: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useNodeDefStore = create<NodeDefState>((set, get) => ({
  nodeDefs: {},
  nodeDefsByCategory: {},
  showDeprecated: false,
  showExperimental: false,
  isLoading: false,
  error: null,

  setNodeDefs: (defs): void => {
    const byCategory: Record<string, ComfyNodeDef[]> = {}
    for (const def of Object.values(defs)) {
      const firstPart = def.category !== ""
        ? def.category.split("/")[0]
        : null
      const category = (firstPart !== null && firstPart !== undefined && firstPart !== "") ? firstPart : "Other"
      byCategory[category] ??= []
      byCategory[category].push(def)
    }
    set({ nodeDefs: defs, nodeDefsByCategory: byCategory })
  },

  getNodeDef: (type): ComfyNodeDef | undefined => {
    const defs = get().nodeDefs
    // 1. Exact match
    if (defs[type]) return defs[type]

    // 2. Case-insensitive match
    const lowerType = type.toLowerCase()
    for (const [key, def] of Object.entries(defs)) {
      if (key.toLowerCase() === lowerType) return def
    }

    // 3. Try stripping known prefixes/suffixes
    const stripped = type.replace(/^(ComfyUI-|Comfy-|Custom-)/i, '').replace(/-(?:Node|Simple|Provider)$/i, '')
    if (stripped !== type && defs[stripped]) return defs[stripped]

    // 4. Try partial match (key contains type or type contains key)
    for (const [key, def] of Object.entries(defs)) {
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes(lowerType) || lowerType.includes(lowerKey)) return def
    }

    return undefined
  },

  registerNodeDef: (def): void => {
    const { nodeDefs, nodeDefsByCategory } = get()
    const nextDefs = { ...nodeDefs, [def.name]: def }
    const firstPart = def.category !== ""
      ? def.category.split("/")[0]
      : null
    const category = (firstPart !== null && firstPart !== undefined && firstPart !== "") ? firstPart : "Other"
    const nextByCategory = { ...nodeDefsByCategory }
    const existing = nextByCategory[category] ?? []
    // 중복 제거 (같은 name이면 교체)
    const filtered = existing.filter((d) => d.name !== def.name)
    nextByCategory[category] = [...filtered, def]
    set({ nodeDefs: nextDefs, nodeDefsByCategory: nextByCategory })
  },

  setShowDeprecated: (showDeprecated): void => { set({ showDeprecated }); },
  setShowExperimental: (showExperimental): void => { set({ showExperimental }); },
  setLoading: (isLoading): void => { set({ isLoading }); },
  setError: (error): void => { set({ error }); },
}))
