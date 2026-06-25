/**
 * Subgraph Blueprint Store (Zustand)
 * ComfyUI_frontend: src/stores/subgraphStore.ts 참고
 *
 * 저장/재사용 가능한 subgraph 블루프린트 관리:
 *  - fetchBlueprints: 로컬(localStorage) + 글로벌(외부 ComfyUI) 블루프린트 로드
 *  - publishSubgraph: 선택된 SubgraphNode를 직렬화하여 블루프린트로 저장
 *  - editBlueprint: 블루프린트를 캔버스에 로드하고 subgraph로 진입
 *  - deleteBlueprint: 블루프린트 삭제
 *  - getBlueprint: 이름으로 블루프린트 정의 조회
 *
 * 블루프린트 = 단일 SubgraphNode 루트 워크플로.
 */

import { create } from "zustand"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { registerSubgraphNodeDef } from "@/comfyui/services/subgraphService"
import {
  listLocalBlueprints,
  saveLocalBlueprint,
  deleteLocalBlueprint,
  getLocalBlueprint,
  getGlobalSubgraphs,
  getGlobalSubgraphData,
  type SubgraphBlueprintMeta,
  type GlobalSubgraphInfo,
} from "@/comfyui/services/subgraphApi"
import { findUsedSubgraphIds } from "@/comfyui/subgraph/subgraphUtils"
import { createSubgraphModel } from "@/comfyui/subgraph/SubgraphModel"
import type { SubgraphDefinition } from "@/comfyui/types/subgraph"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"
import type { ComfyWorkflowNode } from "@/comfyui/types/workflow"

const TYPE_PREFIX = "SubgraphBlueprint."

interface SubgraphBlueprintState {
  /** 로컬 블루프린트 목록 */
  blueprints: SubgraphBlueprintMeta[]
  /** 글로벌 블루프린트 정보 목록 */
  globalBlueprints: GlobalSubgraphInfo[]
  /** 로딩 상태 */
  isLoading: boolean

  // Actions
  /** 로컬 + 글로벌 블루프린트 로드 */
  fetchBlueprints: () => Promise<void>
  /** 선택된 SubgraphNode를 블루프린트로 발행(저장) */
  publishSubgraph: (name: string) => { success: boolean; error?: string }
  /** 블루프린트를 캔버스에 로드하고 노드로 추가 */
  instantiateBlueprint: (name: string, pos: [number, number]) => { success: boolean; error?: string }
  /** 블루프린트 삭제 (로컬만) */
  deleteBlueprint: (name: string) => void
  /** 블루프린트 정의 조회 */
  getBlueprint: (name: string) => SubgraphDefinition | null
  /** 블루프린트를 노드 팔레트에 등록 */
  registerBlueprintNodeDef: (meta: SubgraphBlueprintMeta) => void
}

export const useSubgraphBlueprintStore = create<SubgraphBlueprintState>((set, get): SubgraphBlueprintState => ({
  blueprints: [],
  globalBlueprints: [],
  isLoading: false,

  fetchBlueprints: async (): Promise<void> => {
    set({ isLoading: true })
    try {
      const local = listLocalBlueprints()
      const global = await getGlobalSubgraphs()
      set({ blueprints: local, globalBlueprints: global, isLoading: false })

      // 로컬 블루프린트를 노드 팔레트에 등록
      for (const meta of local) {
        get().registerBlueprintNodeDef(meta)
      }
    } catch (err) {
      console.warn("[subgraphBlueprintStore] fetchBlueprints 실패:", err)
      set({ isLoading: false })
    }
  },

  publishSubgraph: (name: string): { success: boolean; error?: string } => {
    const graphStore = useReactGraphStore.getState()
    const selectedIds = Array.from(graphStore.selectedNodeIds)
    if (selectedIds.length !== 1) {
      return { success: false, error: "단일 SubgraphNode를 선택하세요" }
    }
    const node = graphStore.nodes.find((n) => n.id === selectedIds[0])
    if (!node) return { success: false, error: "노드를 찾을 수 없습니다" }

    // SubgraphNode 인스턴스인지 확인 (type이 UUID)
    const isSubgraphInstance = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.type)
    if (!isSubgraphInstance) {
      return { success: false, error: "SubgraphNode 인스턴스를 선택하세요" }
    }

    const model = graphStore.subgraphs.get(node.type)
    if (!model) return { success: false, error: "Subgraph 정의를 찾을 수 없습니다" }

    // 내부 노드/링크 추출
    const innerNodes = graphStore.nodes.filter((n) => n.graphId === node.type)
    const innerLinks = graphStore.links.filter((l) =>
      l.origin_id === -10 || l.target_id === -20 ||
      innerNodes.some((n) => n.id === l.origin_id || n.id === l.target_id)
    )

    // 정의 직렬화
    const def = model.asSerialisable(innerNodes, innerLinks)
    const meta: SubgraphBlueprintMeta = {
      name,
      displayName: model.name,
      category: model.category ?? "Subgraph Blueprints",
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      definition: def,
    }

    saveLocalBlueprint(meta)
    get().registerBlueprintNodeDef(meta)

    // store 목록 갱신
    set({ blueprints: listLocalBlueprints() })
    return { success: true }
  },

  instantiateBlueprint: (name: string, pos: [number, number]): { success: boolean; error?: string } => {
    const meta = getLocalBlueprint(name)
    if (!meta) return { success: false, error: "블루프린트를 찾을 수 없습니다" }

    const graphStore = useReactGraphStore.getState()

    // Subgraph 정의를 store에 등록 (이미 있으면 스킵)
    if (!graphStore.subgraphs.has(meta.definition.id)) {
      const model = createSubgraphModel(meta.definition)
      const nextSubgraphs = new Map(graphStore.subgraphs)
      nextSubgraphs.set(meta.definition.id, model)
      useReactGraphStore.setState({ subgraphs: nextSubgraphs })
      registerSubgraphNodeDef(meta.definition)
    }

    // SubgraphNode 인스턴스 노드 추가
    const maxId = graphStore.nodes.reduce((max, n) => Math.max(max, n.id), 0)
    const newId = maxId + 1
    const newInstance: ComfyWorkflowNode = {
      id: newId,
      type: meta.definition.id,
      pos,
      size: [240, 80] as [number, number],
      inputs: (meta.definition.inputs ?? []).map((dto) => ({
        name: dto.name,
        type: dto.type,
        link: undefined,
      })),
      outputs: (meta.definition.outputs ?? []).map((dto) => ({
        name: dto.name,
        type: dto.type,
        links: undefined,
      })),
      graphId: null,
    }

    useReactGraphStore.setState({
      nodes: [...graphStore.nodes, newInstance],
      selectedNodeIds: new Set<number>([newId]),
    })

    return { success: true }
  },

  deleteBlueprint: (name: string): void => {
    deleteLocalBlueprint(name)
    set({ blueprints: listLocalBlueprints() })
  },

  getBlueprint: (name: string): SubgraphDefinition | null => {
    const meta = getLocalBlueprint(name)
    return meta?.definition ?? null
  },

  registerBlueprintNodeDef: (meta: SubgraphBlueprintMeta): void => {
    const nodeDefStore = useNodeDefStore.getState()
    const def = meta.definition
    const nodeDef: ComfyNodeDef = {
      name: TYPE_PREFIX + meta.name,
      display_name: def.name,
      category: meta.category,
      input: { required: {} },
      output: (def.outputs ?? []).map((o) => o.type),
      output_name: (def.outputs ?? []).map((o) => o.name),
    }
    nodeDefStore.registerNodeDef(nodeDef)
  },
}))

/** 타입 접두사 (블루프린트 노드 타입 식별용) */
export const SUBGRAPH_BLUEPRINT_TYPE_PREFIX = TYPE_PREFIX

/** 글로벌 subgraph 정의를 로드하여 등록 (비동기) */
export async function loadGlobalSubgraphDefinition(id: string): Promise<SubgraphDefinition | null> {
  const def = await getGlobalSubgraphData(id)
  if (!def) return null
  const graphStore = useReactGraphStore.getState()
  if (!graphStore.subgraphs.has(def.id)) {
    const model = createSubgraphModel(def)
    const nextSubgraphs = new Map(graphStore.subgraphs)
    nextSubgraphs.set(def.id, model)
    useReactGraphStore.setState({ subgraphs: nextSubgraphs })
    registerSubgraphNodeDef(def)
  }
  return def
}

/** 사용되지 않는 import 방지용 (Phase 8에서 사용 예정) */
void findUsedSubgraphIds