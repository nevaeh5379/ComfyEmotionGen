import type { LGraph } from '../LGraph'
import type { LGraphNode } from '../LGraphNode'
import type { SubgraphNode } from '../subgraph/SubgraphNode'

export function forEachNode(
  graph: LGraph,
  callback: (node: LGraphNode) => void
): void {
  if (!graph?._nodes) return
  
  for (const node of graph._nodes) {
    callback(node)
    if (
      node.isSubgraphNode &&
      node.isSubgraphNode()
    ) {
      const subgraphNode = node
      if (subgraphNode.subgraph) {
        forEachNode(subgraphNode.subgraph, callback)
      }
    }
  }
}
