import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import { useBackend } from "./comfyui/hooks/useBackend"
import { SavedImagesGallery } from "./comfyui/components/SavedImagesGallery"
import { curationApi } from "./comfyui/hooks/useSavedImages"
import { useGlobalShortcuts } from "./comfyui/hooks/useGlobalShortcuts"
import { CombinationPicker } from "./comfyui/components/combinationpicker/CombinationPicker"
import { DEFAULT_AXIS } from "./comfyui/components/combinationpicker/freeCurationGroupers"
import { WorkflowGraphViewer } from "./comfyui/components/WorkflowGraphViewer"
import { JobManagerPanel } from "./comfyui/components/JobManagerPanel"
import { JobStatusPopup } from "./comfyui/components/JobStatusPopup"
import { SettingsPanel } from "./comfyui/components/SettingsPanel"
import { StatisticsPanel } from "./comfyui/components/StatisticsPanel"
import { useSettings } from "./comfyui/hooks/useSettings"
import { useLocalStorage } from "./comfyui/hooks/useLocalStorage"
import { useSyncedStorage } from "./comfyui/hooks/useSyncedStorage"
import { useOfflineSync } from "./comfyui/hooks/useOfflineSync"
import { useJobRunner } from "./comfyui/hooks/useJobRunner"

import { ParserPreviewDialog } from "./comfyui/components/ParserPreviewDialog"
import { AxisFilterSheet } from "./comfyui/components/AxisFilterSheet"
import { SelectionSheet } from "./comfyui/components/SelectionSheet"
import { NameConflictDialog } from "./comfyui/components/NameConflictDialog"
import { PresetSelectionDialog } from "./comfyui/components/PresetSelectionDialog"
import { VersionDiffDialog } from "./comfyui/components/VersionDiffDialog"
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
import { API, HEADERS } from "./lib/api"
import { STORAGE_KEYS } from "./lib/storageKeys"
import {
  HEALTH_CHECK_INTERVAL_MS,
  NAME_CONFLICT_START_NUMBER,
} from "./lib/constants"
import { useRenderLog, useWatchValues } from "./lib/renderLogger"
import { Header } from "./comfyui/components/layout/Header"
import type { TabId } from "./comfyui/components/layout/nav-tabs"
import { cn } from "@/lib/utils"
import { useConfirm } from "@/comfyui/hooks/useConfirm"
import type { JobStatus } from "./comfyui/types/Message"
import { toast } from "sonner"
import {
  type SessionMarkerRaw,
  type ActiveStateRaw,
  initMarkers,
  initActiveState,
  saveMarkers,
  saveActiveState,
  genId,
  jobSessionId,
  makeSessionLabel,
  loadMarkersFromServer,
  loadActiveStateFromServer,
} from "./comfyui/utils/sessionUtils"

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export function App() {
  useRenderLog("App")
  useOfflineSync()

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

  const [pendingDiff, setPendingDiff] = useState<{
    name: string
    type: "template" | "workflow"
    oldContent: string
    newContent: string
  } | null>(null)

  const handlePendingUpdate = (
    name: string,
    type: "template" | "workflow",
    oldContent: string,
    newContent: string
  ) => {
    // If content is identical, no diff needed
    if (oldContent === newContent) return null
    setPendingDiff({ name, type, oldContent, newContent })
    return true // Show diff
  }

  // Backend URL (remains at App level — used by many components)
  const [storedBackendUrl, setStoredBackendUrl] = useLocalStorage(
    STORAGE_KEYS.backendUrl,
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
  const [compositionTab, setCompositionTab] = useState<"ceg" | "workflow">(
    "ceg"
  )
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
    <TemplateProvider
      onPendingSave={handlePendingSave}
      onPendingUpdate={handlePendingUpdate}
    >
      <WorkflowProvider
        onPendingSave={handlePendingSave}
        onPendingUpdate={handlePendingUpdate}
        onPendingPresetSelection={setPendingPresetSelection}
      >
        <NodeMappingProvider backendUrl={backendUrl}>
          <AppContent
            pendingSave={pendingSave}
            setPendingSave={setPendingSave}
            pendingDiff={pendingDiff}
            setPendingDiff={setPendingDiff}
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
            compositionTab={compositionTab}
            setCompositionTab={setCompositionTab}
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
  pendingDiff: {
    name: string
    type: "template" | "workflow"
    oldContent: string
    newContent: string
  } | null
  setPendingDiff: (
    v: {
      name: string
      type: "template" | "workflow"
      oldContent: string
      newContent: string
    } | null
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
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (t: "ceg" | "workflow") => void
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

  const confirm = useConfirm()

  // ── session state (lifted) ──────────────────────────────────────────
  const initialMarkers = useMemo(() => initMarkers(), [])
  const [markers, setMarkersRaw] = useState<SessionMarkerRaw[]>(() =>
    initialMarkers
  )

  const persistMarkers = (ms: SessionMarkerRaw[]) => {
    saveMarkers(ms)
    setMarkersRaw(ms)
  }

  const [activeState, setActiveStateRaw] = useState<ActiveStateRaw>(() =>
    initActiveState(initialMarkers)
  )

  const persistActiveState = (as: ActiveStateRaw) => {
    saveActiveState(as)
    setActiveStateRaw(as)
  }

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => b.startAt - a.startAt),
    [markers]
  )

  // Default: newest marker
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    () =>
      activeState?.activeSessionId ??
      initialMarkers.sort((a, b) => b.startAt - a.startAt)[0]!.id
  )

  // 서버에서 세션 데이터 로드 (마운트 시)
  useEffect(() => {
    let aborted = false
    Promise.all([loadMarkersFromServer(), loadActiveStateFromServer()]).then(
      ([serverMarkers, serverActiveState]) => {
        if (aborted) return
        if (serverMarkers.length > 0) {
          setMarkersRaw(serverMarkers)
        }
        if (serverActiveState) {
          setActiveStateRaw(serverActiveState)
          setSelectedSessionId(serverActiveState.activeSessionId)
        }
      }
    )
    return () => {
      aborted = true
    }
  }, [])

  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)

  const sessionJobCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of props.jobs) {
      const sid = jobSessionId(j.createdAt, sortedMarkers, activeState)
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [props.jobs, sortedMarkers, activeState])

  const sessionJobs = useMemo(
    () =>
      props.jobs.filter(
        (j) =>
          jobSessionId(j.createdAt, sortedMarkers, activeState) ===
          selectedSessionId
      ),
    [props.jobs, sortedMarkers, activeState, selectedSessionId]
  )

  const sessionCounts = useMemo(() => {
    const c: Record<JobStatus | "active", number> = {
      pending: 0,
      queued: 0,
      running: 0,
      done: 0,
      error: 0,
      cancelled: 0,
      active: 0,
    }
    for (const j of sessionJobs) {
      c[j.status]++
      if (
        j.status === "pending" ||
        j.status === "queued" ||
        j.status === "running"
      )
        c.active++
    }
    return c
  }, [sessionJobs])

  // ── Job completion notification ──
  const prevActiveCount = useRef<number | null>(null)
  useEffect(() => {
    const current = sessionCounts.active
    if (
      prevActiveCount.current !== null &&
      prevActiveCount.current > 0 &&
      current === 0
    ) {
      const totalJobs = sessionJobs.length
      if (totalJobs > 0) {
        const doneCount = sessionCounts.done
        const errorCount = sessionCounts.error + sessionCounts.cancelled
        if (errorCount > 0) {
          toast.info(`배치 완료! (${doneCount} 완료, ${errorCount} 실패/취소)`)
        } else {
          toast.success(`모든 작업이 완료되었습니다! (${doneCount}개)`)
        }
        // Send batch complete webhook notification
        fetch(`${props.backendUrl}${API.webhooks.batchComplete}`, {
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
    sessionCounts.active,
    sessionCounts.done,
    sessionCounts.error,
    sessionCounts.cancelled,
    sessionJobs.length,
    props.backendUrl,
  ])

  const createNewSession = () => {
    const nonEmpty = markers.filter(
      (m) => (sessionJobCounts.get(m.id) ?? 0) > 0
    )
    if (nonEmpty.length < markers.length) {
      persistMarkers(nonEmpty)
    }
    const newMarker: SessionMarkerRaw = {
      id: genId(),
      startAt: Date.now(),
      label: makeSessionLabel(nonEmpty.length + 1),
    }
    persistMarkers([...nonEmpty, newMarker])
    persistActiveState({
      activeSessionId: newMarker.id,
      activatedAt: Date.now(),
    })
    setSelectedSessionId(newMarker.id)
    setSessionPickerOpen(false)
  }

  const handleTogglePause = async () => {
    try {
      await fetch(
        `${props.backendUrl}${props.paused ? API.jobs.resume : API.jobs.pause}`,
        {
          method: "POST",
        }
      )
    } catch {
      toast.error("일시중지/재개 요청에 실패했습니다.")
    }
  }

  const handleCancelAll = async () => {
    if (
      !(await confirm({
        title: "작업 취소",
        description: "진행 중인 모든 작업을 취소하시겠습니까?",
        variant: "destructive",
        confirmText: "모두 취소",
      }))
    )
      return
    try {
      await fetch(`${props.backendUrl}${API.jobs.cancelAll}`, {
        method: "POST",
      })
    } catch {
      toast.error("전체 취소 요청에 실패했습니다.")
    }
  }

  const handleRetryAllFailed = async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    for (const j of failed) {
      try {
        await fetch(`${props.backendUrl}${API.jobs.retry(j.id)}`, {
          method: "POST",
        })
      } catch {
        toast.error(`작업 재시도에 실패했습니다: ${j.id.slice(0, 8)}`)
      }
    }
  }

  const handleDeleteAllFailed = async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    if (failed.length === 0) return
    if (
      !(await confirm({
        title: "실패 작업 삭제",
        description: `실패/취소된 작업 ${failed.length}개를 모두 영구 삭제하시겠습니까?`,
        variant: "destructive",
        confirmText: "모두 삭제",
      }))
    )
      return
    try {
      await fetch(`${props.backendUrl}${API.jobs.delete}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ job_ids: failed.map((j) => j.id) }),
      })
    } catch {
      toast.error("실패 작업 삭제 요청에 실패했습니다.")
    }
  }

  const [mobileJobTab, setMobileJobTab] = useState<
    "editor" | "status" | "list"
  >("editor")

  // ── Gallery toolbar state (lifted for nav bar rendering) ──
  const [galleryStatusFilter, setGalleryStatusFilter] = useState<
    "pending" | "approved" | "rejected" | "trashed" | "all"
  >("pending")
  const [galleryViewMode, setGalleryViewMode] = useState<"grid" | "compare">(
    "grid"
  )
  const [galleryGroupMode, setGalleryGroupMode] = useState(false)
  const [galleryShowFilters, setGalleryShowFilters] = useState(false)
  const [galleryHideRejected, setGalleryHideRejected] = useState(false)
  const [gallerySearchTags, setGallerySearchTags] = useState<string[]>([])
  const [gallerySearchInput, setGallerySearchInput] = useState("")
  const [galleryCandidates, setGalleryCandidates] = useState<
    { value: string; type: "filename" | "tag" | "metadata" }[]
  >([])
  const [_galleryDuplicateStrategy, setGalleryDuplicateStrategy] = useState<
    "hash" | "number"
  >("hash")
  const [gallerySortKey, setGallerySortKey] = useState<
    "createdAt" | "filename" | "sizeBytes"
  >("createdAt")
  const [gallerySortDir, setGallerySortDir] = useState<"asc" | "desc">("desc")

  const [galleryThumbnailSize, setGalleryThumbnailSize] = useSyncedStorage<number>(
    STORAGE_KEYS.galleryThumbnailSize,
    180
  )


  const galleryFilenameFilter = useMemo(() => {
    return gallerySearchTags
      .filter((t) => t.startsWith("@"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [gallerySearchTags])

  const galleryTagFilter = useMemo(() => {
    return gallerySearchTags
      .filter((t) => t.startsWith("#"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [gallerySearchTags])

  const galleryMetadataFilter = useMemo(() => {
    return gallerySearchTags
      .filter((t) => t.startsWith("$"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [gallerySearchTags])

  const galleryGeneralFilters = useMemo(() => {
    return gallerySearchTags.filter(
      (t) => !t.startsWith("@") && !t.startsWith("#") && !t.startsWith("$")
    )
  }, [gallerySearchTags])

  const galleryHasAnyFilter = !!(
    gallerySearchTags.length > 0 || galleryHideRejected
  )

  // ── Gallery action handlers (for Header dropdown + keyboard shortcuts) ──
  const galleryReloadRef = useRef<(() => void) | null>(null)

  const handleGalleryExport = useCallback(async () => {
    try {
      await curationApi.exportDataset(props.backendUrl, {
        ...(props.settings.galleryExportScope === "approved"
          ? { status: "approved" }
          : {}),
        duplicateStrategy: props.settings.galleryExportStrategy,
      })
      toast.success("내보내기가 완료되었습니다.")
    } catch {
      toast.error("내보내기 요청에 실패했습니다.")
    }
  }, [
    props.backendUrl,
    props.settings.galleryExportScope,
    props.settings.galleryExportStrategy,
  ])

  const handleGalleryEmptyTrash = useCallback(async () => {
    if (
      !(await confirm({
        title: "휴지통 비우기",
        description: "휴지통의 이미지를 영구 삭제합니다. 계속하시겠습니까?",
        variant: "destructive",
        confirmText: "영구 삭제",
      }))
    )
      return
    try {
      const n = await curationApi.emptyTrash(props.backendUrl)
      toast.success(`${n}개 영구 삭제됨`)
      galleryReloadRef.current?.()
    } catch {
      toast.error("휴지통 비우기에 실패했습니다.")
    }
  }, [props.backendUrl, confirm])

  const handleGalleryRefresh = useCallback(() => {
    galleryReloadRef.current?.()
  }, [])

  // ── Quick save handler (Ctrl+S shortcut) ──
  const handleQuickSave = useCallback(() => {
    if (props.compositionTab === "ceg") {
      // Save template
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
      // Save workflow
      if (workflow.activeWorkflow) {
        workflow.saveWorkflow(
          workflow.activeWorkflow.name,
          workflow.workflowJson
        )
        workflow.setWorkflowResetKey((k) => k + 1)
      }
    }
  }, [props.compositionTab, template, workflow])

  // ── Curation toolbar state (lifted for nav bar rendering) ──
  const [curationSelectedAxis, setCurationSelectedAxis] = useSyncedStorage(
    STORAGE_KEYS.curationSelectedAxis,
    DEFAULT_AXIS
  )

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
    handleRandomRun,
    randomRunCount,
    setRandomRunCount,
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
        const response = await fetch(`${props.backendUrl}${API.health}`)
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
    fetch(`${props.backendUrl}${API.objectInfo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) nodeMapping.setObjectInfo(data)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.backendUrl, props.isAliveBackend])

  const canRun =
    Boolean(workflow.workflowJson) && props.isAliveBackend && props.backendAlive

  // ── Global keyboard shortcuts ──
  useGlobalShortcuts({
    activeTab: props.activeTab,
    mobileJobTab,
    canRun,
    handleRun,
    handleSave: handleQuickSave,
    handleGalleryRefresh,
    setActiveTab: props.setActiveTab,
  })

  // ── Name conflict helpers ──
  const nextFreeName = (name: string, items: { name: string }[]): string => {
    if (!items.some((x) => x.name === name)) return name
    let n = NAME_CONFLICT_START_NUMBER
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
        props.activeTab === "jobs"
          ? "h-[100dvh] overflow-hidden"
          : "min-h-[100dvh]"
      }`}
    >
      <Header
        activeTab={props.activeTab}
        setActiveTab={props.setActiveTab}
        isAliveBackend={props.isAliveBackend}
        backendAlive={props.backendAlive}
        workers={props.workers}
        jobsCount={props.jobs.length}
        mobileJobTab={mobileJobTab}
        setMobileJobTab={setMobileJobTab}
        compositionTab={props.compositionTab}
        setCompositionTab={props.setCompositionTab}
        repeatCount={repeatCount}
        setRepeatCount={setRepeatCount}
        handleRun={handleRun}
        handleRandomRun={handleRandomRun}
        randomRunCount={randomRunCount}
        setRandomRunCount={setRandomRunCount}
        canRun={canRun}
        estimatedRunCount={estimatedRunCount}
        setIsSelectionOpen={props.setIsSelectionOpen}
        hasActiveFilter={hasActiveFilter}
        setIsAxisFilterOpen={props.setIsAxisFilterOpen}
        setIsGraphOpen={props.setIsGraphOpen}
        galleryStatusFilter={galleryStatusFilter}
        setGalleryStatusFilter={setGalleryStatusFilter}
        galleryViewMode={galleryViewMode}
        setGalleryViewMode={setGalleryViewMode}
        galleryGroupMode={galleryGroupMode}
        setGalleryGroupMode={setGalleryGroupMode}
        galleryShowFilters={galleryShowFilters}
        setGalleryShowFilters={setGalleryShowFilters}
        galleryHasAnyFilter={galleryHasAnyFilter}
        gallerySearchTags={gallerySearchTags}
        setGallerySearchTags={setGallerySearchTags}
        gallerySearchInput={gallerySearchInput}
        setGallerySearchInput={setGallerySearchInput}
        galleryCandidates={galleryCandidates}
        galleryHideRejected={galleryHideRejected}
        setGalleryHideRejected={setGalleryHideRejected}
        setGalleryDuplicateStrategy={setGalleryDuplicateStrategy}
        gallerySortKey={gallerySortKey}
        setGallerySortKey={setGallerySortKey}
        gallerySortDir={gallerySortDir}
        setGallerySortDir={setGallerySortDir}
        galleryThumbnailSize={galleryThumbnailSize}
        setGalleryThumbnailSize={setGalleryThumbnailSize}
        curationSelectedAxis={curationSelectedAxis}

        setCurationSelectedAxis={setCurationSelectedAxis}
        savedTemplates={template.savedTemplates}
        onGalleryExport={handleGalleryExport}
        onGalleryRefresh={handleGalleryRefresh}
        onGalleryEmptyTrash={handleGalleryEmptyTrash}
        // Session / Job controls props (lifted)
        sessionMarkers={markers}
        sessionJobCounts={sessionJobCounts}
        sortedMarkers={sortedMarkers}
        selectedSessionId={selectedSessionId}
        activeSessionState={
          activeState ? { activeSessionId: activeState.activeSessionId } : null
        }
        sessionPickerOpen={sessionPickerOpen}
        onSessionPickerOpenChange={setSessionPickerOpen}
        onSelectSession={setSelectedSessionId}
        onCreateNewSession={createNewSession}
        paused={props.paused}
        onTogglePause={handleTogglePause}
        onCancelAll={handleCancelAll}
        onRetryAllFailed={handleRetryAllFailed}
        onDeleteAllFailed={handleDeleteAllFailed}
        activeJobsCount={sessionCounts.active}
      />

      <main
        className={`flex w-full flex-1 flex-col ${
          props.activeTab === "jobs" ? "overflow-hidden" : ""
        }`}
      >
        {props.activeTab === "stats" && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
            <StatisticsPanel jobs={props.jobs} workers={props.workers} />
          </div>
        )}
        {props.activeTab === "gallery" && (
          <div className="flex flex-col bg-background">
            <SavedImagesGallery
              backendUrl={props.backendUrl}
              enableHover={props.settings.enableHover}
              imagePageSize={props.settings.imagePageSize}
              imageLazyLoad={props.settings.imageLazyLoad}
              singleDownloadMode={props.settings.singleDownloadMode}
              filenameFilter={galleryFilenameFilter}
              tagFilter={galleryTagFilter}
              metadataFilter={galleryMetadataFilter}
              generalFilters={galleryGeneralFilters}
              onTokensExtracted={setGalleryCandidates}
              onReloadReady={(reload) => {
                galleryReloadRef.current = reload
              }}
              toolbarState={{
                statusFilter: galleryStatusFilter,
                setStatusFilter: setGalleryStatusFilter,
                galleryViewMode: galleryViewMode,
                setGalleryViewMode: setGalleryViewMode,
                groupMode: galleryGroupMode,
                setGroupMode: setGalleryGroupMode,
                showFilters: galleryShowFilters,
                setShowFilters: setGalleryShowFilters,
                hasAnyFilter: galleryHasAnyFilter,
                hideRejected: galleryHideRejected,
                setHideRejected: setGalleryHideRejected,
                sortKey: gallerySortKey,
                setSortKey: setGallerySortKey,
                sortDir: gallerySortDir,
                setSortDir: setGallerySortDir,
                thumbnailSize: galleryThumbnailSize,
                setThumbnailSize: setGalleryThumbnailSize,
                clearAllFilters: () => {
                  setGallerySearchTags([])
                  setGallerySearchInput("")
                  setGalleryHideRejected(false)
                },
                reload: handleGalleryRefresh,
                handleExport: handleGalleryExport,
                handleEmptyTrash: handleGalleryEmptyTrash,
              }}
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
              toolbarState={{
                selectedAxis: curationSelectedAxis,
                setSelectedAxis: setCurationSelectedAxis,
                viewMode: "gallery" as const,
                setViewMode: () => {},
                hideTopSection: true,
                exportIsLoading: false,
                setExportIsLoading: () => {},
                exportMessage: null,
                setExportMessage: () => {},
                regenMessage: null,
                setRegenMessage: () => {},
                onExport: () => {},
                onRegenerate: () => {},
              }}
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
            {/* Desktop: Resizable, Mobile: Single Panel */}
            <div className="hidden md:contents">
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1 overflow-hidden"
              >
                <ResizablePanel
                  defaultSize={35}
                  minSize={25}
                  className="flex min-h-0 flex-col overflow-hidden border-r border-line bg-panel"
                >
                  <WorkCompositionPanel
                    repeatCount={repeatCount}
                    setRepeatCount={setRepeatCount}
                    handleRun={handleRun}
                    handleRandomRun={handleRandomRun}
                    randomRunCount={randomRunCount}
                    setRandomRunCount={setRandomRunCount}
                    estimatedRunCount={estimatedRunCount}
                    canRun={canRun}
                    previewCount={fakeJobQueue.length}
                    compositionTab={props.compositionTab}
                    setCompositionTab={props.setCompositionTab}
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
                  className="flex min-h-0 flex-col overflow-hidden bg-panel"
                >
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <JobManagerPanel
                      jobs={props.jobs}
                      paused={props.paused}
                      backendUrl={props.backendUrl}
                      isAliveBackend={props.isAliveBackend}
                      selectedId={selectedSessionId}
                      setSelectedId={setSelectedSessionId}
                      markers={markers}
                      setMarkersRaw={setMarkersRaw}
                      activeState={activeState}
                      setActiveStateRaw={setActiveStateRaw}
                      sessionPickerOpen={sessionPickerOpen}
                      setSessionPickerOpen={setSessionPickerOpen}
                      createNewSession={createNewSession}
                      sessionJobCounts={sessionJobCounts}
                      sortedMarkers={sortedMarkers}
                      counts={sessionCounts}
                      sessionJobs={sessionJobs}
                      handleTogglePause={handleTogglePause}
                      handleCancelAll={handleCancelAll}
                      handleRetryAllFailed={handleRetryAllFailed}
                      handleDeleteAllFailed={handleDeleteAllFailed}
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden md:hidden">
              {mobileJobTab === "editor" && (
                <div className="flex flex-1 flex-col overflow-hidden bg-panel">
                  <WorkCompositionPanel
                    repeatCount={repeatCount}
                    setRepeatCount={setRepeatCount}
                    handleRun={handleRun}
                    handleRandomRun={handleRandomRun}
                    randomRunCount={randomRunCount}
                    setRandomRunCount={setRandomRunCount}
                    estimatedRunCount={estimatedRunCount}
                    canRun={canRun}
                    previewCount={fakeJobQueue.length}
                    compositionTab={props.compositionTab}
                    setCompositionTab={props.setCompositionTab}
                    onPreviewOpen={() => props.setIsSheetOpen(true)}
                    onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
                    onSelectionOpen={() => props.setIsSelectionOpen(true)}
                    hasActiveFilter={hasActiveFilter}
                    onGraphOpen={() => props.setIsGraphOpen(true)}
                  />
                </div>
              )}
              {(mobileJobTab === "status" || mobileJobTab === "list") && (
                <div className="flex min-h-0 flex-1 flex-col bg-panel">
                  <JobManagerPanel
                    jobs={props.jobs}
                    paused={props.paused}
                    backendUrl={props.backendUrl}
                    isAliveBackend={props.isAliveBackend}
                    mobileTab={mobileJobTab}
                    selectedId={selectedSessionId}
                    setSelectedId={setSelectedSessionId}
                    markers={markers}
                    setMarkersRaw={setMarkersRaw}
                    activeState={activeState}
                    setActiveStateRaw={setActiveStateRaw}
                    sessionPickerOpen={sessionPickerOpen}
                    setSessionPickerOpen={setSessionPickerOpen}
                    createNewSession={createNewSession}
                    sessionJobCounts={sessionJobCounts}
                    sortedMarkers={sortedMarkers}
                    counts={sessionCounts}
                    sessionJobs={sessionJobs}
                    handleTogglePause={handleTogglePause}
                    handleCancelAll={handleCancelAll}
                    handleRetryAllFailed={handleRetryAllFailed}
                    handleDeleteAllFailed={handleDeleteAllFailed}
                  />
                </div>
              )}

              {/* Premium Segmented Bottom bar for Mobile Tab Switcher */}
              <div className="shrink-0 border-t border-line/60 bg-panel/85 px-3 py-2 backdrop-blur-md">
                <div className="flex rounded-xl bg-muted/60 p-0.5">
                  {[
                    { id: "editor" as const, label: "에디터" },
                    { id: "status" as const, label: "현황" },
                    {
                      id: "list" as const,
                      label: `기록 (${props.jobs.length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setMobileJobTab(tab.id)}
                      className={cn(
                        "flex-1 cursor-pointer rounded-lg py-1.5 text-center text-xs font-black transition-all duration-200",
                        mobileJobTab === tab.id
                          ? "scale-100 bg-background text-foreground shadow-xs"
                          : "scale-98 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
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

      <VersionDiffDialog
        open={props.pendingDiff !== null}
        onClose={() => props.setPendingDiff(null)}
        onConfirm={() => {
          if (!props.pendingDiff) return
          if (props.pendingDiff.type === "template") {
            template.saveTemplate(
              props.pendingDiff.name,
              props.pendingDiff.newContent
            )
            template.setTemplateResetKey((k) => k + 1)
          } else {
            const w = workflow.saveWorkflow(
              props.pendingDiff.name,
              props.pendingDiff.newContent
            )
            workflow.setActiveWorkflowId(w.id)
            workflow.setWorkflowResetKey((k) => k + 1)
          }
          toast.success(
            `'${props.pendingDiff.name}' 업데이트가 완료되었습니다.`
          )
        }}
        oldContent={props.pendingDiff?.oldContent ?? ""}
        newContent={props.pendingDiff?.newContent ?? ""}
        itemName={props.pendingDiff?.name ?? ""}
      />
    </div>
  )
}

export default App
