/**
 * ComfyUI 워크플로우 타입 (API 포맷)
 * ComfyUI_frontend: src/platform/workflow/validation/schemas/workflowSchema.ts
 */

export type NodeId = string

/**
 * ComfyUI 워크플로우 JSON (UI 포맷)
 * 노드들의 위치, 크기, 위젯 값 등을 포함
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
}

export interface ComfyWorkflowNode {
  id: number
  type: string
  pos: [number, number]
  size: [number, number]
  flags?: Record<string, unknown> | undefined
  order?: number | undefined
  mode?: number | undefined
  inputs?: ComfyNodeInput[] | undefined
  outputs?: ComfyNodeOutput[] | undefined
  properties?: Record<string, unknown> | undefined
  widgets_values?: (string | number | boolean)[] | undefined
  color?: string | undefined
  bgcolor?: string | undefined
  shape?: number | undefined
}

export interface ComfyNodeInput {
  name: string
  type: string
  link?: number | undefined
  widget?: {
    name: string
    config?: Record<string, unknown> | undefined
  } | undefined
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
  title: string
  bounding: [number, number, number, number]
  color?: string | undefined
  fontSize?: number | undefined
  locked?: boolean | undefined
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
