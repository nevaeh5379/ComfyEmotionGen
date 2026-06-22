/**
 * LGraphNode Adapter 타입
 * 커스텀 노드 호환을 위한 LGraphNode 인터페이스 정의
 */

import type { ComfyWorkflowNode } from "./workflow"

// ── Widget ────────────────────────────────────────────────────────

export interface LGraphWidget {
  type: string
  name: string
  value: string | number | boolean
  element: HTMLElement
  options: Record<string, unknown>
  callback: ((value: string | number | boolean) => void) | null
}

// ── Node slots ────────────────────────────────────────────────────

export interface LGraphNodeSlotInput {
  name: string
  type: string
  link: number | null
  widget?: { name: string } | null
}

export interface LGraphNodeSlotOutput {
  name: string
  type: string
  links: number[] | null
}

// ── LGraphNode interface ──────────────────────────────────────────

export interface LGraphNode {
  id: number
  graph: LGraphAdapterRef | null
  title?: string
  type?: string
  color?: string
  bgcolor?: string
  pos: [number, number]
  size: [number, number]
  inputs: LGraphNodeSlotInput[]
  outputs: LGraphNodeSlotOutput[]
  widgets?: LGraphWidget[]
  order?: number
  mode?: number
  properties?: Record<string, unknown>

  // Methods
  addInput(name: string, type: string): void
  addOutput(name: string, type: string): void
  connect(
    slot: number,
    node: LGraphNode,
    inputSlot: number | string
  ): boolean | null
  disconnectInput(slot: number): void
  disconnectOutput(slot: number): void
  configure(data: ComfyWorkflowNode): void
  onNodeCreated?(): void
  addWidget(
    type: string,
    name: string,
    value: string | number | boolean,
    callback: (v: string | number | boolean) => void,
    options?: Record<string, unknown>
  ): LGraphWidget
  addDOMWidget(
    name: string,
    type: string,
    element: HTMLElement,
    options?: {
      getValue?: () => unknown
      setValue?: (v: unknown) => void
      hideOnZoom?: boolean
      selectOn?: string[]
      [key: string]: unknown
    }
  ): LGraphWidget
  setDirtyCanvas(flag?: boolean, history?: boolean): void
}

// ── Forward reference to LGraphAdapter (avoid circular import) ────

export interface LGraphAdapterRef {
  getNodeById(id: number | string): LGraphNode | null
  nodes: LGraphNode[]
  add(node: LGraphNode): void
  remove(node: LGraphNode): void
}
