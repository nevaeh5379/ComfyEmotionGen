import { useEffect, useRef, useState, useCallback } from "react"
import "litegraph.js/css/litegraph.css"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { ComfyWorkflow } from "@/lib/workflow"
import { computeLayout } from "./workflowGraphLayout"
import { getCategoryStyle } from "./workflowGraphCategories"

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

function WorkflowGraphViewer({ workflow, isOpen, onClose, backendUrl }: WorkflowGraphViewerProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stats, setStats] = useState({ nodes: 0, edges: 0 })

  const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
    setContainerEl(el)
  }, [])

  useEffect(() => {
    if (!isOpen || !containerEl || !canvasRef.current) return

    let cancelled = false
    let stopFn: (() => void) | null = null
    let rafId: number

    async function init(w: number, h: number) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = await import("litegraph.js") as any
      const { LGraph, LGraphCanvas, LGraphNode } = lib

      if (cancelled || !canvasRef.current) return

      const { positions, edges } = computeLayout(workflow)
      const graph = new LGraph()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeMap = new Map<string, any>()

      const objectInfo = await fetchObjectInfo(backendUrl)

      if (cancelled || !canvasRef.current) return

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
            if (!req[name]) continue
            const [typeSpec] = req[name]
            lgNode.addInput(name, Array.isArray(typeSpec) ? "COMBO" : typeSpec)
          }
          for (const [name, spec] of Object.entries(opt)) {
            const [typeSpec] = (spec as InputSpec)
            lgNode.addInput(name, Array.isArray(typeSpec) ? "COMBO" : typeSpec)
          }
          for (let i = 0; i < info.output.length; i++) {
            lgNode.addOutput(info.output_name[i] ?? info.output[i] ?? "", info.output[i] ?? "")
          }
        } else {
          for (const [k, v] of Object.entries(wfNode.inputs)) {
            if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string") {
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
        if (!src || !tgt) continue
        src.connect(edge.sourceSlot, tgt, edge.targetInput)
      }

      setStats({ nodes: Object.keys(workflow).length, edges: edges.length })

      const canvas = canvasRef.current
      const lgCanvas = new LGraphCanvas(canvas, graph)
      lgCanvas.read_only = true
      lgCanvas.resize(w, h)

      // 전체 노드가 보이도록 뷰 맞춤
      const nodes = [...nodeMap.values()]
      if (nodes.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const n of nodes) {
          minX = Math.min(minX, n.pos[0])
          minY = Math.min(minY, n.pos[1])
          maxX = Math.max(maxX, n.pos[0] + (n.size?.[0] ?? 140))
          maxY = Math.max(maxY, n.pos[1] + (n.size?.[1] ?? 80))
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
        if (!entry) return
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) lgCanvas.resize(width, height)
      })
      resizeObserver.observe(containerEl!)

      stopFn = () => {
        resizeObserver.disconnect()
        lgCanvas.stopRendering()
        graph.stop()
      }
    }

    function waitForSize() {
      rafId = requestAnimationFrame(() => {
        if (cancelled || !containerEl) return
        const w = containerEl.clientWidth
        const h = containerEl.clientHeight
        if (w === 0 || h === 0) { waitForSize(); return }
        init(w, h)
      })
    }
    waitForSize()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      stopFn?.()
    }
  }, [isOpen, containerEl, workflow, backendUrl])

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side="right"
        className="flex flex-col min-w-[70vw] sm:max-w-[90vw]"
      >
        <SheetHeader>
          <SheetTitle>워크플로우 그래프</SheetTitle>
          <SheetDescription>
            {stats.nodes}개 노드, {stats.edges}개 연결
          </SheetDescription>
        </SheetHeader>
        <div
          ref={containerRefCallback}
          className="flex-1 min-h-0 rounded-md border overflow-hidden"
          style={{ background: "#1d1d1d" }}
        >
          <canvas ref={canvasRef} style={{ display: "block" }} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { WorkflowGraphViewer }
