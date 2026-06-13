/**
 * EditorTab - 워크플로우 에디터 탭
 * ComfyUI 수준의 노드 에디터 제공
 * 좌: Node Library, 중: Canvas, 우: Properties
 */

import { useEffect, useState, useCallback, useRef } from "react"
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
import { useReactGraphStore } from "@/lib/comfy-graph/stores/reactGraphStore"
import { ReactGraphEditor } from "@/components/graph/react/ReactGraphEditor"

export function EditorTab() {
  const { workflowJson, setWorkflowJson, parsedWorkflow } = useWorkflowContext()

  const [currentWorkflow, setCurrentWorkflow] = useState<ComfyWorkflowJSON | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [editorMode, setEditorMode] = useState<"canvas" | "react">("canvas")

  const nodeDefs = useNodeDefStore((s) => s.nodeDefs)
  const setNodeDefs = useNodeDefStore((s) => s.setNodeDefs)
  const canUndo = useGraphStore((s) => s.canUndo())
  const canRedo = useGraphStore((s) => s.canRedo())
  const graph = useCanvasStore((s) => s.currentGraph)

  // ─── 이전 에디터 모드 추적 (루프 방지용) ─────────────────────
  const prevEditorModeRef = useRef<"canvas" | "react">("canvas")

  // currentWorkflow가 갱신되면 reactGraphStore에도 연동
  // (canvas 모드에서만: react 모드에서는 reactGraphStore가 소스오브트루스)
  useEffect(() => {
    if (currentWorkflow && editorMode !== "react") {
      useReactGraphStore.getState().setGraph(currentWorkflow)
    }
  }, [currentWorkflow, editorMode])

  // canvas → react 모드 전환 시 단 1회 setGraph
  useEffect(() => {
    const prev = prevEditorModeRef.current
    prevEditorModeRef.current = editorMode
    if (editorMode === "react" && prev === "canvas" && currentWorkflow) {
      useReactGraphStore.getState().setGraph(currentWorkflow)
    }
  }, [editorMode]) // currentWorkflow를 의도적으로 제외: 전환 시점 스냅샷만 사용

  // reactGraphStore의 변경사항을 workflowJson에 반영
  useEffect(() => {
    if (editorMode !== "react") return

    const unsubscribe = useReactGraphStore.subscribe((state) => {
      const apiWorkflow: Record<
        string,
        { inputs: Record<string, unknown>; class_type: string; _meta?: { title?: string } }
      > = {}

      for (const node of state.nodes) {
        const inputs: Record<string, unknown> = {}

        // 위젯 값 처리
        if (node.widgets_values && node.properties?.widget_names) {
          const widgetNames = node.properties.widget_names as string[]
          for (let i = 0; i < Math.min(node.widgets_values.length, widgetNames.length); i++) {
            inputs[widgetNames[i]] = node.widgets_values[i]
          }
        }

        // 링크 처리
        if (node.inputs) {
          for (const input of node.inputs) {
            if (input.link != null) {
              const link = state.links.find((l) => l.id === input.link)
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

      const nextJson = JSON.stringify(apiWorkflow, null, 2)
      if (nextJson !== workflowJson) {
        setWorkflowJson(nextJson)
      }
    })

    return () => unsubscribe()
  }, [editorMode, workflowJson, setWorkflowJson])

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

  // workflowJson 변경 시 그래프로 변환 (nodeDefs를 사용해 위젯/출력 올바르게 채우기)
  useEffect(() => {
    if (!parsedWorkflow?.success) {
      setCurrentWorkflow(null)
      return
    }

    const apiWorkflow = parsedWorkflow.data
    const nodes: import("@/lib/comfy-graph/types/workflow").ComfyWorkflowNode[] = []
    const links: import("@/lib/comfy-graph/types/workflow").ComfyWorkflowLink[] = []
    let linkId = 1

    for (const [nodeId, nodeData] of Object.entries(apiWorkflow)) {
      const id = parseInt(nodeId) || nodes.length + 1
      const def = nodeDefs[nodeData.class_type]

      const inputPins: import("@/lib/comfy-graph/types/workflow").ComfyNodeInput[] = []
      const outputPins: import("@/lib/comfy-graph/types/workflow").ComfyNodeOutput[] = []
      const widgetsValues: unknown[] = []
      const widgetNames: string[] = []

      if (def) {
        // Definition 있음: 위젯 vs 링크핀 올바르게 분리
        const req = def.input?.required ?? {}
        const opt = def.input?.optional ?? {}
        const allInputs = { ...req, ...opt }

        for (const [name, spec] of Object.entries(allInputs)) {
          const typeSpec = spec[0]
          const isWidget =
            Array.isArray(typeSpec) ||
            ["INT", "FLOAT", "STRING", "BOOLEAN"].includes(String(typeSpec).toUpperCase())

          const rawVal = nodeData.inputs?.[name]

          let defaultVal: unknown = ""
          if (Array.isArray(typeSpec)) {
            defaultVal = typeSpec[0] ?? ""
          } else if (spec[1]?.default !== undefined) {
            defaultVal = spec[1].default
          } else if (typeSpec === "INT" || typeSpec === "FLOAT") {
            defaultVal = 0
          } else if (typeSpec === "BOOLEAN") {
            defaultVal = false
          }

          if (isWidget) {
            widgetNames.push(name)
            const isLink =
              Array.isArray(rawVal) && rawVal.length === 2 && typeof rawVal[0] === "string"
            widgetsValues.push(isLink ? (spec[1]?.default ?? "") : (rawVal ?? defaultVal))

            // 위젯도 inputs에 추가하되, widget 속성을 붙여 소켓으로 노출
            const pin: import("@/lib/comfy-graph/types/workflow").ComfyNodeInput = {
              name,
              type: String(typeSpec),
              widget: { name, config: spec[1] || {} },
            }
            if (isLink && Array.isArray(rawVal)) {
              pin.link = linkId
              links.push({
                id: linkId++,
                origin_id: parseInt(String(rawVal[0])),
                origin_slot: rawVal[1] as number,
                target_id: id,
                target_slot: inputPins.length,
                type: String(typeSpec),
              })
            }
            inputPins.push(pin)
          } else {
            // 링크 타입 핀
            const pin: import("@/lib/comfy-graph/types/workflow").ComfyNodeInput = {
              name,
              type: String(typeSpec),
            }
            const isLink =
              Array.isArray(rawVal) && rawVal.length === 2 && typeof rawVal[0] === "string"
            if (isLink && Array.isArray(rawVal)) {
              pin.link = linkId
              links.push({
                id: linkId++,
                origin_id: parseInt(String(rawVal[0])),
                origin_slot: rawVal[1] as number,
                target_id: id,
                target_slot: inputPins.length,
                type: String(typeSpec),
              })
            }
            inputPins.push(pin)
          }
        }

        // Outputs: definition에서 읽어오기
        if (def.output && def.output_name) {
          for (let i = 0; i < def.output.length; i++) {
            outputPins.push({
              name: def.output_name[i] || def.output[i],
              type: def.output[i] || "*",
            })
          }
        }
      } else {
        // Definition 없음: 링크 참조만 파싱 (fallback)
        if (nodeData.inputs) {
          for (const [key, value] of Object.entries(nodeData.inputs)) {
            if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
              const pin: import("@/lib/comfy-graph/types/workflow").ComfyNodeInput = {
                name: key, type: "*", link: linkId,
              }
              links.push({
                id: linkId++,
                origin_id: parseInt(value[0]),
                origin_slot: value[1] as number,
                target_id: id,
                target_slot: inputPins.length,
                type: "*",
              })
              inputPins.push(pin)
            }
          }
        }
      }

      const maxSlots = Math.max(inputPins.length, outputPins.length)
      const height = 48 + maxSlots * 18 + widgetNames.length * 22

      nodes.push({
        id,
        type: nodeData.class_type,
        pos: [100 + (nodes.length % 5) * 300, 100 + Math.floor(nodes.length / 5) * 250],
        size: [240, Math.max(80, height)],
        inputs: inputPins.length > 0 ? inputPins : undefined,
        outputs: outputPins.length > 0 ? outputPins : undefined,
        widgets_values: widgetsValues.length > 0 ? widgetsValues : undefined,
        properties: widgetNames.length > 0 ? { widget_names: widgetNames } : undefined,
      })
    }

    setCurrentWorkflow({
      last_node_id: nodes.length,
      last_link_id: linkId - 1,
      nodes,
      links,
      version: 0.4,
    })
  }, [parsedWorkflow, nodeDefs])

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
    if (editorMode === "react") {
      const def = nodeDefs[type]
      const state = useReactGraphStore.getState()
      const pos: [number, number] = [
        Math.round(150 - state.pan[0] / state.zoom),
        Math.round(150 - state.pan[1] / state.zoom)
      ]
      state.addNode(type, pos, def)
      return
    }

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
  }, [graph, editorMode, nodeDefs])

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
        <div className="flex items-center gap-1 rounded-lg bg-muted/65 p-0.5 border border-line/40 select-none">
          <Button
            variant={editorMode === "canvas" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px] font-extrabold cursor-pointer"
            onClick={() => {
              localStorage.setItem("comfy-editor-mode", "canvas")
              setEditorMode("canvas")
            }}
          >
            Canvas (Legacy)
          </Button>
          <Button
            variant={editorMode === "react" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px] font-extrabold cursor-pointer"
            onClick={() => {
              localStorage.setItem("comfy-editor-mode", "react")
              setEditorMode("react")
            }}
          >
            React DOM (New)
          </Button>
        </div>
        <div className="h-4 w-px bg-border mx-1" />
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
          ) : editorMode === "react" ? (
            <ReactGraphEditor />
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
            <NodePropertiesPanel editorMode={editorMode} />
          </div>
        )}
      </div>
    </div>
  )
}
