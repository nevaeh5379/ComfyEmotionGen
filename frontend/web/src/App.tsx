import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import { useBackend } from "./comfyui/hooks/useBackend"
import { SavedImagesGallery } from "./comfyui/components/SavedImagesGallery"
import { CombinationPicker } from "./comfyui/components/combinationpicker/CombinationPicker"
import { WorkflowGraphViewer } from "./comfyui/components/WorkflowGraphViewer"
import { JobManagerPanel } from "./comfyui/components/JobManagerPanel"
import { JobStatusPopup } from "./comfyui/components/JobStatusPopup"
import { SettingsPanel } from "./comfyui/components/SettingsPanel"
import { useSettings } from "./comfyui/hooks/useSettings"
import { useLocalStorage } from "./comfyui/hooks/useLocalStorage"
import { useJobRunner } from "./comfyui/hooks/useJobRunner"
import { ServerStatus, WorkerStatus } from "./comfyui/components/StatusIndicators"
import { ParserPreviewDialog } from "./comfyui/components/ParserPreviewDialog"
import { AxisFilterSheet } from "./comfyui/components/AxisFilterSheet"
import { SelectionSheet } from "./comfyui/components/SelectionSheet"
import { NameConflictDialog } from "./comfyui/components/NameConflictDialog"
import { PresetSelectionDialog } from "./comfyui/components/PresetSelectionDialog"
import { WorkCompositionPanel } from "./comfyui/components/WorkCompositionPanel"
import { useTemplateContext } from "./comfyui/contexts/TemplateContext"
import { useWorkflowContext } from "./comfyui/contexts/WorkflowContext"
import { useNodeMappingContext } from "./comfyui/contexts/NodeMappingContext"
import { TemplateProvider } from "./comfyui/contexts/TemplateContext"
import { WorkflowProvider } from "./comfyui/contexts/WorkflowContext"
import { NodeMappingProvider } from "./comfyui/contexts/NodeMappingContext"
import type { SavedWorkflow } from "./comfyui/hooks/useSavedWorkflows"
import type { NodeMapping } from "./lib/workflow"
import {
  DEFAULT_BACKEND_URL,
  IS_PACKAGE_MODE,
  PACKAGE_BACKEND_URL,
} from "./lib/runtime"
import { useRenderLog, useWatchValues } from "./lib/renderLogger"
import {
  ClipboardList,
  Image as ImageIcon,
  Layers,
  Settings,
} from "lucide-react"

const HEALTH_CHECK_INTERVAL_MS = 5000

const NAV_TABS = [
  { id: "jobs", label: "작업", icon: ClipboardList },
  { id: "gallery", label: "갤러리", icon: ImageIcon },
  { id: "curation", label: "큐레이션", icon: Layers },
  { id: "settings", label: "설정", icon: Settings },
] as const

type TabId = (typeof NAV_TABS)[number]["id"]

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export function App() {
  useRenderLog("App")

  const [pendingSave, setPendingSave] = useState<{
    name: string
    type: "template" | "workflow" | "nodeMapping"
  } | null>(null)

  const handlePendingSave = (
    name: string,
    type: "template" | "workflow" | "nodeMapping"
  ) => {
    setPendingSave({ name, type })
  }

  // Backend URL (remains at App level — used by many components)
  const [storedBackendUrl, setStoredBackendUrl] = useLocalStorage(
    "backendUrl",
    DEFAULT_BACKEND_URL
  )
  const backendUrl = IS_PACKAGE_MODE
    ? (PACKAGE_BACKEND_URL as string)
    : storedBackendUrl
  const setBackendUrl = IS_PACKAGE_MODE
    ? (_: string) => {}
    : setStoredBackendUrl

  const { isConnected: backendAlive, jobs, workers, paused } = useBackend()
  const { settings, updateSetting } = useSettings()

  // UI state
  const [activeTab, setActiveTab] = useState<TabId>("jobs")
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isAxisFilterOpen, setIsAxisFilterOpen] = useState(false)
  const [isSelectionOpen, setIsSelectionOpen] = useState(false)
  const [isAliveBackend, setIsAliveBackend] = useState(false)
  const [previewFilter, setPreviewFilter] = useState("")
  const [pendingPresetSelection, setPendingPresetSelection] =
    useState<SavedWorkflow | null>(null)

  // ── Wrap everything in context providers ──
  return (
    <TemplateProvider onPendingSave={handlePendingSave}>
      <WorkflowProvider
        onPendingSave={handlePendingSave}
        onPendingPresetSelection={setPendingPresetSelection}
      >
        <NodeMappingProvider workers={workers}>
          <AppContent
            pendingSave={pendingSave}
            setPendingSave={setPendingSave}
            pendingPresetSelection={pendingPresetSelection}
            setPendingPresetSelection={setPendingPresetSelection}
            backendUrl={backendUrl}
            setBackendUrl={setBackendUrl}
            backendAlive={backendAlive}
            isAliveBackend={isAliveBackend}
            setIsAliveBackend={setIsAliveBackend}
            jobs={jobs}
            workers={workers}
            paused={paused}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isSheetOpen={isSheetOpen}
            setIsSheetOpen={setIsSheetOpen}
            isGraphOpen={isGraphOpen}
            setIsGraphOpen={setIsGraphOpen}
            isAxisFilterOpen={isAxisFilterOpen}
            setIsAxisFilterOpen={setIsAxisFilterOpen}
            isSelectionOpen={isSelectionOpen}
            setIsSelectionOpen={setIsSelectionOpen}
            previewFilter={previewFilter}
            setPreviewFilter={setPreviewFilter}
            settings={settings}
            updateSetting={updateSetting}
          />
        </NodeMappingProvider>
      </WorkflowProvider>
    </TemplateProvider>
  )
}

// ---------------------------------------------------------------------------
// AppContent — inside all 3 contexts
// ---------------------------------------------------------------------------
interface AppContentProps {
  pendingSave: {
    name: string
    type: "template" | "workflow" | "nodeMapping"
  } | null
  setPendingSave: (
    v: { name: string; type: "template" | "workflow" | "nodeMapping" } | null
  ) => void
  pendingPresetSelection: SavedWorkflow | null
  setPendingPresetSelection: (w: SavedWorkflow | null) => void
  backendUrl: string
  setBackendUrl: (url: string) => void
  backendAlive: boolean
  isAliveBackend: boolean
  setIsAliveBackend: (v: boolean) => void
  jobs: ReturnType<typeof useBackend>["jobs"]
  workers: ReturnType<typeof useBackend>["workers"]
  paused: boolean
  activeTab: TabId
  setActiveTab: (t: TabId) => void
  isSheetOpen: boolean
  setIsSheetOpen: (v: boolean) => void
  isGraphOpen: boolean
  setIsGraphOpen: (v: boolean) => void
  isAxisFilterOpen: boolean
  setIsAxisFilterOpen: (v: boolean) => void
  isSelectionOpen: boolean
  setIsSelectionOpen: (v: boolean) => void
  previewFilter: string
  setPreviewFilter: (v: string) => void
  settings: ReturnType<typeof useSettings>["settings"]
  updateSetting: ReturnType<typeof useSettings>["updateSetting"]
}

function AppContent(props: AppContentProps) {
  useRenderLog("AppContent")

  // ── Contexts ──
  const template = useTemplateContext()
  const workflow = useWorkflowContext()
  const nodeMapping = useNodeMappingContext()

  const [mobileJobTab, setMobileJobTab] = useState<"editor" | "status" | "list">("editor")

  // ── Job Runner (consumes context values) ──
  const {
    fakeJobQueue,
    parserError,
    axisValueFilter,
    setAxisValueFilter,
    collapsedAxes,
    uncheckedItems,
    repeatCount,
    setRepeatCount,
    handleRun,
    handleRunSelected,
    toggleItemCheck,
    checkAllItems,
    uncheckAllItems,
    toggleAxisCollapse,
    estimatedRunCount,
    axisFilteredItems,
    axisExcludedItems,
    filteredByAxisSet,
    hasActiveFilter,
    selectedCount,
  } = useJobRunner({
    cegTemplate: template.cegTemplate,
    workflowJson: workflow.workflowJson,
    nodeMappings: nodeMapping.nodeMappings,
    imageUploads: nodeMapping.imageUploads,
    backendUrl: props.backendUrl,
    isAliveBackend: props.isAliveBackend,
  })

  const filteredPreview = useMemo(() => {
    const needle = props.previewFilter.trim().toLowerCase()
    if (!needle) return fakeJobQueue
    return fakeJobQueue.filter(
      (it) =>
        it.filename.toLowerCase().includes(needle) ||
        it.prompt.toLowerCase().includes(needle)
    )
  }, [fakeJobQueue, props.previewFilter])

  useWatchValues("AppContent", {
    backendAlive: props.backendAlive,
    jobs: props.jobs,
    workers: props.workers,
    paused: props.paused,
    activeTab: props.activeTab,
    fakeJobQueue,
    isSheetOpen: props.isSheetOpen,
    isGraphOpen: props.isGraphOpen,
    isAxisFilterOpen: props.isAxisFilterOpen,
    isSelectionOpen: props.isSelectionOpen,
    isAliveBackend: props.isAliveBackend,
    previewFilter: props.previewFilter,
    parserError,
    axisValueFilter,
    pendingSave: props.pendingSave,
    cegTemplate: template.cegTemplate,
    workflowJson: workflow.workflowJson,
    nodeMappings: nodeMapping.nodeMappings,
  })

  // ── Backend health check ──
  useEffect(() => {
    let cancelled = false
    const checkHealth = async () => {
      try {
        const response = await fetch(`${props.backendUrl}/health`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        return data["backend"] === "ok"
      } catch (error) {
        console.error("Error occurred during backend health check:", error)
        return false
      }
    }
    const tick = async () => {
      const ok = await checkHealth()
      if (!cancelled) props.setIsAliveBackend(ok)
    }
    tick()
    const timer = setInterval(tick, HEALTH_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.backendUrl])

  // ── Object info fetch ──
  useEffect(() => {
    if (!props.isAliveBackend) return
    fetch(`${props.backendUrl}/object_info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) nodeMapping.setObjectInfo(data)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.backendUrl, props.isAliveBackend])

  const canRun =
    Boolean(workflow.workflowJson) && props.isAliveBackend && props.backendAlive

  // ── Name conflict helpers ──
  const nextFreeName = (name: string, items: { name: string }[]): string => {
    if (!items.some((x) => x.name === name)) return name
    let n = 2
    while (items.some((x) => x.name === `${name} (${n})`)) n++
    return `${name} (${n})`
  }

  const pendingSaveItems =
    props.pendingSave?.type === "template"
      ? template.savedTemplates
      : props.pendingSave?.type === "workflow"
        ? workflow.savedWorkflows
        : nodeMapping.savedNodeMappings

  const handleNameConflictSaveNew = () => {
    if (!props.pendingSave) return
    const newName = nextFreeName(props.pendingSave.name, pendingSaveItems)
    if (props.pendingSave.type === "template") {
      template.saveTemplate(newName, template.cegTemplate)
      template.setTemplateResetKey((k) => k + 1)
    } else if (props.pendingSave.type === "workflow") {
      const w = workflow.saveWorkflow(newName, workflow.workflowJson)
      workflow.setActiveWorkflowId(w.id)
      workflow.setWorkflowResetKey((k) => k + 1)
    } else {
      if (workflow.activeWorkflowId) {
        nodeMapping.saveMappingPreset(
          workflow.activeWorkflowId,
          newName,
          nodeMapping.nodeMappings
        )
        nodeMapping.setNodeMappingResetKey((k) => k + 1)
      }
    }
    props.setPendingSave(null)
  }

  const handleNameConflictOverwrite = () => {
    if (!props.pendingSave) return
    if (props.pendingSave.type === "template") {
      template.saveTemplate(props.pendingSave.name, template.cegTemplate)
      template.setTemplateResetKey((k) => k + 1)
    } else if (props.pendingSave.type === "workflow") {
      const w = workflow.saveWorkflow(
        props.pendingSave.name,
        workflow.workflowJson
      )
      workflow.setActiveWorkflowId(w.id)
      workflow.setWorkflowResetKey((k) => k + 1)
    } else {
      if (workflow.activeWorkflowId) {
        nodeMapping.saveMappingPreset(
          workflow.activeWorkflowId,
          props.pendingSave.name,
          nodeMapping.nodeMappings
        )
        nodeMapping.setNodeMappingResetKey((k) => k + 1)
      }
    }
    props.setPendingSave(null)
  }

  return (
    <div
      className={`flex flex-col bg-background ${
        props.activeTab === "jobs" ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
      }`}
    >
      <nav className="sticky top-0 z-50 shrink-0 border-b border-line bg-panel/95 backdrop-blur supports-backdrop-filter:bg-panel/80">
        <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-2.5">
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            <span className="text-[14px] md:text-[15px] font-black tracking-tighter bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent shrink-0">
              <span className="md:inline hidden">ComfyEmotionGen</span>
              <span className="md:hidden inline">CEG</span>
            </span>
            <div className="h-4 w-px bg-line/60 shrink-0" />
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 px-1">
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <Button
                    key={tab.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => props.setActiveTab(tab.id)}
                    className={`h-10 rounded-full px-4 text-[13px] font-black transition-all shrink-0 gap-1.5 ${
                      props.activeTab === tab.id
                        ? "bg-foreground text-background shadow-lg"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${props.activeTab === tab.id ? "animate-pulse" : "opacity-70"}`} />
                    <span className={props.activeTab === tab.id ? "" : "hidden sm:inline"}>{tab.label}</span>
                  </Button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-1">
            <div className="md:block hidden">
              <ServerStatus
                name="백엔드"
                isConnected={props.isAliveBackend && props.backendAlive}
                okHint="백엔드와 연결되어 있습니다."
                failHint="백엔드 서버 상태를 확인해주세요."
              />
            </div>
            <WorkerStatus
              workers={props.workers}
              backendAlive={props.isAliveBackend}
            />
          </div>
        </div>
      </nav>

      <main
        className={`flex w-full flex-1 flex-col ${
          props.activeTab === "jobs" ? "overflow-hidden" : ""
        }`}
      >
        {props.activeTab === "gallery" && (
          <div className="flex flex-col bg-background">
            <SavedImagesGallery
              backendUrl={props.backendUrl}
              enableHover={props.settings.enableHover}
              imagePageSize={props.settings.imagePageSize}
              imageLazyLoad={props.settings.imageLazyLoad}
            />
          </div>
        )}
        {props.activeTab === "curation" && (
          <div className="flex flex-col bg-background">
            <CombinationPicker
              backendUrl={props.backendUrl}
              cegTemplate={template.cegTemplate}
              savedTemplates={template.savedTemplates}
              enableHover={props.settings.enableHover}
              autoApplyReject={props.settings.autoApplyReject}
              savedWorkflows={workflow.savedWorkflows}
            />
          </div>
        )}
        {props.activeTab === "settings" && (
          <div className="flex-1 overflow-y-auto">
            <SettingsPanel
              settings={props.settings}
              updateSetting={props.updateSetting}
              backendUrl={props.backendUrl}
              onBackendUrlChange={props.setBackendUrl}
              workers={props.workers}
            />
          </div>
        )}
        {props.activeTab === "jobs" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Mobile Job Sub-tabs (Unified 3-way toggle) */}
            <div className="flex shrink-0 items-center gap-1 border-b border-line bg-panel/50 p-1 md:hidden">
              <Button
                variant={mobileJobTab === "editor" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 h-9 text-[11px] font-black rounded-lg"
                onClick={() => setMobileJobTab("editor")}
              >
                에디터
              </Button>
              <Button
                variant={mobileJobTab === "status" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 h-9 text-[11px] font-black rounded-lg"
                onClick={() => setMobileJobTab("status")}
              >
                현황
              </Button>
              <Button
                variant={mobileJobTab === "list" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 h-9 text-[11px] font-black rounded-lg"
                onClick={() => setMobileJobTab("list")}
              >
                기록 ({props.jobs.length})
              </Button>
            </div>

            {/* Desktop: Resizable, Mobile: Single Panel */}
            <div className="hidden md:contents">
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1 overflow-hidden"
              >
                <ResizablePanel
                  defaultSize={35}
                  minSize={25}
                  className="min-h-0 flex flex-col overflow-hidden border-r border-line bg-panel"
                >
                  <WorkCompositionPanel
                    repeatCount={repeatCount}
                    setRepeatCount={setRepeatCount}
                    handleRun={handleRun}
                    estimatedRunCount={estimatedRunCount}
                    canRun={canRun}
                    previewCount={fakeJobQueue.length}
                    onPreviewOpen={() => props.setIsSheetOpen(true)}
                    onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
                    onSelectionOpen={() => props.setIsSelectionOpen(true)}
                    hasActiveFilter={hasActiveFilter}
                    onGraphOpen={() => props.setIsGraphOpen(true)}
                  />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel
                  defaultSize={65}
                  className="min-h-0 flex flex-col overflow-hidden bg-panel"
                >
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <JobManagerPanel
                      jobs={props.jobs}
                      paused={props.paused}
                      backendUrl={props.backendUrl}
                      isAliveBackend={props.isAliveBackend}
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden md:hidden">
              {mobileJobTab === "editor" && (
                <div className="flex-1 overflow-hidden flex flex-col bg-panel pb-20">
                  <WorkCompositionPanel
                    repeatCount={repeatCount}
                    setRepeatCount={setRepeatCount}
                    handleRun={handleRun}
                    estimatedRunCount={estimatedRunCount}
                    canRun={canRun}
                    previewCount={fakeJobQueue.length}
                    onPreviewOpen={() => props.setIsSheetOpen(true)}
                    onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
                    onSelectionOpen={() => props.setIsSelectionOpen(true)}
                    hasActiveFilter={hasActiveFilter}
                    onGraphOpen={() => props.setIsGraphOpen(true)}
                  />
                </div>
              )}
              {(mobileJobTab === "status" || mobileJobTab === "list") && (
                <div className="flex-1 overflow-y-auto bg-panel">
                  <JobManagerPanel
                    jobs={props.jobs}
                    paused={props.paused}
                    backendUrl={props.backendUrl}
                    isAliveBackend={props.isAliveBackend}
                    mobileTab={mobileJobTab}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <ParserPreviewDialog
        open={props.isSheetOpen}
        onOpenChange={props.setIsSheetOpen}
        fakeJobQueue={fakeJobQueue}
        previewFilter={props.previewFilter}
        onPreviewFilterChange={props.setPreviewFilter}
        filteredPreview={filteredPreview}
        filteredByAxisSet={filteredByAxisSet}
      />

      <AxisFilterSheet
        open={props.isAxisFilterOpen}
        onOpenChange={props.setIsAxisFilterOpen}
        axisValueFilter={axisValueFilter}
        setAxisValueFilter={setAxisValueFilter}
        collapsedAxes={collapsedAxes}
        toggleAxisCollapse={toggleAxisCollapse}
        estimatedRunCount={estimatedRunCount}
        fakeJobQueue={fakeJobQueue}
        axisFilteredItems={axisFilteredItems}
        axisExcludedItems={axisExcludedItems}
        uncheckedItems={uncheckedItems}
        toggleItemCheck={toggleItemCheck}
      />

      <SelectionSheet
        open={props.isSelectionOpen}
        onOpenChange={props.setIsSelectionOpen}
        fakeJobQueue={fakeJobQueue}
        filteredPreview={filteredPreview}
        previewFilter={props.previewFilter}
        onPreviewFilterChange={props.setPreviewFilter}
        uncheckedItems={uncheckedItems}
        selectedCount={selectedCount}
        canRun={canRun}
        checkAllItems={checkAllItems}
        uncheckAllItems={uncheckAllItems}
        toggleItemCheck={toggleItemCheck}
        onRunSelected={async () => {
          const ok = await handleRunSelected()
          if (ok) props.setIsSelectionOpen(false)
        }}
      />

      {workflow.parsedWorkflow?.success && (
        <WorkflowGraphViewer
          workflow={workflow.parsedWorkflow.data}
          isOpen={props.isGraphOpen}
          onClose={() => props.setIsGraphOpen(false)}
          backendUrl={props.backendUrl}
        />
      )}

      <NameConflictDialog
        pendingSave={props.pendingSave}
        onClose={() => props.setPendingSave(null)}
        newName={nextFreeName(props.pendingSave?.name ?? "", pendingSaveItems)}
        onSaveNew={handleNameConflictSaveNew}
        onOverwrite={handleNameConflictOverwrite}
      />

      {props.activeTab !== "jobs" && (
        <JobStatusPopup
          jobs={props.jobs}
          paused={props.paused}
          backendUrl={props.backendUrl}
          isAliveBackend={props.isAliveBackend}
          onNavigateToJobs={() => props.setActiveTab("jobs")}
        />
      )}

      <PresetSelectionDialog
        pendingWorkflow={props.pendingPresetSelection}
        onClose={() => props.setPendingPresetSelection(null)}
        onSelectPreset={(mappings: NodeMapping[], presetId: string) => {
          nodeMapping.setNodeMappings(mappings)
          nodeMapping.setActiveNodeMappingPresetId(presetId)
          props.setPendingPresetSelection(null)
        }}
        onStartWithoutMapping={() => {
          nodeMapping.setNodeMappings([])
          nodeMapping.setActiveNodeMappingPresetId(null)
          props.setPendingPresetSelection(null)
        }}
      />
    </div>
  )
}

export default App
