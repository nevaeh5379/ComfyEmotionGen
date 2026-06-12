/**
 * Node Library Sidebar
 * ComfyUI_frontend: src/components/sidebar/tabs/NodeLibrarySidebarTab.vue 의 React 포팅
 */

import { useState, useMemo } from "react"
import { useNodeDefStore } from "@/lib/comfy-graph/stores/nodeDefStore"
import { Search, ChevronRight, ChevronDown, Plus } from "lucide-react"

interface NodeLibrarySidebarProps {
  onAddNode?: (type: string) => void
  className?: string
}

export function NodeLibrarySidebar({ onAddNode, className = "" }: NodeLibrarySidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const nodeDefsByCategory = useNodeDefStore((s) => s.nodeDefsByCategory)

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return nodeDefsByCategory

    const result: Record<string, import("@/lib/comfy-graph/types/nodeDef").ComfyNodeDef[]> = {}
    for (const [category, defs] of Object.entries(nodeDefsByCategory)) {
      const filtered = defs.filter(
        (def) =>
          def.name.toLowerCase().includes(query) ||
          (def.display_name?.toLowerCase().includes(query) ?? false) ||
          category.toLowerCase().includes(query)
      )
      if (filtered.length > 0) {
        result[category] = filtered
      }
    }
    return result
  }, [nodeDefsByCategory, searchQuery])

  // 검색 중이면 모든 카테고리 확장
  const isSearching = searchQuery.trim().length > 0

  return (
    <div className={`flex flex-col h-full bg-background border-r ${className}`}>
      {/* Header */}
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold mb-2">Node Library</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(filteredCategories).length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No nodes found
          </div>
        ) : (
          Object.entries(filteredCategories).map(([category, defs]) => {
            const isExpanded = isSearching || expandedCategories.has(category)
            return (
              <div key={category}>
                <button
                  className="flex items-center w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 mr-1 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 mr-1 shrink-0" />
                  )}
                  {category}
                  <span className="ml-auto text-[10px] text-muted-foreground/60">{defs.length}</span>
                </button>
                {isExpanded && (
                  <div className="ml-2">
                    {defs.map((def) => (
                      <button
                        key={def.name}
                        className="flex items-center w-full px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors group"
                        onClick={() => onAddNode?.(def.name)}
                        title={`${def.display_name || def.name} (${def.name})`}
                      >
                        <Plus className="h-3 w-3 mr-1.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                        <span className="truncate">{def.display_name || def.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
