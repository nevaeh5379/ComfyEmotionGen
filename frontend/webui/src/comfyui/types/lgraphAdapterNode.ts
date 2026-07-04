/**
 * LGraphNode Adapter 타입
 * 커스텀 노드 호환을 위한 LGraphNode 인터페이스 정의
 */

import type { ComfyWorkflowNode } from "./workflow"
import type { SubgraphModel } from "./subgraph"
import type { SubgraphId } from "../constants"

// ── Widget ────────────────────────────────────────────────────────

export type WidgetValue = string | number | boolean

export interface LGraphWidget {
  type: string
  name: string
  value: WidgetValue
  element: HTMLElement
  options: Record<string, unknown>
  callback: ((value: WidgetValue) => void) | null
}

// ── Node slots ────────────────────────────────────────────────────

export interface LGraphNodeSlotInput {
  name: string
  type: string
  link: number | null
  localized_name?: string
  widget?: { name: string } | null
}

export interface LGraphNodeSlotOutput {
  name: string
  type: string
  links: number[] | null
  localized_name?: string
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
  properties_info?: Record<string, Record<string, unknown>>
  flags?: Record<string, unknown>

  // Subgraph support
  /** SubgraphNode 인스턴스인지 확인 (type이 SubgraphId인 경우 true) */
  isSubgraphNode?(): this is LGraphNode & { subgraph: SubgraphModel }
  /** SubgraphNode 인스턴스가 참조하는 블루프린트 (일반 노드는 undefined) */
  subgraph?: SubgraphModel
  /** 이 노드가 소속된 그래프 ID (루트=null, 서브그래프=SubgraphId) */
  graphId?: SubgraphId | null

  // Methods
  addInput(name: string, type: string): void
  addOutput(name: string, type: string): void
  computeSize(minWidth?: number): [number, number]
  expandToFitContent(): void
  setSize(size: [number, number]): void
  setPos(x: number | [number, number], y?: number): void
  move(deltaX: number, deltaY: number): void
  snapToGrid(): void
  alignToGrid(): void
  getTitle(): string
  serialize(): Record<string, unknown>
  clone(): LGraphNode
  connect(
    slot: number,
    node: LGraphNode,
    inputSlot: number | string
  ): boolean | null
  disconnectInput(slot: number): void
  disconnectOutput(slot: number): void
  configure(data: ComfyWorkflowNode): void
  onNodeCreated?(): void
  addProperty(
    name: string,
    defaultValue: unknown,
    type?: string,
    extraInfo?: Record<string, unknown>
  ): void
  setProperty(name: string, value: unknown): void
  getProperty(name: string): unknown
  getPropertyInfo(name: string): Record<string, unknown> | undefined
  removeProperty(name: string): void
  addCustomWidget<TWidget extends LGraphWidget>(customWidget: TWidget): TWidget
  removeWidget(widgetOrSlot: LGraphWidget | number): void
  ensureWidgetRemoved(widget: LGraphWidget): void
  findInputSlot(name: string, returnObj?: false): number
  findInputSlot(name: string, returnObj: true): LGraphNodeSlotInput | undefined
  findOutputSlot(name: string, returnObj?: false): number
  findOutputSlot(
    name: string,
    returnObj: true
  ): LGraphNodeSlotOutput | undefined
  getInputInfo(slot: number): LGraphNodeSlotInput | null
  getOutputInfo(slot: number): LGraphNodeSlotOutput | null
  isInputConnected(slot: number): boolean
  isOutputConnected(slot: number): boolean
  isAnyOutputConnected(): boolean
  removeInput(slot: number): void
  removeOutput(slot: number): void
  getInputLink(slot: number): LLink | null
  getInputNode(slot: number): LGraphNode | null
  getOutputNodes(slot: number): LGraphNode[] | null
  getInputData(slot?: number, forceUpdate?: boolean): unknown
  getInputDataByName(slotName?: string, forceUpdate?: boolean): unknown
  setOutputData(slot?: number, data?: unknown): void
  getOutputData(slot?: number): unknown
  setOutputDataType(slot: number, type: string): void
  getInputDataType(slot: number): string | undefined
  getInputOrProperty(name: string): unknown
  findInputSlotFree(): number
  findOutputSlotFree(): number
  findInputSlotByType(type: string): number
  findOutputSlotByType(type: string): number
  findSlotByType(input: boolean, type: string): number
  findConnectByTypeSlot(type: string, isOutput?: boolean): number
  findInputByType(type: string): LGraphNodeSlotInput | null
  findOutputByType(type: string): LGraphNodeSlotOutput | null
  canConnectTo(
    slot: number,
    targetNode: LGraphNode,
    targetSlot: number
  ): boolean
  connectByType(
    slot: number,
    targetNode: LGraphNode,
    targetType: string
  ): boolean | null
  connectByTypeOutput(
    targetType: string,
    targetNode: LGraphNode,
    targetSlot: number
  ): boolean | null
  getSlotFromWidget(widget: LGraphWidget): number
  getWidgetFromSlot(slot: number): LGraphWidget | undefined
  addTitleButton(name: string, label: string, callback?: () => void): unknown
  onTitleButtonClick(name: string): void
  collapse(force?: boolean): void
  toggleAdvanced(): void
  pin(): void
  unpin(): void
  loadImage(url: string): HTMLImageElement
  trace(...args: unknown[]): void
  addWidget(
    type: string,
    name: string,
    value: WidgetValue,
    callback: (v: WidgetValue) => void,
    options?: Record<string, unknown>
  ): LGraphWidget
  addDOMWidget(
    name: string,
    type: string,
    element: HTMLElement,
    options?: {
      getValue?: () => WidgetValue
      setValue?: (v: WidgetValue) => void
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
  setDirtyCanvas?(flag?: boolean, history?: boolean): void
}
