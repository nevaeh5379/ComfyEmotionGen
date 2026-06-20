/**
 * LGraph Adapter
 * Zustand store를 backing store로 사용하여 커스텀 노드 호환 LGraph API 제공
 * ComfyUI_frontend: src/lib/litegraph/src/LGraph.ts 기반
 */

import type {
  LGraphAdapterInterface,
  LGraphStateData,
  LGraphConfigData,
  LGraphExtraData,
  LGraphEventType,
  LGraphEventMap,
  LGraphEventsStub,
  GraphNodeCallback,
  GraphChangeCallback,
  GraphSerializeCallback,
  GraphConfigureCallback,
} from "@/comfyui/types/lgraphAdapter"
import type { LGraphNode } from "@/comfyui/types/lgraphAdapterNode"
import type {
  ComfyWorkflowJSON,
  ComfyWorkflowLink,
  ComfyWorkflowNode,
} from "@/comfyui/types/workflow"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"

/**
 * MapProxyHandler: Map과 legacy bracket 접근(graph.links[id])을 동시에 지원
 */
function createMapProxy<T>(target: Map<number, T>): Map<number, T> & Record<number, T> {
  const handler: ProxyHandler<Map<number, T>> = {
    get(map, prop, receiver) {
      if (typeof prop === "string" && !Map.prototype.hasOwnProperty.call(Map.prototype, prop)) {
        const val = map.get(Number(prop))
        if (val !== undefined) return val
      }
      return Reflect.get(map, prop, receiver) as unknown
    },
    set(map, prop, value, receiver): boolean {
      if (typeof prop === "string") {
        map.set(Number(prop), value as T)
      } else {
        return Reflect.set(map, prop, value, receiver)
      }
      return true
    },
    deleteProperty(map, prop): boolean {
      if (typeof prop === "string") {
        return map.delete(Number(prop))
      }
      return Reflect.deleteProperty(map, prop)
    },
    has(map, prop): boolean {
      if (typeof prop === "string") {
        return map.has(Number(prop))
      }
      return Reflect.has(map, prop)
    },
    ownKeys(map): string[] {
      return Reflect.ownKeys(map) as string[]
    },
    getOwnPropertyDescriptor(target, prop): PropertyDescriptor | undefined {
      if (typeof prop === "string") {
        return {
          configurable: true,
          enumerable: true,
          get: () => target.get(Number(prop)),
          set: (v: T) => target.set(Number(prop), v),
        }
      }
      return Reflect.getOwnPropertyDescriptor(target, prop)
    },
  }
  return new Proxy(target, handler)
}

/**
 * LGraphEventsStub: 커스텀 이벤트 시스템 스텁
 * TODO: 실제 이벤트 디스패치 구현 (subgraph, slot events)
 */
class LGraphEventsStubImpl implements LGraphEventsStub {
  addEventListener<T extends LGraphEventType>(
    _type: T,
    _listener: (event: CustomEvent<LGraphEventMap[T]>) => void
  ): void {
    // TODO: 실제 이벤트 리스너 등록
  }

  removeEventListener<T extends LGraphEventType>(
    _type: T,
    _listener: (event: CustomEvent<LGraphEventMap[T]>) => void
  ): void {
    // TODO: 실제 이벤트 리스너 제거
  }

  dispatch<T extends LGraphEventType>(
    _type: T,
    _detail: LGraphEventMap[T]
  ): boolean {
    // TODO: 실제 이벤트 디스패치
    return true
  }
}

/**
 * LGraphAdapter
 * Zustand reactGraphStore를 backing store로 사용하여
 * 커스텀 노드가 기대하는 LGraph API를 제공합니다.
 */
export class LGraphAdapter implements LGraphAdapterInterface {
  // ── Identity ────────────────────────────────────────────────────
  public readonly id: string = "root"
  public revision = 0
  public status = 1 // STATUS_STOPPED

  // ── Data containers ────────────────────────────────────────────
  public links: Map<number, ComfyWorkflowLink> & Record<number, ComfyWorkflowLink>

  // TODO: LGraphGroup[] support
  public readonly groups: never[] = []
  // TODO: Reroute support
  public readonly reroutes: Map<number, never> = new Map<number, never>()
  // TODO: Floating link support
  public readonly floatingLinks: ReadonlyMap<number, never> = new Map<number, never>()
  // TODO: Subgraph support
  public readonly subgraphs: Map<string, never> = new Map<string, never>()

  // ── State ───────────────────────────────────────────────────────
  public state: LGraphStateData = {
    lastNodeId: 0,
    lastLinkId: 0,
    lastGroupId: 0,
    lastRerouteId: 0,
  }
  public config: LGraphConfigData = {}
  public extra: LGraphExtraData = {}
  public vars: Record<string, unknown> = {}

  // ── Events ──────────────────────────────────────────────────────
  public readonly events: LGraphEventsStub = new LGraphEventsStubImpl()

  // ── Callbacks ───────────────────────────────────────────────────
  public onNodeAdded?: GraphNodeCallback
  public onNodeRemoved?: GraphNodeCallback
  public onBeforeChange?: GraphChangeCallback
  public onAfterChange?: GraphChangeCallback
  public onConfigure?: GraphConfigureCallback
  public onSerialize?: GraphSerializeCallback

  // ── Internal ────────────────────────────────────────────────────
  private _linkedNodes = new WeakSet<LGraphNode>()

  constructor() {
    this.links = createMapProxy<ComfyWorkflowLink>(new Map())
  }

  // ── Computed getters ────────────────────────────────────────────

  /** Zustand store에서 현재 nodes를 읽습니다. */
  public get nodes(): LGraphNode[] {
    const store = useReactGraphStore
    return store.getState().nodes.map((n: ComfyWorkflowNode) => this.wrapNode(n))
  }

  /** 그래프가 비어있으면 true */
  public get empty(): boolean {
    const store = useReactGraphStore
    const state = store.getState()
    return state.nodes.length === 0 && state.links.length === 0
  }

  // ── Node management ────────────────────────────────────────────

  public add(nodeOrGroup: LGraphNode): void {
    const store = useReactGraphStore
    const currentState = store.getState()

    if (currentState.nodes.some((n: ComfyWorkflowNode) => n.id === nodeOrGroup.id)) {
      return
    }

    const linkedNode = this.linkNodeToGraph(nodeOrGroup, this)

    const workflowNode: ComfyWorkflowNode = {
      id: linkedNode.id,
      type: linkedNode.type ?? "",
      pos: linkedNode.pos,
      size: linkedNode.size,
      inputs: linkedNode.inputs.length > 0
        ? linkedNode.inputs.map((i) => ({
            name: i.name,
            type: i.type,
            link: i.link ?? undefined,
          }))
        : undefined,
      outputs: linkedNode.outputs.length > 0
        ? linkedNode.outputs.map((o, idx: number) => ({
            name: o.name,
            type: o.type,
            links: o.links ?? undefined,
            slot_index: idx,
          }))
        : undefined,
      widgets_values: (linkedNode.widgets?.length ?? 0) > 0
        ? linkedNode.widgets.map((w) => w.value)
        : undefined,
      properties: linkedNode.properties
        ? {
            ...linkedNode.properties,
            widget_names: linkedNode.widgets?.map((w) => w.name) ?? [],
          }
        : undefined,
      mode: linkedNode.mode,
      color: linkedNode.color,
      bgcolor: linkedNode.bgcolor,
    }

    store.getState().takeSnapshot()
    const currentNodes = store.getState().nodes
    const currentLinks = store.getState().links
    store.setState({
      nodes: [...currentNodes, workflowNode],
      links: currentLinks,
    })

    this.onNodeAdded?.(linkedNode)
    this.onAfterChange?.(this, linkedNode)
  }

  public remove(node: LGraphNode): void {
    const store = useReactGraphStore
    this.onBeforeChange?.(this, node)
    store.getState().takeSnapshot()
    store.getState().removeNode(node.id)
    this.onNodeRemoved?.(node)
    this.onAfterChange?.(this, null)
  }

  public getNodeById(id: number | string): LGraphNode | null {
    const store = useReactGraphStore
    const numId = typeof id === "string" ? Number(id) : id
    const node = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === numId)
    if (node === undefined) return null
    return this.wrapNode(node)
  }

  // ── Link management ────────────────────────────────────────────

  public getLink(id: number): ComfyWorkflowLink | undefined {
    const store = useReactGraphStore
    return store.getState().links.find((l: ComfyWorkflowLink) => l.id === id)
  }

  public removeLink(id: number): void {
    const store = useReactGraphStore
    this.onBeforeChange?.(this, null)
    store.getState().takeSnapshot()
    store.getState().disconnect(id)
    this.onAfterChange?.(this, null)
  }

  // ── Search ──────────────────────────────────────────────────────

  public findNodesByType(type: string): LGraphNode[] {
    const store = useReactGraphStore
    return store.getState().nodes
      .filter((n: ComfyWorkflowNode) => n.type === type)
      .map((n: ComfyWorkflowNode) => this.wrapNode(n))
  }

  public findNodesByTitle(title: string): LGraphNode[] {
    const store = useReactGraphStore
    return store.getState().nodes
      .filter((n: ComfyWorkflowNode) => n.type === title)
      .map((n: ComfyWorkflowNode) => this.wrapNode(n))
  }

  // ── Serialization ───────────────────────────────────────────────

  public serialize(): ComfyWorkflowJSON {
    const store = useReactGraphStore
    const state = store.getState()

    const workflow: ComfyWorkflowJSON = {
      last_node_id: state.nodes.reduce((max: number, n: ComfyWorkflowNode) => Math.max(max, n.id), 0),
      last_link_id: state.links.reduce((max: number, l: ComfyWorkflowLink) => Math.max(max, l.id), 0),
      nodes: state.nodes.map((n: ComfyWorkflowNode) => ({
        id: n.id,
        type: n.type,
        pos: n.pos,
        size: n.size,
        inputs: n.inputs,
        outputs: n.outputs,
        widgets_values: n.widgets_values,
        properties: n.properties,
        mode: n.mode,
        flags: n.flags,
        order: n.order,
        color: n.color,
        bgcolor: n.bgcolor,
      })),
      links: state.links.map((l: ComfyWorkflowLink) => ({
        id: l.id,
        origin_id: l.origin_id,
        origin_slot: l.origin_slot,
        target_id: l.target_id,
        target_slot: l.target_slot,
        type: l.type,
      })),
      version: 0.4,
    }

    this.onSerialize?.(workflow)
    return workflow
  }

  public configure(data: ComfyWorkflowJSON, keep_old?: boolean): void {
    this.onConfigure?.(data)
    if (keep_old !== true) {
      const store = useReactGraphStore
      store.getState().takeSnapshot()
    }
    const store = useReactGraphStore
    store.getState().setGraph(data)
    this.updateStateFromStore()
  }

  // ── Change tracking ────────────────────────────────────────────

  public beforeChange(info?: LGraphNode): void {
    this.onBeforeChange?.(this, info ?? null)
  }

  public afterChange(info?: LGraphNode | null): void {
    this.onAfterChange?.(this, info)
  }

  public incrementVersion(): void {
    this.revision++
  }

  // ── Canvas (noop) ──────────────────────────────────────────────

  public setDirtyCanvas(_flag: boolean, _history?: boolean): void {
    // No-op in React mode
  }

  // ── Execution (noop stubs) ──────────────────────────────────────

  public updateExecutionOrder(): void {
    // No-op in React mode
  }

  public computeExecutionOrder(): void {
    // No-op in React mode
  }

  // ── Internal helpers ───────────────────────────────────────────

  private wrapNode(node: ComfyWorkflowNode): LGraphNode {
    const store = useReactGraphStore

    return {
      id: node.id,
      graph: this,
      title: node.type,
      type: node.type,
      color: node.color,
      bgcolor: node.bgcolor,
      get pos(): [number, number] {
        const current = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        return current?.pos ?? node.pos
      },
      set pos(v: [number, number]) {
        store.getState().updateNodePos(node.id, v)
      },
      get size(): [number, number] {
        const current = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        return current?.size ?? node.size
      },
      set size(v: [number, number]) {
        store.getState().updateNodeSize(node.id, v)
      },
      get inputs(): { name: string; type: string; link: number | null; widget?: { name: string } | null }[] {
        const current = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        return (current?.inputs ?? []).map((i) => ({
          name: i.name,
          type: i.type,
          link: i.link ?? null,
          widget: i.widget ? { name: i.widget.name } : null,
        }))
      },
      get outputs(): { name: string; type: string; links: number[] | null }[] {
        const current = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        return (current?.outputs ?? []).map((o) => ({
          name: o.name,
          type: o.type,
          links: o.links ?? null,
        }))
      },
      get widgets(): {
        type: string
        name: string
        value: string | number | boolean
        element: HTMLElement
        options: Record<string, unknown>
        callback: ((v: string | number | boolean) => void) | null
      }[] | undefined {
        const current = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        if (current?.widgets_values === undefined) return undefined
        const widgetNames = (current.properties?.widget_names ?? []) as string[]
        return current.widgets_values.map((v: unknown, idx: number) => ({
          type: "text",
          name: widgetNames[idx] ?? `widget_${idx.toString()}`,
          value: v as string | number | boolean,
          element: document.createElement("div"),
          options: {},
          callback: null,
        }))
      },
      mode: node.mode,
      order: node.order,
      properties: node.properties,
      addInput(_name: string, _type: string): void {
        // intentional no-op
      },
      addOutput(_name: string, _type: string): void {
        // intentional no-op
      },
      connect(
        slot: number,
        target: LGraphNode,
        targetSlot: number | string
      ): boolean | null {
        const numTargetSlot = typeof targetSlot === "string" ? 0 : targetSlot
        const originOutput = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === node.id)?.outputs?.[slot]
        const type = originOutput?.type ?? "*"
        store.getState().connect(node.id, slot, target.id, numTargetSlot, type)
        return true
      },
      disconnectInput(slot: number): void {
        const input = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === node.id)?.inputs?.[slot]
        if (input?.link !== undefined) {
          store.getState().disconnect(input.link)
        }
      },
      disconnectOutput(slot: number): void {
        const output = store.getState().nodes.find((n: ComfyWorkflowNode) => n.id === node.id)?.outputs?.[slot]
        if (output?.links) {
          for (const linkId of output.links) {
            store.getState().disconnect(linkId)
          }
        }
      },
      configure(data: ComfyWorkflowNode): void {
        const partialData = data as Partial<ComfyWorkflowNode>
        if (partialData.pos !== undefined) store.getState().updateNodePos(node.id, partialData.pos)
        if (partialData.size !== undefined) store.getState().updateNodeSize(node.id, partialData.size)
      },
      addWidget(
        type: string,
        name: string,
        value: string | number | boolean,
        callback: (v: string | number | boolean) => void,
        options?: Record<string, unknown>
      ): ReturnType<LGraphNode["addWidget"]> {
        return {
          type,
          name,
          value,
          element: document.createElement("div"),
          options: options ?? {},
          callback,
        }
      },
      setDirtyCanvas(): void {
        // intentional no-op
      },
    } as LGraphNode
  }

  private linkNodeToGraph(node: LGraphNode, graph: LGraphAdapterRef): LGraphNode {
    ;(node as { graph: LGraphAdapterRef }).graph = graph
    this._linkedNodes.add(node)
    return node
  }

  private rebuildLinksFromState(state: { links: ComfyWorkflowLink[] }): ComfyWorkflowLink[] {
    return state.links
  }

  private updateStateFromStore(): void {
    const store = useReactGraphStore
    const state = store.getState()
    this.state.lastNodeId = state.nodes.reduce((max: number, n: ComfyWorkflowNode) => Math.max(max, n.id), 0)
    this.state.lastLinkId = state.links.reduce((max: number, l: ComfyWorkflowLink) => Math.max(max, l.id), 0)
  }
}

interface LGraphAdapterRef {
  getNodeById(id: number | string): LGraphNode | null
  nodes: LGraphNode[]
  add(node: LGraphNode): void
  remove(node: LGraphNode): void
}
