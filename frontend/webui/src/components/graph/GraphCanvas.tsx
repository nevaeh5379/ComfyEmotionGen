/**
 * GraphCanvas - 메인 그래프 캔버스 컴포넌트
 * ComfyUI_frontend: src/components/graph/GraphCanvas.vue 의 React 포팅
 */

import { useEffect, useRef, useCallback } from "react"
import { ComfyAppService } from "@/comfyui/services/appService"
import { useCanvasStore } from "@/comfyui/stores/canvasStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { useGraphStore } from "@/comfyui/stores/graphStore"
import type { ComfyWorkflowJSON } from "@/comfyui/types/workflow"

interface GraphData {
  nodes: unknown[]
  remove(node: unknown): void
  setDirtyCanvas(dirty: boolean, dirtyFlags: boolean): void
}

interface CanvasData {
  resize(width: number, height: number): void
}

interface LegacyApp {
  graph: GraphData | null
  canvas: CanvasData | null
  loadGraphData(data: ComfyWorkflowJSON): void
  serializeGraph(): ComfyWorkflowJSON
}

interface GraphCanvasProps {
  workflow?: ComfyWorkflowJSON | null
  onWorkflowChange?: (workflow: ComfyWorkflowJSON) => void
  className?: string
}

export function GraphCanvas({
  workflow,
  onWorkflowChange,
  className = "",
}: GraphCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<ComfyAppService | null>(null)

  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const setCurrentGraph = useCanvasStore((s) => s.setCurrentGraph)
  const setAppService = useCanvasStore((s) => s.setAppService)
  const nodeDefs = useNodeDefStore((s) => s.nodeDefs)

  // 초기화
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || appRef.current) return

    const app = new ComfyAppService({
      canvas,
      container,
      nodeDefs,
    })

    app.onGraphChanged = (wf: ComfyWorkflowJSON): void => {
      onWorkflowChange?.(wf)
    }

    appRef.current = app
    setCanvas(app.canvas)
    setCurrentGraph(app.graph)
    setAppService(app)

    // Bind legacy app properties to window.app
    const winApp = window.app as unknown as LegacyApp
    ;(winApp as unknown as Record<string, unknown>).graph = app.graph
    ;(winApp as unknown as Record<string, unknown>).canvas = app.canvas
    winApp.loadGraphData = app.loadGraphData.bind(app)
    winApp.serializeGraph = app.serializeGraph.bind(app)

    // 리사이즈 핸들러
    const handleResize = (): void => {
      const rect = container.getBoundingClientRect()
      ;(app.canvas as unknown as { resize(w: number, h: number): void }).resize(rect.width, rect.height)
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    handleResize()

    return (): void => {
      resizeObserver.disconnect()
      app.dispose()
      appRef.current = null
      setCanvas(null)
      setCurrentGraph(null)
      setAppService(null)
      const winApp = window.app as unknown as LegacyApp
      winApp.graph = null
      winApp.canvas = null
    }
  }, [nodeDefs, setCanvas, setCurrentGraph, setAppService, onWorkflowChange])

  // workflow prop 변경 시 로드 (appRef가 아직 없으면 pending으로 저장)
  const pendingWorkflowRef = useRef<ComfyWorkflowJSON | null>(null)

  useEffect(() => {
    if (!workflow) return
    if (!appRef.current) {
      pendingWorkflowRef.current = workflow
      return
    }
    appRef.current.loadGraphData(workflow)
    pendingWorkflowRef.current = null
  }, [workflow])

  // appRef 초기화 완료 후 pending workflow가 있으면 로드
  useEffect(() => {
    if (!appRef.current || !pendingWorkflowRef.current) return
    appRef.current.loadGraphData(pendingWorkflowRef.current)
    pendingWorkflowRef.current = null
  }, [nodeDefs])

  // 키보드 단축키
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      // Ctrl/Cmd + Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        const previous = useGraphStore.getState().undo()
        if (previous && appRef.current) {
          appRef.current.loadGraphData(previous)
        }
      }
      // Ctrl/Cmd + Shift + Z: Redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault()
        const next = useGraphStore.getState().redo()
        if (next && appRef.current) {
          appRef.current.loadGraphData(next)
        }
      }
      // Delete: 선택된 노드 삭제
      if (e.key === "Delete" || e.key === "Backspace") {
        const app = appRef.current
        if (!app) return
        const graph = app.graph as unknown as GraphData
        const selected = graph.nodes.filter((n: unknown) => {
          const node = n as { is_selected?: boolean }
          return node.is_selected === true
        })
        if (selected.length > 0) {
          e.preventDefault()
          for (const node of selected) {
            graph.remove(node)
          }
          graph.setDirtyCanvas(true, true)
        }
      }
    },
    []
  )

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{ outline: "none" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{ touchAction: "none" }}
      />
    </div>
  )
}
