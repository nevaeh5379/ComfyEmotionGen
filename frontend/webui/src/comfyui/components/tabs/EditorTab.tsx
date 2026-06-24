/**
 * EditorTab - 워크플로우 에디터 탭
 * ComfyUI 수준의 노드 에디터 제공
 * 좌: Node Library, 중: Canvas, 우: Properties
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { NodeLibrarySidebar } from "@/components/graph/NodeLibrarySidebar"
import { NodePropertiesPanel } from "@/components/graph/NodePropertiesPanel"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { useGraphStore } from "@/comfyui/stores/graphStore"
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
  Play,
  Square,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react"
import { useBackend } from "@/comfyui/hooks/useBackend"
import { useBackendHealth } from "@/comfyui/hooks/useBackendHealth"
import { toast } from "sonner"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { ReactGraphEditor } from "@/components/graph/react/ReactGraphEditor"
import {
  useEditorSavedWorkflows,
  type EditorSavedWorkflow,
} from "@/comfyui/hooks/useEditorSavedWorkflows"
import { convertGraphToPrompt } from "@/comfyui/services/appService"

export function EditorTab(): React.JSX.Element {
  const { workers, backendUrl } = useBackend()
  const [currentWorkflow, setCurrentWorkflow] = useState<ComfyWorkflowJSON | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)

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

  // ComfyUI 백엔드 실행 상태 가져오기
  const executionStatus = useReactGraphStore((s) => s.executionStatus)
  const executedNodeIds = useReactGraphStore((s) => s.executedNodeIds)
  const overallProgress = useReactGraphStore((s) => s.overallProgress)
  const nodes = useReactGraphStore((s) => s.nodes)

  const activeNodes = useMemo(() => {
    return nodes.filter((n) => n.mode !== 4 && n.mode !== 2) // 4: BYPASS, 2: NEVER
  }, [nodes])

  const completedCount = overallProgress ? overallProgress.value : executedNodeIds.size
  const totalCount = overallProgress ? overallProgress.max : activeNodes.length

  const progressPercent = useMemo(() => {
    if (totalCount === 0) return 0
    return Math.min(100, Math.round((completedCount / totalCount) * 100))
  }, [completedCount, totalCount])

  // currentWorkflow가 갱신되면 reactGraphStore 및 백그라운드 LiteGraph에 연동
  useEffect(() => {
    if (!currentWorkflow) return
    if (window.__comfyAppService) {
      window.__comfyAppService.loadGraphData(currentWorkflow)
    } else {
      useReactGraphStore.getState().setGraph(currentWorkflow)
    }
  }, [currentWorkflow])

  // CEG 백엔드 URL 동기화 및 ComfyUI API WebSocket 초기화
  useEffect(() => {
    if (window.api && typeof window.api.setApiBase === "function") {
      window.api.setApiBase(backendUrl)
    }
  }, [backendUrl])

  // object_info 로드
  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        setIsLoading(true)
        const defs = await window.api.getNodeDefs()
        if (!cancelled) {
          setNodeDefs(defs)
        }
      } catch (err) {
        console.error("[EditorTab] Failed to load object_info:", err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return (): void => { cancelled = true }
  }, [setNodeDefs, backendUrl])

  const handleSaveWorkflow = useCallback((): void => {
    if (saveName.trim() === "") return
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
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e: ProgressEvent<FileReader>): void => {
        try {
          const text = e.target?.result as string | undefined
          if (typeof text !== "string") return
          const parsed = JSON.parse(text) as unknown
          if (parsed === null || parsed === undefined || typeof parsed !== "object") return
          const workflow = parsed as Record<string, unknown>
          const nodesVal = workflow.nodes
          if (nodesVal === undefined || !Array.isArray(nodesVal)) {
            throw new Error("Invalid ComfyUI workflow JSON: missing nodes array")
          }
          // 링크 정규화: 배열 [id, origin_id, origin_slot, target_id, target_slot, type] → 객체
          const linksVal = workflow.links
          if (linksVal !== undefined && Array.isArray(linksVal)) {
            workflow.links = linksVal.map((l: unknown) => {
              if (Array.isArray(l)) {
                return { id: l[0] as number, origin_id: l[1] as number, origin_slot: l[2] as number, target_id: l[3] as number, target_slot: l[4] as number, type: l[5] !== undefined && l[5] !== null ? (l[5] as string) : "*" }
              }
              return l
            })
          }
          setCurrentWorkflow(workflow as unknown as ComfyWorkflowJSON)
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
    (w: EditorSavedWorkflow): void => {
      setCurrentWorkflow(w.workflow)
      setLoadDialogOpen(false)
    },
    []
  )

  const handleDeleteWorkflow = useCallback(
    (id: string): void => {
      deleteEditorWorkflow(id)
    },
    [deleteEditorWorkflow]
  )

  const handleNewWorkflow = useCallback((): void => {
    setCurrentWorkflow({
      last_node_id: 0,
      last_link_id: 0,
      nodes: [],
      links: [],
      version: 0.4,
    })
  }, [])

  const { isAliveBackend } = useBackendHealth()

  const handleRunFromEditor = useCallback(async (): Promise<void> => {
    const state = useReactGraphStore.getState()
    const { nodes, links } = state

    if (nodes.length === 0) {
      toast.error("실행할 워크플로우가 없습니다.")
      return
    }

    const workflow = window.__comfyAppService
      ? window.__comfyAppService.graphToPrompt()
      : convertGraphToPrompt(nodes, links)

    const workflowJSON: ComfyWorkflowJSON = {
      last_node_id: Math.max(0, ...nodes.map((n) => n.id)),
      last_link_id: Math.max(0, ...links.map((l) => l.id)),
      nodes,
      links,
      version: 0.4,
    }

    try {
      await window.api.queuePrompt(0, { output: workflow, workflow: workflowJSON })
      toast.success("워크플로우가 실행 큐에 추가되었습니다.")
    } catch (err) {
      console.error("Failed to queue prompt:", err)
      toast.error("워크플로우 실행에 실패했습니다.")
    }
  }, [])

  // 노드 라이브러리에서 노드 추가
  const handleAddNode = useCallback((type: string): void => {
    const def = nodeDefs[type]
    const state = useReactGraphStore.getState()
    const pos: [number, number] = [
      Math.round(150 - state.pan[0] / state.zoom),
      Math.round(150 - state.pan[1] / state.zoom)
    ]
    state.addNode(type, pos, def)
  }, [nodeDefs])

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
        <div className="flex-1 flex items-center justify-end gap-3 px-4">
          {executionStatus === "running" && (
            <div className="flex items-center gap-2.5 bg-green-950/20 border border-green-500/30 px-3 py-1 rounded-md text-xs">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[10px] text-zinc-300 leading-none">
                    진행 중 ({completedCount}/{totalCount})
                  </span>
                  <span className="font-mono text-[9px] text-green-500 font-bold leading-none">{progressPercent}%</span>
                </div>
                <div className="w-28 h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {executionStatus === "success" && (
            <div className="flex items-center gap-1.5 bg-green-950/40 border border-green-500/50 px-2.5 py-1 rounded-md text-xs text-green-400 font-bold text-[10px] leading-none animate-pulse">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              실행 완료
            </div>
          )}

          {executionStatus === "error" && (
            <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-500/50 px-2.5 py-1 rounded-md text-xs text-red-400 font-bold text-[10px] leading-none animate-pulse">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              실행 오류
            </div>
          )}

          {executionStatus === "interrupted" && (
            <div className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-500/50 px-2.5 py-1 rounded-md text-xs text-amber-400 font-bold text-[10px] leading-none animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              중지됨
            </div>
          )}
        </div>

        {executionStatus === "running" ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              try {
                await (window as any).api.interrupt(null)
                toast.success("실행 중지 요청을 보냈습니다.")
              } catch (err) {
                console.error("Failed to interrupt:", err)
                toast.error("실행 중지에 실패했습니다.")
              }
            }}
            className="gap-1 bg-red-900 hover:bg-red-800"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            중지
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => { void handleRunFromEditor(); }}
            disabled={!isAliveBackend}
            className="gap-1"
          >
            <Play className="h-4 w-4" />
            실행
          </Button>
        )}
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
          ) : (
            <ReactGraphEditor />
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
