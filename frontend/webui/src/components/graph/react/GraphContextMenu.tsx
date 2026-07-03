import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useSubgraphNavigationStore } from "@/comfyui/stores/subgraphNavigationStore"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"

export interface GraphContextMenuState {
  x: number
  y: number
  screenX: number
  screenY: number
  nodeId?: number | undefined
  groupId?: number | undefined
}

interface GraphContextMenuProps {
  menu: GraphContextMenuState
  nodeDefsByCategory: Record<string, ComfyNodeDef[]>
  screenToWorld: (screenX: number, screenY: number) => [number, number]
  addNode: (
    type: string,
    pos: [number, number],
    def: ComfyNodeDef | undefined
  ) => void
  addGroup: (
    title: string,
    bounding: [number, number, number, number],
    color?: string
  ) => void
  setZoom: (zoom: number) => void
  setPan: (pan: [number, number]) => void
  clearGraph: () => void
  deselectAll: () => void
  onClose: () => void
}

const SUBGRAPH_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function GraphContextMenu({
  menu,
  nodeDefsByCategory,
  screenToWorld,
  addNode,
  addGroup,
  setZoom,
  setPan,
  clearGraph,
  deselectAll,
  onClose,
}: GraphContextMenuProps): React.JSX.Element {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)

  const closeMenu = (): void => {
    setActiveSubmenu(null)
    setHoveredCategory(null)
    onClose()
  }

  return (
    <div
      className="context-menu-container absolute z-[1000] flex w-48 flex-col rounded-lg border border-zinc-800 bg-zinc-900/95 p-1 text-xs text-zinc-200 shadow-2xl backdrop-blur-md"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event): void => {
        event.stopPropagation()
      }}
    >
      {menu.nodeId !== undefined ? (
        <NodeContextMenu
          nodeId={menu.nodeId}
          deselectAll={deselectAll}
          closeMenu={closeMenu}
        />
      ) : menu.groupId !== undefined ? (
        <GroupContextMenu groupId={menu.groupId} closeMenu={closeMenu} />
      ) : (
        <CanvasContextMenu
          menu={menu}
          nodeDefsByCategory={nodeDefsByCategory}
          activeSubmenu={activeSubmenu}
          hoveredCategory={hoveredCategory}
          setActiveSubmenu={setActiveSubmenu}
          setHoveredCategory={setHoveredCategory}
          screenToWorld={screenToWorld}
          addNode={addNode}
          addGroup={addGroup}
          setZoom={setZoom}
          setPan={setPan}
          clearGraph={clearGraph}
          closeMenu={closeMenu}
        />
      )}
    </div>
  )
}

function NodeContextMenu({
  nodeId,
  deselectAll,
  closeMenu,
}: {
  nodeId: number
  deselectAll: () => void
  closeMenu: () => void
}): React.JSX.Element {
  const node = useReactGraphStore
    .getState()
    .nodes.find((candidate) => candidate.id === nodeId)
  const isSubgraphInstance =
    node !== undefined && SUBGRAPH_ID_PATTERN.test(node.type)

  return (
    <>
      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left text-destructive transition-colors hover:bg-zinc-800 hover:text-destructive"
        onClick={(): void => {
          useReactGraphStore.getState().removeNode(nodeId)
          closeMenu()
        }}
      >
        Delete Node
      </button>
      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
        onClick={(): void => {
          deselectAll()
          closeMenu()
        }}
      >
        Deselect
      </button>
      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
        onClick={(): void => {
          const store = useReactGraphStore.getState()
          const selectedIds = Array.from(store.selectedNodeIds)
          if (selectedIds.length > 0) {
            store.convertToSubgraph(selectedIds)
          }
          closeMenu()
        }}
      >
        Convert to Subgraph
      </button>
      {isSubgraphInstance && node !== undefined ? (
        <button
          className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
          onClick={(): void => {
            useSubgraphNavigationStore.getState().navigateTo(node.type)
            closeMenu()
          }}
        >
          Enter Subgraph
        </button>
      ) : null}
    </>
  )
}

function GroupContextMenu({
  groupId,
  closeMenu,
}: {
  groupId: number
  closeMenu: () => void
}): React.JSX.Element {
  const groups = useReactGraphStore((state) => state.groups)
  const group = groups.find((candidate) => candidate.id === groupId)
  const isLocked = group?.locked === true

  return (
    <>
      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
        onClick={(): void => {
          const currentTitle = group?.title ?? ""
          const newTitle = prompt("Enter new group title:", currentTitle)
          if (newTitle !== null && newTitle.trim()) {
            useReactGraphStore
              .getState()
              .updateGroupTitle(groupId, newTitle.trim())
          }
          closeMenu()
        }}
      >
        Rename Group
      </button>
      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
        onClick={(): void => {
          useReactGraphStore.getState().toggleGroupLock(groupId)
          closeMenu()
        }}
      >
        {isLocked ? "Unlock Group" : "Lock Group"}
      </button>
      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
        onClick={(): void => {
          const colors = [
            "#3b82f6",
            "#ef4444",
            "#10b981",
            "#f59e0b",
            "#8b5cf6",
            "#ec4899",
            "#6b7280",
            "#333355",
          ]
          const curColor = group?.color ?? "#333355"
          const nextColor =
            colors[(colors.indexOf(curColor) + 1) % colors.length] ?? "#333355"
          useReactGraphStore.getState().updateGroupColor(groupId, nextColor)
          closeMenu()
        }}
      >
        Change Color
      </button>
      <div className="my-1 h-px bg-zinc-800" />
      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left text-destructive transition-colors hover:bg-zinc-800 hover:text-destructive"
        onClick={(): void => {
          useReactGraphStore.getState().removeGroup(groupId)
          closeMenu()
        }}
      >
        Delete Group
      </button>
    </>
  )
}

function CanvasContextMenu({
  menu,
  nodeDefsByCategory,
  activeSubmenu,
  hoveredCategory,
  setActiveSubmenu,
  setHoveredCategory,
  screenToWorld,
  addNode,
  addGroup,
  setZoom,
  setPan,
  clearGraph,
  closeMenu,
}: {
  menu: GraphContextMenuState
  nodeDefsByCategory: Record<string, ComfyNodeDef[]>
  activeSubmenu: string | null
  hoveredCategory: string | null
  setActiveSubmenu: (value: string | null) => void
  setHoveredCategory: (value: string | null) => void
  screenToWorld: (screenX: number, screenY: number) => [number, number]
  addNode: (
    type: string,
    pos: [number, number],
    def: ComfyNodeDef | undefined
  ) => void
  addGroup: (
    title: string,
    bounding: [number, number, number, number],
    color?: string
  ) => void
  setZoom: (zoom: number) => void
  setPan: (pan: [number, number]) => void
  clearGraph: () => void
  closeMenu: () => void
}): React.JSX.Element {
  const selectedNodeIds = useReactGraphStore((state) => state.selectedNodeIds)

  return (
    <>
      <div
        className="relative flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
        onMouseEnter={(): void => {
          setActiveSubmenu("categories")
        }}
      >
        <span>Add Node</span>
        <ChevronRight className="h-3 w-3 text-zinc-400" />

        {activeSubmenu === "categories" && (
          <div
            className="absolute top-0 left-full ml-1 flex max-h-80 w-48 flex-col overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/95 p-1 text-xs text-zinc-200 shadow-2xl backdrop-blur-md"
            onMouseLeave={(): void => {
              setActiveSubmenu(null)
              setHoveredCategory(null)
            }}
          >
            {Object.keys(nodeDefsByCategory).map((category) => (
              <div
                key={category}
                className="relative flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onMouseEnter={(): void => {
                  setHoveredCategory(category)
                }}
              >
                <span className="truncate pr-2">{category}</span>
                <ChevronRight className="h-3 w-3 text-zinc-400" />

                {hoveredCategory === category && (
                  <div
                    className="absolute top-0 left-full ml-1 flex max-h-80 w-56 flex-col overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/95 p-1 text-xs text-zinc-200 shadow-2xl backdrop-blur-md"
                    onClick={(event): void => {
                      event.stopPropagation()
                    }}
                  >
                    {nodeDefsByCategory[category]?.map((definition) => (
                      <button
                        key={definition.name}
                        className="flex w-full cursor-pointer items-center truncate rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                        onClick={(): void => {
                          const worldPos = screenToWorld(
                            menu.screenX,
                            menu.screenY
                          )
                          addNode(definition.name, worldPos, definition)
                          closeMenu()
                        }}
                        title={definition.display_name ?? definition.name}
                      >
                        {definition.display_name ?? definition.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
        onClick={(): void => {
          const worldPos = screenToWorld(menu.screenX, menu.screenY)
          addGroup("New Group", [worldPos[0], worldPos[1], 400, 300])
          closeMenu()
        }}
      >
        Add Group
      </button>

      {selectedNodeIds.size > 0 && (
        <button
          className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
          onClick={(): void => {
            const store = useReactGraphStore.getState()
            const selectedIds = Array.from(store.selectedNodeIds)
            const selectedNodes = store.nodes.filter((node) =>
              selectedIds.includes(node.id)
            )
            if (selectedNodes.length > 0) {
              let minX = Infinity
              let minY = Infinity
              let maxX = -Infinity
              let maxY = -Infinity
              for (const node of selectedNodes) {
                minX = Math.min(minX, node.pos[0])
                minY = Math.min(minY, node.pos[1])
                maxX = Math.max(maxX, node.pos[0] + node.size[0])
                maxY = Math.max(maxY, node.pos[1] + node.size[1])
              }
              const padding = 20
              addGroup("Group", [
                minX - padding,
                minY - padding - 30,
                maxX - minX + padding * 2,
                maxY - minY + padding * 2 + 30,
              ])
            }
            closeMenu()
          }}
        >
          Add Group For Selected Nodes
        </button>
      )}

      <div className="my-1 h-px bg-zinc-800" />

      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
        onClick={(): void => {
          setZoom(1.0)
          setPan([0, 0])
          closeMenu()
        }}
      >
        Reset Zoom & Pan
      </button>
      <button
        className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left text-destructive transition-colors hover:bg-zinc-800 hover:text-destructive"
        onClick={(): void => {
          clearGraph()
          closeMenu()
        }}
      >
        Clear Canvas
      </button>
    </>
  )
}
