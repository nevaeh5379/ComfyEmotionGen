/**
 * GraphCanvas - 메인 그래프 캔버스 컴포넌트
 * ComfyUI_frontend: src/components/graph/GraphCanvas.vue 의 React 포팅
 */

import { useEffect, useRef, useCallback } from "react"
import { ComfyAppService } from "@/lib/comfy-graph/services/appService"
import { useCanvasStore } from "@/lib/comfy-graph/stores/canvasStore"
import { useNodeDefStore } from "@/lib/comfy-graph/stores/nodeDefStore"
import { useGraphStore } from "@/lib/comfy-graph/stores/graphStore"
import type { ComfyWorkflowJSON } from "@/lib/comfy-graph/types/workflow"

interface GraphCanvasProps {
  workflow?: ComfyWorkflowJSON | null
  onWorkflowChange?: (workflow: ComfyWorkflowJSON) => void
  className?: string
}

export function GraphCanvas({
  workflow,
  onWorkflowChange,
  className = "",
}: GraphCanvasProps) {
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

    app.onGraphChanged = (wf) => {
      onWorkflowChange?.(wf)
    }

    appRef.current = app
    setCanvas(app.canvas)
    setCurrentGraph(app.graph)
    setAppService(app)

    // 리사이즈 핸들러
    const handleResize = () => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      app.canvas.resize(rect.width, rect.height)
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    handleResize()

    return () => {
      resizeObserver.disconnect()
      app.dispose()
      appRef.current = null
      setCanvas(null)
      setCurrentGraph(null)
      setAppService(null)
    }
  }, [nodeDefs, setCanvas, setCurrentGraph, setAppService, onWorkflowChange])

  // workflow prop 변경 시 로드
  useEffect(() => {
    if (!workflow || !appRef.current) return
    appRef.current.loadGraphData(workflow)
  }, [workflow])

  // 키보드 단축키
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
        const selected = app.graph.nodes.filter((n) => n.is_selected)
        if (selected.length > 0) {
          e.preventDefault()
          for (const node of selected) {
            app.graph.remove(node)
          }
          app.graph.setDirtyCanvas(true, true)
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
