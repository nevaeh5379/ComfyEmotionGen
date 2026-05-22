import { useState, useRef, useEffect } from "react"
import {
  ArrowDown,
  ArrowUp,
  Menu,
  XIcon,
  FilterIcon,
  MoreVertical,
  RefreshCwIcon,
  DownloadIcon,
  Trash2Icon,
  Sun,
  Moon,
  Monitor,
  LayoutGrid,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CompositionTabsList } from "../CompositionTabsList"
import { WorkCompositionToolbar } from "../WorkCompositionToolbar"
import { ServerStatus, WorkerStatus } from "../StatusIndicators"
import type { WorkerView, CurationStatus } from "../../types/Message"
import {
  SessionPopover,
  type SessionMarker,
  type ActiveStateInfo,
} from "../JobManagerSections"
import { TagInputSearch } from "../TagInputSearch"
import {
  CURRENT_TEMPLATE_ID,
  FREE_GROUP_LABELS,
  encodeAxis,
  type FreeGroupBy,
} from "../combinationpicker/freeCurationGroupers"
import { NAV_TABS, type TabId } from "./nav-tabs"

interface HeaderProps {
  activeTab: TabId
  setActiveTab: (t: TabId) => void
  isAliveBackend: boolean
  backendAlive: boolean
  workers: WorkerView[]
  jobsCount: number
  mobileJobTab: "editor" | "status" | "list"
  setMobileJobTab: (v: "editor" | "status" | "list") => void
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (v: "ceg" | "workflow") => void

  // Job specific
  repeatCount: number
  setRepeatCount: (v: number | ((c: number) => number)) => void
  handleRun: () => void
  handleRandomRun: (count: number) => void
  randomRunCount: number
  setRandomRunCount: (v: number | ((c: number) => number)) => void
  canRun: boolean
  estimatedRunCount: number | null
  setIsSelectionOpen: (v: boolean) => void
  hasActiveFilter: boolean
  setIsAxisFilterOpen: (v: boolean) => void
  setIsGraphOpen: (v: boolean) => void

  // Gallery specific
  galleryStatusFilter: CurationStatus | "all"
  setGalleryStatusFilter: (v: CurationStatus | "all") => void
  galleryViewMode: "grid" | "compare"
  setGalleryViewMode: (v: "grid" | "compare") => void
  galleryGroupMode: boolean
  setGalleryGroupMode: (v: boolean) => void
  galleryShowFilters: boolean
  setGalleryShowFilters: (v: boolean) => void
  galleryHasAnyFilter: boolean
  gallerySearchTags: string[]
  setGallerySearchTags: (tags: string[]) => void
  gallerySearchInput: string
  setGallerySearchInput: (v: string) => void
  galleryCandidates: { value: string; type: "filename" | "tag" | "metadata" }[]
  galleryHideRejected: boolean
  setGalleryHideRejected: (v: boolean) => void
  gallerySortKey: "createdAt" | "filename" | "sizeBytes"
  setGallerySortKey: (k: "createdAt" | "filename" | "sizeBytes") => void
  gallerySortDir: "asc" | "desc"
  setGallerySortDir: (d: "asc" | "desc") => void
  setGalleryDuplicateStrategy: (v: "hash" | "number") => void
  galleryThumbnailSize: number
  setGalleryThumbnailSize: (v: number) => void


  // Gallery action callbacks
  onGalleryExport?: () => void
  onGalleryRefresh?: () => void
  onGalleryEmptyTrash?: () => void

  // Curation specific
  curationSelectedAxis: string
  setCurationSelectedAxis: (v: string) => void
  savedTemplates: { id: string; name: string }[]

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
}

export function Header(props: HeaderProps) {
  const { theme, setTheme } = useTheme()

  const [isCompact, setIsCompact] = useState(false)

  const headerRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLSpanElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  
  const galleryToolbarRef = useRef<HTMLDivElement>(null)
  const curationToolbarRef = useRef<HTMLDivElement>(null)
  const rightSectionRef = useRef<HTMLDivElement>(null)
  
  const cachedTabsWidthRef = useRef<number>(480)

  useEffect(() => {
    if (!headerRef.current) return

    const getElWidth = (el: HTMLElement | null) => {
      if (!el) return 0
      return Math.max(el.scrollWidth, el.getBoundingClientRect().width)
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const currentWidth = entry.contentRect.width

        const logoWidth = getElWidth(logoRef.current)
        
        let toolbarWidth = 0
        if (rightSectionRef.current) {
          toolbarWidth += getElWidth(rightSectionRef.current)
        }
        if (props.activeTab === "gallery" && galleryToolbarRef.current) {
          toolbarWidth += getElWidth(galleryToolbarRef.current)
        } else if (props.activeTab === "curation" && curationToolbarRef.current) {
          toolbarWidth += getElWidth(curationToolbarRef.current)
        }

        if (tabsRef.current) {
          const actualTabsWidth = getElWidth(tabsRef.current)
          if (actualTabsWidth > 0) {
            cachedTabsWidthRef.current = actualTabsWidth
          }
        }

        // 로고 + 가로탭 + 활성화된 우측 툴바들 + 안전 마진(64px)
        const requiredWidth = logoWidth + cachedTabsWidthRef.current + toolbarWidth + 64
        setIsCompact(currentWidth < requiredWidth)
      }
    })

    observer.observe(headerRef.current)
    return () => observer.disconnect()
  }, [props.activeTab])

  const toggleSort = (
    key: "createdAt" | "filename" | "sizeBytes"
  ) => {
    if (props.gallerySortKey === key) {
      props.setGallerySortDir(props.gallerySortDir === "asc" ? "desc" : "asc")
    } else {
      props.setGallerySortKey(key)
      props.setGallerySortDir("asc")
    }
  }

  return (
    <nav ref={headerRef} className="sticky top-0 z-50 shrink-0 border-b border-line bg-panel/95 backdrop-blur supports-backdrop-filter:bg-panel/80">
      <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-2.5">
        <div className="flex flex-1 items-center overflow-hidden md:gap-4">
          {/* Mobile hamburger (left side) */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden">
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
                            if (tab.id === "jobs")
                              props.setMobileJobTab("editor")
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
                              label: `기록 (${props.jobsCount})`,
                            },
                          ].map((sub) => (
                            <SheetClose asChild key={sub.id}>
                              <button
                                className={`flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold transition-all ${
                                  props.mobileJobTab === sub.id
                                    ? "bg-accent/80 text-accent-foreground"
                                    : "text-muted-foreground/70 hover:text-foreground"
                                }`}
                                onClick={() => {
                                  props.setActiveTab("jobs")
                                  props.setMobileJobTab(sub.id)
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
          <span ref={logoRef} className="shrink-0 bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-[14px] font-black tracking-tighter text-transparent md:text-[15px]">
            <span className="hidden md:inline">ComfyEmotionGen</span>
          </span>
          <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
          {/* Desktop tabs */}
          {isCompact ? (
            <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2 rounded-full border-line bg-background px-4 text-[13px] font-black shadow-xs hover:bg-accent/50"
                  >
                    {(() => {
                      const activeTabInfo = NAV_TABS.find((t) => t.id === props.activeTab)
                      const ActiveIcon = activeTabInfo?.icon
                      return (
                        <>
                          {ActiveIcon && <ActiveIcon className="h-4 w-4 opacity-100" />}
                          <span>{activeTabInfo?.label}</span>
                        </>
                      )
                    })()}
                    <ChevronDown className="h-3.5 w-3.5 opacity-55" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[150px] p-1.5">
                  {NAV_TABS.map((tab) => {
                    const TabIcon = tab.icon
                    const isActive = props.activeTab === tab.id
                    return (
                      <DropdownMenuItem
                        key={tab.id}
                        onClick={() => props.setActiveTab(tab.id)}
                        className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-bold ${
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }`}
                      >
                        <TabIcon className={`h-3.5 w-3.5 ${isActive ? "opacity-100" : "opacity-60"}`} />
                        <span>{tab.label}</span>
                        {isActive && (
                          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-foreground" />
                        )}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div
              ref={tabsRef}
              className="no-scrollbar hidden items-center gap-1 overflow-x-auto px-1 pb-1 md:flex"
              role="tablist"
              aria-label="메인 탭 네비게이션"
            >
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <Button
                    key={tab.id}
                    variant="ghost"
                    size="sm"
                    role="tab"
                    aria-selected={props.activeTab === tab.id}
                    aria-label={tab.label}
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
          )}
          {/* Mobile composition tabs (jobs editor only) */}
          {props.activeTab === "jobs" && props.mobileJobTab === "editor" && (
            <div className="no-scrollbar flex flex-1 items-center justify-between gap-2 overflow-x-auto md:hidden">
              <Tabs
                value={props.compositionTab}
                onValueChange={(v) =>
                  props.setCompositionTab(v as "ceg" | "workflow")
                }
              >
                <CompositionTabsList />
              </Tabs>
              <WorkCompositionToolbar
                repeatCount={props.repeatCount}
                setRepeatCount={props.setRepeatCount}
                handleRun={props.handleRun}
                handleRandomRun={props.handleRandomRun}
                randomRunCount={props.randomRunCount}
                setRandomRunCount={props.setRandomRunCount}
                canRun={props.canRun}
                estimatedRunCount={props.estimatedRunCount}
                onSelectionOpen={() => props.setIsSelectionOpen(true)}
                hasActiveFilter={props.hasActiveFilter}
                onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
                onGraphOpen={() => props.setIsGraphOpen(true)}
              />
            </div>
          )}
          {/* Mobile Session/Pause/Actions toolbar (jobs status or list only) */}
          {props.activeTab === "jobs" &&
            (props.mobileJobTab === "status" ||
              props.mobileJobTab === "list") &&
            props.sessionMarkers && (
              <div className="flex flex-1 items-center justify-end gap-1.5 md:hidden">
                <div className="relative">
                  <SessionPopover
                    markers={props.sessionMarkers}
                    sessionJobCounts={props.sessionJobCounts || new Map()}
                    sortedMarkers={props.sortedMarkers || []}
                    selectedId={props.selectedSessionId || ""}
                    activeState={props.activeSessionState || null}
                    isOpen={props.sessionPickerOpen || false}
                    onOpenChange={props.onSessionPickerOpenChange || (() => {})}
                    onSelectSession={props.onSelectSession || (() => {})}
                    onCreateNew={props.onCreateNewSession || (() => {})}
                  />
                </div>
                <Button
                  size="sm"
                  variant={props.paused ? "default" : "outline"}
                  className="h-8 px-2 text-[10px] font-bold"
                  onClick={props.onTogglePause}
                  disabled={!props.isAliveBackend}
                >
                  {props.paused ? "재개" : "일시중지"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-2">
                    <DropdownMenuItem
                      onClick={props.onCancelAll}
                      disabled={
                        !props.isAliveBackend ||
                        (props.activeJobsCount ?? 0) === 0
                      }
                      className="py-3 font-bold text-destructive"
                    >
                      진행 중인 모든 작업 취소
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={props.onRetryAllFailed}
                      className="py-3 font-bold"
                    >
                      실패/취소된 모든 작업 재시도
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={props.onDeleteAllFailed}
                      className="py-3 font-bold text-destructive"
                    >
                      실패/취소된 모든 작업 삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          {/* Gallery toolbar (merged into nav) */}
          {props.activeTab === "gallery" && (
            <div ref={galleryToolbarRef} className="flex items-center gap-1.5">
              <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
              <Select
                value={props.galleryStatusFilter}
                onValueChange={(v: string) => {
                  props.setGalleryStatusFilter(v as CurationStatus | "all")
                }}
              >
                <SelectTrigger className="!h-7 w-[82px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
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
                value={props.galleryGroupMode ? "group" : props.galleryViewMode}
                onValueChange={(v) => {
                  if (v === "group") {
                    props.setGalleryGroupMode(true)
                  } else {
                    props.setGalleryGroupMode(false)
                    props.setGalleryViewMode(v as "grid" | "compare")
                  }
                }}
              >
                <SelectTrigger className="!h-7 w-[78px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
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
                value={props.gallerySortKey}
                onValueChange={(k) =>
                  toggleSort(k as "createdAt" | "filename" | "sizeBytes")
                }
              >
                <SelectTrigger className="!h-7 w-[74px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt" className="text-[12px] font-bold">
                    날짜순
                  </SelectItem>
                  <SelectItem value="filename" className="text-[12px] font-bold">
                    파일명순
                  </SelectItem>
                  <SelectItem value="sizeBytes" className="text-[12px] font-bold">
                    크기순
                  </SelectItem>
                </SelectContent>
              </Select>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toggleSort(props.gallerySortKey)
                    }
                    className="!h-7 !w-7 shrink-0 border-line bg-background p-0 shadow-none hover:bg-muted"
                  >
                    {props.gallerySortDir === "asc" ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>정렬 방향</TooltipContent>
              </Tooltip>

              {(props.galleryGroupMode || props.galleryViewMode === "grid") && (
                <div className="hidden items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-2 py-1 md:flex shadow-xs h-7">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center text-muted-foreground">
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-bold">크기 조절</TooltipContent>
                  </Tooltip>
                  <input
                    type="range"
                    min="120"
                    max="320"
                    step="10"
                    value={props.galleryThumbnailSize}
                    onChange={(e) => props.setGalleryThumbnailSize(Number(e.target.value))}
                    className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                  />
                  <span className="text-[9px] font-mono font-bold text-muted-foreground w-6 text-right tabular-nums">
                    {props.galleryThumbnailSize}px
                  </span>
                </div>
              )}

              <Tooltip>

                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={props.galleryShowFilters ? "secondary" : "outline"}
                    onClick={() =>
                      props.setGalleryShowFilters(!props.galleryShowFilters)
                    }
                    className="relative !h-7 !w-7 p-0"
                  >
                    <FilterIcon className="h-3.5 w-3.5" />
                    {props.galleryHasAnyFilter && (
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
                    className="!h-7 !w-7 p-0"
                    onClick={() => props.onGalleryExport?.()}
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>갤러리 내보내기</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="!h-7 !w-7 p-0">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[160px]">
                  <DropdownMenuItem onClick={() => props.onGalleryRefresh?.()}>
                    <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
                    새로고침
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => props.onGalleryEmptyTrash?.()}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash2Icon className="mr-2 h-3.5 w-3.5" />
                    휴지통 비우기
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {/* Curation toolbar (merged into nav) */}
          {props.activeTab === "curation" && (
            <div ref={curationToolbarRef} className="flex items-center gap-1.5">
              <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
              {/* Classification axis selector (template + free axes unified) */}
              <Select
                value={props.curationSelectedAxis}
                onValueChange={(v) => props.setCurationSelectedAxis(v)}
              >
                <SelectTrigger className="!h-7 w-[150px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-muted-foreground">
                      템플릿
                    </SelectLabel>
                    <SelectItem
                      value={encodeAxis({
                        kind: "template",
                        templateId: CURRENT_TEMPLATE_ID,
                      })}
                      className="text-[12px] font-bold"
                    >
                      현재 편집 중인 템플릿
                    </SelectItem>
                    {props.savedTemplates.map((t) => (
                      <SelectItem
                        key={t.id}
                        value={encodeAxis({
                          kind: "template",
                          templateId: t.id,
                        })}
                        className="text-[12px] font-bold"
                      >
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-muted-foreground">
                      기타 분류
                    </SelectLabel>
                    {(Object.keys(FREE_GROUP_LABELS) as FreeGroupBy[]).map(
                      (mode) => (
                        <SelectItem
                          key={mode}
                          value={encodeAxis({ kind: "free", mode })}
                          className="text-[12px] font-bold"
                        >
                          {FREE_GROUP_LABELS[mode]}
                        </SelectItem>
                      )
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div ref={rightSectionRef} className="ml-1 hidden shrink-0 items-center gap-2 md:flex">
          {props.activeTab === "jobs" && props.sessionMarkers && (
            <div className="mr-1 flex items-center gap-1.5 border-r border-line/65 pr-3">
              <div className="relative">
                <SessionPopover
                  markers={props.sessionMarkers}
                  sessionJobCounts={props.sessionJobCounts || new Map()}
                  sortedMarkers={props.sortedMarkers || []}
                  selectedId={props.selectedSessionId || ""}
                  activeState={props.activeSessionState || null}
                  isOpen={props.sessionPickerOpen || false}
                  onOpenChange={props.onSessionPickerOpenChange || (() => {})}
                  onSelectSession={props.onSelectSession || (() => {})}
                  onCreateNew={props.onCreateNewSession || (() => {})}
                />
              </div>
              <Button
                size="sm"
                variant={props.paused ? "default" : "outline"}
                className="h-8 px-3 text-[11px] font-bold"
                onClick={props.onTogglePause}
                disabled={!props.isAliveBackend}
              >
                {props.paused ? "재개" : "일시중지"}
              </Button>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>추가 작업</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-56 p-2">
                  <DropdownMenuItem
                    onClick={props.onCancelAll}
                    disabled={
                      !props.isAliveBackend ||
                      (props.activeJobsCount ?? 0) === 0
                    }
                    className="py-3 font-bold text-destructive"
                  >
                    진행 중인 모든 작업 취소
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={props.onRetryAllFailed}
                    className="py-3 font-bold"
                  >
                    실패/취소된 모든 작업 재시도
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={props.onDeleteAllFailed}
                    className="py-3 font-bold text-destructive"
                  >
                    실패/취소된 모든 작업 삭제
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                    >
                      {theme === "light" ? (
                        <Sun className="h-4 w-4" />
                      ) : theme === "dark" ? (
                        <Moon className="h-4 w-4" />
                      ) : (
                        <Monitor className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>테마 설정</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setTheme("light")}
                  className="gap-2"
                >
                  <Sun className="h-4 w-4" />
                  라이트
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme("dark")}
                  className="gap-2"
                >
                  <Moon className="h-4 w-4" />
                  다크
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme("system")}
                  className="gap-2"
                >
                  <Monitor className="h-4 w-4" />
                  시스템
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
      {props.activeTab === "gallery" && props.galleryShowFilters && (
        <div className="border-t border-line/60 bg-panel/80 px-3 py-2 md:px-4 md:py-2.5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
              <span className="shrink-0 text-[11px] font-bold text-muted-foreground uppercase">
                검색
              </span>
              <div className="max-w-lg flex-1">
                <TagInputSearch
                  value={props.gallerySearchInput}
                  tags={props.gallerySearchTags}
                  candidates={props.galleryCandidates.filter((c) => {
                    const valClean = props.gallerySearchInput
                      .replace(/^[@#$]/, "")
                      .toLowerCase()
                    return c.value.toLowerCase().includes(valClean)
                  })}
                  placeholder="검색어 입력 (@파일명, #태그, $메타데이터)"
                  onValueChange={props.setGallerySearchInput}
                  onAddTag={(tag) => {
                    if (!props.gallerySearchTags.includes(tag)) {
                      props.setGallerySearchTags([
                        ...props.gallerySearchTags,
                        tag,
                      ])
                    }
                    props.setGallerySearchInput("")
                  }}
                  onRemoveTag={(tag) => {
                    props.setGallerySearchTags(
                      props.gallerySearchTags.filter((t) => t !== tag)
                    )
                  }}
                  size="sm"
                />
              </div>
            </div>

            <div className="hidden h-4 w-px shrink-0 bg-line md:block" />

            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line/40 pt-2 md:border-0 md:pt-0">
              <div className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  id="gallery-hide-rejected"
                  checked={props.galleryHideRejected}
                  onCheckedChange={(v) =>
                    props.setGalleryHideRejected(v === true)
                  }
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
                  props.setGallerySearchTags([])
                  props.setGallerySearchInput("")
                  props.setGalleryHideRejected(false)
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
  )
}
