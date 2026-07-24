/**
 * Node Library Sidebar
 * ComfyUI_frontend: src/components/sidebar/tabs/NodeLibrarySidebarTab.vue 의 React 포팅
 */

import { useState, useMemo } from "react"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"
import { Search, ChevronRight, ChevronDown, Plus } from "lucide-react"

interface NodeLibrarySidebarProps {
  onAddNode?: (type: string) => void
  className?: string
}

export function NodeLibrarySidebar({
  onAddNode,
  className = "",
}: NodeLibrarySidebarProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  )

  const nodeDefsByCategory = useNodeDefStore((s) => s.nodeDefsByCategory)

  const toggleCategory = (category: string): void => {
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

    const result: Record<string, ComfyNodeDef[]> = {}
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
    <div className={`flex h-full flex-col border-r bg-background ${className}`}>
      {/* Header */}
      <div className="border-b p-3">
        <h3 className="mb-2 text-sm font-semibold">Node Library</h3>
        <div className="relative">
          <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
            }}
            className="w-full rounded-md border bg-background py-1.5 pr-3 pl-8 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
          />
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(filteredCategories).length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No nodes found
          </div>
        ) : (
          Object.entries(filteredCategories).map(([category, defs]) => {
            const isExpanded = isSearching || expandedCategories.has(category)
            return (
              <div key={category}>
                <button
                  className="flex w-full items-center px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50"
                  onClick={() => {
                    toggleCategory(category)
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="mr-1 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="mr-1 h-3.5 w-3.5 shrink-0" />
                  )}
                  {category}
                  <span className="ml-auto text-[10px] text-muted-foreground/60">
                    {defs.length}
                  </span>
                </button>
                {isExpanded && (
                  <div className="ml-2">
                    {defs.map((def, idx) => (
                      <button
                        key={`${category}-${def.name}-${String(idx)}`}
                        className="group flex w-full items-center px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                        onClick={() => onAddNode?.(def.name)}
                        title={`${def.display_name ?? def.name} (${def.name})`}
                      >
                        <Plus className="mr-1.5 h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground" />
                        <span className="truncate">
                          {def.display_name ?? def.name}
                        </span>
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
