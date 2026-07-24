import { ChevronRight } from "lucide-react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useSubgraphNavigationStore } from "@/comfyui/stores/subgraphNavigationStore"

export function SubgraphBreadcrumb(): React.JSX.Element | null {
  const idStack = useSubgraphNavigationStore((state) => state.idStack)
  const activeSubgraph = useSubgraphNavigationStore(
    (state) => state.activeSubgraph
  )
  const navigateToRoot = useSubgraphNavigationStore(
    (state) => state.navigateToRoot
  )
  const navigateToLevel = useSubgraphNavigationStore(
    (state) => state.navigateToLevel
  )
  const subgraphs = useReactGraphStore((state) => state.subgraphs)
  const activeGraphId = useReactGraphStore((state) => state.activeGraphId)

  if (activeGraphId === null) return null

  return (
    <div className="absolute top-2 left-2 z-[500] flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-200 backdrop-blur-sm">
      <button
        className="cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-700"
        onClick={(): void => {
          navigateToRoot()
        }}
      >
        Root
      </button>
      {idStack.map((id, index) => {
        const model = subgraphs.get(id)
        const name = model?.name ?? "Subgraph"
        const isCurrent = id === activeGraphId
        return (
          <span key={`crumb-${id}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-zinc-500" />
            <button
              className={`cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-700 ${isCurrent ? "font-semibold text-zinc-100" : ""}`}
              onClick={(): void => {
                navigateToLevel(index + 1)
              }}
            >
              {name}
            </button>
          </span>
        )
      })}
      {activeSubgraph !== null && !idStack.includes(activeGraphId) ? (
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-zinc-500" />
          <span className="px-1.5 py-0.5 font-semibold text-zinc-100">
            {activeSubgraph.name}
          </span>
        </span>
      ) : null}
    </div>
  )
}
