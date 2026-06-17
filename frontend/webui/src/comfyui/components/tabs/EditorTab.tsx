/**
 * EditorTab - 워크플로우 에디터 탭
 * ComfyUI 수준의 노드 에디터 제공
 * 좌: Node Library, 중: Canvas, 우: Properties
 */

import { useEffect, useState, useCallback, useRef } from "react"
import { GraphCanvas } from "@/components/graph/GraphCanvas"
import { NodeLibrarySidebar } from "@/components/graph/NodeLibrarySidebar"
import { NodePropertiesPanel } from "@/components/graph/NodePropertiesPanel"
import { comfyApi } from "@/comfyui/api"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { useGraphStore } from "@/comfyui/stores/graphStore"
import { useCanvasStore } from "@/comfyui/stores/canvasStore"
import type { ComfyWorkflowJSON } from "@/comfyui/types/workflow"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  PanelLeft,
  PanelRight,
  Trash2,
  Folder,
  Upload,
} from "lucide-react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { ReactGraphEditor } from "@/components/graph/react/ReactGraphEditor"
import {
  useEditorSavedWorkflows,
  type EditorSavedWorkflow,
} from "@/comfyui/hooks/useEditorSavedWorkflows"

export function EditorTab() {
  const [currentWorkflow, setCurrentWorkflow] = useState<ComfyWorkflowJSON | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [editorMode, setEditorMode] = useState<"canvas" | "react">("canvas")

  const { workflows: savedEditorWorkflows, saveWorkflow: saveEditorWorkflow, deleteWorkflow: deleteEditorWorkflow } =
    useEditorSavedWorkflows()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const nodeDefs = useNodeDefStore((s) => s.nodeDefs)
  const setNodeDefs = useNodeDefStore((s) => s.setNodeDefs)
  const canUndo = useGraphStore((s) => s.canUndo())
  const canRedo = useGraphStore((s) => s.canRedo())
  const graph = useCanvasStore((s) => s.currentGraph)

  // ─── 이전 에디터 모드 추적 (루프 방지용) ─────────────────────
  const prevEditorModeRef = useRef<"canvas" | "react">("canvas")

  // currentWorkflow가 갱신되면 reactGraphStore에도 연동
  useEffect(() => {
    if (!currentWorkflow) return
    useReactGraphStore.getState().setGraph(currentWorkflow)
  }, [currentWorkflow])

  // canvas → react 모드 전환 시 단 1회 setGraph
  useEffect(() => {
    const prev = prevEditorModeRef.current
    prevEditorModeRef.current = editorMode
    if (editorMode === "react" && prev === "canvas" && currentWorkflow) {
      useReactGraphStore.getState().setGraph(currentWorkflow)
    }
  }, [editorMode]) // currentWorkflow를 의도적으로 제외: 전환 시점 스냅샷만 사용

  // object_info 로드
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setIsLoading(true)
        const defs = await comfyApi.getObjectInfo()
        if (!cancelled) {
          setNodeDefs(defs)
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

  const handleSaveWorkflow = useCallback(() => {
    if (!saveName.trim()) return
    const state = useReactGraphStore.getState()
    const workflow: ComfyWorkflowJSON = {
      last_node_id: Math.max(0, ...state.nodes.map((n) => n.id)),
      last_link_id: Math.max(0, ...state.links.map((l) => l.id)),
      nodes: state.nodes,
      links: state.links,
      version: 0.4,
    }
    saveEditorWorkflow(saveName.trim(), workflow)
    setSaveDialogOpen(false)
    setSaveName("")
  }, [saveName, saveEditorWorkflow])

  const handleFileImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string
          const parsed = JSON.parse(text) as ComfyWorkflowJSON
          if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
            throw new Error("Invalid ComfyUI workflow JSON: missing nodes array")
          }
          // 링크 정규화: 배열 [id, origin_id, origin_slot, target_id, target_slot, type] → 객체
          if (parsed.links) {
            parsed.links = parsed.links.map((l: unknown) => {
              if (Array.isArray(l)) {
                return { id: l[0], origin_id: l[1], origin_slot: l[2], target_id: l[3], target_slot: l[4], type: l[5] ?? "*" }
              }
              return l
            }) as ComfyWorkflowJSON["links"]
          }
          setCurrentWorkflow(parsed)
        } catch (err) {
          console.error("[EditorTab] Failed to import workflow file:", err)
          alert("워크플로우 파일을 불러오는데 실패했습니다. 올바른 JSON 파일인지 확인해주세요.")
        } finally {
          if (fileInputRef.current) {
            fileInputRef.current.value = ""
          }
        }
      }
      reader.readAsText(file)
    },
    []
  )

  const handleLoadWorkflow = useCallback(
    (w: EditorSavedWorkflow) => {
      setCurrentWorkflow(w.workflow)
      setLoadDialogOpen(false)
    },
    []
  )

  const handleDeleteWorkflow = useCallback(
    (id: string) => {
      deleteEditorWorkflow(id)
    },
    [deleteEditorWorkflow]
  )

  const handleNewWorkflow = useCallback(() => {
    setCurrentWorkflow({
      last_node_id: 0,
      last_link_id: 0,
      nodes: [],
      links: [],
      version: 0.4,
    })
  }, [])

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
          onClick={() => { setShowLeftPanel((v) => !v); }}
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
        <Button
          variant="ghost"
          size="sm"
          disabled={!currentWorkflow}
          onClick={() => {
            setSaveName("")
            setSaveDialogOpen(true)
          }}
        >
          <Save className="h-4 w-4 mr-1" />
          저장
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setLoadDialogOpen(true); }}
        >
          <Folder className="h-4 w-4 mr-1" />
          불러오기
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-1" />
          가져오기
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileImport}
        />
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
          onClick={() => { setShowRightPanel((v) => !v); }}
          className={showRightPanel ? "bg-accent" : ""}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      </div>

      {/* 저장 다이얼로그 */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>워크플로우 저장</DialogTitle>
            <DialogDescription>
              현재 에디터의 워크플로우를 저장합니다. 같은 이름이 있으면 덮어씁니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="workflow-name">이름</Label>
              <Input
                id="workflow-name"
                value={saveName}
                onChange={(e) => { setSaveName(e.target.value); }}
                placeholder="워크플로우 이름"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSaveWorkflow()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSaveDialogOpen(false); }}>
              취소
            </Button>
            <Button onClick={handleSaveWorkflow} disabled={!saveName.trim()}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 불러오기 다이얼로그 */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>저장된 워크플로우</DialogTitle>
            <DialogDescription>
              에디터에 저장된 워크플로우 목록입니다. 선택하면 불러옵니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {savedEditorWorkflows.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                저장된 워크플로우가 없습니다.
              </div>
            ) : (
              <ul className="divide-y">
                {savedEditorWorkflows.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between py-2"
                  >
                    <button
                      type="button"
                      className="flex-1 text-left text-sm hover:text-accent-foreground cursor-pointer"
                      onClick={() => { handleLoadWorkflow(w); }}
                    >
                      <span className="font-medium">{w.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(w.savedAt).toLocaleString()}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-2"
                      onClick={() => { handleDeleteWorkflow(w.id); }}
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLoadDialogOpen(false); }}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
