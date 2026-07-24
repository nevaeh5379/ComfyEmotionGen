import {
  ArrowDown,
  ArrowUp,
  FilterIcon,
  MoreVertical,
  RefreshCwIcon,
  DownloadIcon,
  Trash2Icon,
  LayoutGrid,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import { Tabs } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CompositionTabsList } from "../CompositionTabsList"
import { WorkCompositionToolbar } from "../WorkCompositionToolbar"
import { ServerStatus, WorkerStatus } from "../StatusIndicators"
import type { WorkerView, CurationStatus, JobView } from "../../types/Message"
import { type SessionMarker, type ActiveStateInfo } from "../JobManagerSections"
import { useCurationToolbar } from "../combinationpicker/useCurationToolbar"
import { usePanelLayout } from "../../contexts/PanelLayoutContext"
import { useGalleryToolbar } from "../../contexts/GalleryToolbarContext"
import type { TabId } from "./nav-tabs"
import { CurationGroupSelect } from "./CurationGroupSelect"
import { JobSessionControls } from "./JobSessionControls"
import { DesktopNavigation, MobileNavigation } from "./HeaderNavigation"
import { GeneratorHeaderControls } from "./GeneratorHeaderControls"
import { useHeaderResponsiveLayout } from "../../hooks/useHeaderResponsiveLayout"
import { GalleryFilters } from "./GalleryFilters"
import { ThemeSelector } from "./ThemeSelector"

interface HeaderProps {
  useWindowMode?: boolean
  activeTab: TabId
  setActiveTab: (t: TabId) => void
  isAliveBackend: boolean
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

  // Session / Job controls props (lifted)
  sessionMarkers?: SessionMarker[]
  sessionJobCounts?: Map<string, number>
  sortedMarkers?: SessionMarker[]
  selectedSessionId?: string
  activeSessionState?: ActiveStateInfo | null
  sessionPickerOpen?: boolean
  onSessionPickerOpenChange?: (open: boolean) => void
  onSelectSession?: (id: string) => void
  onCreateNewSession?: () => void
  paused?: boolean
  onTogglePause?: () => void
  onCancelAll?: () => void
  onRetryAllFailed?: () => void
  onDeleteAllFailed?: () => void
  activeJobsCount?: number

  // Drag-to-float for stats/curation/gallery nav tabs
  onStatsDragStart?: (clientX: number, clientY: number) => void
  onCurationDragStart?: (clientX: number, clientY: number) => void
  onGalleryDragStart?: (clientX: number, clientY: number) => void
}

export function Header(props: HeaderProps): JSX.Element {
  const panel = usePanelLayout()
  const tb = useGalleryToolbar()
  const curToolbar = useCurationToolbar()
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

  const toggleSort = (key: "createdAt" | "filename" | "sizeBytes"): void => {
    if (tb.sortKey === key) {
      tb.setSortDir(tb.sortDir === "asc" ? "desc" : "asc")
    } else {
      tb.setSortKey(key)
      tb.setSortDir("asc")
    }
  }

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
          {/* Mobile composition tabs (jobs editor only) */}
          {props.activeTab === "jobs" && props.mobileJobTab === "editor" && (
            <div className="no-scrollbar flex flex-1 items-center justify-between gap-2 overflow-x-auto md:hidden">
              <Tabs
                value={props.compositionTab}
                onValueChange={(v) => {
                  props.setCompositionTab(v as "ceg" | "workflow")
                }}
              >
                <CompositionTabsList />
              </Tabs>
              <WorkCompositionToolbar
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
                onSelectionOpen={() => {
                  props.setIsSelectionOpen(true)
                }}
                hasActiveFilter={props.hasActiveFilter}
                onAxisFilterOpen={() => {
                  props.setIsAxisFilterOpen(true)
                }}
              />
            </div>
          )}
          {/* Mobile Session/Pause/Actions toolbar (jobs status or list only) */}
          {props.activeTab === "jobs" &&
            (props.mobileJobTab === "status" ||
              props.mobileJobTab === "list") &&
            props.sessionMarkers && (
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
                compact
              />
            )}

          <GeneratorHeaderControls active={props.activeTab === "generator"} />

          {/* Curation toolbar — desktop (hidden on mobile) */}
          {props.activeTab === "curation" && (
            <div
              ref={curationToolbarRef}
              className="hidden items-center gap-1.5 md:flex"
            >
              <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
              <CurationGroupSelect toolbar={curToolbar} />
            </div>
          )}

          {/* Curation toolbar — mobile (hidden on desktop) */}
          {props.activeTab === "curation" && (
            <div className="flex items-center gap-1 md:hidden">
              <CurationGroupSelect toolbar={curToolbar} compact />

              <Button
                size="sm"
                variant={curToolbar.filtersExpanded ? "secondary" : "outline"}
                className="!h-7 !w-7 shrink-0 p-0"
                onClick={() => {
                  curToolbar.setFiltersExpanded(!curToolbar.filtersExpanded)
                }}
              >
                <FilterIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <div
          ref={rightSectionRef}
          className="ml-1 flex shrink-0 items-center gap-2"
        >
          {/* Gallery toolbar — desktop (moved to right section) */}
          {props.activeTab === "gallery" && (
            <div
              ref={galleryToolbarRef}
              className="hidden items-center gap-1.5 md:flex"
            >
              <Select
                value={tb.statusFilter}
                onValueChange={(v: string) => {
                  tb.setStatusFilter(v as CurationStatus | "all")
                }}
              >
                <SelectTrigger
                  className={`hidden !h-7 w-[82px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 ${isGalleryToolbarUltraCompact ? "md:hidden" : "md:inline-flex"}`}
                >
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
                value={tb.groupMode ? "group" : tb.viewMode}
                onValueChange={(v) => {
                  if (v === "group") {
                    tb.setGroupMode(true)
                  } else {
                    tb.setGroupMode(false)
                    tb.setViewMode(v as "grid" | "compare")
                  }
                }}
              >
                <SelectTrigger
                  className={`hidden !h-7 w-[78px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 ${isGalleryToolbarUltraCompact ? "md:hidden" : "md:inline-flex"}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group" className="text-[12px] font-bold">
                    그룹
                  </SelectItem>
                  <SelectItem value="grid" className="text-[12px] font-bold">
                    그리드
                  </SelectItem>
                  <SelectItem value="compare" className="text-[12px] font-bold">
                    비교
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={tb.sortKey}
                onValueChange={(k) => {
                  toggleSort(k as "createdAt" | "filename" | "sizeBytes")
                }}
              >
                <SelectTrigger
                  className={`hidden !h-7 w-[74px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 ${isGalleryToolbarUltraCompact ? "md:hidden" : "md:inline-flex"}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="createdAt"
                    className="text-[12px] font-bold"
                  >
                    날짜순
                  </SelectItem>
                  <SelectItem
                    value="filename"
                    className="text-[12px] font-bold"
                  >
                    파일명순
                  </SelectItem>
                  <SelectItem
                    value="sizeBytes"
                    className="text-[12px] font-bold"
                  >
                    크기순
                  </SelectItem>
                </SelectContent>
              </Select>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      toggleSort(tb.sortKey)
                    }}
                    className={`hidden !h-7 !w-7 shrink-0 border-line bg-background p-0 shadow-none hover:bg-muted ${isGalleryToolbarUltraCompact ? "md:hidden" : "md:inline-flex"}`}
                  >
                    {tb.sortDir === "asc" ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>정렬 방향</TooltipContent>
              </Tooltip>

              {(tb.groupMode || tb.viewMode === "grid") && (
                <div
                  className={`hidden h-7 items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-2 py-1 shadow-xs ${isGalleryToolbarCompact || isGalleryToolbarUltraCompact ? "md:hidden" : "md:flex"}`}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center text-muted-foreground">
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-bold">
                      크기 조절
                    </TooltipContent>
                  </Tooltip>
                  <input
                    type="range"
                    min="120"
                    max="320"
                    step="10"
                    value={tb.thumbnailSize}
                    onChange={(e) => {
                      tb.setThumbnailSize(Number(e.target.value))
                    }}
                    className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                  />
                  <span className="w-[34px] text-right font-mono text-[9px] font-bold whitespace-nowrap text-muted-foreground tabular-nums">
                    {tb.thumbnailSize}px
                  </span>
                </div>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={tb.showFilters ? "secondary" : "outline"}
                    onClick={() => {
                      tb.setShowFilters(!tb.showFilters)
                    }}
                    className={`relative hidden !h-7 !w-7 p-0 ${isGalleryToolbarCompact || isGalleryToolbarUltraCompact ? "md:hidden" : "md:inline-flex"}`}
                  >
                    <FilterIcon className="h-3.5 w-3.5" />
                    {tb.hasAnyFilter && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary"></span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>검색 및 필터 토글</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`hidden !h-7 !w-7 p-0 ${isGalleryToolbarCompact || isGalleryToolbarUltraCompact ? "md:hidden" : "md:inline-flex"}`}
                    onClick={() => void tb.handleExport()}
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>갤러리 내보내기</TooltipContent>
              </Tooltip>

              {props.useWindowMode === true && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`hidden !h-7 !w-7 p-0 ${isGalleryToolbarCompact || isGalleryToolbarUltraCompact ? "md:hidden" : "md:inline-flex"}`}
                      onClick={() => {
                        panel.gallery.setIsFloating(true)
                        props.setActiveTab("jobs")
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>창으로 분리 (Pop out)</TooltipContent>
                </Tooltip>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="hidden !h-7 !w-7 p-0 md:inline-flex"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className={
                    isGalleryToolbarUltraCompact
                      ? "w-[220px] p-2"
                      : isGalleryToolbarCompact
                        ? "w-[200px] p-2"
                        : "w-[160px]"
                  }
                >
                  {isGalleryToolbarUltraCompact && (
                    <>
                      {/* 상태 필터 서브메뉴 */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
                          <span>
                            필터:{" "}
                            {tb.statusFilter === "all"
                              ? "전체"
                              : tb.statusFilter === "pending"
                                ? "대기"
                                : tb.statusFilter === "approved"
                                  ? "통과"
                                  : tb.statusFilter === "rejected"
                                    ? "탈락"
                                    : "휴지통"}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="w-[120px] p-1">
                            {(
                              [
                                "all",
                                "pending",
                                "approved",
                                "rejected",
                                "trashed",
                              ] as const
                            ).map((s) => (
                              <DropdownMenuItem
                                key={s}
                                onClick={() => {
                                  tb.setStatusFilter(s)
                                }}
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
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>

                      {/* 뷰 모드 서브메뉴 */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
                          <span>
                            보기:{" "}
                            {tb.groupMode
                              ? "그룹"
                              : tb.viewMode === "grid"
                                ? "그리드"
                                : "비교"}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="w-[120px] p-1">
                            <DropdownMenuItem
                              onClick={() => {
                                tb.setGroupMode(true)
                              }}
                              className="text-[12px] font-bold"
                            >
                              그룹
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                tb.setGroupMode(false)
                                tb.setViewMode("grid")
                              }}
                              className="text-[12px] font-bold"
                            >
                              그리드
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                tb.setGroupMode(false)
                                tb.setViewMode("compare")
                              }}
                              className="text-[12px] font-bold"
                            >
                              비교
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>

                      {/* 정렬 기준 서브메뉴 */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
                          <span>
                            정렬:{" "}
                            {tb.sortKey === "createdAt"
                              ? "날짜순"
                              : tb.sortKey === "filename"
                                ? "파일명순"
                                : "크기순"}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="w-[120px] p-1">
                            <DropdownMenuItem
                              onClick={() => {
                                toggleSort("createdAt")
                              }}
                              className="text-[12px] font-bold"
                            >
                              날짜순
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                toggleSort("filename")
                              }}
                              className="text-[12px] font-bold"
                            >
                              파일명순
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                toggleSort("sizeBytes")
                              }}
                              className="text-[12px] font-bold"
                            >
                              크기순
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>

                      {/* 정렬 방향 토글 아이템 */}
                      <DropdownMenuItem
                        onClick={() => {
                          toggleSort(tb.sortKey)
                        }}
                        className="mb-1 flex items-center gap-2 border-b border-line/45 pb-2 text-[12px] font-bold"
                      >
                        {tb.sortDir === "asc" ? (
                          <>
                            <ArrowUp className="h-3.5 w-3.5 opacity-60" />
                            <span>정렬 방향: 오름차순</span>
                          </>
                        ) : (
                          <>
                            <ArrowDown className="h-3.5 w-3.5 opacity-60" />
                            <span>정렬 방향: 내림차순</span>
                          </>
                        )}
                      </DropdownMenuItem>
                    </>
                  )}

                  {(isGalleryToolbarCompact ||
                    isGalleryToolbarUltraCompact) && (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          tb.setShowFilters(!tb.showFilters)
                        }}
                        className="flex items-center gap-2 text-[12px] font-bold"
                      >
                        <FilterIcon
                          className={`h-3.5 w-3.5 ${tb.showFilters ? "text-primary" : "opacity-60"}`}
                        />
                        <span>필터 {tb.showFilters ? "숨기기" : "표시"}</span>
                        {tb.hasAnyFilter && (
                          <span className="ml-auto h-2 w-2 rounded-full bg-primary" />
                        )}
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() => void tb.handleExport()}
                        className="flex items-center gap-2 text-[12px] font-bold"
                      >
                        <DownloadIcon className="h-3.5 w-3.5 opacity-60" />
                        <span>갤러리 내보내기</span>
                      </DropdownMenuItem>

                      {props.useWindowMode === true && (
                        <DropdownMenuItem
                          onClick={() => {
                            panel.gallery.setIsFloating(true)
                            props.setActiveTab("jobs")
                          }}
                          className="flex items-center gap-2 text-[12px] font-bold"
                        >
                          <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                          <span>창으로 분리 (Pop out)</span>
                        </DropdownMenuItem>
                      )}

                      {(tb.groupMode || tb.viewMode === "grid") && (
                        <div className="my-1 flex flex-col gap-1.5 border-b border-line/45 px-2.5 py-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <LayoutGrid className="h-3.5 w-3.5" />
                              크기 조절
                            </span>
                            <span className="font-mono text-[10px] text-primary">
                              {tb.thumbnailSize}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="120"
                            max="320"
                            step="10"
                            value={tb.thumbnailSize}
                            onChange={(e) => {
                              tb.setThumbnailSize(Number(e.target.value))
                            }}
                            className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                            onClick={(e) => {
                              e.stopPropagation()
                            }}
                          />
                        </div>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      tb.handleRefresh()
                    }}
                    className="text-[12px] font-bold"
                  >
                    <RefreshCwIcon className="mr-2 h-3.5 w-3.5 opacity-60" />
                    새로고침
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void tb.handleEmptyTrash()}
                    className="text-[12px] font-bold text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash2Icon className="mr-2 h-3.5 w-3.5 opacity-60" />
                    휴지통 비우기
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
            </div>
          )}
          {/* 모바일 갤러리 ... 버튼 (오른쪽 배치) */}
          {props.activeTab === "gallery" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="!h-8 !w-8 p-0 md:hidden"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={
                  isGalleryToolbarUltraCompact
                    ? "w-[220px] p-2"
                    : isGalleryToolbarCompact
                      ? "w-[200px] p-2"
                      : "w-[160px]"
                }
              >
                {isGalleryToolbarUltraCompact && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
                        <span>
                          필터:{" "}
                          {tb.statusFilter === "all"
                            ? "전체"
                            : tb.statusFilter === "pending"
                              ? "대기"
                              : tb.statusFilter === "approved"
                                ? "통과"
                                : tb.statusFilter === "rejected"
                                  ? "탈락"
                                  : "휴지통"}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-[120px] p-1">
                          {(
                            [
                              "all",
                              "pending",
                              "approved",
                              "rejected",
                              "trashed",
                            ] as const
                          ).map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => {
                                tb.setStatusFilter(s)
                              }}
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
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
                        <span>
                          보기:{" "}
                          {tb.groupMode
                            ? "그룹"
                            : tb.viewMode === "grid"
                              ? "그리드"
                              : "비교"}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-[120px] p-1">
                          <DropdownMenuItem
                            onClick={() => {
                              tb.setGroupMode(true)
                            }}
                            className="text-[12px] font-bold"
                          >
                            그룹
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              tb.setGroupMode(false)
                              tb.setViewMode("grid")
                            }}
                            className="text-[12px] font-bold"
                          >
                            그리드
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              tb.setGroupMode(false)
                              tb.setViewMode("compare")
                            }}
                            className="text-[12px] font-bold"
                          >
                            비교
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
                        <span>
                          정렬:{" "}
                          {tb.sortKey === "createdAt"
                            ? "날짜순"
                            : tb.sortKey === "filename"
                              ? "파일명순"
                              : "크기순"}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-[120px] p-1">
                          <DropdownMenuItem
                            onClick={() => {
                              toggleSort("createdAt")
                            }}
                            className="text-[12px] font-bold"
                          >
                            날짜순
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              toggleSort("filename")
                            }}
                            className="text-[12px] font-bold"
                          >
                            파일명순
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              toggleSort("sizeBytes")
                            }}
                            className="text-[12px] font-bold"
                          >
                            크기순
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      onClick={() => {
                        toggleSort(tb.sortKey)
                      }}
                      className="mb-1 flex items-center gap-2 border-b border-line/45 pb-2 text-[12px] font-bold"
                    >
                      {tb.sortDir === "asc" ? (
                        <>
                          <ArrowUp className="h-3.5 w-3.5 opacity-60" />
                          <span>정렬 방향: 오름차순</span>
                        </>
                      ) : (
                        <>
                          <ArrowDown className="h-3.5 w-3.5 opacity-60" />
                          <span>정렬 방향: 내림차순</span>
                        </>
                      )}
                    </DropdownMenuItem>
                  </>
                )}
                {(isGalleryToolbarCompact || isGalleryToolbarUltraCompact) && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        tb.setShowFilters(!tb.showFilters)
                      }}
                      className="flex items-center gap-2 text-[12px] font-bold"
                    >
                      <FilterIcon
                        className={`h-3.5 w-3.5 ${tb.showFilters ? "text-primary" : "opacity-60"}`}
                      />
                      <span>필터 {tb.showFilters ? "숨기기" : "표시"}</span>
                      {tb.hasAnyFilter && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-primary" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void tb.handleExport()}
                      className="flex items-center gap-2 text-[12px] font-bold"
                    >
                      <DownloadIcon className="h-3.5 w-3.5 opacity-60" />
                      <span>갤러리 내보내기</span>
                    </DropdownMenuItem>
                    {props.useWindowMode === true && (
                      <DropdownMenuItem
                        onClick={() => {
                          panel.gallery.setIsFloating(true)
                          props.setActiveTab("jobs")
                        }}
                        className="flex items-center gap-2 text-[12px] font-bold"
                      >
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                        <span>창으로 분리 (Pop out)</span>
                      </DropdownMenuItem>
                    )}
                    {(tb.groupMode || tb.viewMode === "grid") && (
                      <div className="my-1 flex flex-col gap-1.5 border-b border-line/45 px-2.5 py-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <LayoutGrid className="h-3.5 w-3.5" />
                            크기 조절
                          </span>
                          <span className="font-mono text-[10px] text-primary">
                            {tb.thumbnailSize}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min="120"
                          max="320"
                          step="10"
                          value={tb.thumbnailSize}
                          onChange={(e) => {
                            tb.setThumbnailSize(Number(e.target.value))
                          }}
                          className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                          onClick={(e) => {
                            e.stopPropagation()
                          }}
                        />
                      </div>
                    )}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    tb.handleRefresh()
                  }}
                  className="text-[12px] font-bold"
                >
                  <RefreshCwIcon className="mr-2 h-3.5 w-3.5 opacity-60" />
                  새로고침
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void tb.handleEmptyTrash()}
                  className="text-[12px] font-bold text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2Icon className="mr-2 h-3.5 w-3.5 opacity-60" />
                  휴지통 비우기
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* 모바일 구분선 */}
          {props.activeTab === "gallery" && (
            <div className="h-4 w-px bg-border/60 md:hidden" />
          )}
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
