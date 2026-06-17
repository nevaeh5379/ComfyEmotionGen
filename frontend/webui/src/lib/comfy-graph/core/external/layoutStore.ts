export enum LayoutSource {
  Canvas = 'canvas',
  Vue = 'vue',
  DOM = 'dom',
  External = 'external'
}

// Locally defined geometric and layout types to ensure self-contained type safety
export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export type NodeId = string | number
export type LinkId = number
export type RerouteId = number

export interface NodeLayout {
  id: NodeId
  position: Point
  size: Size
  zIndex: number
  visible: boolean
  bounds: Bounds
}

export interface SlotLayout {
  nodeId: NodeId
  index: number
  type: 'input' | 'output'
  position: Point
  bounds: Bounds
}

export interface LinkLayout {
  id: LinkId
  path?: Path2D
  bounds: Bounds
  centerPos: Point
  sourceNodeId: NodeId
  targetNodeId: NodeId
  sourceSlot: number
  targetSlot: number
}

export interface LinkSegmentLayout {
  linkId: LinkId
  rerouteId: RerouteId | null
  path?: Path2D
  bounds: Bounds
  centerPos: Point
}

export interface RerouteLayout {
  id: RerouteId
  position: Point
  radius?: number
  bounds: Bounds
}

export type LayoutOperation = any
export type LayoutChange = any

// Geometry Helpers
function pointInBounds(p: Point, b: Bounds): boolean {
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height
}

export class InMemoryLayoutStore {
  private nodes = new Map<NodeId, NodeLayout>()
  private links = new Map<LinkId, LinkLayout>()
  private linkSegments = new Map<string, LinkSegmentLayout>()
  private slots = new Map<string, SlotLayout>()
  private reroutes = new Map<RerouteId, RerouteLayout>()

  private nodeRefs = new Map<NodeId, { value: NodeLayout | null }>()
  private allNodesRef = { value: new Map<NodeId, NodeLayout>() }
  private versionRef = { value: 0 }

  private source: LayoutSource = LayoutSource.Canvas
  private actor: string = 'user'

  // Vue reactive bindings (reused in React stubs)
  public isDraggingVueNodes = { value: false }
  public isResizingVueNodes = { value: false }
  public pendingSlotSync = false
  public vueNodesMode = false

  getNodeLayoutRef(nodeId: NodeId) {
    let ref = this.nodeRefs.get(nodeId)
    if (!ref) {
      ref = { value: this.nodes.get(nodeId) || null }
      this.nodeRefs.set(nodeId, ref)
    }
    return ref
  }

  getNodesInBounds(bounds: Bounds) {
    const list: NodeId[] = []
    for (const [id, node] of this.nodes) {
      if (
        node.bounds.x + node.bounds.width >= bounds.x &&
        node.bounds.x <= bounds.x + bounds.width &&
        node.bounds.y + node.bounds.height >= bounds.y &&
        node.bounds.y <= bounds.y + bounds.height
      ) {
        list.push(id)
      }
    }
    return { value: list }
  }

  getAllNodes() {
    this.allNodesRef.value = this.nodes
    return this.allNodesRef
  }

  getVersion() {
    return this.versionRef
  }

  queryNodeAtPoint(point: Point): NodeId | null {
    let highestZNodeId: NodeId | null = null
    let maxZ = -Infinity
    for (const [id, node] of this.nodes) {
      if (pointInBounds(point, node.bounds)) {
        if (node.zIndex > maxZ) {
          maxZ = node.zIndex
          highestZNodeId = id
        }
      }
    }
    return highestZNodeId
  }

  queryNodesInBounds(bounds: Bounds): NodeId[] {
    return this.getNodesInBounds(bounds).value
  }

  queryLinkAtPoint(point: Point, ctx?: CanvasRenderingContext2D): LinkId | null {
    for (const [id, link] of this.links) {
      if (pointInBounds(point, link.bounds)) {
        if (ctx && link.path) {
          if (ctx.isPointInStroke(link.path, point.x, point.y)) {
            return id
          }
        } else {
          return id
        }
      }
    }
    return null
  }

  queryLinkSegmentAtPoint(
    point: Point,
    ctx?: CanvasRenderingContext2D
  ): { linkId: LinkId; rerouteId: RerouteId | null } | null {
    for (const [key, layout] of this.linkSegments) {
      if (
        point.x >= layout.bounds.x - 8 &&
        point.x <= layout.bounds.x + layout.bounds.width + 8 &&
        point.y >= layout.bounds.y - 8 &&
        point.y <= layout.bounds.y + layout.bounds.height + 8
      ) {
        if (ctx && layout.path) {
          if (ctx.isPointInStroke(layout.path, point.x, point.y)) {
            return { linkId: layout.linkId, rerouteId: layout.rerouteId }
          }
        } else {
          return { linkId: layout.linkId, rerouteId: layout.rerouteId }
        }
      }
    }
    return null
  }

  querySlotAtPoint(point: Point): SlotLayout | null {
    for (const slot of this.slots.values()) {
      if (pointInBounds(point, slot.bounds)) {
        return slot
      }
    }
    return null
  }

  queryRerouteAtPoint(point: Point): RerouteLayout | null {
    for (const layout of this.reroutes.values()) {
      const dx = point.x - layout.position.x
      const dy = point.y - layout.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= (layout.radius || 10)) {
        return layout
      }
    }
    return null
  }

  queryItemsInBounds(bounds: Bounds) {
    const nodes: NodeId[] = []
    const links: LinkId[] = []
    const slots: string[] = []
    const reroutes: RerouteId[] = []

    for (const [id, node] of this.nodes) {
      if (pointInBounds(node.position, bounds)) nodes.push(id)
    }
    for (const [id, link] of this.links) {
      if (pointInBounds(link.centerPos, bounds)) links.push(id)
    }
    for (const [key, slot] of this.slots) {
      if (pointInBounds(slot.position, bounds)) slots.push(key)
    }
    for (const [id, r] of this.reroutes) {
      if (pointInBounds(r.position, bounds)) reroutes.push(id)
    }

    return { nodes, links, slots, reroutes }
  }

  updateLinkLayout(linkId: LinkId, layout: LinkLayout): void {
    this.links.set(linkId, layout)
    this.triggerChange()
  }

  updateLinkSegmentLayout(
    linkId: LinkId,
    rerouteId: RerouteId | null,
    layout: Omit<LinkSegmentLayout, 'linkId' | 'rerouteId'>
  ): void {
    const key = `${linkId}:${rerouteId ?? 'final'}`
    this.linkSegments.set(key, { ...layout, linkId, rerouteId })
    this.triggerChange()
  }

  updateSlotLayout(key: string, layout: SlotLayout): void {
    this.slots.set(key, layout)
    this.triggerChange()
  }

  updateRerouteLayout(rerouteId: RerouteId, layout: RerouteLayout): void {
    this.reroutes.set(rerouteId, layout)
    this.triggerChange()
  }

  deleteLinkLayout(linkId: LinkId): void {
    this.links.delete(linkId)
    // Clear segments belonging to this link
    for (const [key] of this.linkSegments) {
      if (key.startsWith(`${linkId}:`)) {
        this.linkSegments.delete(key)
      }
    }
    this.triggerChange()
  }

  deleteLinkSegmentLayout(linkId: LinkId, rerouteId: RerouteId | null): void {
    const key = `${linkId}:${rerouteId ?? 'final'}`
    this.linkSegments.delete(key)
    this.triggerChange()
  }

  deleteSlotLayout(key: string): void {
    this.slots.delete(key)
    this.triggerChange()
  }

  deleteRerouteLayout(rerouteId: RerouteId): void {
    this.reroutes.delete(rerouteId)
    this.triggerChange()
  }

  clearAllSlotLayouts(): void {
    this.slots.clear()
    this.triggerChange()
  }

  getLinkLayout(linkId: LinkId): LinkLayout | null {
    return this.links.get(linkId) || null
  }

  getSlotLayout(key: string): SlotLayout | null {
    return this.slots.get(key) || null
  }

  getRerouteLayout(rerouteId: RerouteId): RerouteLayout | null {
    return this.reroutes.get(rerouteId) || null
  }

  getAllSlotKeys(): string[] {
    return Array.from(this.slots.keys())
  }

  applyOperation(operation: LayoutOperation): void {
    const timestamp = operation.timestamp || Date.now()
    if (operation.type === 'moveNode') {
      const node = this.nodes.get(operation.nodeId)
      if (node) {
        node.position = operation.position
        node.bounds = { ...node.bounds, ...operation.position }
        this.updateNodeRef(operation.nodeId, node)
      }
    } else if (operation.type === 'resizeNode') {
      const node = this.nodes.get(operation.nodeId)
      if (node) {
        node.size = operation.size
        node.bounds = { ...node.bounds, ...operation.size }
        this.updateNodeRef(operation.nodeId, node)
      }
    } else if (operation.type === 'batchUpdateBounds') {
      for (const update of operation.updates) {
        const node = this.nodes.get(update.nodeId)
        if (node) {
          node.bounds = update.bounds
          node.position = { x: update.bounds.x, y: update.bounds.y }
          node.size = { width: update.bounds.width, height: update.bounds.height }
          this.updateNodeRef(update.nodeId, node)
        }
      }
    } else if (operation.type === 'createNode') {
      const bounds = operation.bounds || { x: operation.position.x, y: operation.position.y, width: operation.size.width, height: operation.size.height }
      const nodeLayout: NodeLayout = {
        id: operation.nodeId,
        position: operation.position,
        size: operation.size,
        zIndex: operation.zIndex || 0,
        visible: operation.visible !== false,
        bounds
      }
      this.nodes.set(operation.nodeId, nodeLayout)
      this.updateNodeRef(operation.nodeId, nodeLayout)
    } else if (operation.type === 'deleteNode') {
      this.nodes.delete(operation.nodeId)
      const ref = this.nodeRefs.get(operation.nodeId)
      if (ref) ref.value = null
    } else if (operation.type === 'createReroute') {
      this.reroutes.set(operation.rerouteId, {
        id: operation.rerouteId,
        position: { x: operation.pos.x, y: operation.pos.y },
        radius: 10,
        bounds: { x: operation.pos.x - 10, y: operation.pos.y - 10, width: 20, height: 20 }
      })
    } else if (operation.type === 'deleteReroute') {
      this.reroutes.delete(operation.rerouteId)
    } else if (operation.type === 'moveReroute') {
      const r = this.reroutes.get(operation.rerouteId)
      if (r) {
        r.position = { x: operation.pos[0], y: operation.pos[1] }
        r.bounds = { x: operation.pos[0] - 10, y: operation.pos[1] - 10, width: 20, height: 20 }
      }
    } else if (operation.type === 'setNodeZIndex') {
      const nodeLayout = this.nodes.get(operation.nodeId)
      if (nodeLayout) {
        nodeLayout.zIndex = operation.zIndex
      }
    }
    this.triggerChange()
  }

  private updateNodeRef(nodeId: NodeId, node: NodeLayout) {
    const ref = this.nodeRefs.get(nodeId)
    if (ref) ref.value = node
  }

  private triggerChange() {
    this.versionRef.value++
  }

  onChange(callback: (change: LayoutChange) => void): () => void {
    return () => {}
  }

  onNodeChange(nodeId: NodeId, callback: (change: LayoutChange) => void): () => void {
    return () => {}
  }

  initializeFromLiteGraph(
    nodes: Array<{ id: string; pos: [number, number]; size: [number, number] }>
  ): void {
    this.nodes.clear()
    for (const n of nodes) {
      const nodeLayout: NodeLayout = {
        id: n.id,
        position: { x: n.pos[0], y: n.pos[1] },
        size: { width: n.size[0], height: n.size[1] },
        zIndex: 0,
        visible: true,
        bounds: { x: n.pos[0], y: n.pos[1], width: n.size[0], height: n.size[1] }
      }
      this.nodes.set(n.id, nodeLayout)
      this.updateNodeRef(n.id, nodeLayout)
    }
    this.triggerChange()
  }

  setSource(source: LayoutSource): void {
    this.source = source
  }

  setActor(actor: string): void {
    this.actor = actor
  }

  getCurrentSource(): LayoutSource {
    return this.source
  }

  getCurrentActor(): string {
    return this.actor
  }

  batchUpdateNodeBounds(
    updates: Array<{ nodeId: NodeId; bounds: Bounds }>
  ): void {
    for (const update of updates) {
      const node = this.nodes.get(update.nodeId)
      if (node) {
        node.bounds = update.bounds
        node.position = { x: update.bounds.x, y: update.bounds.y }
        node.size = { width: update.bounds.width, height: update.bounds.height }
        this.updateNodeRef(update.nodeId, node)
      }
    }
    this.triggerChange()
  }
}

export const layoutStore = new InMemoryLayoutStore()
