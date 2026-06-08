import React from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  ExternalLink,
  RotateCcw,
  Workflow,
  X as XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { WorkCompositionPanel } from "../WorkCompositionPanel"
import { JobManagerPanel } from "../JobManagerPanel"
import { StatisticsPanel } from "../StatisticsPanel"
import { SavedImagesGallery } from "../SavedImagesGallery"
import { CombinationPicker } from "../combinationpicker/CombinationPicker"

import type { JobView, WorkerView, JobStatus } from "../../types/Message"
import type { SessionMarkerRaw, ActiveStateRaw } from "../../utils/sessionUtils"
import type { GalleryToolbarValue } from "../../contexts/GalleryToolbarContext"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Session manager state returned from useSessionManager */
interface SessionManagerState {
  markers: SessionMarkerRaw[]
  setMarkersRaw: React.Dispatch<React.SetStateAction<SessionMarkerRaw[]>>
  activeState: ActiveStateRaw | null
  setActiveStateRaw: React.Dispatch<React.SetStateAction<ActiveStateRaw>>
  sortedMarkers: SessionMarkerRaw[]
  selectedSessionId: string
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string>>
  sessionJobCounts: Map<string, number>
  sessionJobs: JobView[]
  sessionCounts: Record<JobStatus | "active", number>
  sessionPickerOpen: boolean
  setSessionPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  createNewSession: () => void
}

/** Job runner state returned from useJobRunner */
interface JobRunnerState {
  fakeJobQueue: { filename: string; prompt: string }[]
  hasActiveFilter: boolean
  estimatedRunCount: number | null
  repeatCount: number
  setRepeatCount: React.Dispatch<React.SetStateAction<number>>
  handleRun: () => void
  handleRandomRun: (count: number) => void
  randomRunCount: number
  setRandomRunCount: React.Dispatch<React.SetStateAction<number>>
}

/** Window manager state (subset used by JobsTab) */
interface WindowManagerState {
  isCompositionFloating: boolean
  setIsCompositionFloating: (v: boolean) => void
  compositionFloatingPos: { x: number; y: number }
  setCompositionFloatingPos: (pos: { x: number; y: number }) => void
  compositionFloatingSize: { w: number; h: number }
  setCompositionFloatingSize: (size: { w: number; h: number }) => void

  isJobManagerFloating: boolean
  setIsJobManagerFloating: (v: boolean) => void
  jobManagerFloatingPos: { x: number; y: number }
  setJobManagerFloatingPos: (pos: { x: number; y: number }) => void
  jobManagerFloatingSize: { w: number; h: number }
  setJobManagerFloatingSize: (size: { w: number; h: number }) => void

  isGalleryFloating: boolean
  setIsGalleryFloating: (v: boolean) => void
  galleryFloatingPos: { x: number; y: number }
  setGalleryFloatingPos: (pos: { x: number; y: number }) => void
  galleryFloatingSize: { w: number; h: number }
  setGalleryFloatingSize: (size: { w: number; h: number }) => void
  isGalleryDocked: boolean
  setIsGalleryDocked: (v: boolean) => void
  galleryDockedSide: "start" | "end"

  isStatsFloating: boolean
  setIsStatsFloating: (v: boolean) => void
  statsFloatingPos: { x: number; y: number }
  setStatsFloatingPos: (pos: { x: number; y: number }) => void
  statsFloatingSize: { w: number; h: number }
  setStatsFloatingSize: (size: { w: number; h: number }) => void
  isStatsDocked: boolean
  setIsStatsDocked: (v: boolean) => void
  statsDockedSide: "start" | "end"

  isCurationFloating: boolean
  setIsCurationFloating: (v: boolean) => void
  curationFloatingPos: { x: number; y: number }
  setCurationFloatingPos: (pos: { x: number; y: number }) => void
  curationFloatingSize: { w: number; h: number }
  setCurationFloatingSize: (size: { w: number; h: number }) => void
  isCurationDocked: boolean
  setIsCurationDocked: (v: boolean) => void
  curationDockedSide: "start" | "end"

  handleHeaderDragStart: (e: React.MouseEvent, windowType: "composition" | "jobManager") => void
}

/** Job action handlers */
interface JobActionHandlers {
  handleTogglePause: () => void
  handleCancelAll: () => void
  handleRetryAllFailed: () => void
  handleDeleteAllFailed: () => void
}

export interface JobsTabProps {
  // Backend state
  backendUrl: string
  isAliveBackend: boolean
  jobs: JobView[]
  workers: WorkerView[]
  paused: boolean

  // Session manager state
  session: SessionManagerState

  // Job runner state
  runner: JobRunnerState

  // Window manager state
  windowManager: WindowManagerState

  // Job actions
  jobActions: JobActionHandlers

  // Layout settings
  jobsLayoutOrientation: "horizontal" | "vertical"
  setJobsLayoutOrientation: (v: "horizontal" | "vertical") => void
  jobsPanelOrder: "composition-first" | "manager-first"
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (tab: "ceg" | "workflow") => void

  // Mobile tab state
  mobileJobTab: "editor" | "status" | "list"
  setMobileJobTab: (tab: "editor" | "status" | "list") => void

  // Settings
  useWindowMode: boolean
  enableHover: boolean
  imagePageSize: 24 | 48 | 96
  imageLazyLoad: boolean
  singleDownloadMode: "newtab" | "direct"
  autoApplyReject: boolean
  hideEmptyCurationFolders: boolean

  // Curation
  curationSelectedAxis: string
  setCurationSelectedAxis: (axis: string) => void

  // Template / workflow context values (for curation/gallery panels)
  cegTemplate: ReturnType<typeof import("../../contexts/useTemplateContext").useTemplateContext>["cegTemplate"]
  savedTemplates: ReturnType<typeof import("../../contexts/useTemplateContext").useTemplateContext>["savedTemplates"]
  savedWorkflows: ReturnType<typeof import("../../contexts/WorkflowContext").useWorkflowContext>["savedWorkflows"]

  // Gallery toolbar
  tb: GalleryToolbarValue

  // Dialog triggers
  setIsSheetOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsAxisFilterOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsSelectionOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsGraphOpen: React.Dispatch<React.SetStateAction<boolean>>

  // Can run
  canRun: boolean
}

// ---------------------------------------------------------------------------
// JobsTab
// ---------------------------------------------------------------------------

export function JobsTab({
  backendUrl,
  isAliveBackend,
  jobs,
  workers,
  paused,

  session,
  runner,
  windowManager,
  jobActions,

  jobsLayoutOrientation,
  setJobsLayoutOrientation,
  jobsPanelOrder,
  compositionTab,
  setCompositionTab,

  mobileJobTab,
  setMobileJobTab,

  useWindowMode,
  enableHover,
  imagePageSize,
  imageLazyLoad,
  singleDownloadMode,
  autoApplyReject,
  hideEmptyCurationFolders,

  curationSelectedAxis,
  setCurationSelectedAxis,

  cegTemplate,
  savedTemplates,
  savedWorkflows,

  tb,

  setIsSheetOpen,
  setIsAxisFilterOpen,
  setIsSelectionOpen,
  setIsGraphOpen,

  canRun,
}: JobsTabProps) {
  const {
    isCompositionFloating,
    setIsCompositionFloating,

    isJobManagerFloating,
    setIsJobManagerFloating,

    isGalleryDocked,
    setIsGalleryDocked,
    galleryDockedSide,

    isStatsDocked,
    setIsStatsDocked,
    statsDockedSide,

    isCurationDocked,
    setIsCurationDocked,
    curationDockedSide,

    handleHeaderDragStart,
  } = windowManager

  const {
    markers,
    setMarkersRaw,
    activeState,
    setActiveStateRaw,
    sortedMarkers,
    selectedSessionId,
    setSelectedSessionId,
    sessionJobCounts,
    sessionJobs,
    sessionCounts,
    sessionPickerOpen,
    setSessionPickerOpen,
    createNewSession,
  } = session

  const {
    repeatCount,
    setRepeatCount,
    handleRun,
    handleRandomRun,
    randomRunCount,
    setRandomRunCount,
    estimatedRunCount,
    fakeJobQueue,
    hasActiveFilter,
  } = runner

  const {
    handleTogglePause,
    handleCancelAll,
    handleRetryAllFailed,
    handleDeleteAllFailed,
  } = jobActions

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Desktop: Resizable, Mobile: Single Panel */}
      <div className="hidden md:contents">
        {(() => {
          // ── 패널 콘텐츠 ──────────────────────────────────────────
          const compositionEl = !isCompositionFloating ? (
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
              compositionTab={compositionTab}
              setCompositionTab={setCompositionTab}
              onPreviewOpen={() => setIsSheetOpen(true)}
              onAxisFilterOpen={() => setIsAxisFilterOpen(true)}
              onSelectionOpen={() => setIsSelectionOpen(true)}
              hasActiveFilter={hasActiveFilter}
              onGraphOpen={() => setIsGraphOpen(true)}
              isFloating={false}
              jobsLayoutOrientation={jobsLayoutOrientation}
              onToggleJobsLayoutOrientation={() =>
                setJobsLayoutOrientation(
                  jobsLayoutOrientation === "horizontal"
                    ? "vertical"
                    : "horizontal"
                )
              }
              {...(useWindowMode
                ? {
                    onFloatToggle: () => setIsCompositionFloating(true),
                    onHeaderDragStart: (e: React.MouseEvent) =>
                      handleHeaderDragStart(e, "composition"),
                  }
                : {})}
            />
          ) : null

          const jobManagerEl = !isJobManagerFloating ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <JobManagerPanel
                jobs={jobs}
                paused={paused}
                backendUrl={backendUrl}
                isAliveBackend={isAliveBackend}
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
                isFloating={false}
                {...(useWindowMode
                  ? {
                      onFloatToggle: () => setIsJobManagerFloating(true),
                      onHeaderDragStart: (e: React.MouseEvent) =>
                        handleHeaderDragStart(e, "jobManager"),
                    }
                  : {})}
              />
            </div>
          ) : null

          // 도킹 패널 공통 헤더 버튼
          const panelBtn = (
            icon: React.ReactNode,
            onClick: () => void,
            title: string
          ) => (
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onClick}
              title={title}
            >
              {icon}
            </button>
          )

          // ── 패널 리스트 구성 ────────────────────────────────────
          type PanelItem = {
            id: string
            el: React.ReactNode
            minSize?: number
          }

          // 코어 패널 (composition / jobManager)
          const corePanels: PanelItem[] = []
          const comp = compositionEl
            ? { id: "composition", el: compositionEl, minSize: 20 }
            : null
          const mgr = jobManagerEl
            ? { id: "jobManager", el: jobManagerEl }
            : null
          if (jobsPanelOrder === "composition-first") {
            if (comp) corePanels.push(comp)
            if (mgr) corePanels.push(mgr)
          } else {
            if (mgr) corePanels.push(mgr)
            if (comp) corePanels.push(comp)
          }

          // 추가 도킹 패널 — snap 방향에 따라 start/end 분리
          const startExtra: PanelItem[] = []
          const endExtra: PanelItem[] = []
          const addExtra = (item: PanelItem, side: "start" | "end") =>
            (side === "start" ? startExtra : endExtra).push(item)

          if (isStatsDocked)
            addExtra(
              {
                id: "stats",
                el: (
                  <div className="flex h-full w-full flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                      <span className="text-[13px] font-bold">통계</span>
                      <div className="flex items-center gap-0.5">
                        {useWindowMode &&
                          panelBtn(
                            <ExternalLink className="h-3.5 w-3.5" />,
                            () => {
                              setIsStatsDocked(false)
                              windowManager.setIsStatsFloating(true)
                            },
                            "창으로 분리"
                          )}
                        {panelBtn(
                          <XIcon className="h-3.5 w-3.5" />,
                          () => setIsStatsDocked(false),
                          "패널 닫기"
                        )}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                      <StatisticsPanel jobs={jobs} workers={workers} />
                    </div>
                  </div>
                ),
              },
              statsDockedSide
            )

          if (isGalleryDocked)
            addExtra(
              {
                id: "gallery",
                el: (
                  <div className="flex h-full w-full flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                      <span className="text-[13px] font-bold">
                        갤러리
                      </span>
                      <div className="flex items-center gap-0.5">
                        {useWindowMode &&
                          panelBtn(
                            <ExternalLink className="h-3.5 w-3.5" />,
                            () => {
                              setIsGalleryDocked(false)
                              windowManager.setIsGalleryFloating(true)
                            },
                            "창으로 분리"
                          )}
                        {panelBtn(
                          <XIcon className="h-3.5 w-3.5" />,
                          () => setIsGalleryDocked(false),
                          "패널 닫기"
                        )}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <SavedImagesGallery
                        backendUrl={backendUrl}
                        enableHover={enableHover}
                        imagePageSize={imagePageSize}
                        imageLazyLoad={imageLazyLoad}
                        singleDownloadMode={singleDownloadMode}
                        filenameFilter={tb.filenameFilter}
                        tagFilter={tb.tagFilter}
                        metadataFilter={tb.metadataFilter}
                        generalFilters={tb.generalFilters}
                        onTokensExtracted={tb.setCandidates}
                        onReloadReady={(reload) => {
                          tb.registerReload(reload)
                        }}
                        toolbarState={tb}
                      />
                    </div>
                  </div>
                ),
              },
              galleryDockedSide
            )

          if (isCurationDocked)
            addExtra(
              {
                id: "curation",
                el: (
                  <div className="flex h-full w-full flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                      <span className="text-[13px] font-bold">
                        큐레이션
                      </span>
                      <div className="flex items-center gap-0.5">
                        {useWindowMode &&
                          panelBtn(
                            <ExternalLink className="h-3.5 w-3.5" />,
                            () => {
                              setIsCurationDocked(false)
                              windowManager.setIsCurationFloating(true)
                            },
                            "창으로 분리"
                          )}
                        {panelBtn(
                          <XIcon className="h-3.5 w-3.5" />,
                          () => setIsCurationDocked(false),
                          "패널 닫기"
                        )}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <CombinationPicker
                        backendUrl={backendUrl}
                        cegTemplate={cegTemplate}
                        savedTemplates={savedTemplates}
                        enableHover={enableHover}
                        autoApplyReject={autoApplyReject}
                        hideEmptyCurationFolders={hideEmptyCurationFolders}
                        savedWorkflows={savedWorkflows}
                        toolbarState={{
                          selectedAxis: curationSelectedAxis,
                          setSelectedAxis: setCurationSelectedAxis,
                          viewMode: "gallery" as const,
                          setViewMode: () => {},
                          hideTopSection: true,
                        }}
                      />
                    </div>
                  </div>
                ),
              },
              curationDockedSide
            )

          // start → core → end 순서로 최종 패널 리스트
          const panels: PanelItem[] = [
            ...startExtra,
            ...corePanels,
            ...endExtra,
          ]

          // ── 렌더링 ──────────────────────────────────────────────
          if (panels.length === 0) {
            return (
              <div className="flex flex-1 animate-in flex-col items-center justify-center bg-background p-8 text-center duration-300 select-none fade-in">
                <div className="relative flex max-w-md animate-in flex-col items-center justify-center space-y-6 overflow-hidden rounded-2xl border border-line/45 bg-panel/40 p-8 shadow-xl backdrop-blur-xl duration-300 zoom-in-95 before:absolute before:inset-0 before:-z-10 before:rounded-2xl before:bg-gradient-to-tr before:from-primary/5 before:via-transparent before:to-primary/10">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Workflow className="h-8 w-8 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight text-foreground">
                      모든 작업 패널이 창 모드로 분리되었습니다
                    </h3>
                    <p className="px-4 text-sm leading-relaxed text-muted-foreground">
                      작업 구성 패널과 작업 큐 매니저가 개별 플로팅 창으로
                      활성화되었습니다.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setIsCompositionFloating(false)
                      setIsJobManagerFloating(false)
                    }}
                    className="group flex h-10 items-center gap-2 rounded-xl bg-primary px-6 py-2 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90"
                  >
                    <RotateCcw className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
                    모두 원래대로 결합
                  </Button>
                </div>
              </div>
            )
          }

          if (panels.length === 1) {
            return (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
                {panels[0]!.el}
              </div>
            )
          }

          const defaultSize = Math.floor(100 / panels.length)
          return (
            <ResizablePanelGroup
              key={panels.map((p) => p.id).join(",")}
              autoSaveId={`job-layout-${panels.map((p) => p.id).join(",")}-${jobsLayoutOrientation}`}
              orientation={jobsLayoutOrientation}
              className="min-h-0 flex-1 overflow-hidden"
            >
              {panels.flatMap((panel, i) => {
                const items = []
                if (i > 0)
                  items.push(<ResizableHandle key={`h-${panel.id}`} />)
                items.push(
                  <ResizablePanel
                    key={panel.id}
                    id={panel.id}
                    defaultSize={defaultSize}
                    minSize={panel.minSize ?? 15}
                    className={cn(
                      "flex min-h-0 flex-col overflow-hidden bg-panel",
                      i < panels.length - 1 &&
                        (jobsLayoutOrientation === "horizontal"
                          ? "border-r border-line"
                          : "border-b border-line")
                    )}
                  >
                    {panel.el}
                  </ResizablePanel>
                )
                return items
              })}
            </ResizablePanelGroup>
          )
        })()}
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
              compositionTab={compositionTab}
              setCompositionTab={setCompositionTab}
              onPreviewOpen={() => setIsSheetOpen(true)}
              onAxisFilterOpen={() => setIsAxisFilterOpen(true)}
              onSelectionOpen={() => setIsSelectionOpen(true)}
              hasActiveFilter={hasActiveFilter}
              onGraphOpen={() => setIsGraphOpen(true)}
            />
          </div>
        )}
        {(mobileJobTab === "status" || mobileJobTab === "list") && (
          <div className="flex min-h-0 flex-1 flex-col bg-panel">
            <JobManagerPanel
              jobs={jobs}
              paused={paused}
              backendUrl={backendUrl}
              isAliveBackend={isAliveBackend}
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
                label: `기록 (${jobs.length})`,
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
  )
}
