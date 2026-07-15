import {
  Code2,
  Copy,
  Download,
  FolderOpen,
  ArrowUpRight,
  ExternalLink,
  Columns2,
  Rows2,
  RotateCcw,
  SlidersHorizontal,
  Server,
  Braces,
  Play,
  Shuffle,
  Clock,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { ComfyWorkflowImportDialog } from "./ComfyWorkflowImportDialog"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { CompositionTabsList } from "./CompositionTabsList"
import { WorkCompositionToolbar } from "./WorkCompositionToolbar"
import CodeEditor from "@/components/CodeEditor"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { CegTemplatePanel } from "./CegTemplatePanel"
import { SaveInputBar } from "./SavedItemsManager"
import { NodeMappingSection } from "./NodeMappingSection"
import { WorkflowFormEditor } from "./WorkflowFormEditor"
import { JsonTreeEditor } from "./JsonTreeEditor"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useTemplateContext } from "../contexts/useTemplateContext"
import { useWorkflowContext } from "../contexts/WorkflowContext"
import { useNodeMappingContext } from "../contexts/NodeMappingContext"
import type { WorkerView } from "../types/Message"
import type { RenderItem, RenderItemsResponse } from "../types/renderTypes"
import {
  itemKey,
  randomSelect,
  substitute,
  type AxisValueFilter,
} from "../../lib/workflowUtils"

const WORKFLOW_TEST_RECENTS_KEY = "workflow_test_recent_items"
const MAX_WORKFLOW_TEST_RECENTS = 5

function loadWorkflowTestRecents(): RenderItem[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(WORKFLOW_TEST_RECENTS_KEY) ?? "[]"
    ) as unknown
    return Array.isArray(value) ? (value as RenderItem[]) : []
  } catch {
    return []
  }
}

function saveWorkflowTestRecent(item: RenderItem): void {
  const next = [
    item,
    ...loadWorkflowTestRecents().filter(
      (recent) => itemKey(recent) !== itemKey(item)
    ),
  ].slice(0, MAX_WORKFLOW_TEST_RECENTS)
  try {
    localStorage.setItem(WORKFLOW_TEST_RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* ignore storage errors */
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSaveCallback(
  existingItems: { name: string }[],
  onConflict: (name: string) => void,
  doSave: (name: string) => { id: string },
  setActiveId: (id: string) => void
): (name: string) => boolean {
  return (name) => {
    const trimmed = name.trim() || format(new Date(), "yyyy-MM-dd HH:mm")
    if (existingItems.some((item) => item.name === trimmed)) {
      onConflict(trimmed)
      return false
    }
    const saved = doSave(trimmed)
    setActiveId(saved.id)
    return true
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkCompositionPanelProps {
  // Job Runner
  repeatCount: number
  setRepeatCount: (value: number | ((prev: number) => number)) => void
  handleRun: () => void
  handleRandomRun: (count: number) => void
  handleRunUnapproved: () => void
  randomRunCount: number
  setRandomRunCount: (value: number | ((prev: number) => number)) => void
  estimatedRunCount: number | null
  canRun: boolean
  previewCount: number
  workers: WorkerView[]
  targetWorkerId: string | null
  setTargetWorkerId: (value: string | null) => void
  // Composition tab
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (tab: "ceg" | "workflow") => void
  // UI Callbacks
  onPreviewOpen: () => void
  onAxisFilterOpen: () => void
  onSelectionOpen: () => void
  hasActiveFilter: boolean
  // Floating Window controls
  isFloating?: boolean
  onFloatToggle?: () => void
  onHeaderDragStart?: (e: React.MouseEvent) => void
  // Layout orientation
  jobsLayoutOrientation?: "horizontal" | "vertical"
  onToggleJobsLayoutOrientation?: () => void
  // Axis entry context menu (for CegTemplatePanel)
  axisValueFilter?: AxisValueFilter | undefined
  setAxisValueFilter?:
    | React.Dispatch<React.SetStateAction<AxisValueFilter>>
    | undefined
  renderResponse?: RenderItemsResponse | null | undefined
  onRunSingle?: ((item: RenderItem) => Promise<boolean>) | undefined
  parserError?: string | null | undefined
  parserErrorLine?: number | null | undefined
  parserErrorColumn?: number | null | undefined
}

// ---------------------------------------------------------------------------
// WorkCompositionPanel
// ---------------------------------------------------------------------------

export function WorkCompositionPanel({
  repeatCount,
  setRepeatCount,
  handleRun,
  handleRandomRun,
  handleRunUnapproved,
  randomRunCount,
  setRandomRunCount,
  estimatedRunCount,
  canRun,
  previewCount,
  workers,
  targetWorkerId,
  setTargetWorkerId,
  compositionTab,
  setCompositionTab,
  onPreviewOpen,
  onAxisFilterOpen,
  onSelectionOpen,
  hasActiveFilter,
  isFloating,
  onFloatToggle,
  onHeaderDragStart,
  jobsLayoutOrientation,
  onToggleJobsLayoutOrientation,
  axisValueFilter,
  setAxisValueFilter,
  renderResponse,
  onRunSingle,
  parserError,
  parserErrorLine,
  parserErrorColumn,
}: WorkCompositionPanelProps): React.ReactNode {
  // ── Consume contexts ──
  const template = useTemplateContext()
  const workflow = useWorkflowContext()
  const nodeMapping = useNodeMappingContext()

  const [viewMode, setViewMode] = useState<"code" | "form" | "tree">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("workflow_editor_view_mode")
      if (saved === "code" || saved === "form" || saved === "tree") return saved
    }
    return "code"
  })
  const [isComfyImportOpen, setIsComfyImportOpen] = useState(false)

  const handleSetViewMode = useCallback((mode: "code" | "form" | "tree") => {
    setViewMode(mode)
    localStorage.setItem("workflow_editor_view_mode", mode)
  }, [])
  const recentTestItems = useMemo(() => {
    if (!renderResponse) return []
    const currentItems = new Map(
      renderResponse.items.map((item) => [itemKey(item), item])
    )
    return loadWorkflowTestRecents()
      .map((item) => currentItems.get(itemKey(item)))
      .filter((item): item is RenderItem => item !== undefined)
      .slice(0, 3)
  }, [renderResponse])

  const runWorkflowTest = useCallback(
    (item: RenderItem) => {
      if (!onRunSingle) return
      saveWorkflowTestRecent(item)
      void onRunSingle(item)
    },
    [onRunSingle]
  )

  // Helper to generate a unique preset/workflow/template name if conflict exists
  const getUniquePresetName = useCallback(
    (baseName: string, existingNames: string[]) => {
      const trimmed = baseName.trim()
      let name = trimmed
      let counter = 1
      while (existingNames.includes(name)) {
        name = `${trimmed} (${String(counter)})`
        counter++
      }
      return name
    },
    []
  )

  const handleUpdateWorkflow = useCallback(() => {
    if (!workflow.activeWorkflow) return
    if (workflow.activeWorkflow.workflow !== workflow.workflowJson) {
      workflow.onPendingUpdate(
        workflow.activeWorkflow.name,
        "workflow",
        workflow.activeWorkflow.workflow,
        workflow.workflowJson
      )
    } else {
      workflow.saveWorkflow(workflow.activeWorkflow.name, workflow.workflowJson)
    }
  }, [workflow])

  // ── File open handler (drag-and-drop / file input) ──
  const handleWorkflowFileOpen = useCallback(
    (content: string, fileName: string) => {
      try {
        // Validate JSON
        const parsed = JSON.parse(content) as Record<string, unknown>
        if (typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error("유효한 워크플로우 JSON 파일이 아닙니다.")
          return
        }

        const formattedJson = JSON.stringify(parsed, null, 2)
        const baseName = fileName.replace(/\.[^/.]+$/, "")
        const existingNames = workflow.savedWorkflows.map((w) => w.name)
        const uniqueName = getUniquePresetName(baseName, existingNames)

        // Save as a new workflow preset automatically
        const saved = workflow.saveWorkflow(uniqueName, formattedJson)

        // Reset mapping presets and set node mappings to empty
        nodeMapping.setActiveNodeMappingPresetId(null)
        nodeMapping.setNodeMappings([])

        // Update workflow context state
        workflow.setWorkflowJson(formattedJson)
        workflow.setActiveWorkflowId(saved.id)
        workflow.setWorkflowResetKey((k) => k + 1)

        toast.success(
          `'${uniqueName}' 워크플로우 프리셋이 자동으로 저장되었습니다.`
        )
      } catch {
        toast.error("JSON 파싱에 실패했습니다.")
      }
    },
    [workflow, nodeMapping, getUniquePresetName]
  )

  const handleTemplateFileOpen = useCallback(
    (content: string, fileName: string) => {
      if (!content.trim()) {
        toast.error("템플릿 내용이 비어 있습니다.")
        return
      }
      const baseName = fileName.replace(/\.[^/.]+$/, "")
      const existingNames = template.savedTemplates.map((t) => t.name)
      const uniqueName = getUniquePresetName(baseName, existingNames)

      const saved = template.saveTemplate(uniqueName, content)

      template.setCegTemplate(content)
      template.setActiveTemplateId(saved.id)
      template.setTemplateResetKey((k) => k + 1)

      toast.success(`'${uniqueName}' 템플릿 프리셋이 자동으로 저장되었습니다.`)
    },
    [template, getUniquePresetName]
  )

  // ── Handle download active template as .ceg file ──
  const handleDownloadTemplate = useCallback(() => {
    const active = template.savedTemplates.find(
      (t) => t.id === template.activeTemplateId
    )
    if (active === undefined || active.template.trim() === "") return
    const blob = new Blob([active.template], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${active.name}.ceg`
    a.click()
    URL.revokeObjectURL(url)
  }, [template])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest("button, input, select, [role='tab'], a, textarea")) {
        return
      }
      onHeaderDragStart?.(e)
    },
    [onHeaderDragStart]
  )

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs
          value={compositionTab}
          onValueChange={(v) => {
            setCompositionTab(v as "ceg" | "workflow")
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            onMouseDown={handleMouseDown}
            className="flex hidden shrink-0 cursor-grab items-center justify-between border-b px-3 py-2 select-none md:inline-flex"
          >
            <CompositionTabsList className="hidden md:inline-flex" />
            <div className="flex items-center gap-2">
              <WorkCompositionToolbar
                repeatCount={repeatCount}
                setRepeatCount={setRepeatCount}
                handleRun={handleRun}
                handleRandomRun={handleRandomRun}
                handleRunUnapproved={handleRunUnapproved}
                randomRunCount={randomRunCount}
                setRandomRunCount={setRandomRunCount}
                canRun={canRun}
                estimatedRunCount={estimatedRunCount}
                onSelectionOpen={onSelectionOpen}
                hasActiveFilter={hasActiveFilter}
                onAxisFilterOpen={onAxisFilterOpen}
                workers={workers}
                targetWorkerId={targetWorkerId}
                setTargetWorkerId={setTargetWorkerId}
                className="hidden md:flex"
              />
              {onToggleJobsLayoutOrientation !== undefined &&
                jobsLayoutOrientation !== undefined && (
                  <>
                    <div className="h-4 w-px shrink-0 bg-line/60" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={onToggleJobsLayoutOrientation}
                        >
                          {jobsLayoutOrientation === "horizontal" ? (
                            <Rows2 className="h-4 w-4" />
                          ) : (
                            <Columns2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="border border-line bg-popover text-xs font-bold text-popover-foreground">
                        {jobsLayoutOrientation === "horizontal"
                          ? "세로 분할 레이아웃으로 전환 (위/아래)"
                          : "가로 분할 레이아웃으로 전환 (왼쪽/오른쪽)"}
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              {onFloatToggle && (
                <>
                  <div className="h-4 w-px shrink-0 bg-line/60" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={onFloatToggle}
                      >
                        {(isFloating ?? false) ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="border border-line bg-popover text-xs font-bold text-popover-foreground">
                      {(isFloating ?? false)
                        ? "원래대로 결합 (Dock)"
                        : "창으로 분리 (Pop out)"}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>

          <TabsContent
            value="ceg"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <CegTemplatePanel
                cegTemplate={template.cegTemplate}
                setCegTemplate={template.setCegTemplate}
                previewCount={previewCount}
                onPreviewOpen={onPreviewOpen}
                templateResetKey={template.templateResetKey}
                savedTemplates={template.savedTemplates}
                activeTemplateId={template.activeTemplateId}
                onSaveTemplate={makeSaveCallback(
                  template.savedTemplates,
                  (name) => {
                    template.onPendingSave(name, "template")
                  },
                  (name) => template.saveTemplate(name, template.cegTemplate),
                  template.setActiveTemplateId
                )}
                onLoadTemplate={(t) => {
                  template.setCegTemplate(t.template)
                  template.setActiveTemplateId(t.id)
                }}
                onDeleteTemplate={(id) => {
                  if (template.activeTemplateId === id)
                    template.setActiveTemplateId(null)
                  template.deleteTemplate(id)
                }}
                onUpdateTemplate={
                  template.savedTemplates.find(
                    (t) => t.id === template.activeTemplateId
                  )
                    ? (): void => {
                        const active = template.savedTemplates.find(
                          (t) => t.id === template.activeTemplateId
                        )
                        if (!active) return
                        // Check if content changed and show diff
                        if (active.template !== template.cegTemplate) {
                          template.onPendingUpdate(
                            active.name,
                            "template",
                            active.template,
                            template.cegTemplate
                          )
                        } else {
                          template.saveTemplate(
                            active.name,
                            template.cegTemplate
                          )
                        }
                      }
                    : undefined
                }
                onDownloadSingle={handleDownloadTemplate}
                onFileOpen={handleTemplateFileOpen}
                isDirty={template.isDirty}
                onRevert={template.revert}
                axisValueFilter={axisValueFilter}
                setAxisValueFilter={setAxisValueFilter}
                renderResponse={renderResponse}
                onRunSingle={onRunSingle}
                parserError={parserError}
                parserErrorLine={parserErrorLine}
                parserErrorColumn={parserErrorColumn}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="workflow"
            className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
              <div className="relative flex shrink-0 items-center justify-center">
                <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                {workflow.isDirty === true && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500"></span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <SaveInputBar
                  key={workflow.workflowResetKey}
                  onSave={makeSaveCallback(
                    workflow.savedWorkflows,
                    (name) => {
                      workflow.onPendingSave(name, "workflow")
                    },
                    (name) =>
                      workflow.saveWorkflow(name, workflow.workflowJson),
                    workflow.setActiveWorkflowId
                  )}
                  allowEmptySave
                  placeholder={
                    workflow.activeWorkflow?.name ?? "워크플로우 이름"
                  }
                  saveDisabled={!workflow.workflowJson.trim()}
                  activeName={workflow.activeWorkflow?.name}
                  items={workflow.savedWorkflows}
                  onLoad={(w) => {
                    nodeMapping.setActiveNodeMappingPresetId(null)
                    workflow.loadWorkflowItem(
                      w,
                      () => {
                        nodeMapping.setNodeMappings([])
                      },
                      (m, presetId) => {
                        nodeMapping.setNodeMappings(m)
                        nodeMapping.setActiveNodeMappingPresetId(presetId)
                      }
                    )
                  }}
                  onDelete={(id) => {
                    if (workflow.activeWorkflowId === id)
                      workflow.setActiveWorkflowId(null)
                    workflow.deleteWorkflow(id)
                  }}
                  activeItemId={workflow.activeWorkflowId ?? undefined}
                  onUpdate={handleUpdateWorkflow}
                />
              </div>
              {workflow.parsedWorkflow?.success === true && (
                <span className="mono mr-1 shrink-0 text-[10px] text-muted-foreground">
                  {Object.keys(workflow.parsedWorkflow.data).length} Nodes
                </span>
              )}

              <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line/40 bg-muted/65 p-0.5 select-none">
                <Button
                  variant={viewMode === "code" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 cursor-pointer px-2 text-[10px] font-extrabold shadow-xs"
                  onClick={() => {
                    handleSetViewMode("code")
                  }}
                >
                  <Code2 className="mr-1 h-3 w-3 text-muted-foreground" />
                  코드
                </Button>
                <Button
                  variant={viewMode === "form" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 cursor-pointer px-2 text-[10px] font-extrabold shadow-xs"
                  onClick={() => {
                    handleSetViewMode("form")
                  }}
                >
                  <SlidersHorizontal className="mr-1 h-3 w-3 text-muted-foreground" />
                  속성 편집
                </Button>
                <Button
                  variant={viewMode === "tree" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 cursor-pointer px-2 text-[10px] font-extrabold shadow-xs"
                  onClick={() => {
                    handleSetViewMode("tree")
                  }}
                >
                  <Braces className="mr-1 h-3 w-3 text-muted-foreground" />
                  JSON 트리
                </Button>
              </div>

              <div className="h-4 w-px shrink-0 bg-line/65" />

              <div className="flex shrink-0 items-center gap-1">
                {workflow.isDirty === true && workflow.revert !== undefined && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={workflow.revert}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>변경사항 취소 (되돌리기)</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={() => {
                        const input = document.createElement("input")
                        input.type = "file"
                        input.accept = ".json,.txt"
                        input.onchange = (e: Event): void => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onload = (
                              _ev: ProgressEvent<FileReader>
                            ): void => {
                              const content = _ev.target?.result as string
                              handleWorkflowFileOpen(content, file.name)
                            }
                            reader.readAsText(file)
                          }
                        }
                        input.click()
                      }}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>워크플로우 파일 열기</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={() => {
                        setIsComfyImportOpen(true)
                      }}
                    >
                      <Server className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    ComfyUI 서버에서 워크플로우 직접 가져오기
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          workflow.workflowJson
                        )
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>워크플로우 JSON 복사</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={() => {
                        const blob = new Blob([workflow.workflowJson], {
                          type: "application/json",
                        })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement("a")
                        a.href = url
                        a.download = "workflow.json"
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>워크플로우 JSON 다운로드</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Scrollable Body + workflow test context menu */}
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto"
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                      e.preventDefault()
                      if (workflow.activeWorkflow) {
                        handleUpdateWorkflow()
                      } else {
                        const input =
                          e.currentTarget.parentElement?.querySelector("input")
                        input?.focus()
                      }
                    }
                  }}
                >
                  {viewMode === "code" ? (
                    <CodeEditor
                      language="json"
                      placeholder="워크플로우 JSON 입력"
                      value={workflow.workflowJson}
                      onChange={workflow.setWorkflowJson}
                      onFileOpen={handleWorkflowFileOpen}
                      minHeight="80px"
                      bareWrapper
                      className="h-full min-h-0 w-full flex-1"
                    />
                  ) : viewMode === "form" ? (
                    <WorkflowFormEditor
                      workflowJson={workflow.workflowJson}
                      onChangeWorkflowJson={workflow.setWorkflowJson}
                      parsedWorkflowData={
                        workflow.parsedWorkflow?.success === true
                          ? workflow.parsedWorkflow.data
                          : null
                      }
                      objectInfo={nodeMapping.objectInfo}
                      onBackToCode={() => {
                        handleSetViewMode("code")
                      }}
                      workers={workers}
                      setObjectInfo={nodeMapping.setObjectInfo}
                    />
                  ) : (
                    <JsonTreeEditor
                      value={workflow.workflowJson}
                      onChange={workflow.setWorkflowJson}
                      onBackToCode={() => {
                        handleSetViewMode("code")
                      }}
                    />
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-64">
                <ContextMenuLabel>워크플로우 바로 테스트</ContextMenuLabel>
                <ContextMenuItem
                  disabled={
                    !canRun ||
                    !onRunSingle ||
                    (renderResponse?.items.length ?? 0) === 0
                  }
                  onSelect={() => {
                    const items = renderResponse?.items
                    if (!items || items.length === 0) return
                    const [item] = randomSelect(items, 1)
                    if (item) runWorkflowTest(item)
                  }}
                >
                  <Shuffle />
                  랜덤 조합으로 테스트
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={
                    !canRun || (renderResponse?.items.length ?? 0) === 0
                  }
                  onSelect={onSelectionOpen}
                >
                  <Play />
                  조합 선택...
                  {(renderResponse?.items.length ?? 0) > 0 ? (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {String(renderResponse?.items.length ?? 0)}개
                    </span>
                  ) : null}
                </ContextMenuItem>
                {recentTestItems.length > 0 && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuLabel>최근 선택한 조합</ContextMenuLabel>
                    {recentTestItems.map((item) => (
                      <ContextMenuItem
                        key={`workflow-recent-${itemKey(item)}`}
                        disabled={!canRun || !onRunSingle}
                        onSelect={() => {
                          runWorkflowTest(item)
                        }}
                      >
                        <Clock className="text-blue-400" />
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
                          {substitute(item.filename, item)}
                        </span>
                      </ContextMenuItem>
                    ))}
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>

            {workflow.parsedWorkflow !== undefined &&
              !workflow.parsedWorkflow.success && (
                <div className="shrink-0 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                  workflow 파싱 오류: {workflow.parsedWorkflow.error.message}
                </div>
              )}

            {workflow.parsedWorkflow?.success === true && (
              <NodeMappingSection
                nodeMappings={nodeMapping.nodeMappings}
                setNodeMappings={nodeMapping.setNodeMappings}
                updateMapping={nodeMapping.updateMapping}
                handleAutoMap={nodeMapping.handleAutoMap}
                handleImageUpload={nodeMapping.handleImageUpload}
                imageUploads={nodeMapping.imageUploads}
                availableNodeOptions={nodeMapping.availableNodeOptions}
                parsedWorkflowData={workflow.parsedWorkflow.data}
                objectInfo={nodeMapping.objectInfo}
                activeWorkflowId={workflow.activeWorkflowId}
                savedNodeMappings={nodeMapping.savedNodeMappings}
                activeNodeMappingPresetId={
                  nodeMapping.activeNodeMappingPresetId
                }
                nodeMappingResetKey={nodeMapping.nodeMappingResetKey}
                savedWorkflows={workflow.savedWorkflows}
                onSaveNodeMapping={(name) => {
                  const trimmed =
                    name.trim() || format(new Date(), "yyyy-MM-dd HH:mm")
                  if (
                    nodeMapping.savedNodeMappings.some(
                      (m) => m.name === trimmed
                    )
                  ) {
                    return false
                  }
                  if (workflow.activeWorkflowId !== null) {
                    const updatedWorkflow = nodeMapping.saveMappingPreset(
                      workflow.activeWorkflowId,
                      trimmed,
                      nodeMapping.nodeMappings
                    )
                    const newPreset = updatedWorkflow?.mappingPresets.find(
                      (p) => p.name === trimmed
                    )
                    if (newPreset)
                      nodeMapping.setActiveNodeMappingPresetId(newPreset.id)
                  }
                  return true
                }}
                onLoadNodeMapping={(m) => {
                  nodeMapping.setNodeMappings(m.mappings)
                  nodeMapping.setActiveNodeMappingPresetId(m.id)
                }}
                onDeleteNodeMapping={(presetId) => {
                  if (nodeMapping.activeNodeMappingPresetId === presetId)
                    nodeMapping.setActiveNodeMappingPresetId(null)
                  if (workflow.activeWorkflowId !== null)
                    nodeMapping.deleteMappingPreset(
                      workflow.activeWorkflowId,
                      presetId
                    )
                }}
                onUpdateNodeMapping={() => {
                  if (
                    nodeMapping.activeNodeMappingPreset !== null &&
                    workflow.activeWorkflowId !== null
                  )
                    nodeMapping.saveMappingPreset(
                      workflow.activeWorkflowId,
                      nodeMapping.activeNodeMappingPreset.name,
                      nodeMapping.nodeMappings
                    )
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ComfyWorkflowImportDialog
        isOpen={isComfyImportOpen}
        onClose={() => {
          setIsComfyImportOpen(false)
        }}
        onImport={(workflowContent, fileName) => {
          try {
            const parsed: unknown = JSON.parse(workflowContent)
            const formattedJson = JSON.stringify(parsed, null, 2)
            const baseName = fileName.replace(/\.[^/.]+$/, "")
            const existingNames = workflow.savedWorkflows.map((w) => w.name)
            const uniqueName = getUniquePresetName(baseName, existingNames)

            // 자동으로 새 프리셋으로 저장
            const saved = workflow.saveWorkflow(uniqueName, formattedJson)

            nodeMapping.setActiveNodeMappingPresetId(null)
            nodeMapping.setNodeMappings([])

            // 상태 동기화 및 렌더링 리셋
            workflow.setWorkflowJson(formattedJson)
            workflow.setActiveWorkflowId(saved.id)
            workflow.setWorkflowResetKey((k) => k + 1)
          } catch (err) {
            console.error("Workflow loading error:", err)
            toast.error(
              "가져온 워크플로우를 처리하는 도중 에러가 발생했습니다."
            )
          }
        }}
        workers={workers}
      />
    </>
  )
}
