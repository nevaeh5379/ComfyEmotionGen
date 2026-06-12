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
  last_node_id?: number
  last_link_id?: number
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
  groups?: ComfyWorkflowGroup[]
  config?: Record<string, unknown>
  extra?: Record<string, unknown>
  version?: number
}

export interface ComfyWorkflowNode {
  id: number
  type: string
  pos: [number, number]
  size: [number, number]
  flags?: Record<string, unknown>
  order?: number
  mode?: number
  inputs?: ComfyNodeInput[]
  outputs?: ComfyNodeOutput[]
  properties?: Record<string, unknown>
  widgets_values?: unknown[]
  color?: string
  bgcolor?: string
  shape?: number
}

export interface ComfyNodeInput {
  name: string
  type: string
  link?: number
  widget?: {
    name: string
    config?: Record<string, unknown>
  }
}

export interface ComfyNodeOutput {
  name: string
  type: string
  links?: number[]
  slot_index?: number
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
  color?: string
  fontSize?: number
  locked?: boolean
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
