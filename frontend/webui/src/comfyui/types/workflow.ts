/**
 * ComfyUI 워크플로우 타입 (API 포맷)
 * ComfyUI_frontend: src/platform/workflow/validation/schemas/workflowSchema.ts
 */

import type { SubgraphDefinition } from "./subgraph"

export type NodeId = string

/**
 * 워크플로우 정의(블루프린트) 컨테이너.
 * 재귀 SubgraphDefinition을 포함한다.
 */
export interface WorkflowDefinitions {
  subgraphs: SubgraphDefinition[]
}

/**
 * ComfyUI 워크플로우 JSON (UI 포맷)
 * 노드들의 위치, 크기, 위젯 값 등을 포함
 * Subgraph 지원: definitions.subgraphs[] 로 블루프린트를, 노드 type=UUID 로 인스턴스를 표현.
 */
export interface ComfyWorkflowJSON {
  last_node_id?: number | undefined
  last_link_id?: number | undefined
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
  groups?: ComfyWorkflowGroup[] | undefined
  config?: Record<string, unknown> | undefined
  extra?: Record<string, unknown> | undefined
  version?: number | undefined
  /** Subgraph 정의(블루프린트) - 직렬화 시 참조되는 것만 포함 */
  definitions?: WorkflowDefinitions | undefined
}

export interface ComfyWorkflowNode {
  id: number
  /** 일반 노드 타입명, 또는 SubgraphNode 인스턴스의 경우 SubgraphId(UUID) */
  type: string
  pos: [number, number]
  size: [number, number]
  flags?: Record<string, unknown> | undefined
  order?: number | undefined
  mode?: number | undefined
  /** 일반 노드 입력 - SubgraphNode 인스턴스의 경우 정의 미러링 슬롯으로 사용 */
  inputs?: ComfyNodeInput[] | undefined
  /** 일반 노드 출력 - SubgraphNode 인스턴스의 경우 정의 미러링 슬롯으로 사용 */
  outputs?: ComfyNodeOutput[] | undefined
  properties?: Record<string, unknown> | undefined
  widgets_values?: (string | number | boolean)[] | undefined
  color?: string | undefined
  bgcolor?: string | undefined
  shape?: number | undefined
  /** 이 노드가 소속된 그래프 ID. null/undefined=루트, SubgraphId=서브그래프 내부 */
  graphId?: string | null | undefined
}

/** SubgraphNode 인스턴스 노드인지 확인 (type이 UUID 형식) */
export function isSubgraphNodeInstance(node: ComfyWorkflowNode): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    node.type
  )
}

export interface ComfyNodeInput {
  name: string
  type: string
  link?: number | undefined
  widget?:
    | {
        name: string
        config?: Record<string, unknown> | undefined
      }
    | undefined
}

export interface ComfyNodeOutput {
  name: string
  type: string
  links?: number[] | undefined
  slot_index?: number | undefined
}

export interface ComfyWorkflowLink {
  id: number
  origin_id: number
  origin_slot: number
  target_id: number
  target_slot: number
  type: string
}

export interface ComfyWorkflowGroup {
  id: number
  title: string
  bounding: [number, number, number, number]
  color?: string | undefined
  fontSize?: number | undefined
  locked?: boolean | undefined
  graphId?: string | null | undefined
}

/**
 * ComfyUI API 워크플로우 (실행용 포맷)
 * prompt 전송 시 사용
 */
export type ComfyApiWorkflow = Record<
  NodeId,
  {
    inputs: Record<string, unknown>
    class_type: string
    _meta?: {
      title?: string
    }
  }
>
