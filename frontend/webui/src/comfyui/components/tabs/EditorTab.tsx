/**
 * EditorTab - 워크플로우 에디터 탭
 * ComfyUI 수준의 노드 에디터 제공
 * 좌: Node Library, 중: Canvas, 우: Properties
 */

import { useEffect, useState, useCallback } from "react"
import { useWorkflowContext } from "@/comfyui/contexts/WorkflowContext"
import { GraphCanvas } from "@/components/graph/GraphCanvas"
import { NodeLibrarySidebar } from "@/components/graph/NodeLibrarySidebar"
import { NodePropertiesPanel } from "@/components/graph/NodePropertiesPanel"
import { comfyApi } from "@/lib/comfy-graph/api"
import { useNodeDefStore } from "@/lib/comfy-graph/stores/nodeDefStore"
import { useGraphStore } from "@/lib/comfy-graph/stores/graphStore"
import { useCanvasStore } from "@/lib/comfy-graph/stores/canvasStore"
import type { ComfyWorkflowJSON } from "@/lib/comfy-graph/types/workflow"
import { Button } from "@/components/ui/button"
import { Undo2, Redo2, Save, FolderOpen, PanelLeft, PanelRight } from "lucide-react"

export function EditorTab() {
  const { workflowJson, setWorkflowJson, parsedWorkflow } = useWorkflowContext()

  const [currentWorkflow, setCurrentWorkflow] = useState<ComfyWorkflowJSON | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)

  const nodeDefs = useNodeDefStore((s) => s.nodeDefs)
  const setNodeDefs = useNodeDefStore((s) => s.setNodeDefs)
  const canUndo = useGraphStore((s) => s.canUndo())
  const canRedo = useGraphStore((s) => s.canRedo())
  const graph = useCanvasStore((s) => s.currentGraph)

  // object_info 로드
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setIsLoading(true)
        const defs = await comfyApi.getObjectInfo()
        if (!cancelled) {
          setNodeDefs(defs as Record<string, import("@/lib/comfy-graph/types/nodeDef").ComfyNodeDef>)
        }
      } catch (err) {
        console.error("[EditorTab] Failed to load object_info:", err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [setNodeDefs])

  // workflowJson 변경 시 그래프로 변환
  useEffect(() => {
    if (!parsedWorkflow?.success) {
      setCurrentWorkflow(null)
      return
    }

    // ComfyWorkflow (API 포맷) → ComfyWorkflowJSON (UI 포맷) 변환
    const apiWorkflow = parsedWorkflow.data
    const nodes: import("@/lib/comfy-graph/types/workflow").ComfyWorkflowNode[] = []
    const links: import("@/lib/comfy-graph/types/workflow").ComfyWorkflowLink[] = []
    let linkId = 1

    for (const [nodeId, nodeData] of Object.entries(apiWorkflow)) {
      const id = parseInt(nodeId) || nodes.length + 1
      const node: import("@/lib/comfy-graph/types/workflow").ComfyWorkflowNode = {
        id,
        type: nodeData.class_type,
        pos: [100 + (nodes.length % 5) * 300, 100 + Math.floor(nodes.length / 5) * 200],
        size: [200, 100],
      }

      // 입력 처리
      if (nodeData.inputs) {
        const inputs: import("@/lib/comfy-graph/types/workflow").ComfyNodeInput[] = []
        for (const [key, value] of Object.entries(nodeData.inputs)) {
          if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
            // 링크 참조
            const originId = parseInt(value[0])
            const originSlot = value[1] as number
            inputs.push({ name: key, type: "*", link: linkId })
            links.push({
              id: linkId++,
              origin_id: originId,
              origin_slot: originSlot,
              target_id: id,
              target_slot: inputs.length - 1,
              type: "*",
            })
          } else {
            inputs.push({ name: key, type: "*" })
          }
        }
        if (inputs.length > 0) node.inputs = inputs
      }

      nodes.push(node)
    }

    setCurrentWorkflow({
      last_node_id: nodes.length,
      last_link_id: linkId - 1,
      nodes,
      links,
      version: 0.4,
    })
  }, [parsedWorkflow])

  // 그래프 변경 시 workflowJson 업데이트
  const handleWorkflowChange = useCallback(
    (workflow: ComfyWorkflowJSON) => {
      // ComfyWorkflowJSON → ComfyWorkflow (API 포맷) 변환
      const apiWorkflow: Record<
        string,
        { inputs: Record<string, unknown>; class_type: string; _meta?: { title?: string } }
      > = {}

      for (const node of workflow.nodes) {
        const inputs: Record<string, unknown> = {}

        // 위젯 값 처리 (간단한 휴리스틱)
        if (node.widgets_values) {
          const nodeDef = Object.values(nodeDefs).find((d) => d.name === node.type)
          if (nodeDef?.input?.required) {
            const keys = Object.keys(nodeDef.input.required)
            for (let i = 0; i < Math.min(node.widgets_values.length, keys.length); i++) {
              inputs[keys[i]] = node.widgets_values[i]
            }
          }
        }

        // 링크 처리
        if (node.inputs) {
          for (const input of node.inputs) {
            if (input.link != null) {
              const link = workflow.links.find((l) => l.id === input.link)
              if (link) {
                inputs[input.name] = [link.origin_id.toString(), link.origin_slot]
              }
            }
          }
        }

        apiWorkflow[node.id.toString()] = {
          inputs,
          class_type: node.type,
          _meta: { title: node.type },
        }
      }

      setWorkflowJson(JSON.stringify(apiWorkflow, null, 2))
    },
    [nodeDefs, setWorkflowJson]
  )

  // workflowJson이 비어있으면 빈 그래프 표시
  const handleNewWorkflow = useCallback(() => {
    setWorkflowJson("")
    setCurrentWorkflow({
      last_node_id: 0,
      last_link_id: 0,
      nodes: [],
      links: [],
      version: 0.4,
    })
  }, [setWorkflowJson])

  // 노드 라이브러리에서 노드 추가
  const handleAddNode = useCallback((type: string) => {
    // @ts-ignore - graph is LGraph from our store
    if (!graph) return

    // 중앙에 노드 추가 (캔버스 중심)
    // @ts-ignore
    const center = graph?.list_of_graphcanvas?.[0]?.ds?.offset || [0, 0]
    const pos: [number, number] = [center[0] + 100, center[1] + 100]

    // Use ComfyAppService through the canvas store
    const app = useCanvasStore.getState().appService as any
    if (app?.createNode) {
      app.createNode(type, pos)
    }
  }, [graph])

  return (
    <div className="flex flex-col h-full w-full">
      {/* 툴바 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLeftPanel((v) => !v)}
          className={showLeftPanel ? "bg-accent" : ""}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canUndo}
          onClick={() => {
            const prev = useGraphStore.getState().undo()
            if (prev) setCurrentWorkflow(prev)
          }}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canRedo}
          onClick={() => {
            const next = useGraphStore.getState().redo()
            if (next) setCurrentWorkflow(next)
          }}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="h-4 w-px bg-border mx-1" />
        <Button variant="ghost" size="sm" onClick={handleNewWorkflow}>
          <FolderOpen className="h-4 w-4 mr-1" />
          새 워크플로우
        </Button>
        <Button variant="ghost" size="sm" onClick={() => {
          console.log("[EditorTab] Save workflow:", workflowJson)
        }}>
          <Save className="h-4 w-4 mr-1" />
          저장
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowRightPanel((v) => !v)}
          className={showRightPanel ? "bg-accent" : ""}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      </div>

      {/* 메인 영역: 좌-중-우 */}
      <div className="flex flex-1 min-h-0">
        {/* 좌측: Node Library */}
        {showLeftPanel && (
          <div className="w-64 shrink-0 border-r">
            <NodeLibrarySidebar onAddNode={handleAddNode} />
          </div>
        )}

        {/* 중앙: Canvas */}
        <div className="flex-1 min-w-0 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              노드 정의 로드 중...
            </div>
          ) : Object.keys(nodeDefs).length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              ComfyUI 워커가 연결되어 있지 않습니다.
            </div>
          ) : (
            <GraphCanvas
              workflow={currentWorkflow}
              onWorkflowChange={handleWorkflowChange}
            />
          )}
        </div>

        {/* 우측: Properties */}
        {showRightPanel && (
          <div className="w-64 shrink-0 border-l">
            <NodePropertiesPanel />
          </div>
        )}
      </div>
    </div>
  )
}
