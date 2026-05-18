import {
  Code2,
  Copy,
  Download,
  Settings,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { CompositionTabsList } from "./CompositionTabsList"
import { WorkCompositionToolbar } from "./WorkCompositionToolbar"
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

  // Composition tab
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (tab: "ceg" | "workflow") => void

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
  compositionTab,
  setCompositionTab,
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
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs
          value={compositionTab}
          onValueChange={(v) => setCompositionTab(v as "ceg" | "workflow")}
          className="flex min-h-0 flex-1 flex-col "
        >
          <div className="py-2 px-3 flex shrink-0 items-center justify-between border-b">
            <CompositionTabsList className="hidden md:inline-flex"/>
            <WorkCompositionToolbar
              repeatCount={repeatCount}
              setRepeatCount={setRepeatCount}
              handleRun={handleRun}
              canRun={canRun}
              estimatedRunCount={estimatedRunCount}
              onSelectionOpen={onSelectionOpen}
              hasActiveFilter={hasActiveFilter}
              onAxisFilterOpen={onAxisFilterOpen}
              onGraphOpen={onGraphOpen}
              className="hidden md:flex"
            />
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
            className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
          >
            {/* Workflow Header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
              <Code2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
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
              {workflow.parsedWorkflow?.success && (
                <span className="mono shrink-0 text-[10px] text-muted-foreground">
                  {Object.keys(workflow.parsedWorkflow.data).length} Nodes
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1">
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

            {/* Scrollable Body */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <CodeEditor
                language="json"
                placeholder="워크플로우 JSON 입력"
                value={workflow.workflowJson}
                onChange={workflow.setWorkflowJson}
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
        </Tabs></div></>
  )
}
