 
import { useEffect, useRef, useState, useCallback, type JSX } from "react"
// import "comfy-litegraph/public/css/litegraph.css"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { ComfyWorkflow } from "@/lib/workflow"
import { computeLayout } from "../utils/workflowGraphLayout"
import { getCategoryStyle } from "../utils/workflowGraphCategories"
window.LGraph ??= class DummyLGraph {
  readonly __dummy = true
  _nodes_by_id: Record<string, LGraphNode | undefined> = {}
  links: Map<number, LLink> | Record<number, LLink> = {}
  groups: LGraphGroup[] = []
  nodes: LGraphNode[] = []

  add(node: LGraphNode): void {
    if (!this.nodes.includes(node)) {
      this.nodes.push(node)
    }
    if (node.id) {
      this._nodes_by_id[String(node.id)] = node
    }
  }

  remove(node: LGraphNode): void {
    const idx = this.nodes.indexOf(node)
    if (idx !== -1) {
      this.nodes.splice(idx, 1)
    }
    if (node.id) {
      this._nodes_by_id[String(node.id)] = undefined
    }
  }

  clear(): void {
    this.nodes = []
    this._nodes_by_id = {}
    this.links = {}
    this.groups = []
  }

  getNodeById(id: number | string): LGraphNode | undefined {
    return this._nodes_by_id[String(id)]
  }

  setDirtyCanvas(_flag: boolean, _history?: boolean): void {
    /* noop */
  }
} as unknown as LGraphConstructor
const LGraph = window.LGraph

window.LGraphCanvas ??= class DummyLGraphCanvas {
  readonly __dummy = true
  state = { readOnly: false }
  resize(): void { /* noop */ }
  ds = { scale: 1, offset: [0, 0] as [number, number] }
  setDirty(): void { /* noop */ }
  stopRendering(): void { /* noop */ }
  startRendering(): void { /* noop */ }
  canvas: HTMLCanvasElement | null = null
  setCanvas(canvas: HTMLCanvasElement | string | null | undefined, _skip_events?: boolean): void {
    if (canvas !== null && canvas !== undefined && typeof canvas !== "string") {
      this.canvas = canvas
    }
  }
} as unknown as LGraphCanvasConstructor
const LGraphCanvas = window.LGraphCanvas

const LGraphNode = window.LGraphNode ?? class DummyLGraphNode {
  readonly __dummy = true
  id = 0
  type?: string
  color?: string
  bgcolor?: string
  pos: [number, number] = [0, 0]
  size: [number, number] = [0, 0]
  inputs: LGraphNodeInput[] = []
  outputs: LGraphNodeOutput[] = []
  widgets?: WidgetType[] = []

  constructor(type?: string) {
    if (type !== undefined) {
      this.type = type
    }
  }

  addInput(name: string, type: string): void {
    this.inputs.push({ name, type, link: null })
  }

  addOutput(name: string, type: string): void {
    this.outputs.push({ name, type, links: null })
  }

  connect(_slot: number, _targetNode: LGraphNode, _targetSlot: number | string): boolean | null {
    return true
  }

  configure(_data: unknown): void {
    /* noop */
  }

  setDirtyCanvas(): void {
    /* noop */
  }

  addWidget(
    type: string,
    name: string,
    value: string | number | boolean,
    callback: (v: string | number | boolean) => void,
    options?: Record<string, unknown>
  ): WidgetType {
    const w: WidgetType = {
      type,
      name,
      element: document.createElement("div"),
      options: { hideOnZoom: false, ...(options ?? {}) },
      _value: String(value),
      value: value,
      callback,
    }
    this.widgets ??= []
    this.widgets.push(w)
    return w
  }
}

type InputSpec = [string | string[], Record<string, unknown>]

interface NodeDef {
  input?: {
    required?: Record<string, InputSpec>
    optional?: Record<string, InputSpec>
  }
  input_order?: { required?: string[] }
  output: string[]
  output_name: string[]
  category: string
}

type ObjectInfo = Record<string, NodeDef>

let cachedObjectInfo: ObjectInfo | null = null

async function fetchObjectInfo(backendUrl: string): Promise<ObjectInfo | null> {
  if (cachedObjectInfo) return cachedObjectInfo
  try {
    const res = await fetch(`${backendUrl}/object_info`)
    if (!res.ok) return null
    cachedObjectInfo = (await res.json()) as ObjectInfo
    return cachedObjectInfo
  } catch {
    return null
  }
}

interface WorkflowGraphViewerProps {
  workflow: ComfyWorkflow
  isOpen: boolean
  onClose: () => void
  backendUrl: string
}

function WorkflowGraphViewer({
  workflow,
  isOpen,
  onClose,
  backendUrl,
}: WorkflowGraphViewerProps): JSX.Element {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stats, setStats] = useState({ nodes: 0, edges: 0 })

  const containerRefCallback = useCallback((el: HTMLDivElement | null): void => {
    setContainerEl(el)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    if (containerEl === null) return
    if (canvasRef.current === null) return

    const abortController = new AbortController()
    const { signal } = abortController
    let stopFn: (() => void) | null = null
    let rafId: number
    const container = containerEl
    const canvasEl = canvasRef.current

    async function init(w: number, h: number): Promise<void> {
      const { positions, edges } = computeLayout(workflow)
      const graph = new LGraph()
      const nodeMap = new Map<string, LGraphNode>()

      const objectInfo = await fetchObjectInfo(backendUrl)

      if (signal.aborted) return

      for (const [nodeId, wfNode] of Object.entries(workflow)) {
        const info = objectInfo?.[wfNode.class_type]
        const title = wfNode._meta?.title ?? wfNode.class_type
        const { hex } = getCategoryStyle(wfNode.class_type)

        const lgNode = new LGraphNode(title)
        lgNode.color = hex

        if (info) {
          const req = info.input?.required ?? {}
          const opt = info.input?.optional ?? {}
          const orderedKeys = info.input_order?.required ?? Object.keys(req)

          for (const name of orderedKeys) {
            if (req[name] === undefined) continue
            const [typeSpec] = req[name]
            lgNode.addInput(name, Array.isArray(typeSpec) ? "COMBO" : typeSpec)
          }
          for (const [name, spec] of Object.entries(opt)) {
            const [typeSpec] = spec
            lgNode.addInput(name, Array.isArray(typeSpec) ? "COMBO" : typeSpec)
          }
          for (let i = 0; i < info.output.length; i++) {
            lgNode.addOutput(
              info.output_name[i] ?? info.output[i] ?? "",
              info.output[i] ?? ""
            )
          }
        } else {
          for (const [k, v] of Object.entries(wfNode.inputs)) {
            if (
              Array.isArray(v) &&
              v.length === 2 &&
              typeof v[0] === "string"
            ) {
              lgNode.addInput(k, "*")
            }
          }
          lgNode.addOutput("output", "*")
        }

        graph.add(lgNode)
        const p = positions.get(nodeId) ?? { x: 0, y: 0 }
        lgNode.pos = [p.x, p.y]
        nodeMap.set(nodeId, lgNode)
      }

      for (const edge of edges) {
        const src = nodeMap.get(edge.source)
        const tgt = nodeMap.get(edge.target)
        if (src === undefined || tgt === undefined) continue
        src.connect(edge.sourceSlot, tgt, edge.targetInput)
      }

      setStats({ nodes: Object.keys(workflow).length, edges: edges.length })

      const lgCanvas = new LGraphCanvas(canvasEl, graph)
      lgCanvas.state.readOnly = true
      lgCanvas.resize(w, h)

      const nodes = [...nodeMap.values()]
      if (nodes.length > 0) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity
        for (const n of nodes) {
          minX = Math.min(minX, n.pos[0])
          minY = Math.min(minY, n.pos[1])
          maxX = Math.max(maxX, n.pos[0] + n.size[0])
          maxY = Math.max(maxY, n.pos[1] + n.size[1])
        }
        const gw = maxX - minX
        const gh = maxY - minY
        const scale = Math.min(w / (gw + 120), h / (gh + 120), 1.0)
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        lgCanvas.ds.scale = scale
        lgCanvas.ds.offset = [w / 2 / scale - cx, h / 2 / scale - cy]
      }

      lgCanvas.setDirty(true, true)

      const resizeObserver = new ResizeObserver(([entry]) => {
        if (entry === undefined) return
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) lgCanvas.resize(width, height)
      })
      resizeObserver.observe(container)

      stopFn = (): void => {
        resizeObserver.disconnect()
        lgCanvas.stopRendering()
      }
    }

    function waitForSize(): void {
      rafId = requestAnimationFrame(() => {
        if (signal.aborted) return
        const w = container.clientWidth
        const h = container.clientHeight
        if (w === 0 || h === 0) {
          waitForSize()
          return
        }
        void init(w, h)
      })
    }
    waitForSize()

    return (): void => {
      abortController.abort()
      cancelAnimationFrame(rafId)
      stopFn?.()
    }
  }, [isOpen, containerEl, workflow, backendUrl])

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open): void => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="flex min-w-[70vw] flex-col sm:max-w-[90vw]"
      >
        <SheetHeader>
          <SheetTitle>워크플로우 그래프</SheetTitle>
          <SheetDescription>
            {String(stats.nodes)}개 노드, {String(stats.edges)}개 연결
          </SheetDescription>
        </SheetHeader>
        <div
          ref={containerRefCallback}
          className="min-h-0 flex-1 overflow-hidden rounded-md border"
          style={{ background: "var(--graph-canvas)" }}
        >
          <canvas ref={canvasRef} style={{ display: "block" }} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { WorkflowGraphViewer }
