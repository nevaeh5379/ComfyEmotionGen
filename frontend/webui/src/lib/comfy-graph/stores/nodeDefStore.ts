/**
 * NodeDef Store (Zustand)
 * ComfyUI_frontend: src/stores/nodeDefStore.ts
 */

import { create } from "zustand"
import type { ComfyNodeDef } from "@comfy-graph/types/nodeDef"

interface NodeDefState {
  nodeDefs: Record<string, ComfyNodeDef>
  nodeDefsByCategory: Record<string, ComfyNodeDef[]>
  showDeprecated: boolean
  showExperimental: boolean
  isLoading: boolean
  error: string | null

  // Actions
  setNodeDefs: (defs: Record<string, ComfyNodeDef>) => void
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

  setNodeDefs: (defs) => {
    const byCategory: Record<string, ComfyNodeDef[]> = {}
    for (const def of Object.values(defs)) {
      const category = def.category?.split("/")[0] || "Other"
      if (!byCategory[category]) byCategory[category] = []
      byCategory[category].push(def)
    }
    set({ nodeDefs: defs, nodeDefsByCategory: byCategory })
  },

  getNodeDef: (type) => {
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

  setShowDeprecated: (showDeprecated) => set({ showDeprecated }),
  setShowExperimental: (showExperimental) => set({ showExperimental }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
