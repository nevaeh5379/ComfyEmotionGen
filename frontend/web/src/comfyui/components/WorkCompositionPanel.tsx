import {
  MinusIcon,
  PlusIcon,
  Code2,
  EllipsisVertical,
  Copy,
  Download,
  Settings,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import CodeEditor from "@/components/CodeEditor"

import { CegTemplatePanel } from "./CegTemplatePanel"
import { SaveInputBar } from "./SavedItemsManager"
import { NodeMappingSection } from "./NodeMappingSection"
import { useTemplateContext } from "../contexts/TemplateContext"
import { useWorkflowContext } from "../contexts/WorkflowContext"
import { useNodeMappingContext } from "../contexts/NodeMappingContext"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkCompositionPanelProps {
  // Job Runner
  repeatCount: number
  setRepeatCount: (value: number | ((prev: number) => number)) => void
  handleRun: () => void
  estimatedRunCount: number | null
  canRun: boolean
  previewCount: number

  // UI Callbacks
  onPreviewOpen: () => void
  onAxisFilterOpen: () => void
  onSelectionOpen: () => void
  hasActiveFilter: boolean
  onGraphOpen: () => void
}

// ---------------------------------------------------------------------------
// WorkCompositionPanel
// ---------------------------------------------------------------------------

export function WorkCompositionPanel({
  repeatCount,
  setRepeatCount,
  handleRun,
  estimatedRunCount,
  canRun,
  previewCount,
  onPreviewOpen,
  onAxisFilterOpen,
  onSelectionOpen,
  hasActiveFilter,
  onGraphOpen,
}: WorkCompositionPanelProps) {
  // ── Consume contexts ──
  const template = useTemplateContext()
  const workflow = useWorkflowContext()
  const nodeMapping = useNodeMappingContext()

  return (
    <>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs defaultValue="ceg" className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-1.5">
            <TabsList className="h-6 gap-0 bg-transparent p-0">
              <TabsTrigger
                value="ceg"
                className="h-6 rounded-[5px] px-2 py-0.5 text-[11px] data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none"
              >
                CEG 탬플릿
              </TabsTrigger>
              <TabsTrigger
                value="workflow"
                className="h-6 rounded-[5px] px-2 py-0.5 text-[11px] data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none"
              >
                ComfyUI 워크플로우
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <div className="flex h-6 items-center overflow-hidden rounded-[3px] border border-line bg-panel">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-5 rounded-none"
                  onClick={() => setRepeatCount((c) => Math.max(1, c - 1))}
                >
                  <MinusIcon className="h-3 w-3" />
                </Button>
                <input
                  type="number"
                  className="mono h-full w-8 border-x border-line bg-transparent text-center text-[11px] font-semibold outline-none"
                  min={1}
                  value={repeatCount}
                  onChange={(e) =>
                    setRepeatCount(Math.max(1, Number(e.target.value) || 1))
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-5 rounded-none"
                  onClick={() => setRepeatCount((c) => c + 1)}
                >
                  <PlusIcon className="h-3 w-3" />
                </Button>
              </div>
              <Button
                variant="default"
                size="sm"
                className="h-6 bg-foreground px-3 text-[11px] font-semibold text-background hover:bg-foreground/90"
                onClick={handleRun}
                disabled={!canRun}
              >
                실행
                {estimatedRunCount !== null
                  ? ` (${estimatedRunCount}${repeatCount > 1 ? ` × ${repeatCount}` : ""})`
                  : ""}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                  >
                    <EllipsisVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={onSelectionOpen}
                    disabled={!canRun}
                  >
                    선택 실행
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onAxisFilterOpen}>
                    축 필터
                    {hasActiveFilter ? ` (${estimatedRunCount})` : ""}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              onSaveTemplate={(name) => {
                const trimmed = name.trim()
                if (template.savedTemplates.some((t) => t.name === trimmed)) {
                  template.onPendingSave(trimmed, "template")
                  return false
                }
                const saved = template.saveTemplate(
                  trimmed,
                  template.cegTemplate
                )
                template.setActiveTemplateId(saved.id)
                return true
              }}
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
                      template.saveTemplate(active.name, template.cegTemplate)
                    }
                  : undefined
              }
            />
          </TabsContent>

          <TabsContent
            value="workflow"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">
                    ComfyUI API 워크플로우
                  </span>
                  {workflow.parsedWorkflow?.success && (
                    <span className="mono text-[10px] text-muted-foreground">
                      노드 {Object.keys(workflow.parsedWorkflow.data).length}개
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    title="복사"
                    onClick={() =>
                      navigator.clipboard.writeText(workflow.workflowJson)
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    title="다운로드"
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    title="그래프 보기"
                    onClick={onGraphOpen}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <CodeEditor
                language="json"
                placeholder="ComfyUI API 워크플로우 입력 칸"
                value={workflow.workflowJson}
                onChange={workflow.setWorkflowJson}
                minHeight="100px"
                maxHeight="280px"
                bareWrapper
                className="h-full min-h-0 w-full flex-1"
              />
              <div className="flex items-center justify-end border-t border-line px-3 py-1.5">
                <SaveInputBar
                  key={workflow.workflowResetKey}
                  onSave={(name) => {
                    const trimmed = name.trim()
                    if (
                      workflow.savedWorkflows.some((w) => w.name === trimmed)
                    ) {
                      workflow.onPendingSave(trimmed, "workflow")
                      return false
                    }
                    const w = workflow.saveWorkflow(
                      trimmed,
                      workflow.workflowJson
                    )
                    workflow.setActiveWorkflowId(w.id)
                    return true
                  }}
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
                  onUpdate={() => {
                    if (workflow.activeWorkflow)
                      workflow.saveWorkflow(
                        workflow.activeWorkflow.name,
                        workflow.workflowJson
                      )
                  }}
                />
              </div>
            </div>

            {workflow.parsedWorkflow && !workflow.parsedWorkflow.success && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
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
                  const trimmed = name.trim()
                  if (
                    nodeMapping.savedNodeMappings.some(
                      (m) => m.name === trimmed
                    )
                  ) {
                    return false
                  }
                  if (workflow.activeWorkflowId)
                    nodeMapping.saveMappingPreset(
                      workflow.activeWorkflowId,
                      trimmed,
                      nodeMapping.nodeMappings
                    )
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
