import type { ComfyWorkflow } from "@/lib/workflow"

export interface GraphEdge {
  source: string
  sourceSlot: number
  target: string
  targetInput: string
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>
  edges: GraphEdge[]
  layers: number
}

const LAYER_GAP_X = 280
const NODE_GAP_Y = 140

function isNodeLink(value: unknown): value is [string, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number"
  )
}

export function computeLayout(workflow: ComfyWorkflow): LayoutResult {
  const nodeIds = Object.keys(workflow)

  // 1. Extract edges
  const edges: GraphEdge[] = []
  for (const [nodeId, node] of Object.entries(workflow)) {
    for (const [inputKey, inputValue] of Object.entries(node.inputs)) {
      if (isNodeLink(inputValue)) {
        const [sourceId, sourceSlot] = inputValue
        if (workflow[sourceId]) {
          edges.push({ source: sourceId, sourceSlot, target: nodeId, targetInput: inputKey })
        }
      }
    }
  }

  // 2. Build adjacency + indegree
  const adj = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const id of nodeIds) {
    adj.set(id, [])
    indegree.set(id, 0)
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target)
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  }

  // 3. Topological layering (BFS from zero-indegree nodes)
  const layer = new Map<string, number>()
  const queue: string[] = []

  for (const [id, deg] of indegree) {
    if (deg === 0) {
      layer.set(id, 0)
      queue.push(id)
    }
  }

  // If all nodes have indegree > 0 (cycle), start from all nodes
  if (queue.length === 0) {
    for (const id of nodeIds) {
      layer.set(id, 0)
      queue.push(id)
    }
  }

  const remainingIndegree = new Map(indegree)
  let maxLayer = 0

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentLayer = layer.get(current)!
    for (const neighbor of adj.get(current) ?? []) {
      const candidate = currentLayer + 1
      if (!layer.has(neighbor) || layer.get(neighbor)! < candidate) {
        layer.set(neighbor, candidate)
        maxLayer = Math.max(maxLayer, candidate)
      }
      const newDeg = (remainingIndegree.get(neighbor) ?? 1) - 1
      remainingIndegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  // Any remaining nodes (cycles) go to maxLayer + 1
  for (const id of nodeIds) {
    if (!layer.has(id)) {
      maxLayer += 1
      layer.set(id, maxLayer)
    }
  }

  // 4. Group by layer
  const layerGroups = new Map<number, string[]>()
  for (const [id, l] of layer) {
    const arr = layerGroups.get(l) ?? []
    arr.push(id)
    layerGroups.set(l, arr)
  }

  // 5. Assign positions
  const positions = new Map<string, { x: number; y: number }>()

  for (let li = 0; li <= maxLayer; li++) {
    const nodesInLayer = layerGroups.get(li) ?? []
    // Sort by connection count descending
    const sorted = [...nodesInLayer].sort((a, b) => {
      const connA = (adj.get(a)?.length ?? 0) + edges.filter((e) => e.target === a).length
      const connB = (adj.get(b)?.length ?? 0) + edges.filter((e) => e.target === b).length
      return connB - connA
    })
    const yOffset = -((sorted.length - 1) * NODE_GAP_Y) / 2
    sorted.forEach((nodeId, i) => {
      positions.set(nodeId, { x: li * LAYER_GAP_X, y: yOffset + i * NODE_GAP_Y })
    })
  }

  return { positions, edges, layers: maxLayer + 1 }
}
