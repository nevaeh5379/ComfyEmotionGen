import { memo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { isRootGraphId } from "@/comfyui/utils/workflowGraphModel"
import { ReactNode } from "./ReactNode"
import { ReactGroup } from "./ReactGroup"

const NodeLayerItem = memo(function NodeLayerItem({
  id,
}: {
  id: number
}): React.JSX.Element | null {
  const node = useReactGraphStore(
    useShallow(
      (state) => state.nodes.find((candidate) => candidate.id === id) ?? null
    )
  )
  const selected = useReactGraphStore((state) => state.selectedNodeIds.has(id))
  if (!node) return null
  return (
    <ReactNode
      key={`node-${String(node.id)}`}
      id={node.id}
      type={node.type}
      pos={node.pos}
      size={node.size}
      selected={selected}
      mode={node.mode}
    />
  )
})

export const NodeLayer = memo(function NodeLayer(): React.JSX.Element {
  const nodeIds = useReactGraphStore(
    useShallow((state) => {
      const activeId = state.activeGraphId
      return state.nodes
        .filter((node) =>
          activeId === null
            ? isRootGraphId(node.graphId)
            : node.graphId === activeId
        )
        .map((node) => node.id)
    })
  )
  return (
    <>
      {nodeIds.map((id) => (
        <NodeLayerItem key={`node-${String(id)}`} id={id} />
      ))}
    </>
  )
})

const GroupLayerItem = memo(function GroupLayerItem({
  id,
}: {
  id: number
}): React.JSX.Element | null {
  return <ReactGroup id={id} />
})

export const GroupLayer = memo(function GroupLayer(): React.JSX.Element {
  const groupIds = useReactGraphStore(
    useShallow((state) => {
      const activeId = state.activeGraphId
      return state.groups
        .filter((group) =>
          activeId === null
            ? isRootGraphId(group.graphId)
            : group.graphId === activeId
        )
        .map((group) => group.id)
    })
  )
  return (
    <>
      {groupIds.map((id) => (
        <GroupLayerItem key={`group-${String(id)}`} id={id} />
      ))}
    </>
  )
})
