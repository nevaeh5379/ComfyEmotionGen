import { useCallback, useEffect, useMemo, useRef, useState } from "react"

// ── Hooks ──
import { useWindowManager } from "./comfyui/hooks/useWindowManager"
import { useBackend } from "./comfyui/hooks/useBackend"
import { useSessionManager } from "./comfyui/hooks/useSessionManager"
import { useGlobalShortcuts } from "./comfyui/hooks/useGlobalShortcuts"
import { useSettings } from "./comfyui/hooks/useSettings"
import { useLocalStorage } from "./comfyui/hooks/useLocalStorage"
import { useSyncedStorage } from "./comfyui/hooks/useSyncedStorage"
import { useOfflineSync } from "./comfyui/hooks/useOfflineSync"
import { useJobRunner } from "./comfyui/hooks/useJobRunner"
import { useJobActions } from "./comfyui/hooks/useJobActions"
import { useBackendHealth } from "./comfyui/hooks/useBackendHealth"
import { useBackendUrl } from "./comfyui/hooks/useBackendUrl"

// ── Contexts ──
import { CurationToolbarProvider } from "./comfyui/components/combinationpicker/CurationToolbarTypes"
import { useTemplateContext } from "./comfyui/contexts/useTemplateContext"
import { useWorkflowContext } from "./comfyui/contexts/WorkflowContext"
import { useNodeMappingContext } from "./comfyui/contexts/NodeMappingContext"
import { TemplateProvider } from "./comfyui/contexts/TemplateContext"
import { WorkflowProvider } from "./comfyui/contexts/WorkflowContext"
import { NodeMappingProvider } from "./comfyui/contexts/NodeMappingContext"
import {
  PendingDialogProvider,
  usePendingDialog,
} from "./comfyui/contexts/PendingDialogContext"
import { PanelLayoutProvider } from "./comfyui/contexts/PanelLayoutContext"
import {
  GalleryToolbarProvider,
  useGalleryToolbar,
} from "./comfyui/contexts/GalleryToolbarContext"

// ── Constants / Utilities ──
import { DEFAULT_AXIS } from "./comfyui/components/combinationpicker/freeCurationGroupers"
import {
  DEFAULT_BACKEND_URL,
  IS_PACKAGE_MODE,
  PACKAGE_BACKEND_URL,
} from "./lib/runtime"
import { API } from "./lib/api"
import { STORAGE_KEYS } from "./lib/storageKeys"
import { NAME_CONFLICT_START_NUMBER } from "./lib/constants"
import type { NodeMapping } from "./lib/workflow"
import { toast } from "sonner"

// ── Layout ──
import { Header } from "./comfyui/components/layout/Header"
import { FloatingWindow } from "./comfyui/components/layout/FloatingWindow"
import { GalleryFloatingWindow } from "./comfyui/components/layout/GalleryFloatingWindow"
import type { TabId } from "./comfyui/components/layout/nav-tabs"

// ── Tab Components ──
import { JobsTab } from "./comfyui/components/tabs/JobsTab"
import { GalleryTab } from "./comfyui/components/tabs/GalleryTab"
import { CurationTab } from "./comfyui/components/tabs/CurationTab"
import { StatsTab } from "./comfyui/components/tabs/StatsTab"
import { GeneratorTab } from "./comfyui/components/tabs/GeneratorTab"
import { SettingsTab } from "./comfyui/components/tabs/SettingsTab"

// ── Dialog Components ──
import { ParserPreviewDialog } from "./comfyui/components/ParserPreviewDialog"
import { AxisFilterSheet } from "./comfyui/components/AxisFilterSheet"
import { SelectionSheet } from "./comfyui/components/SelectionSheet"
import { NameConflictDialog } from "./comfyui/components/NameConflictDialog"
import { PresetSelectionDialog } from "./comfyui/components/PresetSelectionDialog"
import { VersionDiffDialog } from "./comfyui/components/VersionDiffDialog"
import { KeyboardShortcutsDialog } from "./comfyui/components/KeyboardShortcutsDialog"
import { JobStatusPopup } from "./comfyui/components/JobStatusPopup"
import { WorkflowGraphViewer } from "./comfyui/components/WorkflowGraphViewer"

// ── Floating Window Content ──
import { WorkCompositionPanel } from "./comfyui/components/WorkCompositionPanel"
import { JobManagerPanel } from "./comfyui/components/JobManagerPanel"
import { StatisticsPanel } from "./comfyui/components/StatisticsPanel"
import { CombinationPicker } from "./comfyui/components/combinationpicker/CombinationPicker"

import { cn } from "@/lib/utils"
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from "lucide-react"

// ---------------------------------------------------------------------------
// App — Root component with providers
// ---------------------------------------------------------------------------
export function App() {
  useOfflineSync()

  const [storedBackendUrl] = useLocalStorage(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  const backendUrl = IS_PACKAGE_MODE
    ? (PACKAGE_BACKEND_URL as string)
    : storedBackendUrl

  return (
    <PendingDialogProvider>
      <PanelLayoutProvider>
        <GalleryToolbarProvider backendUrl={backendUrl}>
          <TemplateProvider>
            <WorkflowProvider>
              <NodeMappingProvider backendUrl={backendUrl}>
                <AppContent />
              </NodeMappingProvider>
            </WorkflowProvider>
          </TemplateProvider>
        </GalleryToolbarProvider>
      </PanelLayoutProvider>
    </PendingDialogProvider>
  )
}

// ---------------------------------------------------------------------------
// AppContent — Inside all contexts
// ---------------------------------------------------------------------------
function AppContent() {
  // ── Backend ──
  const { isConnected: backendAlive, jobs, workers, paused } = useBackend()

  // ── Backend URL state ──
  const backendUrl = useBackendUrl()
  const [, setStoredBackendUrl] = useLocalStorage(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  const setBackendUrl = IS_PACKAGE_MODE
    ? (_: string) => {}
    : setStoredBackendUrl

  // ── Backend health ──
  const { isAliveBackend } = useBackendHealth()

  // ── Settings ──
  const { settings, updateSetting } = useSettings()

  // ── Gallery toolbar ──
  const tb = useGalleryToolbar()

  // ── Pending dialogs ──
  const {
    pendingSave,
    setPendingSave,
    pendingDiff,
    setPendingDiff,
    pendingPresetSelection,
    setPendingPresetSelection,
  } = usePendingDialog()

  // ── Contexts ──
  const template = useTemplateContext()
  const workflow = useWorkflowContext()
  const nodeMapping = useNodeMappingContext()

  // ── UI state ──
  const [activeTab, setActiveTab] = useLocalStorage<TabId>(
    STORAGE_KEYS.activeTab,
    "jobs"
  )
  const [compositionTab, setCompositionTab] = useState<"ceg" | "workflow">(
    "ceg"
  )
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isAxisFilterOpen, setIsAxisFilterOpen] = useState(false)
  const [isSelectionOpen, setIsSelectionOpen] = useState(false)
  const [previewFilter, setPreviewFilter] = useState("")
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [mobileJobTab, setMobileJobTab] = useState<
    "editor" | "status" | "list"
  >("editor")

  const [jobsLayoutOrientation, setJobsLayoutOrientation] = useLocalStorage<
    "horizontal" | "vertical"
  >("ceg_jobsLayoutOrientation", "horizontal")
  const [jobsPanelOrder, setJobsPanelOrder] = useLocalStorage<
    "composition-first" | "manager-first"
  >("ceg_jobsPanelOrder", "composition-first")

  // ── Curation toolbar ──
  const [curationSelectedAxis, setCurationSelectedAxis] = useSyncedStorage(
    STORAGE_KEYS.curationSelectedAxis,
    DEFAULT_AXIS
  )

  // ── Window manager ──
  const {
    isCompositionFloating,
    setIsCompositionFloating,
    compositionFloatingPos,
    setCompositionFloatingPos,
    compositionFloatingSize,
    setCompositionFloatingSize,
    isJobManagerFloating,
    setIsJobManagerFloating,
    jobManagerFloatingPos,
    setJobManagerFloatingPos,
    jobManagerFloatingSize,
    setJobManagerFloatingSize,
    isGalleryFloating,
    setIsGalleryFloating,
    galleryFloatingPos,
    setGalleryFloatingPos,
    galleryFloatingSize,
    setGalleryFloatingSize,
    isGalleryDocked,
    setIsGalleryDocked,
    galleryDockedSide,
    isStatsFloating,
    setIsStatsFloating,
    statsFloatingPos,
    setStatsFloatingPos,
    statsFloatingSize,
    setStatsFloatingSize,
    isStatsDocked,
    setIsStatsDocked,
    statsDockedSide,
    isCurationFloating,
    setIsCurationFloating,
    curationFloatingPos,
    setCurationFloatingPos,
    curationFloatingSize,
    setCurationFloatingSize,
    isCurationDocked,
    setIsCurationDocked,
    curationDockedSide,
    snapDockZone,
    handleDragProgress,
    handleHeaderDragStart,
    handleNavTabDragStart,
  } = useWindowManager({
    activeTab,
    setActiveTab,
    setJobsLayoutOrientation,
    setJobsPanelOrder,
  })

  // ── Session manager ──
  const session = useSessionManager(backendUrl)

  // ── Job completion notification ──
  const prevActiveCount = useRef<number | null>(null)
  useEffect(() => {
    const current = session.sessionCounts.active
    if (
      prevActiveCount.current !== null &&
      prevActiveCount.current > 0 &&
      current === 0
    ) {
      const totalJobs = session.sessionJobs.length
      if (totalJobs > 0) {
        const doneCount = session.sessionCounts.done
        const errorCount = session.sessionCounts.error + session.sessionCounts.cancelled
        if (errorCount > 0) {
          toast.info(`배치 완료! (${doneCount} 완료, ${errorCount} 실패/취소)`)
        } else {
          toast.success(`모든 작업이 완료되었습니다! (${doneCount}개)`)
        }
        fetch(`${backendUrl}${API.webhooks.batchComplete}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            done: doneCount,
            error: errorCount,
            total: totalJobs,
          }),
        }).catch(() => {})
      }
    }
    prevActiveCount.current = current
  }, [
    session.sessionCounts.active,
    session.sessionCounts.done,
    session.sessionCounts.error,
    session.sessionCounts.cancelled,
    session.sessionJobs.length,
    backendUrl,
  ])

  // ── Job actions ──
  const jobActions = useJobActions()

  // ── Job runner ──
  const {
    fakeJobQueue,
    renderResponse,
    axisValueFilter,
    setAxisValueFilter,
    collapsedAxes,
    uncheckedItems,
    repeatCount,
    setRepeatCount,
    handleRun,
    handleRunSelected,
    handleRandomRun,
    handleRunUnapproved,
    selectOnlyUnapprovedItems,
    randomRunCount,
    setRandomRunCount,
    targetWorkerId,
    setTargetWorkerId,
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
  } = useJobRunner()

  // ── Derived state ──
  const filteredPreview = useMemo(() => {
    const needle = previewFilter.trim().toLowerCase()
    if (!needle) return fakeJobQueue
    return fakeJobQueue.filter(
      (it) =>
        it.filename.toLowerCase().includes(needle) ||
        it.prompt.toLowerCase().includes(needle)
    )
  }, [fakeJobQueue, previewFilter])

  const canRun =
    Boolean(workflow.workflowJson) && isAliveBackend && backendAlive

  // ── Object info fetch ──
  useEffect(() => {
    if (!isAliveBackend) return
    fetch(`${backendUrl}${API.objectInfo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) nodeMapping.setObjectInfo(data)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, isAliveBackend])

  // ── Quick save handler (Ctrl+S shortcut) ──
  const handleQuickSave = useCallback(() => {
    if (compositionTab === "ceg") {
      if (template.activeTemplateId) {
        const active = template.savedTemplates.find(
          (t) => t.id === template.activeTemplateId
        )
        if (active) {
          template.saveTemplate(active.name, template.cegTemplate)
          template.setTemplateResetKey((k) => k + 1)
        }
      }
    } else {
      if (workflow.activeWorkflow) {
        workflow.saveWorkflow(
          workflow.activeWorkflow.name,
          workflow.workflowJson
        )
      }
    }
  }, [compositionTab, template, workflow])

  // ── Tab Change Scroll Lock Cleanup ──
  useEffect(() => {
    // Reset body style modifications (e.g. from Radix UI Dialogs/Sheets or ImageViewer)
    // to ensure scrolling and clicking work correctly when switching tabs.
    document.body.style.overflow = ""
    document.body.style.pointerEvents = ""
  }, [activeTab])

  // ── Global keyboard shortcuts ──
  useGlobalShortcuts({
    activeTab,
    mobileJobTab,
    canRun,
    handleRun,
    handleSave: handleQuickSave,
    handleGalleryRefresh: tb.handleRefresh,
    setActiveTab,
    toggleShortcuts: () => setShortcutsOpen((prev) => !prev),
  })

  // ── Name conflict helpers ──
  const nextFreeName = (name: string, items: { name: string }[]): string => {
    if (!items.some((x) => x.name === name)) return name
    let n = NAME_CONFLICT_START_NUMBER
    while (items.some((x) => x.name === `${name} (${n})`)) n++
    return `${name} (${n})`
  }

  const pendingSaveItems =
    pendingSave?.type === "template"
      ? template.savedTemplates
      : pendingSave?.type === "workflow"
        ? workflow.savedWorkflows
        : nodeMapping.savedNodeMappings

  const handleNameConflictSaveNew = () => {
    if (!pendingSave) return
    const newName = nextFreeName(pendingSave.name, pendingSaveItems)
    if (pendingSave.type === "template") {
      template.saveTemplate(newName, template.cegTemplate)
      template.setTemplateResetKey((k) => k + 1)
    } else if (pendingSave.type === "workflow") {
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
    setPendingSave(null)
  }

  const handleNameConflictOverwrite = () => {
    if (!pendingSave) return
    if (pendingSave.type === "template") {
      template.saveTemplate(pendingSave.name, template.cegTemplate)
      template.setTemplateResetKey((k) => k + 1)
    } else if (pendingSave.type === "workflow") {
      const w = workflow.saveWorkflow(pendingSave.name, workflow.workflowJson)
      workflow.setActiveWorkflowId(w.id)
      workflow.setWorkflowResetKey((k) => k + 1)
    } else {
      if (workflow.activeWorkflowId) {
        nodeMapping.saveMappingPreset(
          workflow.activeWorkflowId,
          pendingSave.name,
          nodeMapping.nodeMappings
        )
        nodeMapping.setNodeMappingResetKey((k) => k + 1)
      }
    }
    setPendingSave(null)
  }

  const runnerProps = useMemo(() => ({
    fakeJobQueue,
    hasActiveFilter,
    estimatedRunCount,
    repeatCount,
    setRepeatCount,
    handleRun,
    handleRandomRun,
    handleRunUnapproved,
    randomRunCount,
    setRandomRunCount,
    targetWorkerId,
    setTargetWorkerId,
  }), [
    fakeJobQueue,
    hasActiveFilter,
    estimatedRunCount,
    repeatCount,
    setRepeatCount,
    handleRun,
    handleRandomRun,
    handleRunUnapproved,
    randomRunCount,
    setRandomRunCount,
    targetWorkerId,
    setTargetWorkerId,
  ])

  const windowManagerProps = useMemo(() => ({
    isCompositionFloating,
    setIsCompositionFloating,
    compositionFloatingPos,
    setCompositionFloatingPos,
    compositionFloatingSize,
    setCompositionFloatingSize,
    isJobManagerFloating,
    setIsJobManagerFloating,
    jobManagerFloatingPos,
    setJobManagerFloatingPos,
    jobManagerFloatingSize,
    setJobManagerFloatingSize,
    isGalleryFloating,
    setIsGalleryFloating,
    galleryFloatingPos,
    setGalleryFloatingPos,
    galleryFloatingSize,
    setGalleryFloatingSize,
    isGalleryDocked,
    setIsGalleryDocked,
    galleryDockedSide,
    isStatsFloating,
    setIsStatsFloating,
    statsFloatingPos,
    setStatsFloatingPos,
    statsFloatingSize,
    setStatsFloatingSize,
    isStatsDocked,
    setIsStatsDocked,
    statsDockedSide,
    isCurationFloating,
    setIsCurationFloating,
    curationFloatingPos,
    setCurationFloatingPos,
    curationFloatingSize,
    setCurationFloatingSize,
    isCurationDocked,
    setIsCurationDocked,
    curationDockedSide,
    handleHeaderDragStart,
  }), [
    isCompositionFloating,
    setIsCompositionFloating,
    compositionFloatingPos,
    setCompositionFloatingPos,
    compositionFloatingSize,
    setCompositionFloatingSize,
    isJobManagerFloating,
    setIsJobManagerFloating,
    jobManagerFloatingPos,
    setJobManagerFloatingPos,
    jobManagerFloatingSize,
    setJobManagerFloatingSize,
    isGalleryFloating,
    setIsGalleryFloating,
    galleryFloatingPos,
    setGalleryFloatingPos,
    galleryFloatingSize,
    setGalleryFloatingSize,
    isGalleryDocked,
    setIsGalleryDocked,
    galleryDockedSide,
    isStatsFloating,
    setIsStatsFloating,
    statsFloatingPos,
    setStatsFloatingPos,
    statsFloatingSize,
    setStatsFloatingSize,
    isStatsDocked,
    setIsStatsDocked,
    statsDockedSide,
    isCurationFloating,
    setIsCurationFloating,
    curationFloatingPos,
    setCurationFloatingPos,
    curationFloatingSize,
    setCurationFloatingSize,
    isCurationDocked,
    setIsCurationDocked,
    curationDockedSide,
    handleHeaderDragStart,
  ])

  // ── Render ──
  return (
    <div
      className={`flex flex-col bg-background ${
        activeTab === "jobs" || activeTab === "generator" ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
      }`}
    >
      <CurationToolbarProvider
        selectedAxis={curationSelectedAxis}
        setSelectedAxis={setCurationSelectedAxis}
        savedTemplates={template.savedTemplates}
      >
        <Header
          useWindowMode={settings.useWindowMode}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isAliveBackend={isAliveBackend}
          backendAlive={backendAlive}
          workers={workers}
          jobs={jobs}
          jobsCount={jobs.length}
          mobileJobTab={mobileJobTab}
          setMobileJobTab={setMobileJobTab}
          compositionTab={compositionTab}
          setCompositionTab={setCompositionTab}
          repeatCount={repeatCount}
          setRepeatCount={setRepeatCount}
          handleRun={handleRun}
          handleRandomRun={handleRandomRun}
          handleRunUnapproved={handleRunUnapproved}
          randomRunCount={randomRunCount}
          setRandomRunCount={setRandomRunCount}
          targetWorkerId={targetWorkerId}
          setTargetWorkerId={setTargetWorkerId}
          canRun={canRun}
          estimatedRunCount={estimatedRunCount}
          setIsSelectionOpen={setIsSelectionOpen}
          hasActiveFilter={hasActiveFilter}
          setIsAxisFilterOpen={setIsAxisFilterOpen}
          setIsGraphOpen={setIsGraphOpen}
          onStatsDragStart={(cx, cy) => handleNavTabDragStart("stats", cx, cy)}
          onCurationDragStart={(cx, cy) =>
            handleNavTabDragStart("curation", cx, cy)
          }
          onGalleryDragStart={(cx, cy) =>
            handleNavTabDragStart("gallery", cx, cy)
          }
          sessionMarkers={session.markers}
          sessionJobCounts={session.sessionJobCounts}
          sortedMarkers={session.sortedMarkers}
          selectedSessionId={session.selectedSessionId}
          activeSessionState={
            session.activeState ? { activeSessionId: session.activeState.activeSessionId } : null
          }
          sessionPickerOpen={session.sessionPickerOpen}
          onSessionPickerOpenChange={session.setSessionPickerOpen}
          onSelectSession={session.setSelectedSessionId}
          onCreateNewSession={session.createNewSession}
          paused={paused}
          onTogglePause={jobActions.handleTogglePause}
          onCancelAll={jobActions.handleCancelAll}
          onRetryAllFailed={jobActions.handleRetryAllFailed}
          onDeleteAllFailed={jobActions.handleDeleteAllFailed}
          activeJobsCount={session.sessionCounts.active}
        />

        <main
          className={`flex w-full flex-1 flex-col ${
            activeTab === "jobs" || activeTab === "generator" ? "overflow-hidden" : ""
          }`}
        >
          {/* ── Tab Routing ── */}
          {activeTab === "stats" && <StatsTab jobs={jobs} workers={workers} />}
          {activeTab === "gallery" && (
            <GalleryTab
              backendUrl={backendUrl}
              enableHover={settings.enableHover}
              imagePageSize={settings.imagePageSize}
              imageLazyLoad={settings.imageLazyLoad}
              singleDownloadMode={settings.singleDownloadMode}
              fluidGridLayout={settings.fluidGridLayout}
              tb={tb}
            />
          )}
          {activeTab === "curation" && (
            <CurationTab
              backendUrl={backendUrl}
              cegTemplate={template.cegTemplate}
              savedTemplates={template.savedTemplates}
              enableHover={settings.enableHover}
              autoApplyReject={settings.autoApplyReject}
              hideEmptyCurationFolders={settings.hideEmptyCurationFolders}
              savedWorkflows={workflow.savedWorkflows}
              fluidGridLayout={settings.fluidGridLayout}
              curationSelectedAxis={curationSelectedAxis}
              setCurationSelectedAxis={setCurationSelectedAxis}
            />
          )}
          {activeTab === "generator" && (
            <GeneratorTab setActiveTab={setActiveTab} backendUrl={backendUrl} />
          )}
          {activeTab === "settings" && (
            <SettingsTab
              settings={settings}
              updateSetting={updateSetting}
              backendUrl={backendUrl}
              onBackendUrlChange={setBackendUrl}
              workers={workers}
            />
          )}
          {activeTab === "jobs" && (
            <JobsTab
              backendUrl={backendUrl}
              isAliveBackend={isAliveBackend}
              jobs={jobs}
              workers={workers}
              paused={paused}
              session={session}
              runner={runnerProps}
              windowManager={windowManagerProps}
              jobActions={jobActions}
              jobsLayoutOrientation={jobsLayoutOrientation}
              setJobsLayoutOrientation={setJobsLayoutOrientation}
              jobsPanelOrder={jobsPanelOrder}
              compositionTab={compositionTab}
              setCompositionTab={setCompositionTab}
              mobileJobTab={mobileJobTab}
              setMobileJobTab={setMobileJobTab}
              useWindowMode={settings.useWindowMode}
              enableHover={settings.enableHover}
              imagePageSize={settings.imagePageSize}
              imageLazyLoad={settings.imageLazyLoad}
              singleDownloadMode={settings.singleDownloadMode}
              autoApplyReject={settings.autoApplyReject}
              hideEmptyCurationFolders={settings.hideEmptyCurationFolders}
              curationSelectedAxis={curationSelectedAxis}
              setCurationSelectedAxis={setCurationSelectedAxis}
              cegTemplate={template.cegTemplate}
              savedTemplates={template.savedTemplates}
              savedWorkflows={workflow.savedWorkflows}
              tb={tb}
              setIsSheetOpen={setIsSheetOpen}
              setIsAxisFilterOpen={setIsAxisFilterOpen}
              setIsSelectionOpen={setIsSelectionOpen}
              setIsGraphOpen={setIsGraphOpen}
              canRun={canRun}
            />
          )}
        </main>

        {/* ── Dialog Overlays ── */}
        <ParserPreviewDialog
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          renderResponse={renderResponse}
          filteredByAxisSet={filteredByAxisSet}
        />

        <AxisFilterSheet
          open={isAxisFilterOpen}
          onOpenChange={setIsAxisFilterOpen}
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
          open={isSelectionOpen}
          onOpenChange={setIsSelectionOpen}
          fakeJobQueue={fakeJobQueue}
          filteredPreview={filteredPreview}
          previewFilter={previewFilter}
          onPreviewFilterChange={setPreviewFilter}
          uncheckedItems={uncheckedItems}
          selectedCount={selectedCount}
          canRun={canRun}
          checkAllItems={checkAllItems}
          uncheckAllItems={uncheckAllItems}
          toggleItemCheck={toggleItemCheck}
          onRunSelected={async () => {
            const ok = await handleRunSelected()
            if (ok) setIsSelectionOpen(false)
          }}
          onExcludeApproved={selectOnlyUnapprovedItems}
        />

        {workflow.parsedWorkflow?.success && (
          <WorkflowGraphViewer
            workflow={workflow.parsedWorkflow.data}
            isOpen={isGraphOpen}
            onClose={() => setIsGraphOpen(false)}
            backendUrl={backendUrl}
          />
        )}

        <NameConflictDialog
          pendingSave={pendingSave}
          onClose={() => setPendingSave(null)}
          newName={nextFreeName(pendingSave?.name ?? "", pendingSaveItems)}
          onSaveNew={handleNameConflictSaveNew}
          onOverwrite={handleNameConflictOverwrite}
        />

        {activeTab !== "jobs" && (
          <JobStatusPopup
            jobs={jobs}
            paused={paused}
            backendUrl={backendUrl}
            isAliveBackend={isAliveBackend}
            onNavigateToJobs={() => setActiveTab("jobs")}
            cycleMinimizedProgress={settings.cycleMinimizedProgress}
          />
        )}

        <PresetSelectionDialog
          pendingWorkflow={pendingPresetSelection}
          onClose={() => setPendingPresetSelection(null)}
          onSelectPreset={(mappings: NodeMapping[], presetId: string) => {
            nodeMapping.setNodeMappings(mappings)
            nodeMapping.setActiveNodeMappingPresetId(presetId)
            setPendingPresetSelection(null)
          }}
          onStartWithoutMapping={() => {
            nodeMapping.setNodeMappings([])
            nodeMapping.setActiveNodeMappingPresetId(null)
            setPendingPresetSelection(null)
          }}
        />

        <VersionDiffDialog
          open={pendingDiff !== null}
          onClose={() => setPendingDiff(null)}
          onConfirm={() => {
            if (!pendingDiff) return
            if (pendingDiff.type === "template") {
              template.saveTemplate(pendingDiff.name, pendingDiff.newContent)
              template.setTemplateResetKey((k) => k + 1)
            } else {
              const w = workflow.saveWorkflow(
                pendingDiff.name,
                pendingDiff.newContent
              )
              workflow.setActiveWorkflowId(w.id)
              workflow.setWorkflowResetKey((k) => k + 1)
            }
            toast.success(`'${pendingDiff.name}' 업데이트가 완료되었습니다.`)
          }}
          oldContent={pendingDiff?.oldContent ?? ""}
          newContent={pendingDiff?.newContent ?? ""}
          itemName={pendingDiff?.name ?? ""}
        />

        <KeyboardShortcutsDialog
          open={shortcutsOpen}
          onOpenChange={setShortcutsOpen}
        />

        {/* ── Floating Windows ── */}

        {/* Composition floating window */}
        {isCompositionFloating && (
          <FloatingWindow
            id="floating-window-composition"
            isOpen={isCompositionFloating}
            onClose={() => setIsCompositionFloating(false)}
            onDock={() => setIsCompositionFloating(false)}
            initialPos={compositionFloatingPos}
            initialSize={compositionFloatingSize}
            onPosChange={setCompositionFloatingPos}
            onSizeChange={setCompositionFloatingSize}
            title="작업 구성 패널"
            onDragProgress={(cx, cy, sw, sh, isEnding) =>
              handleDragProgress(cx, cy, sw, sh, isEnding, "composition")
            }
          >
            <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
              <WorkCompositionPanel
                repeatCount={repeatCount}
                setRepeatCount={setRepeatCount}
                handleRun={handleRun}
                handleRandomRun={handleRandomRun}
                handleRunUnapproved={handleRunUnapproved}
                randomRunCount={randomRunCount}
                setRandomRunCount={setRandomRunCount}
                estimatedRunCount={estimatedRunCount}
                canRun={canRun}
                previewCount={fakeJobQueue.length}
                workers={workers}
                targetWorkerId={targetWorkerId}
                setTargetWorkerId={setTargetWorkerId}
                compositionTab={compositionTab}
                setCompositionTab={setCompositionTab}
                onPreviewOpen={() => setIsSheetOpen(true)}
                onAxisFilterOpen={() => setIsAxisFilterOpen(true)}
                onSelectionOpen={() => setIsSelectionOpen(true)}
                hasActiveFilter={hasActiveFilter}
                onGraphOpen={() => setIsGraphOpen(true)}
                isFloating={true}
                onFloatToggle={() => setIsCompositionFloating(false)}
              />
            </div>
          </FloatingWindow>
        )}

        {/* Job Manager floating window */}
        {isJobManagerFloating && (
          <FloatingWindow
            id="floating-window-jobManager"
            isOpen={isJobManagerFloating}
            onClose={() => setIsJobManagerFloating(false)}
            onDock={() => setIsJobManagerFloating(false)}
            initialPos={jobManagerFloatingPos}
            initialSize={jobManagerFloatingSize}
            onPosChange={setJobManagerFloatingPos}
            onSizeChange={setJobManagerFloatingSize}
            title="작업 큐 매니저"
            onDragProgress={(cx, cy, sw, sh, isEnding) =>
              handleDragProgress(cx, cy, sw, sh, isEnding, "jobManager")
            }
          >
            <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <JobManagerPanel
                  jobs={jobs}
                  workers={workers}
                  paused={paused}
                  backendUrl={backendUrl}
                  isAliveBackend={isAliveBackend}
                  selectedId={session.selectedSessionId}
                  setSelectedId={session.setSelectedSessionId}
                  markers={session.markers}
                  setMarkersRaw={session.setMarkersRaw}
                  activeState={session.activeState}
                  setActiveStateRaw={session.setActiveStateRaw}
                  sessionPickerOpen={session.sessionPickerOpen}
                  setSessionPickerOpen={session.setSessionPickerOpen}
                  createNewSession={session.createNewSession}
                  sessionJobCounts={session.sessionJobCounts}
                  sortedMarkers={session.sortedMarkers}
                  counts={session.sessionCounts}
                  sessionJobs={session.sessionJobs}
                  handleTogglePause={jobActions.handleTogglePause}
                  handleCancelAll={jobActions.handleCancelAll}
                  handleRetryAllFailed={jobActions.handleRetryAllFailed}
                  handleDeleteAllFailed={jobActions.handleDeleteAllFailed}
                  refetchStats={session.refetchStats}
                  isFloating={true}
                  onFloatToggle={() => setIsJobManagerFloating(false)}
                />
              </div>
            </div>
          </FloatingWindow>
        )}

        {/* Gallery floating window (extracted toolbar) */}
        {activeTab !== "gallery" && !isGalleryDocked && isGalleryFloating && (
          <GalleryFloatingWindow
            isOpen={true}
            onClose={() => setIsGalleryFloating(false)}
            onDock={() => {
              setIsGalleryFloating(false)
              setActiveTab("gallery")
            }}
            initialPos={galleryFloatingPos}
            initialSize={galleryFloatingSize}
            onPosChange={setGalleryFloatingPos}
            onSizeChange={setGalleryFloatingSize}
            onDragProgress={(cx, cy, sw, sh, isEnding) =>
              handleDragProgress(cx, cy, sw, sh, isEnding, "gallery")
            }
            backendUrl={backendUrl}
            enableHover={settings.enableHover}
            imagePageSize={settings.imagePageSize}
            imageLazyLoad={settings.imageLazyLoad}
            singleDownloadMode={settings.singleDownloadMode}
            tb={tb}
          />
        )}

        {/* Stats floating window */}
        {activeTab !== "stats" && isStatsFloating && (
          <FloatingWindow
            id="floating-window-stats"
            isOpen={isStatsFloating}
            onClose={() => setIsStatsFloating(false)}
            onDock={() => {
              setIsStatsFloating(false)
              setActiveTab("stats")
            }}
            initialPos={statsFloatingPos}
            initialSize={statsFloatingSize}
            onPosChange={setStatsFloatingPos}
            onSizeChange={setStatsFloatingSize}
            title="통계"
            onDragProgress={(cx, cy, _sw, sh, isEnding) =>
              handleDragProgress(cx, cy, _sw, sh, isEnding, "stats")
            }
          >
            <div className="flex h-full w-full flex-col overflow-y-auto bg-panel p-4 md:p-6">
              <StatisticsPanel jobs={jobs} workers={workers} />
            </div>
          </FloatingWindow>
        )}

        {/* Curation floating window */}
        {activeTab !== "curation" && isCurationFloating && (
          <FloatingWindow
            id="floating-window-curation"
            isOpen={isCurationFloating}
            onClose={() => setIsCurationFloating(false)}
            onDock={() => {
              setIsCurationFloating(false)
              setActiveTab("curation")
            }}
            initialPos={curationFloatingPos}
            initialSize={curationFloatingSize}
            onPosChange={setCurationFloatingPos}
            onSizeChange={setCurationFloatingSize}
            title="큐레이션"
            onDragProgress={(cx, cy, sw, sh, isEnding) =>
              handleDragProgress(cx, cy, sw, sh, isEnding, "curation")
            }
          >
            <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
              <CombinationPicker
                backendUrl={backendUrl}
                cegTemplate={template.cegTemplate}
                savedTemplates={template.savedTemplates}
                enableHover={settings.enableHover}
                autoApplyReject={settings.autoApplyReject}
                hideEmptyCurationFolders={settings.hideEmptyCurationFolders}
                savedWorkflows={workflow.savedWorkflows}
                toolbarState={{
                  selectedAxis: curationSelectedAxis,
                  setSelectedAxis: setCurationSelectedAxis,
                  viewMode: "gallery" as const,
                  setViewMode: () => {},
                  hideTopSection: true,
                }}
              />
            </div>
          </FloatingWindow>
        )}

        {/* Snap dock zone indicator */}
        {snapDockZone && (
          <div
            className={cn(
              "pointer-events-none fixed z-50 flex animate-pulse items-center justify-center border border-primary/30 bg-primary/10 backdrop-blur-xs transition-all duration-300",
              snapDockZone.zone === "left" &&
                "top-0 bottom-0 left-0 w-1/2 rounded-r-2xl border-l-0",
              snapDockZone.zone === "right" &&
                "top-0 right-0 bottom-0 w-1/2 rounded-l-2xl border-r-0",
              snapDockZone.zone === "top" &&
                "top-0 right-0 left-0 h-1/2 rounded-b-2xl border-t-0",
              snapDockZone.zone === "bottom" &&
                "right-0 bottom-0 left-0 h-1/2 rounded-t-2xl border-b-0"
            )}
          >
            <div className="flex scale-110 animate-in flex-col items-center justify-center rounded-2xl border border-line bg-panel/60 p-6 shadow-2xl backdrop-blur-xl duration-200 zoom-in-95">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]">
                {snapDockZone.zone === "left" && (
                  <ArrowLeft className="h-6 w-6" />
                )}
                {snapDockZone.zone === "right" && (
                  <ArrowRight className="h-6 w-6" />
                )}
                {snapDockZone.zone === "top" && <ArrowUp className="h-6 w-6" />}
                {snapDockZone.zone === "bottom" && (
                  <ArrowDown className="h-6 w-6" />
                )}
              </div>
              <span className="mt-3 text-xs font-black tracking-wider text-foreground uppercase">
                {snapDockZone.zone === "left" || snapDockZone.zone === "right"
                  ? "가로 결합 스냅"
                  : "세로 결합 스냅"}
              </span>
            </div>
          </div>
        )}
      </CurationToolbarProvider>
    </div>
  )
}

export default App
