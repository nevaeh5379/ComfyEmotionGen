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
import type { SubgraphModel } from "@/comfyui/types/subgraph"
import type { SubgraphId } from "@/comfyui/constants"
import { SUBGRAPH_INPUT_ID, SUBGRAPH_OUTPUT_ID } from "@/comfyui/constants"
import { findUsedSubgraphIds } from "@/comfyui/subgraph/subgraphUtils"
import type { SubgraphDefinition } from "@/comfyui/types/subgraph"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"

function normalizeSlotType(type: unknown): string {
  return Array.isArray(type) ? type.join(",") : String(type ?? "*")
}

function isValidSlotConnection(a: unknown, b: unknown): boolean {
  const left = normalizeSlotType(a).toUpperCase()
  const right = normalizeSlotType(b).toUpperCase()
  if (["*", "", "0", "ANY", "COMBO"].includes(left)) return true
  if (["*", "", "0", "ANY", "COMBO"].includes(right)) return true
  return left.split(",").some((type) => right.split(",").includes(type))
}

/**
 * MapProxyHandler: Map과 legacy bracket 접근(graph.links[id])을 동시에 지원
 */
function createMapProxy<T>(
  target: Map<number, T>
): Map<number, T> & Record<number, T> {
  const handler: ProxyHandler<Map<number, T>> = {
    get(map, prop) {
      if (
        typeof prop === "string" &&
        !Map.prototype.hasOwnProperty.call(Map.prototype, prop)
      ) {
        const numKey = Number(prop)
        if (!isNaN(numKey)) {
          const store = useReactGraphStore
          const link = store.getState().links.find((l) => l.id === numKey)
          if (link !== undefined) return link
        }
        const val = map.get(Number(prop))
        if (val !== undefined) return val
      }

      const store = useReactGraphStore
      const currentLinks = store.getState().links
      const dynamicMap = new Map(currentLinks.map((l) => [l.id, l]))

      // If it's a method on Map (like get, has, etc.), we want to invoke it on the dynamic map
      const val = Reflect.get(dynamicMap, prop) as unknown
      if (typeof val === "function") {
        return (val as (...args: unknown[]) => unknown).bind(dynamicMap)
      }
      return val
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
        const numKey = Number(prop)
        if (!isNaN(numKey)) {
          const store = useReactGraphStore
          return store.getState().links.some((l) => l.id === numKey)
        }
        return map.has(Number(prop))
      }
      return Reflect.has(map, prop)
    },
    ownKeys(_map): string[] {
      const store = useReactGraphStore
      return store.getState().links.map((l) => String(l.id))
    },
    getOwnPropertyDescriptor(target, prop): PropertyDescriptor | undefined {
      if (typeof prop === "string") {
        const numKey = Number(prop)
        const store = useReactGraphStore
        const link = store.getState().links.find((l) => l.id === numKey)
        if (link) {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: link,
          }
        }
      }
      return undefined
    },
  }
  return new Proxy(target, handler) as Map<number, T> & Record<number, T>
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
  public links: Map<number, ComfyWorkflowLink> &
    Record<number, ComfyWorkflowLink>

  // LGraphGroup[] support
  public get groups(): any[] {
    const store = useReactGraphStore
    const state = store.getState()
    const activeId = state.activeGraphId
    const activeGroups = state.groups.filter((g) =>
      activeId === null
        ? g.graphId === null || g.graphId === undefined
        : g.graphId === activeId
    )
    return activeGroups.map((g) => {
      const group: any = {
        id: g.id,
        title: g.title,
        color: g.color,
        fontSize: g.fontSize,
        locked: g.locked,
        graph: this,
        nodes: [],
        _children: new Set(),
        pos: [g.bounding[0], g.bounding[1]],
        size: [g.bounding[2], g.bounding[3]],
        _pos: [g.bounding[0], g.bounding[1]],
        _bounding: [g.bounding[0], g.bounding[1], g.bounding[2], g.bounding[3]],
        get bounding() {
          return g.bounding
        },
        set bounding(v: [number, number, number, number]) {
          store.getState().updateGroupBounding(g.id, v)
          this.pos = [v[0], v[1]]
          this.size = [v[2], v[3]]
          this._pos = [v[0], v[1]]
          this._bounding = [v[0], v[1], v[2], v[3]]
        },
        configure(o: any) {
          g.title = o.title ?? g.title
          this.bounding =
            o.bounding ??
            (Array.isArray(o.pos) && Array.isArray(o.size)
              ? [o.pos[0], o.pos[1], o.size[0], o.size[1]]
              : g.bounding)
          g.color = o.color ?? g.color
          g.fontSize = o.fontSize ?? g.fontSize
          g.locked = o.locked ?? g.locked
        },
        serialize() {
          return {
            id: g.id,
            title: g.title,
            bounding: g.bounding,
            color: g.color,
            fontSize: g.fontSize,
            locked: g.locked,
          }
        },
        recomputeInsideNodes() {},
        resizeTo() {},
      }
      return group
    })
  }
  public get _groups(): any[] {
    return this.groups
  }
  // TODO: Reroute support
  public readonly reroutes: Map<number, never> = new Map<number, never>()
  // TODO: Floating link support
  public readonly floatingLinks: ReadonlyMap<number, never> = new Map<
    number,
    never
  >()
  // Subgraph blueprint registry - reactGraphStore.subgraphs와 동기화 (getter로 위임)
  public readonly subgraphs: Map<SubgraphId, SubgraphModel> = new Map<
    SubgraphId,
    SubgraphModel
  >()

  // ── State ───────────────────────────────────────────────────────
  public state: LGraphStateData = {
    lastNodeId: 0,
    lastLinkId: 0,
    lastGroupId: 0,
    lastRerouteId: 0,
    lastSubgraphId: 0,
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
  /** Live node instances with real DOM widget elements, keyed by node id. */
  private _liveNodes = new Map<number, LGraphNode>()
  private _isRefreshingLiveNode = false

  constructor() {
    this.links = createMapProxy<ComfyWorkflowLink>(new Map())
    if ((window as any).LGraph) {
      const proto = Object.getPrototypeOf(this)
      if (Object.getPrototypeOf(proto) !== (window as any).LGraph.prototype) {
        Object.setPrototypeOf(proto, (window as any).LGraph.prototype)
      }
    }
  }

  // ── Computed getters ────────────────────────────────────────────

  /** Zustand store에서 현재 nodes를 읽습니다. */
  public get nodes(): LGraphNode[] {
    const store = useReactGraphStore
    return store
      .getState()
      .nodes.map((n: ComfyWorkflowNode) => {
        const liveNode = this._liveNodes.get(n.id)
        if (liveNode !== undefined) return this.ensureLiveNodeReady(liveNode)
        return this.materializeLiveNode(n) ?? this.wrapNode(n)
      })
  }

  public get _nodes(): LGraphNode[] {
    const store = useReactGraphStore
    return store
      .getState()
      .nodes.map(
        (n: ComfyWorkflowNode) => this._liveNodes.get(n.id) ?? this.wrapNode(n)
      )
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

    // Always store the live node so getNodeById returns real DOM widget elements,
    // even if the workflow node already exists in the Zustand store.
    const linkedNode = this.linkNodeToGraph(nodeOrGroup, this)
    this._liveNodes.set(linkedNode.id, linkedNode)

    if (
      !currentState.nodes.some(
        (n: ComfyWorkflowNode) => n.id === nodeOrGroup.id
      )
    ) {
      const workflowNode: ComfyWorkflowNode = {
        id: linkedNode.id,
        type: linkedNode.type ?? "",
        pos: linkedNode.pos,
        size: linkedNode.size,
        inputs:
          linkedNode.inputs.length > 0
            ? linkedNode.inputs.map((i) => ({
                name: i.name,
                type: i.type,
                link: i.link ?? undefined,
              }))
            : undefined,
        outputs:
          linkedNode.outputs.length > 0
            ? linkedNode.outputs.map((o, idx: number) => ({
                name: o.name,
                type: o.type,
                links: o.links ?? undefined,
                slot_index: idx,
              }))
            : undefined,
        widgets_values:
          (linkedNode.widgets?.length ?? 0) > 0
            ? (linkedNode.widgets ?? []).map((w) => w.value)
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
    }

    this.onNodeAdded?.(linkedNode)
    this.onAfterChange?.(this, linkedNode)
  }

  public remove(node: LGraphNode): void {
    const store = useReactGraphStore
    this._liveNodes.delete(node.id)
    this.onBeforeChange?.(this, node)
    store.getState().takeSnapshot()
    store.getState().removeNode(node.id)
    this.onNodeRemoved?.(node)
    this.onAfterChange?.(this, null)
  }

  public getNodeById(id: number | string): LGraphNode | null {
    const numId = typeof id === "string" ? Number(id) : id
    // Return the live node instance (with real DOM widget elements) if available.
    const liveNode = this._liveNodes.get(numId)
    if (liveNode) return liveNode
    const store = useReactGraphStore
    const node = store
      .getState()
      .nodes.find((n: ComfyWorkflowNode) => n.id === numId)
    if (node === undefined) return null
    return (
      (this._liveNodes.get(numId) !== undefined
        ? this.ensureLiveNodeReady(this._liveNodes.get(numId)!)
        : undefined) ??
      this.materializeLiveNode(node) ??
      this.wrapNode(node)
    )
  }

  public clear(): void {
    this._liveNodes.clear()
    const store = useReactGraphStore
    store.getState().takeSnapshot()
    store.setState({ nodes: [], links: [] })
    this.onAfterChange?.(this, null)
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
    return store
      .getState()
      .nodes.filter((n: ComfyWorkflowNode) => n.type === type)
      .map((n: ComfyWorkflowNode) => this.wrapNode(n))
  }

  public findNodesByTitle(title: string): LGraphNode[] {
    const store = useReactGraphStore
    return store
      .getState()
      .nodes.filter((n: ComfyWorkflowNode) => n.type === title)
      .map((n: ComfyWorkflowNode) => this.wrapNode(n))
  }

  // ── Serialization ───────────────────────────────────────────────

  public serialize(): ComfyWorkflowJSON {
    const store = useReactGraphStore
    const state = store.getState()

    // Subgraph definitions 직렬화 (사용되는 것만)
    const rootNodes = state.nodes.filter(
      (n: ComfyWorkflowNode) => n.graphId === null || n.graphId === undefined
    )
    const usedIds = findUsedSubgraphIds(
      rootNodes,
      state.subgraphs as unknown as Map<string, SubgraphDefinition>
    )
    const subgraphDefs: SubgraphDefinition[] = []
    for (const id of usedIds) {
      const model = state.subgraphs.get(id)
      if (!model) continue
      const innerNodes = state.nodes.filter(
        (n: ComfyWorkflowNode) => n.graphId === id
      )
      const innerLinks = state.links.filter(
        (l: ComfyWorkflowLink) =>
          l.origin_id === SUBGRAPH_INPUT_ID ||
          l.target_id === SUBGRAPH_OUTPUT_ID ||
          innerNodes.some(
            (n: ComfyWorkflowNode) =>
              n.id === l.origin_id || n.id === l.target_id
          )
      )
      const innerGroups = state.groups.filter((g: any) => g.graphId === id)
      subgraphDefs.push(
        model.asSerialisable(innerNodes, innerLinks, innerGroups)
      )
    }

    const rootGroups = state.groups.filter(
      (g: any) => g.graphId === null || g.graphId === undefined
    )

    const workflow: ComfyWorkflowJSON = {
      last_node_id: state.nodes.reduce(
        (max: number, n: ComfyWorkflowNode) => Math.max(max, n.id),
        0
      ),
      last_link_id: state.links.reduce(
        (max: number, l: ComfyWorkflowLink) => Math.max(max, l.id),
        0
      ),
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
        ...(n.graphId !== undefined ? { graphId: n.graphId } : {}),
      })),
      links: state.links.map((l: ComfyWorkflowLink) => ({
        id: l.id,
        origin_id: l.origin_id,
        origin_slot: l.origin_slot,
        target_id: l.target_id,
        target_slot: l.target_slot,
        type: l.type,
      })),
      groups: rootGroups.map((g: any) => ({
        id: g.id,
        title: g.title,
        bounding: g.bounding,
        color: g.color,
        fontSize: g.fontSize,
        locked: g.locked,
      })),
      version: 0.4,
    }
    if (subgraphDefs.length > 0) {
      workflow.definitions = { subgraphs: subgraphDefs }
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
    const liveWidgets: {
      type: string
      name: string
      value: string | number | boolean
      element: HTMLElement
      options: Record<string, unknown>
      callback: ((v: string | number | boolean) => void) | null
    }[] = []

    return {
      id: node.id,
      graph: this,
      title: node.type,
      type: node.type,
      color: node.color,
      bgcolor: node.bgcolor,
      get pos(): [number, number] {
        const current = store
          .getState()
          .nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        return current?.pos ?? node.pos
      },
      set pos(v: [number, number]) {
        store.getState().updateNodePos(node.id, v)
      },
      get size(): [number, number] {
        const current = store
          .getState()
          .nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        return current?.size ?? node.size
      },
      set size(v: [number, number]) {
        store.getState().updateNodeSize(node.id, v)
      },
      get inputs(): {
        name: string
        type: string
        link: number | null
        localized_name?: string
        widget?: { name: string } | null
      }[] {
        const current = store
          .getState()
          .nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        const nodeDef = useNodeDefStore.getState().getNodeDef(node.type ?? "") as any
        return (current?.inputs ?? []).map((i) => {
          const defInput = nodeDef?.inputs?.find((di: { name: string }) => di.name === i.name)
          return {
            name: i.name,
            type: i.type,
            link: i.link ?? null,
            localized_name: i.localized_name ?? defInput?.localized_name ?? i.name,
            widget: i.widget ? { name: i.widget.name } : null,
          }
        })
      },
      get outputs(): {
        name: string
        type: string
        links: number[] | null
        localized_name?: string
      }[] {
        const current = store
          .getState()
          .nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        const nodeDef = useNodeDefStore.getState().getNodeDef(node.type ?? "") as any
        return (current?.outputs ?? []).map((o) => {
          const defOutput = nodeDef?.outputs?.find((do_: { name: string }) => do_.name === o.name)
          return {
            name: o.name,
            type: o.type,
            links: o.links ?? null,
            localized_name: o.localized_name ?? defOutput?.localized_name ?? o.name,
          }
        })
      },
      get widgets():
        | {
            type: string
            name: string
            value: string | number | boolean
            element: HTMLElement
            options: Record<string, unknown>
            callback: ((v: string | number | boolean) => void) | null
          }[]
        | undefined {
        // Live widgets (created via addWidget/addCustomWidget/addDOMWidget)
        // take precedence — they mirror real ComfyUI node.widgets.
        if (liveWidgets.length > 0) {
          return [...liveWidgets]
        }
        // Fallback: project widgets from the store when live widgets haven't
        // been created yet (e.g. before addNodeWidgets runs).
        const current = store
          .getState()
          .nodes.find((n: ComfyWorkflowNode) => n.id === node.id)
        if (current?.widgets_values === undefined) return undefined
        const wv = current.widgets_values
        if (Array.isArray(wv)) {
          const widgetNames = (current.properties?.widget_names ?? []) as string[]
          const projected = wv.map((v: unknown, idx: number) => ({
            type: "text",
            name: widgetNames[idx] ?? `widget_${idx.toString()}`,
            value: v as string | number | boolean,
            element: document.createElement("div"),
            options: {},
            callback: null,
          }))
          return projected.length > 0 ? projected : undefined
        }
        if (wv !== null && typeof wv === "object") {
          const obj = wv as Record<string, unknown>
          const projected = Object.keys(obj).map((name) => ({
            type: "text",
            name,
            value: obj[name] as string | number | boolean,
            element: document.createElement("div"),
            options: {},
            callback: null,
          }))
          return projected.length > 0 ? projected : undefined
        }
        return undefined
      },
      mode: node.mode,
      order: node.order,
      properties: node.properties,
      properties_info: {},
      addInput(_name: string, _type: string): void {
        // intentional no-op
      },
      addOutput(_name: string, _type: string): void {
        // intentional no-op
      },
      computeSize(minWidth?: number): [number, number] {
        return [Math.max(minWidth ?? 200, node.size?.[0] ?? 200), node.size?.[1] ?? 80]
      },
      expandToFitContent(): void {
        // Store-backed nodes keep their explicit serialized size.
      },
      setSize(size: [number, number]): void {
        store.getState().updateNodeSize(node.id, size)
      },
      setPos(x: number | [number, number], y?: number): void {
        const pos: [number, number] = Array.isArray(x) ? [x[0], x[1]] : [x, y ?? node.pos[1]]
        store.getState().updateNodePos(node.id, pos)
      },
      move(deltaX: number, deltaY: number): void {
        store.getState().updateNodePos(node.id, [
          node.pos[0] + deltaX,
          node.pos[1] + deltaY,
        ])
      },
      getBounding(): [number, number, number, number] {
        return [node.pos[0], node.pos[1], node.size?.[0] ?? 0, node.size?.[1] ?? 0]
      },
      snapToGrid(): void {
        store.getState().updateNodePos(node.id, [
          Math.round(node.pos[0] / 10) * 10,
          Math.round(node.pos[1] / 10) * 10,
        ])
      },
      alignToGrid(): void {
        this.snapToGrid()
      },
      getTitle(): string {
        return this.title ?? this.type ?? ""
      },
      serialize(): Record<string, unknown> {
        return {
          id: node.id,
          type: node.type,
          title: node.type,
          pos: node.pos,
          size: node.size,
          mode: node.mode,
          order: node.order,
          properties: node.properties,
          widgets_values: node.widgets_values,
        }
      },
      clone(): LGraphNode {
        return {
          ...this,
          id: 0,
          graph: null,
          pos: [this.pos[0], this.pos[1]],
          size: [this.size[0], this.size[1]],
          inputs: this.inputs.map((input) => ({ ...input })),
          outputs: this.outputs.map((output) => ({
            ...output,
            links: output.links === null ? null : [...output.links],
          })),
          properties: { ...(this.properties ?? {}) },
        }
      },
      connect(
        slot: number,
        target: LGraphNode,
        targetSlot: number | string
      ): boolean | null {
        const numTargetSlot = typeof targetSlot === "string" ? 0 : targetSlot
        const originOutput = store
          .getState()
          .nodes.find((n: ComfyWorkflowNode) => n.id === node.id)?.outputs?.[
          slot
        ]
        const type = originOutput?.type ?? "*"
        store.getState().connect(node.id, slot, target.id, numTargetSlot, type)
        return true
      },
      disconnectInput(slot: number): void {
        const input = store
          .getState()
          .nodes.find((n: ComfyWorkflowNode) => n.id === node.id)?.inputs?.[
          slot
        ]
        if (input?.link !== undefined) {
          store.getState().disconnect(input.link)
        }
      },
      disconnectOutput(slot: number): void {
        const output = store
          .getState()
          .nodes.find((n: ComfyWorkflowNode) => n.id === node.id)?.outputs?.[
          slot
        ]
        if (output?.links) {
          for (const linkId of output.links) {
            store.getState().disconnect(linkId)
          }
        }
      },
      configure(data: ComfyWorkflowNode): void {
        const partialData = data as Partial<ComfyWorkflowNode>
        if (partialData.pos !== undefined)
          store.getState().updateNodePos(node.id, partialData.pos)
        if (partialData.size !== undefined)
          store.getState().updateNodeSize(node.id, partialData.size)
      },
      addProperty(
        name: string,
        defaultValue: unknown,
        type?: string,
        extraInfo?: Record<string, unknown>
      ): void {
        node.properties ??= {}
        if (!(name in node.properties)) {
          node.properties[name] = defaultValue
        }
        ;(this.properties_info ??= {})[name] = {
          name,
          default_value: defaultValue,
          type,
          ...(extraInfo ?? {}),
        }
      },
      setProperty(name: string, value: unknown): void {
        node.properties ??= {}
        node.properties[name] = value
      },
      getProperty(name: string): unknown {
        return node.properties?.[name]
      },
      getPropertyInfo(name: string): Record<string, unknown> | undefined {
        return this.properties_info?.[name]
      },
      removeProperty(name: string): void {
        if (node.properties !== undefined) delete node.properties[name]
        if (this.properties_info !== undefined) delete this.properties_info[name]
      },
      addCustomWidget<TWidget extends ReturnType<LGraphNode["addWidget"]>>(
        customWidget: TWidget
      ): TWidget {
        customWidget.options = {
          hideOnZoom: false,
          ...(customWidget.options ?? {}),
        }
        const existingIdx = liveWidgets.findIndex(
          (w) => w.name === (customWidget as { name?: string }).name
        )
        if (existingIdx >= 0) {
          liveWidgets[existingIdx] = customWidget as typeof liveWidgets[number]
        } else {
          liveWidgets.push(customWidget as typeof liveWidgets[number])
        }
        return customWidget
      },
      removeWidget(_widgetOrSlot: ReturnType<LGraphNode["addWidget"]> | number): void {
        // Store-backed wrapper widgets are projected from node.widgets_values.
      },
      ensureWidgetRemoved(_widget: ReturnType<LGraphNode["addWidget"]>): void {
        // Store-backed wrapper widgets are projected from node.widgets_values.
      },
      findInputSlot(
        name: string,
        returnObj?: boolean
      ): number | ReturnType<LGraphNode["getInputInfo"]> | undefined {
        const inputs = this.inputs
        const index = inputs.findIndex((input) => input.name === name)
        return returnObj === true ? inputs[index] : index
      },
      findOutputSlot(
        name: string,
        returnObj?: boolean
      ): number | ReturnType<LGraphNode["getOutputInfo"]> | undefined {
        const outputs = this.outputs
        const index = outputs.findIndex((output) => output.name === name)
        return returnObj === true ? outputs[index] : index
      },
      getInputInfo(slot: number): ReturnType<LGraphNode["getInputInfo"]> {
        return this.inputs[slot] ?? null
      },
      getOutputInfo(slot: number): ReturnType<LGraphNode["getOutputInfo"]> {
        return this.outputs[slot] ?? null
      },
      isInputConnected(slot: number): boolean {
        return this.inputs[slot]?.link != null
      },
      isOutputConnected(slot: number): boolean {
        const links = this.outputs[slot]?.links
        return Array.isArray(links) && links.length > 0
      },
      isAnyOutputConnected(): boolean {
        return this.outputs.some((_, index) => this.isOutputConnected(index))
      },
      removeInput(_slot: number): void {
        // Store-backed wrapper slots are projected from workflow nodes.
      },
      removeOutput(_slot: number): void {
        // Store-backed wrapper slots are projected from workflow nodes.
      },
      getInputLink(slot: number): ReturnType<LGraphNode["getInputLink"]> {
        const linkId = this.inputs[slot]?.link
        const graph = this.graph as
          | (LGraphAdapterRef & { links: Map<number, LLink> })
          | null
        if (linkId == null || graph === null) return null
        return graph.links.get(linkId) ?? null
      },
      getInputNode(slot: number): ReturnType<LGraphNode["getInputNode"]> {
        const link = this.getInputLink(slot)
        const graph = this.graph
        return link === null || graph === null
          ? null
          : graph.getNodeById(link.origin_id)
      },
      getOutputNodes(slot: number): ReturnType<LGraphNode["getOutputNodes"]> {
        const links = this.outputs[slot]?.links
        if (!Array.isArray(links) || links.length === 0) return null
        const graph = this.graph as
          | (LGraphAdapterRef & { links: Map<number, LLink> })
          | null
        if (graph === null) return null
        const nodes: LGraphNode[] = []
        for (const linkId of links) {
          const link = graph.links.get(linkId)
          if (link !== undefined) {
            const target = graph.getNodeById(link.target_id)
            if (target !== null) nodes.push(target)
          }
        }
        return nodes
      },
      getInputData(_slot?: number, _forceUpdate?: boolean): undefined {
        return undefined
      },
      getInputDataByName(_slotName?: string, _forceUpdate?: boolean): null {
        return null
      },
      setOutputData(): void {
        // No execution data is stored in the React graph adapter.
      },
      getOutputData(): undefined {
        return undefined
      },
      setOutputDataType(slot: number, type: string): void {
        if (this.outputs[slot] !== undefined) this.outputs[slot].type = type
      },
      getInputDataType(slot: number): string | undefined {
        return this.inputs[slot]?.type
      },
      getInputOrProperty(name: string): unknown {
        const inputSlot = this.findInputSlot(name) as number
        const inputData = inputSlot >= 0 ? this.getInputData(inputSlot) : undefined
        return inputData ?? this.properties?.[name]
      },
      findInputSlotFree(): number {
        return this.inputs.findIndex((input) => input.link == null)
      },
      findOutputSlotFree(): number {
        return this.outputs.findIndex(
          (output) => !Array.isArray(output.links) || output.links.length === 0
        )
      },
      findInputSlotByType(type: string): number {
        return this.inputs.findIndex((input) =>
          isValidSlotConnection(input.type, type)
        )
      },
      findOutputSlotByType(type: string): number {
        return this.outputs.findIndex((output) =>
          isValidSlotConnection(output.type, type)
        )
      },
      findSlotByType(input: boolean, type: string): number {
        return input ? this.findInputSlotByType(type) : this.findOutputSlotByType(type)
      },
      findConnectByTypeSlot(type: string, isOutput = true): number {
        return isOutput ? this.findOutputSlotByType(type) : this.findInputSlotByType(type)
      },
      findInputByType(type: string): ReturnType<LGraphNode["findInputByType"]> {
        const slot = this.findInputSlotByType(type)
        return slot >= 0 ? this.inputs[slot] ?? null : null
      },
      findOutputByType(type: string): ReturnType<LGraphNode["findOutputByType"]> {
        const slot = this.findOutputSlotByType(type)
        return slot >= 0 ? this.outputs[slot] ?? null : null
      },
      canConnectTo(slot: number, targetNode: LGraphNode, targetSlot: number): boolean {
        return isValidSlotConnection(
          this.outputs[slot]?.type,
          targetNode.inputs[targetSlot]?.type
        )
      },
      connectByType(
        slot: number,
        targetNode: LGraphNode,
        targetType: string
      ): boolean | null {
        const targetSlot = targetNode.findInputSlotByType(targetType)
        return targetSlot >= 0 ? this.connect(slot, targetNode, targetSlot) : false
      },
      connectByTypeOutput(
        targetType: string,
        targetNode: LGraphNode,
        targetSlot: number
      ): boolean | null {
        const outputSlot = this.findOutputSlotByType(targetType)
        return outputSlot >= 0
          ? this.connect(outputSlot, targetNode, targetSlot)
          : false
      },
      getSlotFromWidget(widget: ReturnType<LGraphNode["addWidget"]>): number {
        return this.widgets?.indexOf(widget) ?? -1
      },
      getWidgetFromSlot(slot: number): ReturnType<LGraphNode["getWidgetFromSlot"]> {
        return this.widgets?.[slot]
      },
      addTitleButton(
        name: string,
        label: string,
        callback?: () => void
      ): unknown {
        const record = this as LGraphNode & { title_buttons?: unknown[] }
        record.title_buttons ??= []
        const button = { name, label, callback }
        record.title_buttons.push(button)
        return button
      },
      onTitleButtonClick(name: string): void {
        const record = this as LGraphNode & { title_buttons?: unknown[] }
        const button = record.title_buttons?.find(
          (item) => (item as { name?: string }).name === name
        ) as { callback?: () => void } | undefined
        button?.callback?.()
      },
      collapse(force?: boolean): void {
        this.flags ??= {}
        this.flags.collapsed = force ?? !this.flags.collapsed
      },
      toggleAdvanced(): void {
        this.flags ??= {}
        this.flags.advanced = !this.flags.advanced
      },
      pin(): void {
        this.flags ??= {}
        this.flags.pinned = true
      },
      unpin(): void {
        this.flags ??= {}
        this.flags.pinned = false
      },
      loadImage(url: string): HTMLImageElement {
        const img = new Image()
        img.src = url
        return img
      },
      trace(...args: unknown[]): void {
        console.debug("[LGraphAdapterNode]", ...args)
      },
      addWidget(
        type: string,
        name: string,
        value: string | number | boolean,
        callback: (v: string | number | boolean) => void,
        options?: Record<string, unknown>
      ): ReturnType<LGraphNode["addWidget"]> {
        const w = {
          type,
          name,
          value,
          element: document.createElement("div"),
          options: options ?? {},
          callback,
        }
        const existingIdx = liveWidgets.findIndex((lw) => lw.name === name)
        if (existingIdx >= 0) {
          liveWidgets[existingIdx] = w
        } else {
          liveWidgets.push(w)
        }
        return w
      },
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
      ): {
        type: string
        name: string
        value: string | number | boolean
        element: HTMLElement
        options: Record<string, unknown>
        callback: ((v: string | number | boolean) => void) | null
      } {
        const opts = options ?? {}
        const w = {
          type,
          name,
          element,
          options: { hideOnZoom: false, ...opts },
          value: opts.getValue ? String(opts.getValue()) : "",
          callback: null as ((v: string | number | boolean) => void) | null,
        }
        let _value: unknown = w.value
        Object.defineProperty(w, "value", {
          get(): unknown {
            return typeof opts.getValue === "function"
              ? opts.getValue()
              : _value
          },
          set(v: unknown): void {
            _value = v
            if (typeof opts.setValue === "function") {
              opts.setValue(v)
            }
          },
          configurable: true,
          enumerable: true,
        })
        const existingIdx = liveWidgets.findIndex((lw) => lw.name === name)
        if (existingIdx >= 0) {
          liveWidgets[existingIdx] = w
        } else {
          liveWidgets.push(w)
        }
        return w
      },
      setDirtyCanvas(): void {
        // intentional no-op
      },
    } as LGraphNode
  }

  private materializeLiveNode(node: ComfyWorkflowNode): LGraphNode | null {
    const liteGraph = (window as any).LiteGraph
    if (typeof liteGraph?.createNode !== "function") return null
    const liveNode = liteGraph.createNode(node.type) as LGraphNode | null
    if (liveNode === null) return null
    liveNode.id = node.id
    liveNode.pos = node.pos
    liveNode.size = node.size
    liveNode.mode = node.mode
    liveNode.order = node.order
    liveNode.color = node.color
    liveNode.bgcolor = node.bgcolor
    liveNode.properties = { ...(node.properties ?? {}) }
    this.linkNodeToGraph(liveNode, this)
    if (typeof liveNode.configure === "function") {
      liveNode.configure(node)
    }
    this._liveNodes.set(node.id, liveNode)
    ;(liveNode as { onAdded?: (graph: LGraphAdapterRef) => void }).onAdded?.(
      this
    )
    return this.ensureLiveNodeReady(liveNode)
  }

  private ensureLiveNodeReady(node: LGraphNode): LGraphNode {
    const fastGroupNode = node as LGraphNode & {
      refreshWidgets?: () => void
      widgets?: unknown[]
    }
    if (
      !this._isRefreshingLiveNode &&
      typeof fastGroupNode.refreshWidgets === "function" &&
      (fastGroupNode.widgets?.length ?? 0) === 0
    ) {
      this._isRefreshingLiveNode = true
      try {
        fastGroupNode.refreshWidgets()
      } finally {
        this._isRefreshingLiveNode = false
      }
    }
    return node
  }

  private linkNodeToGraph(
    node: LGraphNode,
    graph: LGraphAdapterRef
  ): LGraphNode {
    ;(node as { graph: LGraphAdapterRef }).graph = graph
    const nodeWithBounding = node as LGraphNode & {
      getBounding?: () => [number, number, number, number]
    }
    nodeWithBounding.getBounding ??= (): [number, number, number, number] => [
      node.pos?.[0] ?? 0,
      node.pos?.[1] ?? 0,
      node.size?.[0] ?? 0,
      node.size?.[1] ?? 0,
    ]
    this._linkedNodes.add(node)
    return node
  }

  private rebuildLinksFromState(state: {
    links: ComfyWorkflowLink[]
  }): ComfyWorkflowLink[] {
    return state.links
  }

  private updateStateFromStore(): void {
    const store = useReactGraphStore
    const state = store.getState()
    this.state.lastNodeId = state.nodes.reduce(
      (max: number, n: ComfyWorkflowNode) => Math.max(max, n.id),
      0
    )
    this.state.lastLinkId = state.links.reduce(
      (max: number, l: ComfyWorkflowLink) => Math.max(max, l.id),
      0
    )
  }
}

interface LGraphAdapterRef {
  getNodeById(id: number | string): LGraphNode | null
  nodes: LGraphNode[]
  add(node: LGraphNode): void
  remove(node: LGraphNode): void
}
