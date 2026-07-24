import { ServerStatus, WorkerStatus } from "../StatusIndicators"
import type { WorkerView, JobView } from "../../types/Message"
import type { TabId } from "./nav-tabs"
import {
  JobSessionControls,
  type JobSessionControlsProps,
} from "./JobSessionControls"
import { DesktopNavigation, MobileNavigation } from "./HeaderNavigation"
import { GeneratorHeaderControls } from "./GeneratorHeaderControls"
import { useHeaderResponsiveLayout } from "../../hooks/useHeaderResponsiveLayout"
import { GalleryFilters } from "./GalleryFilters"
import { ThemeSelector } from "./ThemeSelector"
import { GalleryHeaderControls } from "./GalleryHeaderControls"
import { CurationHeaderControls } from "./CurationHeaderControls"
import { MobileJobHeaderControls } from "./MobileJobHeaderControls"

interface HeaderProps extends Omit<
  JobSessionControlsProps,
  "markers" | "compact"
> {
  useWindowMode?: boolean
  activeTab: TabId
  setActiveTab: (t: TabId) => void
  backendAlive: boolean
  workers: WorkerView[]
  jobsCount: number
  jobs?: JobView[]
  mobileJobTab: "editor" | "status" | "list"
  setMobileJobTab: (v: "editor" | "status" | "list") => void
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (v: "ceg" | "workflow") => void

  // Job specific
  repeatCount: number
  setRepeatCount: (v: number | ((c: number) => number)) => void
  handleRun: () => void
  handleRandomRun: (count: number) => void
  handleRunUnapproved: () => void
  randomRunCount: number
  setRandomRunCount: (v: number | ((c: number) => number)) => void
  targetWorkerId: string | null
  setTargetWorkerId: (v: string | null) => void
  canRun: boolean
  estimatedRunCount: number | null
  setIsSelectionOpen: (v: boolean) => void
  hasActiveFilter: boolean
  setIsAxisFilterOpen: (v: boolean) => void

  // Header renames the required session list because the controls are optional.
  sessionMarkers?: JobSessionControlsProps["markers"]

  // Drag-to-float for stats/curation/gallery nav tabs
  onStatsDragStart?: (clientX: number, clientY: number) => void
  onCurationDragStart?: (clientX: number, clientY: number) => void
  onGalleryDragStart?: (clientX: number, clientY: number) => void
}

export function Header(props: HeaderProps): JSX.Element {
  const {
    headerRef,
    logoRef,
    tabsRef,
    galleryToolbarRef,
    curationToolbarRef,
    rightSectionRef,
    galleryToolbarCompact: isGalleryToolbarCompact,
    galleryToolbarUltraCompact: isGalleryToolbarUltraCompact,
  } = useHeaderResponsiveLayout(props.activeTab)

  return (
    <nav
      ref={headerRef}
      className="sticky top-0 z-50 shrink-0 border-b border-line bg-panel/95 backdrop-blur supports-backdrop-filter:bg-panel/80"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-2.5">
        <div className="flex flex-1 items-center overflow-hidden md:gap-4">
          <MobileNavigation
            activeTab={props.activeTab}
            setActiveTab={props.setActiveTab}
            mobileJobTab={props.mobileJobTab}
            setMobileJobTab={props.setMobileJobTab}
            jobsCount={props.jobsCount}
            isAliveBackend={props.isAliveBackend}
            backendAlive={props.backendAlive}
            workers={props.workers}
            jobs={props.jobs ?? []}
          />
          <span
            ref={logoRef}
            className="shrink-0 bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-[14px] font-black tracking-tighter text-transparent md:text-[15px]"
          >
            <span className="hidden md:inline">ComfyEmotionGen</span>
          </span>
          <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
          <DesktopNavigation
            tabsRef={tabsRef}
            activeTab={props.activeTab}
            setActiveTab={props.setActiveTab}
            useWindowMode={props.useWindowMode === true}
            onStatsDragStart={props.onStatsDragStart}
            onCurationDragStart={props.onCurationDragStart}
            onGalleryDragStart={props.onGalleryDragStart}
          />
          <MobileJobHeaderControls
            active={props.activeTab === "jobs"}
            mobileJobTab={props.mobileJobTab}
            compositionTab={props.compositionTab}
            setCompositionTab={props.setCompositionTab}
            repeatCount={props.repeatCount}
            setRepeatCount={props.setRepeatCount}
            handleRun={props.handleRun}
            handleRandomRun={props.handleRandomRun}
            handleRunUnapproved={props.handleRunUnapproved}
            randomRunCount={props.randomRunCount}
            setRandomRunCount={props.setRandomRunCount}
            canRun={props.canRun}
            estimatedRunCount={props.estimatedRunCount}
            workers={props.workers}
            targetWorkerId={props.targetWorkerId}
            setTargetWorkerId={props.setTargetWorkerId}
            setIsSelectionOpen={props.setIsSelectionOpen}
            hasActiveFilter={props.hasActiveFilter}
            setIsAxisFilterOpen={props.setIsAxisFilterOpen}
            sessionMarkers={props.sessionMarkers}
            sessionJobCounts={props.sessionJobCounts}
            sortedMarkers={props.sortedMarkers}
            selectedSessionId={props.selectedSessionId}
            activeSessionState={props.activeSessionState}
            sessionPickerOpen={props.sessionPickerOpen}
            onSessionPickerOpenChange={props.onSessionPickerOpenChange}
            onSelectSession={props.onSelectSession}
            onCreateNewSession={props.onCreateNewSession}
            paused={props.paused}
            onTogglePause={props.onTogglePause}
            onCancelAll={props.onCancelAll}
            onRetryAllFailed={props.onRetryAllFailed}
            onDeleteAllFailed={props.onDeleteAllFailed}
            activeJobsCount={props.activeJobsCount}
            isAliveBackend={props.isAliveBackend}
          />

          <GeneratorHeaderControls active={props.activeTab === "generator"} />

          <CurationHeaderControls
            ref={curationToolbarRef}
            active={props.activeTab === "curation"}
          />
        </div>
        <div
          ref={rightSectionRef}
          className="ml-1 flex shrink-0 items-center gap-2"
        >
          <GalleryHeaderControls
            ref={galleryToolbarRef}
            active={props.activeTab === "gallery"}
            compact={isGalleryToolbarCompact}
            ultraCompact={isGalleryToolbarUltraCompact}
            useWindowMode={props.useWindowMode === true}
            onPopOut={() => {
              props.setActiveTab("jobs")
            }}
          />
          {props.activeTab === "jobs" && props.sessionMarkers && (
            <JobSessionControls
              markers={props.sessionMarkers}
              sessionJobCounts={props.sessionJobCounts}
              sortedMarkers={props.sortedMarkers}
              selectedSessionId={props.selectedSessionId}
              activeSessionState={props.activeSessionState}
              sessionPickerOpen={props.sessionPickerOpen}
              onSessionPickerOpenChange={props.onSessionPickerOpenChange}
              onSelectSession={props.onSelectSession}
              onCreateNewSession={props.onCreateNewSession}
              paused={props.paused}
              onTogglePause={props.onTogglePause}
              onCancelAll={props.onCancelAll}
              onRetryAllFailed={props.onRetryAllFailed}
              onDeleteAllFailed={props.onDeleteAllFailed}
              activeJobsCount={props.activeJobsCount}
              isAliveBackend={props.isAliveBackend}
            />
          )}
          <ThemeSelector />
          <div className="hidden items-center gap-2 md:flex">
            <ServerStatus
              name="백엔드"
              isConnected={props.isAliveBackend && props.backendAlive}
              okHint="백엔드와 연결되어 있습니다."
              failHint="백엔드 서버 상태를 확인해주세요."
            />
            <WorkerStatus
              workers={props.workers}
              backendAlive={props.isAliveBackend}
              jobs={props.jobs ?? []}
            />
          </div>
        </div>
      </div>

      <GalleryFilters active={props.activeTab === "gallery"} />
    </nav>
  )
}
