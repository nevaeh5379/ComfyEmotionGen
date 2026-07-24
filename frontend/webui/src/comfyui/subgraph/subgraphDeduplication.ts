/**
 * Subgraph 노드 ID 중복 제거 & 위상 정렬 (순수 TS)
 * ComfyUI_frontend: src/lib/litegraph/src/subgraph/subgraphDeduplication.ts 참고
 *
 *  - deduplicateSubgraphNodeIds: 로드 시 subgraph 내부 노드 ID가 루트/다른 subgraph와
 *    충돌하면 새 ID로 재매핑. 링크 origin_id/target_id, 승격 위젯 참조도 함께 패치.
 *  - topologicalSortSubgraphs: leaf-first 정렬(Kahn) - 참조되는 정의가 먼저 생성되도록.
 */

import type { ComfyWorkflowLink, ComfyWorkflowNode } from "../types/workflow"
import type { SubgraphDefinition, ExposedWidget } from "../types/subgraph"
import type { GraphSharedState } from "../types/subgraph"

const MAX_NODE_ID = 100_000_000

export interface DeduplicationResult {
  subgraphs: SubgraphDefinition[]
  rootNodes: ComfyWorkflowNode[] | undefined
}

/**
 * 직렬화된 subgraph 정의들 간의 노드 ID 충돌을 제거.
 * reservedNodeIds(루트 노드 ID 집합)와 충돌하는 subgraph 내부 노드 ID를 새 ID로 재매핑.
 * state.lastNodeId를 전진시킨다. 입력은 변경하지 않고 깊은 복제본을 반환.
 */
export function deduplicateSubgraphNodeIds(
  subgraphs: SubgraphDefinition[],
  reservedNodeIds: Set<number>,
  state: GraphSharedState,
  rootNodes?: ComfyWorkflowNode[]
): DeduplicationResult {
  const clonedSubgraphs: SubgraphDefinition[] = structuredClone(subgraphs)
  const clonedRootNodes: ComfyWorkflowNode[] | undefined = rootNodes
    ? structuredClone(rootNodes)
    : undefined

  const usedNodeIds = new Set(reservedNodeIds)
  const subgraphIdSet = new Set(clonedSubgraphs.map((sg) => sg.id))
  const remapBySubgraph = new Map<string, Map<number, number>>()

  for (const subgraph of clonedSubgraphs) {
    const remappedIds = remapNodeIds(subgraph.nodes, usedNodeIds, state)
    if (remappedIds.size === 0) continue
    remapBySubgraph.set(subgraph.id, remappedIds)

    patchLinks(subgraph.links, remappedIds)
    patchPromotedWidgets(subgraph.widgets ?? [], remappedIds)
  }

  for (const subgraph of clonedSubgraphs) {
    patchProxyWidgets(subgraph.nodes, subgraphIdSet, remapBySubgraph)
  }

  if (clonedRootNodes) {
    patchProxyWidgets(clonedRootNodes, subgraphIdSet, remapBySubgraph)
  }

  return { subgraphs: clonedSubgraphs, rootNodes: clonedRootNodes }
}

/**
 * 충돌하는 노드 ID를 새 ID로 재매핑. usedNodeIds와 state.lastNodeId를 갱신.
 */
function remapNodeIds(
  nodes: ComfyWorkflowNode[],
  usedNodeIds: Set<number>,
  state: GraphSharedState
): Map<number, number> {
  const remapped = new Map<number, number>()

  for (const node of nodes) {
    if (!usedNodeIds.has(node.id)) {
      usedNodeIds.add(node.id)
      continue
    }
    // 충돌: 새 ID 할당
    let newId = state.lastNodeId + 1
    while (usedNodeIds.has(newId) || newId <= state.lastNodeId) {
      newId++
      if (newId > MAX_NODE_ID) {
        newId = 1
        break
      }
    }
    state.lastNodeId = Math.max(state.lastNodeId, newId)
    usedNodeIds.add(newId)
    remapped.set(node.id, newId)
    node.id = newId
  }

  return remapped
}

/** 링크의 origin_id/target_id를 재매핑. */
function patchLinks(
  links: ComfyWorkflowLink[],
  remap: Map<number, number>
): void {
  for (const link of links) {
    const newOrigin = remap.get(link.origin_id)
    if (newOrigin !== undefined) link.origin_id = newOrigin
    const newTarget = remap.get(link.target_id)
    if (newTarget !== undefined) link.target_id = newTarget
  }
}

/** 승격 위젯의 내부 노드 참조(id)를 재매핑. */
function patchPromotedWidgets(
  widgets: ExposedWidget[],
  remap: Map<number, number>
): void {
  for (const widget of widgets) {
    const newId = remap.get(widget.id)
    if (newId !== undefined) widget.id = newId
  }
}

/** 루트 노드의 legacy proxyWidgets 배열을 패치 (subgraph 인스턴스 노드). */
function patchProxyWidgets(
  nodes: ComfyWorkflowNode[],
  subgraphIdSet: Set<string>,
  remapBySubgraph: Map<string, Map<number, number>>
): void {
  for (const node of nodes) {
    if (!subgraphIdSet.has(node.type)) continue
    const remappedIds = remapBySubgraph.get(node.type)
    if (!remappedIds) continue

    const proxyWidgets = node.properties?.proxyWidgets
    if (!Array.isArray(proxyWidgets)) continue

    for (const entry of proxyWidgets) {
      if (!Array.isArray(entry)) continue
      const oldId = Number(entry[0])
      const newId = remappedIds.get(oldId)
      if (newId !== undefined) entry[0] = String(newId)
    }
  }
}

/**
 * Subgraph 정의를 leaf-first 순서로 위상 정렬 (Kahn's algorithm).
 * 참조되는 정의가 참조하는 정의보다 먼저 오도록 보장.
 * 의존성 그래프에 사이클이 있으면 원래 순서 유지(폴백).
 */
export function topologicalSortSubgraphs(
  subgraphs: SubgraphDefinition[]
): SubgraphDefinition[] {
  const subgraphIds = new Set(subgraphs.map((sg) => sg.id))
  const byId = new Map(subgraphs.map((sg) => [sg.id, sg] as const))

  // adjacency: dependency → set of dependents (leaf가 먼저 나오도록)
  const dependents = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()
  for (const id of subgraphIds) {
    dependents.set(id, new Set())
    inDegree.set(id, 0)
  }

  for (const sg of subgraphs) {
    for (const node of sg.nodes) {
      if (subgraphIds.has(node.type)) {
        // sg는 node.type(하위 subgraph)에 의존 → node.type → sg.id 간선
        const deps = dependents.get(node.type)
        if (deps) deps.add(sg.id)
        inDegree.set(sg.id, (inDegree.get(sg.id) ?? 0) + 1)
      }
    }
  }

  // in-degree 0(leaf)부터 큐에 적재
  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  const sorted: SubgraphDefinition[] = []
  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined) break
    const def = byId.get(id)
    if (def) sorted.push(def)
    for (const dependent of dependents.get(id) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, newDegree)
      if (newDegree === 0) queue.push(dependent)
    }
  }

  // 사이클 폴백: 원래 순서
  if (sorted.length !== subgraphs.length) return subgraphs

  return sorted
}
