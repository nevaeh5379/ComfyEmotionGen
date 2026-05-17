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
import type { ObjectInfo } from "./renderTypes"
import type { SavedTemplate } from "./useSavedTemplates"
import {
  type SavedWorkflow,
  type SavedNodeMappingPreset,
} from "./useSavedWorkflows"
import { type ComfyWorkflow, type NodeMapping } from "@/lib/workflow"

type ParsedWorkflow =
  | { success: true; data: ComfyWorkflow }
  | { success: false; error: { message: string } }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkCompositionPanelProps {
  // Repeat / Run
  repeatCount: number
  setRepeatCount: (value: number | ((prev: number) => number)) => void
  handleRun: () => void
  estimatedRunCount: number | null
  canRun: boolean

  // Preview / Axis filter / Selection sheets
  onPreviewOpen: () => void
  onAxisFilterOpen: () => void
  onSelectionOpen: () => void
  hasActiveFilter: boolean

  // CEG Template
  cegTemplate: string
  setCegTemplate: (value: string) => void
  previewCount: number
  templateResetKey: number
  savedTemplates: SavedTemplate[]
  activeTemplateId: string | null
  setActiveTemplateId: (id: string | null) => void
  saveTemplate: (name: string, template: string) => SavedTemplate
  deleteTemplate: (id: string) => void
  activeTemplate: SavedTemplate | null
  onPendingSave: (
    name: string,
    type: "template" | "workflow" | "nodeMapping"
  ) => void

  // Workflow
  workflowJson: string
  setWorkflowJson: (value: string) => void
  parsedWorkflow: ParsedWorkflow | undefined
  workflowResetKey: number
  savedWorkflows: SavedWorkflow[]
  activeWorkflowId: string | null
  setActiveWorkflowId: (id: string | null) => void
  saveWorkflow: (name: string, workflow: string) => SavedWorkflow
  deleteWorkflow: (id: string) => void
  activeWorkflow: SavedWorkflow | null
  loadWorkflowItem: (w: SavedWorkflow) => void
  onGraphOpen: () => void

  // Node Mappings
  nodeMappings: NodeMapping[]
  setNodeMappings: (
    value: NodeMapping[] | ((prev: NodeMapping[]) => NodeMapping[])
  ) => void
  updateMapping: (id: string, patch: Partial<NodeMapping>) => void
  handleAutoMap: () => void
  handleImageUpload: (file: File, nodeId: string, inputKey: string) => void
  imageUploads: Record<
    string,
    { uploadedName: string | null; error: string | null; uploading: boolean }
  >
  availableNodeOptions: {
    nodeId: string
    title: string
    inputKey: string
    isNumeric: boolean
    isLoadImage: boolean
  }[]
  objectInfo: ObjectInfo | null
  savedNodeMappings: SavedNodeMappingPreset[]
  activeNodeMappingPresetId: string | null
  setActiveNodeMappingPresetId: (id: string | null) => void
  nodeMappingResetKey: number
  saveMappingPreset: (
    workflowId: string,
    name: string,
    mappings: NodeMapping[]
  ) => SavedWorkflow | null
  deleteMappingPreset: (
    workflowId: string,
    presetId: string
  ) => SavedWorkflow | null
  activeNodeMappingPreset: SavedNodeMappingPreset | null
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
  onPreviewOpen,
  onAxisFilterOpen,
  onSelectionOpen,
  hasActiveFilter,
  cegTemplate,
  setCegTemplate,
  previewCount,
  templateResetKey,
  savedTemplates,
  activeTemplateId,
  setActiveTemplateId,
  saveTemplate,
  deleteTemplate,
  activeTemplate,
  onPendingSave,
  workflowJson,
  setWorkflowJson,
  parsedWorkflow,
  workflowResetKey,
  savedWorkflows,
  activeWorkflowId,
  setActiveWorkflowId,
  saveWorkflow,
  deleteWorkflow,
  activeWorkflow,
  loadWorkflowItem,
  onGraphOpen,
  nodeMappings,
  setNodeMappings,
  updateMapping,
  handleAutoMap,
  handleImageUpload,
  imageUploads,
  availableNodeOptions,
  objectInfo,
  savedNodeMappings,
  activeNodeMappingPresetId,
  setActiveNodeMappingPresetId,
  nodeMappingResetKey,
  saveMappingPreset,
  deleteMappingPreset,
  activeNodeMappingPreset,
}: WorkCompositionPanelProps) {
  return (
    <>
      <div className="flex h-7 items-center border-b border-line px-3 whitespace-nowrap">
        <span className="text-[9px] font-semibold tracking-wider text-faint uppercase">
          작업 구성
        </span>
      </div>
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
              cegTemplate={cegTemplate}
              setCegTemplate={setCegTemplate}
              previewCount={previewCount}
              onPreviewOpen={onPreviewOpen}
              templateResetKey={templateResetKey}
              savedTemplates={savedTemplates}
              activeTemplateId={activeTemplateId}
              onSaveTemplate={(name) => {
                const trimmed = name.trim()
                if (savedTemplates.some((t) => t.name === trimmed)) {
                  onPendingSave(trimmed, "template")
                  return false
                }
                const saved = saveTemplate(trimmed, cegTemplate)
                setActiveTemplateId(saved.id)
                return true
              }}
              onLoadTemplate={(t) => {
                setCegTemplate(t.template)
                setActiveTemplateId(t.id)
              }}
              onDeleteTemplate={(id) => {
                if (activeTemplateId === id) setActiveTemplateId(null)
                deleteTemplate(id)
              }}
              onUpdateTemplate={
                activeTemplate
                  ? () => saveTemplate(activeTemplate.name, cegTemplate)
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
                  {parsedWorkflow?.success && (
                    <span className="mono text-[10px] text-muted-foreground">
                      노드 {Object.keys(parsedWorkflow.data).length}개
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    title="복사"
                    onClick={() => navigator.clipboard.writeText(workflowJson)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    title="다운로드"
                    onClick={() => {
                      const blob = new Blob([workflowJson], {
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
                value={workflowJson}
                onChange={setWorkflowJson}
                minHeight="100px"
                maxHeight="280px"
                bareWrapper
                className="h-full min-h-0 w-full flex-1"
              />
              <div className="flex items-center justify-end border-t border-line px-3 py-1.5">
                <SaveInputBar
                  key={workflowResetKey}
                  onSave={(name) => {
                    const trimmed = name.trim()
                    if (savedWorkflows.some((w) => w.name === trimmed)) {
                      onPendingSave(trimmed, "workflow")
                      return false
                    }
                    const w = saveWorkflow(trimmed, workflowJson)
                    setActiveWorkflowId(w.id)
                    return true
                  }}
                  placeholder={activeWorkflow?.name ?? "워크플로우 이름"}
                  saveDisabled={!workflowJson.trim()}
                  activeName={activeWorkflow?.name}
                  items={savedWorkflows}
                  onLoad={loadWorkflowItem}
                  onDelete={(id) => {
                    if (activeWorkflowId === id) setActiveWorkflowId(null)
                    deleteWorkflow(id)
                  }}
                  activeItemId={activeWorkflowId ?? undefined}
                  onUpdate={() => {
                    if (activeWorkflow)
                      saveWorkflow(activeWorkflow.name, workflowJson)
                  }}
                />
              </div>
            </div>

            {parsedWorkflow && !parsedWorkflow.success && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                workflow 파싱 오류: {parsedWorkflow.error?.message}
              </div>
            )}

            {parsedWorkflow?.success && (
              <NodeMappingSection
                nodeMappings={nodeMappings}
                setNodeMappings={setNodeMappings}
                updateMapping={updateMapping}
                handleAutoMap={handleAutoMap}
                handleImageUpload={handleImageUpload}
                imageUploads={imageUploads}
                availableNodeOptions={availableNodeOptions}
                parsedWorkflowData={parsedWorkflow.data}
                objectInfo={objectInfo}
                activeWorkflowId={activeWorkflowId}
                savedNodeMappings={savedNodeMappings}
                activeNodeMappingPresetId={activeNodeMappingPresetId}
                nodeMappingResetKey={nodeMappingResetKey}
                savedWorkflows={savedWorkflows}
                pendingSaveType={null}
                onSaveNodeMapping={(name) => {
                  const trimmed = name.trim()
                  if (savedNodeMappings.some((m) => m.name === trimmed)) {
                    onPendingSave(trimmed, "nodeMapping")
                    return false
                  }
                  if (activeWorkflowId)
                    saveMappingPreset(activeWorkflowId, trimmed, nodeMappings)
                  return true
                }}
                onLoadNodeMapping={(m) => {
                  setNodeMappings(m.mappings)
                  setActiveNodeMappingPresetId(m.id)
                }}
                onDeleteNodeMapping={(presetId) => {
                  if (activeNodeMappingPresetId === presetId)
                    setActiveNodeMappingPresetId(null)
                  if (activeWorkflowId)
                    deleteMappingPreset(activeWorkflowId, presetId)
                }}
                onUpdateNodeMapping={() => {
                  if (activeNodeMappingPreset && activeWorkflowId)
                    saveMappingPreset(
                      activeWorkflowId,
                      activeNodeMappingPreset.name,
                      nodeMappings
                    )
                }}
                onPendingNameConflict={(name) =>
                  onPendingSave(name, "nodeMapping")
                }
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
