/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-plus-operands */
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
// import { LGraph, LGraphCanvas, LGraphNode } from "comfy-litegraph"
type LGraph = any
type LGraphCanvas = any
type LGraphNode = any
const LGraph = (window as any).LGraph
const LGraphCanvas = (window as any).LGraphCanvas
const LGraphNode = (window as any).LGraphNode

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
