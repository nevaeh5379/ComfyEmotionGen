import {
  Code2,
  Copy,
  Download,
  FolderOpen,
  Workflow,
  ArrowUpRight,
  ExternalLink,
  Columns2,
  Rows2,
  RotateCcw,
} from "lucide-react"
import { useCallback } from "react"
import { format } from "date-fns"
import { toast } from "sonner"

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
import { useTemplateContext } from "../contexts/TemplateContext"
import { useWorkflowContext } from "../contexts/WorkflowContext"
import { useNodeMappingContext } from "../contexts/NodeMappingContext"

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
  randomRunCount: number
  setRandomRunCount: (value: number | ((prev: number) => number)) => void
  estimatedRunCount: number | null
  canRun: boolean
  previewCount: number

  // Composition tab
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (tab: "ceg" | "workflow") => void

  // UI Callbacks
  onPreviewOpen: () => void
  onAxisFilterOpen: () => void
  onSelectionOpen: () => void
  hasActiveFilter: boolean
  onGraphOpen: () => void

  // Floating Window controls
  isFloating?: boolean
  onFloatToggle?: () => void
  onHeaderDragStart?: (e: React.MouseEvent) => void

  // Layout orientation
  jobsLayoutOrientation?: "horizontal" | "vertical"
  onToggleJobsLayoutOrientation?: () => void
}

// ---------------------------------------------------------------------------
// WorkCompositionPanel
// ---------------------------------------------------------------------------

export function WorkCompositionPanel({
  repeatCount,
  setRepeatCount,
  handleRun,
  handleRandomRun,
  randomRunCount,
  setRandomRunCount,
  estimatedRunCount,
  canRun,
  previewCount,
  compositionTab,
  setCompositionTab,
  onPreviewOpen,
  onAxisFilterOpen,
  onSelectionOpen,
  hasActiveFilter,
  onGraphOpen,
  isFloating,
  onFloatToggle,
  onHeaderDragStart,
  jobsLayoutOrientation,
  onToggleJobsLayoutOrientation,
}: WorkCompositionPanelProps) {
  // ── Consume contexts ──
  const template = useTemplateContext()
  const workflow = useWorkflowContext()
  const nodeMapping = useNodeMappingContext()

  // Helper to generate a unique preset/workflow/template name if conflict exists
  const getUniquePresetName = useCallback((baseName: string, existingNames: string[]) => {
    const trimmed = baseName.trim()
    let name = trimmed
    let counter = 1
    while (existingNames.includes(name)) {
      name = `${trimmed} (${counter})`
      counter++
    }
    return name
  }, [])

  const handleUpdateWorkflow = useCallback(() => {
    if (!workflow.activeWorkflow) return
    if (
      workflow.activeWorkflow.workflow !== workflow.workflowJson &&
      workflow.onPendingUpdate
    ) {
      workflow.onPendingUpdate(
        workflow.activeWorkflow.name,
        "workflow",
        workflow.activeWorkflow.workflow,
        workflow.workflowJson
      )
    } else {
      workflow.saveWorkflow(
        workflow.activeWorkflow.name,
        workflow.workflowJson
      )
    }
  }, [workflow])

  // ── File open handler (drag-and-drop / file input) ──
  const handleWorkflowFileOpen = useCallback(
    (content: string, fileName: string) => {
      try {
        // Validate JSON
        const parsed = JSON.parse(content)
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
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

        toast.success(`'${uniqueName}' 워크플로우 프리셋이 자동으로 저장되었습니다.`)
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
    if (!active || !active.template.trim()) return
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
          onValueChange={(v) => setCompositionTab(v as "ceg" | "workflow")}
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
                randomRunCount={randomRunCount}
                setRandomRunCount={setRandomRunCount}
                canRun={canRun}
                estimatedRunCount={estimatedRunCount}
                onSelectionOpen={onSelectionOpen}
                hasActiveFilter={hasActiveFilter}
                onAxisFilterOpen={onAxisFilterOpen}
                onGraphOpen={onGraphOpen}
                className="hidden md:flex"
              />
              {onToggleJobsLayoutOrientation && jobsLayoutOrientation && (
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
                        {isFloating ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="border border-line bg-popover text-xs font-bold text-popover-foreground">
                      {isFloating
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
                (name) => template.onPendingSave(name, "template"),
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
                  ? () => {
                      const active = template.savedTemplates.find(
                        (t) => t.id === template.activeTemplateId
                      )!
                      // Check if content changed and show diff
                      if (
                        active.template !== template.cegTemplate &&
                        template.onPendingUpdate
                      ) {
                        template.onPendingUpdate(
                          active.name,
                          "template",
                          active.template,
                          template.cegTemplate
                        )
                      } else {
                        template.saveTemplate(active.name, template.cegTemplate)
                      }
                    }
                  : undefined
              }
              onDownloadSingle={handleDownloadTemplate}
              onFileOpen={handleTemplateFileOpen}
              isDirty={template.isDirty}
              onRevert={template.revert}
            />
          </TabsContent>

          <TabsContent
            value="workflow"
            className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
              <div className="relative flex items-center justify-center shrink-0">
                <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                {workflow.isDirty && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500"></span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <SaveInputBar
                  key={workflow.workflowResetKey}
                  onSave={makeSaveCallback(
                    workflow.savedWorkflows,
                    (name) => workflow.onPendingSave(name, "workflow"),
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
                      () => nodeMapping.setNodeMappings([]),
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
              {workflow.parsedWorkflow?.success && (
                <span className="mono shrink-0 text-[10px] text-muted-foreground">
                  {Object.keys(workflow.parsedWorkflow.data).length} Nodes
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {workflow.isDirty && workflow.revert && (
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
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onload = (ev) => {
                              const content = ev.target?.result as string
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
                      onClick={() =>
                        navigator.clipboard.writeText(workflow.workflowJson)
                      }
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

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={onGraphOpen}
                    >
                      <Workflow className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>그래프 보기</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Scrollable Body */}
            <div
              className="flex min-h-0 flex-1 flex-col overflow-y-auto"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                  e.preventDefault()
                  if (workflow.activeWorkflow) {
                    handleUpdateWorkflow()
                  } else {
                    const input = e.currentTarget.parentElement?.querySelector("input")
                    input?.focus()
                  }
                }
              }}
            >
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
            </div>

            {workflow.parsedWorkflow && !workflow.parsedWorkflow.success && (
              <div className="shrink-0 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                workflow 파싱 오류: {workflow.parsedWorkflow.error?.message}
              </div>
            )}

            {workflow.parsedWorkflow?.success && (
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
                pendingSaveType={null}
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
                  if (workflow.activeWorkflowId) {
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
                  if (workflow.activeWorkflowId)
                    nodeMapping.deleteMappingPreset(
                      workflow.activeWorkflowId,
                      presetId
                    )
                }}
                onUpdateNodeMapping={() => {
                  if (
                    nodeMapping.activeNodeMappingPreset &&
                    workflow.activeWorkflowId
                  )
                    nodeMapping.saveMappingPreset(
                      workflow.activeWorkflowId,
                      nodeMapping.activeNodeMappingPreset.name,
                      nodeMapping.nodeMappings
                    )
                }}
                onPendingNameConflict={() => {}}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
