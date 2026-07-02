/**
 * Subgraph Service
 * ComfyUI_frontend: src/services/subgraphService.ts 참고
 *
 * 워크플로우 JSON의 definitions.subgraphs 를 로드하여:
 *  - SubgraphModelRuntime 생성 (reactGraphStore.subgraphs 맵에 등록)
 *  - nodeDefStore에 subgraph 노드 타입 등록 (노드 팔레트에 표시)
 */

import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { createSubgraphModel } from "@/comfyui/subgraph/SubgraphModel"
import { topologicalSortSubgraphs } from "@/comfyui/subgraph/subgraphDeduplication"
import type { SubgraphDefinition } from "@/comfyui/types/subgraph"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"
import type { ComfyWorkflowJSON } from "@/comfyui/types/workflow"

/**
 * 워크플로우 JSON에서 subgraph 정의를 로드하여 store와 노드 팔레트에 등록.
 * 위상 정렬(leaf-first)하여 참조되는 정의가 먼저 생성되도록 보장.
 */
export function loadSubgraphs(graphData: ComfyWorkflowJSON): void {
  const rawSubgraphs = graphData.definitions?.subgraphs ?? []
  if (rawSubgraphs.length === 0) return

  const sorted = topologicalSortSubgraphs(rawSubgraphs)
  const store = useReactGraphStore.getState()
  const nextSubgraphs = new Map(store.subgraphs)

  for (const def of sorted) {
    if (nextSubgraphs.has(def.id)) continue
    const model = createSubgraphModel(def)
    nextSubgraphs.set(def.id, model)
    registerSubgraphNodeDef(def)
  }

  useReactGraphStore.setState({ subgraphs: nextSubgraphs })
}

/**
 * Subgraph 정의를 ComfyNodeDef로 변환하여 nodeDefStore에 등록.
 * 노드 검색 팔레트에 "Subgraph" 카테고리로 표시.
 */
export function registerSubgraphNodeDef(def: SubgraphDefinition): void {
  const nodeDefStore = useNodeDefStore.getState()
  const nodeDef: ComfyNodeDef = {
    name: def.id,
    display_name: def.name,
    category: def.category ?? "subgraph",
    input: {
      required: {},
    },
    output: (def.outputs ?? []).map((o) => o.type),
    output_name: (def.outputs ?? []).map((o) => o.name),
  }
  nodeDefStore.registerNodeDef(nodeDef)
}

/**
 * 새 SubgraphModelRuntime을 생성하여 store에 등록하고 노드 타입도 등록.
 * convertToSubgraph 액션 후 호출.
 */
export function registerNewSubgraph(def: SubgraphDefinition): void {
  const store = useReactGraphStore.getState()
  const nextSubgraphs = new Map(store.subgraphs)
  const model = createSubgraphModel(def)
  nextSubgraphs.set(def.id, model)
  useReactGraphStore.setState({ subgraphs: nextSubgraphs })
  registerSubgraphNodeDef(def)
}
