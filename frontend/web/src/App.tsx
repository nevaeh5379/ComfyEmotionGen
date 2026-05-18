import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Tabs } from "@/components/ui/tabs"
import { CompositionTabsList } from "./comfyui/components/CompositionTabsList"
import { WorkCompositionToolbar } from "./comfyui/components/WorkCompositionToolbar"
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
import {
  ServerStatus,
  WorkerStatus,
} from "./comfyui/components/StatusIndicators"
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
  Menu,
  Settings,
  XIcon,
} from "lucide-react"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  FilterIcon,
  MoreVertical,
  RefreshCwIcon,
  DownloadIcon,
  Trash2Icon,
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
  const [galleryFilenameFilter, setGalleryFilenameFilter] = useState("")
  const [galleryTagFilter, setGalleryTagFilter] = useState("")
  const [galleryMetadataFilter, setGalleryMetadataFilter] = useState("")
  const [_galleryDuplicateStrategy, setGalleryDuplicateStrategy] = useState<
    "hash" | "number"
  >("hash")

  const galleryHasAnyFilter = !!(
    galleryFilenameFilter.trim() ||
    galleryTagFilter.trim() ||
    galleryMetadataFilter.trim() ||
    galleryHideRejected
  )

  // ── Curation toolbar state (lifted for nav bar rendering) ──
  const [curationSelectedTemplateId, setCurationSelectedTemplateId] =
    useState("")

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
        props.activeTab === "jobs"
          ? "h-[100dvh] overflow-hidden"
          : "min-h-[100dvh]"
      }`}
    >
      <nav className="sticky top-0 z-50 shrink-0 border-b border-line bg-panel/95 backdrop-blur supports-backdrop-filter:bg-panel/80">
        <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-2.5">
          <div className="flex items-center overflow-hidden md:gap-4">
            {/* Mobile hamburger (left side) */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 md:hidden"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="w-[300px] sm:w-[320px]"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <span className="bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-[15px] font-black tracking-tighter text-transparent">
                    ComfyEmotionGen
                  </span>
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </SheetClose>
                </div>

                {/* Navigation */}
                <div className="flex flex-col gap-1 px-3 py-3">
                  {NAV_TABS.map((tab) => {
                    const Icon = tab.icon
                    const isActive = props.activeTab === tab.id
                    return (
                      <div key={tab.id}>
                        <SheetClose asChild>
                          <button
                            className={`group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-bold transition-all ${
                              isActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            }`}
                            onClick={() => {
                              props.setActiveTab(tab.id)
                              if (tab.id === "jobs") setMobileJobTab("editor")
                            }}
                          >
                            <Icon
                              className={`h-[17px] w-[17px] ${isActive ? "opacity-100" : "opacity-50"}`}
                            />
                            <span>{tab.label}</span>
                            {isActive && (
                              <div className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-foreground" />
                            )}
                          </button>
                        </SheetClose>
                        {tab.id === "jobs" && (
                          <div className="mt-0.5 ml-4 border-l border-line pl-3">
                            {[
                              { id: "editor" as const, label: "에디터" },
                              { id: "status" as const, label: "현황" },
                              {
                                id: "list" as const,
                                label: `기록 (${props.jobs.length})`,
                              },
                            ].map((sub) => (
                              <SheetClose asChild key={sub.id}>
                                <button
                                  className={`flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold transition-all ${
                                    mobileJobTab === sub.id
                                      ? "bg-accent/80 text-accent-foreground"
                                      : "text-muted-foreground/70 hover:text-foreground"
                                  }`}
                                  onClick={() => {
                                    props.setActiveTab("jobs")
                                    setMobileJobTab(sub.id)
                                  }}
                                >
                                  {sub.label}
                                </button>
                              </SheetClose>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Footer */}
                <div className="mt-auto border-t border-line px-5 py-4">
                  <div className="flex items-center gap-3">
                    <ServerStatus
                      name="백엔드"
                      isConnected={props.isAliveBackend && props.backendAlive}
                      okHint="백엔드와 연결되어 있습니다."
                      failHint="백엔드 서버 상태를 확인해주세요."
                    />
                    <WorkerStatus
                      workers={props.workers}
                      backendAlive={props.isAliveBackend}
                    />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <span className="shrink-0 bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-[14px] font-black tracking-tighter text-transparent md:text-[15px]">
              <span className="hidden md:inline">ComfyEmotionGen</span>
            </span>
            <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
            {/* Desktop tabs */}
            <div className="no-scrollbar hidden items-center gap-1 overflow-x-auto px-1 pb-1 md:flex">
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <Button
                    key={tab.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => props.setActiveTab(tab.id)}
                    className={`h-10 shrink-0 gap-1.5 rounded-full px-4 text-[13px] font-black transition-all ${
                      props.activeTab === tab.id
                        ? "bg-foreground text-background shadow-lg"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${props.activeTab === tab.id ? "opacity-100" : "opacity-70"}`}
                    />
                    <span
                      className={
                        props.activeTab === tab.id ? "" : "hidden sm:inline"
                      }
                    >
                      {tab.label}
                    </span>
                  </Button>
                )
              })}
            </div>
            {/* Mobile composition tabs (jobs only) */}
            {props.activeTab === "jobs" && (
              <div className="flex flex-1 items-center justify-between gap-2 overflow-x-auto no-scrollbar md:hidden">
                <Tabs
                  value={props.compositionTab}
                  onValueChange={(v) => props.setCompositionTab(v as "ceg" | "workflow")}
                >
                  <CompositionTabsList />
                </Tabs>
                <WorkCompositionToolbar
                  repeatCount={repeatCount}
                  setRepeatCount={setRepeatCount}
                  handleRun={handleRun}
                  canRun={canRun}
                  estimatedRunCount={estimatedRunCount}
                  onSelectionOpen={() => props.setIsSelectionOpen(true)}
                  hasActiveFilter={hasActiveFilter}
                  onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
                  onGraphOpen={() => props.setIsGraphOpen(true)}
                />
              </div>
            )}
            {/* Gallery toolbar (merged into nav) */}
            {props.activeTab === "gallery" && (
              <div className="flex items-center gap-1.5">
                <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
                <Select
                  value={galleryStatusFilter}
                  onValueChange={(v: string) => {
                    setGalleryStatusFilter(
                      v as
                        | "pending"
                        | "approved"
                        | "rejected"
                        | "trashed"
                        | "all"
                    )
                  }}
                >
                  <SelectTrigger className="h-7 w-[70px] border-line bg-background px-1.5 text-[11px] font-bold shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "all",
                        "pending",
                        "approved",
                        "rejected",
                        "trashed",
                      ] as const
                    ).map((s) => (
                      <SelectItem
                        key={s}
                        value={s}
                        className="text-[12px] font-bold"
                      >
                        {s === "all"
                          ? "전체"
                          : s === "pending"
                            ? "대기"
                            : s === "approved"
                              ? "통과"
                              : s === "rejected"
                                ? "탈락"
                                : "휴지통"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={galleryGroupMode ? "group" : galleryViewMode}
                  onValueChange={(v) => {
                    if (v === "group") {
                      setGalleryGroupMode(true)
                    } else {
                      setGalleryGroupMode(false)
                      setGalleryViewMode(v as "grid" | "compare")
                    }
                  }}
                >
                  <SelectTrigger className="h-7 w-[60px] border-line bg-background px-1.5 text-[11px] font-bold shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group" className="text-[12px] font-bold">
                      그룹
                    </SelectItem>
                    <SelectItem value="grid" className="text-[12px] font-bold">
                      그리드
                    </SelectItem>
                    <SelectItem
                      value="compare"
                      className="text-[12px] font-bold"
                    >
                      비교
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  variant={galleryShowFilters ? "secondary" : "outline"}
                  onClick={() => setGalleryShowFilters(!galleryShowFilters)}
                  className="relative h-7 w-7 p-0"
                >
                  <FilterIcon className="h-3.5 w-3.5" />
                  {galleryHasAnyFilter && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary"></span>
                  )}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[180px]">
                    <DropdownMenuLabel className="text-[11px] font-bold">
                      내보내기
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setGalleryDuplicateStrategy("hash")}
                      className="text-[12px] font-bold"
                    >
                      <DownloadIcon className="mr-2 h-3.5 w-3.5" />
                      HASH 기반
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setGalleryDuplicateStrategy("number")}
                      className="text-[12px] font-bold"
                    >
                      <DownloadIcon className="mr-2 h-3.5 w-3.5" />
                      NUM 기반
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => {}}>
                      <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
                      새로고침
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                      <Trash2Icon className="mr-2 h-3.5 w-3.5" />
                      휴지통 비우기
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {/* Curation toolbar (merged into nav) */}
            {props.activeTab === "curation" && (
              <div className="flex items-center gap-1.5">
                <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
                {/* Template selector */}
                <Select
                  value={curationSelectedTemplateId || "__current__"}
                  onValueChange={(v) =>
                    setCurationSelectedTemplateId(v === "__current__" ? "" : v)
                  }
                >
                  <SelectTrigger className="h-7 w-[130px] border-line bg-background px-1.5 text-[11px] font-bold shadow-none focus:ring-0 sm:w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="__current__"
                      className="text-[12px] font-bold"
                    >
                      현재 편집 중인 템플릿
                    </SelectItem>
                    {template.savedTemplates.map((t) => (
                      <SelectItem
                        key={t.id}
                        value={t.id}
                        className="text-[12px] font-bold"
                      >
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="ml-1 hidden shrink-0 items-center gap-2 md:flex">
            <ServerStatus
              name="백엔드"
              isConnected={props.isAliveBackend && props.backendAlive}
              okHint="백엔드와 연결되어 있습니다."
              failHint="백엔드 서버 상태를 확인해주세요."
            />
            <WorkerStatus
              workers={props.workers}
              backendAlive={props.isAliveBackend}
            />
          </div>
        </div>

        {/* Collapsible Filters (gallery only) */}
        {props.activeTab === "gallery" && galleryShowFilters && (
          <div className="border-t border-line/60 bg-panel/80 px-3 py-2 md:px-4 md:py-2.5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">
                  검색
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center">
                  <Input
                    className="h-7 w-full text-xs"
                    type="search"
                    placeholder="파일명 필터"
                    value={galleryFilenameFilter}
                    onChange={(e) => setGalleryFilenameFilter(e.target.value)}
                  />
                  <Input
                    className="h-7 w-full text-xs"
                    type="search"
                    placeholder="태그 필터"
                    value={galleryTagFilter}
                    onChange={(e) => setGalleryTagFilter(e.target.value)}
                  />
                  <Input
                    className="h-7 w-full text-xs"
                    type="search"
                    placeholder="메타데이터/prompt 검색"
                    value={galleryMetadataFilter}
                    onChange={(e) => setGalleryMetadataFilter(e.target.value)}
                  />
                </div>
              </div>

              <div className="hidden h-4 w-px bg-line md:block" />

              <div className="flex items-center justify-between border-t border-line/40 pt-2 md:border-0 md:pt-0">
                <div className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    id="gallery-hide-rejected"
                    checked={galleryHideRejected}
                    onCheckedChange={(v) => setGalleryHideRejected(v === true)}
                  />
                  <Label
                    htmlFor="gallery-hide-rejected"
                    className="cursor-pointer text-[11px] font-bold text-muted-foreground"
                  >
                    리젝 숨기기
                  </Label>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10px] font-bold text-muted-foreground"
                  onClick={() => {
                    setGalleryFilenameFilter("")
                    setGalleryTagFilter("")
                    setGalleryMetadataFilter("")
                    setGalleryHideRejected(false)
                  }}
                >
                  <XIcon className="mr-1 h-3 w-3" />
                  필터 초기화
                </Button>
              </div>
            </div>
          </div>
        )}
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
                clearAllFilters: () => {
                  setGalleryFilenameFilter("")
                  setGalleryTagFilter("")
                  setGalleryMetadataFilter("")
                  setGalleryHideRejected(false)
                },
                reload: () => {},
                handleExport: () => {},
                handleEmptyTrash: () => {},
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
                selectedTemplateId: curationSelectedTemplateId,
                setSelectedTemplateId: setCurationSelectedTemplateId,
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
