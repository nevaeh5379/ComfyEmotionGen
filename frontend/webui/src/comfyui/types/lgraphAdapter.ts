/**
 * LGraph Adapter 타입
 * 커스텀 노드 호환을 위한 LGraph 인터페이스 정의
 * ComfyUI_frontend: src/lib/litegraph/src/LGraph.ts
 */

import type { ComfyWorkflowJSON, ComfyWorkflowLink } from "./workflow"
import type { LGraphNode } from "./lgraphAdapterNode"
import type { SubgraphModel } from "./subgraph"
import type { SubgraphId } from "../constants"

// ── Graph State ───────────────────────────────────────────────────

export interface LGraphStateData {
  lastNodeId: number
  lastLinkId: number
  lastGroupId: number
  lastRerouteId: number
  lastSubgraphId: number
}

// ── Graph Config ──────────────────────────────────────────────────

export interface LGraphConfigData {
  align_to_grid?: boolean
  links_ontop?: boolean
}

// ── Graph Extra ───────────────────────────────────────────────────

export type LGraphExtraData = Record<string, unknown>

// ── Callbacks ─────────────────────────────────────────────────────

export type GraphNodeCallback = (node: LGraphNode) => void
export type GraphChangeCallback = (
  graph: LGraphAdapterForwardRef,
  info?: LGraphNode | null
) => void
export type GraphSerializeCallback = (data: ComfyWorkflowJSON) => void
export type GraphConfigureCallback = (data: ComfyWorkflowJSON) => void

// ── Event types (future: subgraph, slot events) ──────────────────

export interface LGraphEventMap {
  configuring: { data: ComfyWorkflowJSON; clearGraph: boolean }
  configured: never
  "node:property:changed": {
    nodeId: number
    property: string
    oldValue: unknown
    newValue: unknown
  }
  "subgraph-created": { subgraph: SubgraphModel; data: unknown }
  "convert-to-subgraph": {
    subgraph: SubgraphModel
    bounds: [number, number, number, number]
  }
  "open-subgraph": { subgraph: SubgraphModel; fromNodeId: number }
}

export type LGraphEventType = keyof LGraphEventMap

// ── LGraphAdapter public interface ────────────────────────────────

export interface LGraphAdapterInterface {
  // Identity
  id: string
  revision: number
  status: number

  // Data containers
  readonly nodes: LGraphNode[]
  readonly links: Map<number, ComfyWorkflowLink> &
    Record<number, ComfyWorkflowLink>
  readonly groups: unknown[] // LGraphGroup[] support
  readonly reroutes: Map<number, never> // TODO: Reroute support
  readonly floatingLinks: ReadonlyMap<number, never> // TODO: Floating link support
  readonly subgraphs: Map<SubgraphId, SubgraphModel> // Subgraph blueprint registry (루트 그래프가 소유)

  // State
  state: LGraphStateData
  config: LGraphConfigData
  extra: LGraphExtraData
  vars: Record<string, unknown>

  // Computed
  readonly empty: boolean

  // Methods - Node management
  add(nodeOrGroup: LGraphNode): void
  remove(node: LGraphNode): void
  getNodeById(id: number | string): LGraphNode | null
  clear(): void

  // Methods - Link management
  getLink(id: number): ComfyWorkflowLink | undefined
  removeLink(id: number): void

  // Methods - Search
  findNodesByType(type: string): LGraphNode[]
  findNodesByTitle(title: string): LGraphNode[]

  // Methods - Serialization
  serialize(): ComfyWorkflowJSON
  configure(data: ComfyWorkflowJSON, keep_old?: boolean): void

  // Methods - Change tracking
  beforeChange(info?: LGraphNode): void
  afterChange(info?: LGraphNode | null): void
  incrementVersion(): void

  // Methods - Canvas
  setDirtyCanvas(_flag: boolean, _history?: boolean): void

  // Methods - Execution (noop stubs)
  updateExecutionOrder(): void
  computeExecutionOrder(): void

  // Callbacks
  onNodeAdded?: GraphNodeCallback
  onNodeRemoved?: GraphNodeCallback
  onBeforeChange?: GraphChangeCallback
  onAfterChange?: GraphChangeCallback
  onConfigure?: GraphConfigureCallback
  onSerialize?: GraphSerializeCallback

  // Events (stub, future: subgraph, slot events)
  readonly events: LGraphEventsStub
}

// ── Events stub ───────────────────────────────────────────────────

export interface LGraphEventsStub {
  addEventListener<T extends LGraphEventType>(
    type: T,
    listener: (event: CustomEvent<LGraphEventMap[T]>) => void
  ): void
  removeEventListener<T extends LGraphEventType>(
    type: T,
    listener: (event: CustomEvent<LGraphEventMap[T]>) => void
  ): void
  dispatch<T extends LGraphEventType>(
    type: T,
    detail: LGraphEventMap[T]
  ): boolean
}

// Forward declaration for callback types
export interface LGraphAdapterForwardRef {
  getNodeById(id: number | string): LGraphNode | null
  nodes: LGraphNode[]
}
