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
import type {
  ComfyWorkflowJSON,
  ComfyWorkflowLink,
} from "@/comfyui/types/workflow"
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
import { useBackendUrl } from "@/comfyui/hooks/useBackendUrl"
import { useBackendHealth } from "@/comfyui/hooks/useBackendHealth"
import { toast } from "sonner"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { ReactGraphEditor } from "@/components/graph/react/ReactGraphEditor"
import {
  useEditorSavedWorkflows,
  type EditorSavedWorkflow,
} from "@/comfyui/hooks/useEditorSavedWorkflows"
import { convertGraphToPrompt } from "@/comfyui/services/appService"
import {
  buildWorkflowJSON,
  normalizeWorkflowLinks,
} from "@/comfyui/utils/workflowGraphModel"

/* ------------------------------------------------------------------ */
/*  실행 상태 뱃지 컴포넌트                                            */
/* ------------------------------------------------------------------ */

interface ExecutionStatusBadgeProps {
  status: "idle" | "running" | "success" | "error" | "interrupted"
  completedCount: number
  totalCount: number
  progressPercent: number
}

const STATUS_CONFIG: Record<
  NonNullable<ExecutionStatusBadgeProps["status"]>,
  {
    bg: string
    border: string
    text: string
    icon: React.ReactNode
    label: string
  }
> = {
  idle: { bg: "", border: "", text: "", icon: null, label: "" },
  running: {
    bg: "bg-green-950/20",
    border: "border-green-500/30",
    text: "text-zinc-300",
    icon: (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
    ),
    label: "", // 진행 중은 별도 렌더링
  },
  success: {
    bg: "bg-green-950/40",
    border: "border-green-500/50",
    text: "text-green-400",
    icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
    label: "실행 완료",
  },
  error: {
    bg: "bg-red-950/40",
    border: "border-red-500/50",
    text: "text-red-400",
    icon: <XCircle className="h-3.5 w-3.5 shrink-0" />,
    label: "실행 오류",
  },
  interrupted: {
    bg: "bg-amber-950/40",
    border: "border-amber-500/50",
    text: "text-amber-400",
    icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
    label: "중지됨",
  },
}

function ExecutionStatusBadge({
  status,
  completedCount,
  totalCount,
  progressPercent,
}: ExecutionStatusBadgeProps): React.JSX.Element {
  if (status === "idle") return <></>

  if (status === "running") {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-md border px-3 py-1 text-xs ${STATUS_CONFIG.running.bg} ${STATUS_CONFIG.running.border}`}
      >
        {STATUS_CONFIG.running.icon}
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] leading-none font-bold text-zinc-300">
              진행 중 ({completedCount}/{totalCount})
            </span>
            <span className="font-mono text-[9px] leading-none font-bold text-green-500">
              {progressPercent}%
            </span>
          </div>
          <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${String(progressPercent)}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  const config = STATUS_CONFIG[status]
  return (
    <div
      className={`flex animate-pulse items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-[10px] leading-none font-bold ${config.bg} ${config.border} ${config.text}`}
    >
      {config.icon}
      {config.label}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  패널 토글 버튼                                                     */
/* ------------------------------------------------------------------ */

interface PanelToggleProps {
  active: boolean
  onToggle: () => void
  children: React.ReactNode
}

function PanelToggle({
  active,
  onToggle,
  children,
}: PanelToggleProps): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      className={active ? "bg-accent" : ""}
    >
      {children}
    </Button>
  )
}

/* ------------------------------------------------------------------ */
/*  메인 컴포넌트                                                      */
/* ------------------------------------------------------------------ */

export function EditorTab(): React.JSX.Element {
  const backendUrl = useBackendUrl()
  const [currentWorkflow, setCurrentWorkflow] =
    useState<ComfyWorkflowJSON | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)

  const {
    workflows: savedEditorWorkflows,
    saveWorkflow: saveEditorWorkflow,
    deleteWorkflow: deleteEditorWorkflow,
  } = useEditorSavedWorkflows()
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

  const completedCount = overallProgress
    ? overallProgress.value
    : executedNodeIds.size
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
    if (typeof window.api.setApiBase === "function") {
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
    return (): void => {
      cancelled = true
    }
  }, [setNodeDefs, backendUrl])

  const handleSaveWorkflow = useCallback((): void => {
    if (saveName.trim() === "") return
    // subgraph definitions 포함을 위해 appService.serializeGraph 사용
    const w = window as unknown as {
      __comfyAppService?: { serializeGraph?: () => ComfyWorkflowJSON }
    }
    const workflow =
      w.__comfyAppService?.serializeGraph?.() ??
      buildWorkflowJSON(
        useReactGraphStore.getState().nodes,
        useReactGraphStore.getState().links
      )
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
          if (
            parsed === null ||
            parsed === undefined ||
            typeof parsed !== "object"
          )
            return
          const workflow = parsed as Record<string, unknown>
          const nodesVal = workflow.nodes
          if (nodesVal === undefined || !Array.isArray(nodesVal)) {
            throw new Error(
              "Invalid ComfyUI workflow JSON: missing nodes array"
            )
          }
          const linksVal = workflow.links as
            | (ComfyWorkflowLink | number[])[]
            | undefined
          if (linksVal !== undefined && Array.isArray(linksVal)) {
            workflow.links = normalizeWorkflowLinks(linksVal)
          }
          setCurrentWorkflow(workflow as unknown as ComfyWorkflowJSON)
        } catch (err) {
          console.error("[EditorTab] Failed to import workflow file:", err)
          alert(
            "워크플로우 파일을 불러오는데 실패했습니다. 올바른 JSON 파일인지 확인해주세요."
          )
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

  const handleLoadWorkflow = useCallback((w: EditorSavedWorkflow): void => {
    setCurrentWorkflow(w.workflow)
    setLoadDialogOpen(false)
  }, [])

  const handleDeleteWorkflow = useCallback(
    (id: string): void => {
      deleteEditorWorkflow(id)
    },
    [deleteEditorWorkflow]
  )

  const handleNewWorkflow = useCallback((): void => {
    setCurrentWorkflow(buildWorkflowJSON([], []))
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

    const workflowJSON = buildWorkflowJSON(nodes, links)

    try {
      await window.api.queuePrompt(0, {
        output: workflow,
        workflow: workflowJSON,
      })
      toast.success("워크플로우가 실행 큐에 추가되었습니다.")
    } catch (err) {
      console.error("Failed to queue prompt:", err)
      toast.error("워크플로우 실행에 실패했습니다.")
    }
  }, [])

  // 노드 라이브러리에서 노드 추가
  const handleAddNode = useCallback(
    (type: string): void => {
      const def = nodeDefs[type]
      const state = useReactGraphStore.getState()
      const pos: [number, number] = [
        Math.round(150 - state.pan[0] / state.zoom),
        Math.round(150 - state.pan[1] / state.zoom),
      ]
      state.addNode(type, pos, def)
    },
    [nodeDefs]
  )

  return (
    <div className="flex h-full w-full flex-col">
      {/* 툴바 */}
      <div className="flex shrink-0 items-center gap-2 border-b bg-background px-3 py-2">
        <PanelToggle
          active={showLeftPanel}
          onToggle={() => {
            setShowLeftPanel((v) => !v)
          }}
        >
          <PanelLeft className="h-4 w-4" />
        </PanelToggle>
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
        <div className="flex flex-1 items-center justify-end gap-3 px-4">
          <ExecutionStatusBadge
            status={executionStatus}
            completedCount={completedCount}
            totalCount={totalCount}
            progressPercent={progressPercent}
          />
        </div>

        {executionStatus === "running" ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              void (async (): Promise<void> => {
                try {
                  await window.api.interrupt(null)
                  toast.success("실행 중지 요청을 보냈습니다.")
                } catch (err) {
                  console.error("Failed to interrupt:", err)
                  toast.error("실행 중지에 실패했습니다.")
                }
              })()
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
            onClick={() => {
              void handleRunFromEditor()
            }}
            disabled={!isAliveBackend}
            className="gap-1"
          >
            <Play className="h-4 w-4" />
            실행
          </Button>
        )}
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          id="comfy-clear-button"
          onClick={handleNewWorkflow}
        >
          <FolderOpen className="mr-1 h-4 w-4" />새 워크플로우
        </Button>
        <Button
          variant="ghost"
          size="sm"
          id="comfy-save-button"
          disabled={!currentWorkflow}
          onClick={() => {
            setSaveName("")
            setSaveDialogOpen(true)
          }}
        >
          <Save className="mr-1 h-4 w-4" />
          저장
        </Button>
        <Button
          variant="ghost"
          size="sm"
          id="comfy-load-button"
          onClick={() => {
            setLoadDialogOpen(true)
          }}
        >
          <Folder className="mr-1 h-4 w-4" />
          불러오기
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1 h-4 w-4" />
          가져오기
        </Button>
        <input
          ref={fileInputRef}
          id="comfy-file-input"
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileImport}
        />
        <div className="flex-1" />
        <div className="mx-1 h-4 w-px bg-border" />
        <PanelToggle
          active={showRightPanel}
          onToggle={() => {
            setShowRightPanel((v) => !v)
          }}
        >
          <PanelRight className="h-4 w-4" />
        </PanelToggle>
      </div>

      {/* 저장 다이얼로그 */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>워크플로우 저장</DialogTitle>
            <DialogDescription>
              현재 에디터의 워크플로우를 저장합니다. 같은 이름이 있으면
              덮어씁니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="workflow-name">이름</Label>
              <Input
                id="workflow-name"
                value={saveName}
                onChange={(e) => {
                  setSaveName(e.target.value)
                }}
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
            <Button
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false)
              }}
            >
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
              <div className="py-8 text-center text-sm text-muted-foreground">
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
                      className="flex-1 cursor-pointer text-left text-sm hover:text-accent-foreground"
                      onClick={() => {
                        handleLoadWorkflow(w)
                      }}
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
                      onClick={() => {
                        handleDeleteWorkflow(w.id)
                      }}
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
            <Button
              variant="outline"
              onClick={() => {
                setLoadDialogOpen(false)
              }}
            >
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 메인 영역: 좌-중-우 */}
      <div className="flex min-h-0 flex-1">
        {/* 좌측: Node Library */}
        {showLeftPanel && (
          <div className="w-64 shrink-0 border-r">
            <NodeLibrarySidebar onAddNode={handleAddNode} />
          </div>
        )}

        {/* 중앙: Canvas */}
        <div className="relative min-w-0 flex-1">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              노드 정의 로드 중...
            </div>
          ) : Object.keys(nodeDefs).length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
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
