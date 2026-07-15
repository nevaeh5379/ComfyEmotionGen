import { useRef, useState, useLayoutEffect, useCallback } from "react"
import {
  FolderIcon,
  LayoutGridIcon,
  Maximize2Icon,
  FilterIcon,
  Settings2Icon,
  RefreshCwIcon,
  AlertTriangleIcon,
  DownloadIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { LoadingButton } from "./CombinationPickerComponents"
import { useCurationContext } from "./CurationContext"
import { hasApproved } from "../../types/Message"
import { TagInputSearch } from "../TagInputSearch"
import { useCurationToolbar } from "./useCurationToolbar"
import {
  CURRENT_TEMPLATE_ID,
  FREE_GROUP_LABELS,
  encodeAxis,
  type FreeGroupBy,
} from "./freeCurationGroupers"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

interface ToolbarProps {
  selectedAxis: string
  setSelectedAxis: (axis: string) => void
  hideTopSection?: boolean
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedFilename: string | null
  compareImageCount: number

  filtersExpanded: boolean
  setFiltersExpanded: (v: boolean) => void

  hideRejected: boolean
  setHideRejected: (v: boolean) => void
  autoAdvance: boolean
  setAutoAdvance: (v: boolean) => void
  duplicateStrategy: "hash" | "number"
  setDuplicateStrategy: (v: "hash" | "number") => void

  unassignedGroupsSize: number
  unassignedTotalCount: number
  showUnassignedPanel: boolean
  setShowUnassignedPanel: (v: boolean) => void

  handleBulkRegenerate: () => void
  handleRegeneratePending: () => void
  pendingRegenerateCount: number
  pendingRegenerateDisabled: boolean
  bulkRegenActionMessage: string | null

  heldFilenames: string[]
  handleRegenerateHeld: () => void
  handleRegenerateEmpty: () => void
  heldRegenerateCount: number
  emptyRegenerateCount: number

  handleBulkDownload: () => void
  bulkDownloadIsLoading: boolean
  bulkDownloadMessage: string | null

  handleExport: () => void
  exportActionIsLoading: boolean
  exportActionMessage: string | null
  regenActionMessage: string | null
}

export function CombinationPickerToolbar({
  selectedAxis,
  setSelectedAxis,
  viewMode,
  onViewModeChange,
  selectedFilename,
  compareImageCount,
  hideTopSection,
  filtersExpanded,
  setFiltersExpanded,
  hideRejected,
  setHideRejected,
  autoAdvance,
  setAutoAdvance,
  duplicateStrategy,
  setDuplicateStrategy,
  unassignedGroupsSize,
  unassignedTotalCount,
  showUnassignedPanel,
  setShowUnassignedPanel,
  handleBulkRegenerate,
  handleRegeneratePending,
  pendingRegenerateCount,
  pendingRegenerateDisabled,
  bulkRegenActionMessage,
  heldFilenames,
  handleRegenerateHeld,
  handleRegenerateEmpty,
  heldRegenerateCount,
  emptyRegenerateCount,
  handleBulkDownload,
  bulkDownloadIsLoading,
  bulkDownloadMessage,
  handleExport,
  exportActionIsLoading,
  exportActionMessage,
  regenActionMessage,
}: ToolbarProps): React.JSX.Element {
  const { savedTemplates, data, selection, thumbnailSize, setThumbnailSize } =
    useCurationContext()
  const {
    renderItems,
    rawRenderItems,
    doneCount,
    statusFilter,
    setStatusFilter,
    searchTags,
    setSearchTags,
    searchInput,
    setSearchInput,
    candidates,
    filteredRenderItems,
    fetchData,
    loading,
    activeCurationFilters,
    setActiveCurationFilters,
    savedGroups,
    activeGroupId,
    availableFilters,
    saveCurationGroup,
    deleteCurationGroup,
    imagesByFilename,
  } = data

  const { selectionMode, selectedFilenames, exitSelectionMode } = selection

  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = useState(0)
  const { listLayout, setListLayout, gridSubMode, setGridSubMode } =
    useCurationToolbar()
  const [isMobile, setIsMobile] = useState(false)

  useLayoutEffect(() => {
    const handleResize = (): void => {
      setIsMobile(window.innerWidth < 768)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return (): void => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    const update = (): void => {
      setToolbarHeight(el.offsetHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return (): void => {
      ro.disconnect()
    }
  }, [])

  // 필터 변경 시 자동 확장 헬퍼
  const withExpand = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
      setter(value)
      setFiltersExpanded(true)
    },
    [setFiltersExpanded]
  )

  return (
    <div
      ref={toolbarRef}
      className="sticky z-40 shrink-0 border-t border-line bg-panel shadow-sm"
      style={
        {
          "--toolbar-height": `${String(toolbarHeight)}px`,
        } as React.CSSProperties
      }
    >
      {/* 메인 툴바: 모바일에서는 헤더로 이동했으므로 숨김 */}
      <div className="hidden flex-wrap items-center gap-2 border-b bg-muted/5 px-4 py-2 md:flex md:gap-3">
        {/* 분류 축 선택 (hideTopSection일 때 숨김) */}
        {hideTopSection !== true && (
          <>
            <Select value={selectedAxis} onValueChange={setSelectedAxis}>
              <SelectTrigger className="h-8 w-full border-0 bg-transparent text-[12px] font-bold shadow-none focus:ring-0 sm:w-56 sm:text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-[10px] text-muted-foreground">
                    분류 기준
                  </SelectLabel>
                  <SelectItem
                    value={encodeAxis({
                      kind: "template",
                      templateId: CURRENT_TEMPLATE_ID,
                    })}
                  >
                    현재 템플릿 축 조합
                  </SelectItem>
                  {savedTemplates.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={encodeAxis({
                        kind: "template",
                        templateId: t.id,
                      })}
                    >
                      {t.name} (축 조합)
                    </SelectItem>
                  ))}
                  {(Object.keys(FREE_GROUP_LABELS) as FreeGroupBy[]).map(
                    (mode) => {
                      let label = FREE_GROUP_LABELS[mode];
                      if (mode === "filename") label = "파일명 기준";
                      if (mode === "parsedFilename") label = "파일명 패턴 파싱";
                      if (mode === "tags") label = "태그별 분류";
                      if (mode === "savedTemplate") label = "템플릿 해시별";
                      return (
                        <SelectItem
                          key={mode}
                          value={encodeAxis({ kind: "free", mode })}
                        >
                          {label}
                        </SelectItem>
                      );
                    }
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>

            <div className="hidden h-5 w-px bg-border/60 sm:block" />
          </>
        )}

        {/* 뷰 모드 탭 (모바일: 드롭다운, 데스크톱: 탭) */}
        {/* Main Mode Tabs: 목록 / 그리드 */}
        <Tabs
          value={
            viewMode === "gallery" || viewMode === "table" ? "list" : "grid"
          }
          onValueChange={(v) => {
            if (v === "list") {
              onViewModeChange(listLayout)
            } else {
              onViewModeChange(gridSubMode)
            }
          }}
          className="w-full sm:w-auto"
        >
          <TabsList className="h-8 gap-0.5 bg-muted/65 p-0.5">
            <TabsTrigger
              value="list"
              className="gap-1.5 px-3.5 py-1 text-xs font-bold data-[state=active]:bg-background"
            >
              <FolderIcon className="h-3.5 w-3.5" />
              <span>목록</span>
            </TabsTrigger>
            <TabsTrigger
              value="grid"
              disabled={selectedFilename === null}
              className="gap-1.5 px-3.5 py-1 text-xs font-bold data-[state=active]:bg-background"
            >
              <Maximize2Icon className="h-3.5 w-3.5" />
              <span>그리드</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Sub Mode Selectors (toggled contextually) */}
        {viewMode === "gallery" || viewMode === "table" ? (
          <div className="flex h-8 items-center gap-1 rounded-lg border border-border/80 bg-background/50 p-0.5">
            <Button
              variant={listLayout === "gallery" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-[11px] font-bold shadow-xs"
              onClick={() => {
                setListLayout("gallery")
                onViewModeChange("gallery")
              }}
            >
              갤러리 보기
            </Button>
            <Button
              variant={listLayout === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-[11px] font-bold shadow-xs"
              onClick={() => {
                setListLayout("table")
                onViewModeChange("table")
              }}
            >
              테이블 보기
            </Button>
          </div>
        ) : (
          <div className="flex h-8 items-center gap-1 rounded-lg border border-border/80 bg-background/50 p-0.5">
            <Button
              variant={gridSubMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-[11px] font-bold shadow-xs"
              onClick={() => {
                setGridSubMode("grid")
                onViewModeChange("grid")
              }}
            >
              그리드
            </Button>
            <Button
              variant={gridSubMode === "compare" ? "secondary" : "ghost"}
              size="sm"
              disabled={compareImageCount < 2}
              className="h-7 px-2.5 text-[11px] font-bold shadow-xs"
              onClick={() => {
                setGridSubMode("compare")
                onViewModeChange("compare")
              }}
            >
              비교
            </Button>
            <Button
              variant={gridSubMode === "tournament" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-[11px] font-bold shadow-xs"
              onClick={() => {
                setGridSubMode("tournament")
                onViewModeChange("tournament")
              }}
            >
              토너먼트
            </Button>
          </div>
        )}

        <div className="hidden h-5 w-px bg-border/60 md:block" />

        {/* 진행률 (모바일에서는 바 숨기고 %만) */}
        {((): React.JSX.Element => {
          const total = rawRenderItems.length
          const done = doneCount
          const held = rawRenderItems.filter(
            (ri) => heldFilenames.includes(ri.filename) && !hasApproved(imagesByFilename.get(ri.filename) ?? [])
          ).length
          const empty = rawRenderItems.filter(
            (ri) => (imagesByFilename.get(ri.filename) ?? []).length === 0
          ).length

          const donePercent = total > 0 ? (done / total) * 100 : 0
          const heldPercent = total > 0 ? (held / total) * 100 : 0
          const emptyPercent = total > 0 ? (empty / total) * 100 : 0

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-1 cursor-help items-center justify-end gap-2 md:justify-start md:gap-3">
                  <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-muted shadow-inner md:flex md:flex-1">
                    <div style={{ width: `${String(donePercent)}%` }} className="h-full bg-green-500 transition-all duration-300" />
                    <div style={{ width: `${String(heldPercent)}%` }} className="h-full bg-yellow-500 transition-all duration-300" />
                    <div style={{ width: `${String(emptyPercent)}%` }} className="h-full bg-zinc-400 dark:bg-zinc-500 transition-all duration-300" />
                  </div>
                  <span className="shrink-0 text-[11px] font-black text-foreground/70 tabular-nums">
                    {Math.round(donePercent)}%
                    <span className="xs:inline ml-1.5 hidden opacity-50">
                      (완료 {done} · 남음 {total - done} · 보류 {held} · 빈 폴더 {empty})
                    </span>
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="p-3 text-xs font-bold leading-relaxed">
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 border-b pb-1">진행 현황 상세</div>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" /> 완료: {done}개 ({Math.round(donePercent)}%)</div>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /> 남음: {total - done}개 ({Math.round((100 - donePercent))}%)</div>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-yellow-500" /> 보류: {held}개 ({Math.round(heldPercent)}%)</div>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-zinc-400" /> 빈 폴더: {empty}개 ({Math.round(emptyPercent)}%)</div>
                  <div className="flex items-center gap-2 border-t pt-1 mt-1 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-muted border" /> 전체 조합: {total}개</div>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })()}

        <div className="xs:block hidden h-5 w-px bg-border/60" />

        {/* 액션 및 설정 그룹 */}
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {/* 썸네일 크기 슬라이더 (갤러리, 그리드, 토너먼트 뷰 지원) */}
          {(viewMode === "gallery" ||
            viewMode === "grid" ||
            viewMode === "tournament") && (
            <div className="hidden h-8 items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-2 py-1 shadow-xs md:flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center text-muted-foreground">
                    <LayoutGridIcon className="h-3.5 w-3.5" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">
                  크기 조절
                </TooltipContent>
              </Tooltip>
              <input
                type="range"
                min="120"
                max="600"
                step="10"
                value={thumbnailSize}
                onChange={(e) => {
                  setThumbnailSize(Number(e.target.value))
                }}
                className="h-1 w-20 cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
              />
              <span className="w-[34px] text-right font-mono text-[10px] font-bold whitespace-nowrap text-muted-foreground tabular-nums">
                {thumbnailSize}px
              </span>
            </div>
          )}

          {/* 필터 토글 */}
          {isMobile ? (
            <Button
              variant={
                filtersExpanded ||
                statusFilter !== "all" ||
                searchTags.length > 0
                  ? "secondary"
                  : "outline"
              }
              size="sm"
              className={`h-9 shrink-0 gap-1.5 px-3 text-[11px] font-bold shadow-xs transition-all md:h-8 ${(statusFilter !== "all" || searchTags.length > 0) && !filtersExpanded ? "ring-2 ring-primary/20" : ""}`}
              onClick={() => {
                setFiltersExpanded(true)
              }}
            >
              <FilterIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
              <span className="hidden sm:inline">필터</span>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={
                    filtersExpanded ||
                    statusFilter !== "all" ||
                    searchTags.length > 0
                      ? "secondary"
                      : "outline"
                  }
                  size="sm"
                  className={`h-9 shrink-0 gap-1.5 px-3 text-[11px] font-bold shadow-xs transition-all md:h-8 ${(statusFilter !== "all" || searchTags.length > 0) && !filtersExpanded ? "ring-2 ring-primary/20" : ""}`}
                  onClick={() => {
                    setFiltersExpanded(!filtersExpanded)
                  }}
                >
                  <FilterIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  <span className="hidden sm:inline">필터</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>필터 토글</TooltipContent>
            </Tooltip>
          )}

          {/* 일괄 재생성 버튼 (드롭다운 적용) */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingRegenerateDisabled}
                    className="h-9 shrink-0 gap-1.5 px-3 text-[11px] font-bold md:h-8"
                  >
                    <RefreshCwIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
                    <span className="hidden lg:inline">일괄 재생성</span>
                    <span className="font-mono tabular-nums">
                      {pendingRegenerateCount}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent className="text-xs font-bold">
                선택적 일괄 재생성 옵션
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                재생성 범위 선택
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleRegeneratePending}
                disabled={pendingRegenerateCount === 0}
                className="text-xs font-medium"
              >
                <RefreshCwIcon className="mr-2 h-3.5 w-3.5 text-blue-500" />
                미완료 조합 재생성 ({pendingRegenerateCount})
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleRegenerateHeld}
                disabled={heldRegenerateCount === 0}
                className="text-xs font-medium"
              >
                <RefreshCwIcon className="mr-2 h-3.5 w-3.5 text-yellow-500" />
                보류 조합 재생성 ({heldRegenerateCount})
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleRegenerateEmpty}
                disabled={emptyRegenerateCount === 0}
                className="text-xs font-medium"
              >
                <RefreshCwIcon className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                빈 폴더 조합 재생성 ({emptyRegenerateCount})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 새로고침 버튼 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void fetchData()
                }}
                disabled={loading}
                className="h-9 w-9 shrink-0 p-0 md:h-8 md:w-8"
              >
                <RefreshCwIcon
                  className={cn(
                    "h-4 w-4 md:h-3.5 md:w-3.5",
                    loading && "animate-spin"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs font-bold">
              새로고침
            </TooltipContent>
          </Tooltip>

          {/* 설정 드롭다운 */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-9 text-[10px] font-bold md:h-8 md:w-auto md:gap-1 md:px-2.5"
                  >
                    <Settings2Icon className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>설정 열기</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">설정</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void fetchData()
                }}
                className="py-2.5 md:py-1.5"
              >
                <RefreshCwIcon className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" />
                새로고침
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={hideRejected}
                onCheckedChange={(v) => {
                  setHideRejected(v)
                }}
                className="py-2.5 md:py-1.5"
              >
                리젝 숨기기
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={autoAdvance}
                onCheckedChange={(v) => {
                  setAutoAdvance(v)
                }}
                className="py-2.5 md:py-1.5"
              >
                자동 다음 이동
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {/* 중복 전략 */}
              <DropdownMenuLabel className="text-xs">
                중복 전략
              </DropdownMenuLabel>
              <DropdownMenuItem
                className={cn(
                  "py-2.5 md:py-1.5",
                  duplicateStrategy === "hash" ? "bg-accent" : ""
                )}
                onClick={() => {
                  setDuplicateStrategy("hash")
                }}
              >
                HASH
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "py-2.5 md:py-1.5",
                  duplicateStrategy === "number" ? "bg-accent" : ""
                )}
                onClick={() => {
                  setDuplicateStrategy("number")
                }}
              >
                NUM
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {unassignedGroupsSize > 0 && (
                <DropdownMenuItem
                  onClick={() => {
                    setShowUnassignedPanel(!showUnassignedPanel)
                  }}
                  className="py-2.5 md:py-1.5"
                >
                  <AlertTriangleIcon className="mr-2 h-4 w-4 text-amber-600 md:h-3.5 md:w-3.5" />
                  미할당: {unassignedGroupsSize}파일 ({unassignedTotalCount}장)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* EXPORT 버튼 */}
          <LoadingButton
            size="sm"
            className="h-9 px-3 text-[11px] font-black md:h-8 md:px-2.5"
            onClick={handleExport}
            isLoading={exportActionIsLoading}
            disabled={doneCount === 0}
            icon={DownloadIcon}
          >
            <span className="ml-1 hidden text-xs sm:inline">내보내기</span>
          </LoadingButton>
        </div>
      </div>

      {/* 선택 모드 (인라인) — 메인 툴바 밖으로 분리, 모바일에서도 항상 표시 */}
      {selectionMode && (
        <div className="flex items-center gap-1.5 border-b bg-muted/5 px-4 py-2">
          <div className="flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50/60 px-2 py-0.5">
            <span className="text-[10px] font-bold text-blue-700">
              {selectedFilenames.size}개
            </span>
            <Button
              size="sm"
              className="h-6 px-1.5 text-[9px] font-bold"
              onClick={handleBulkRegenerate}
              disabled={selectedFilenames.size === 0}
            >
              <RefreshCwIcon className="h-2.5 w-2.5" />
              재생성
            </Button>
            <Button
              size="sm"
              className="h-6 px-1.5 text-[9px] font-bold"
              onClick={handleBulkDownload}
              disabled={selectedFilenames.size === 0 || bulkDownloadIsLoading}
            >
              <DownloadIcon className="h-2.5 w-2.5" />
              다운로드
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 text-[9px] font-bold text-muted-foreground"
              onClick={exitSelectionMode}
            >
              <XIcon className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>
      )}

      {/* 메시지 영역 (툴바 아래 고정 높이 방지 위해 절대 위치 지양) */}
      {(exportActionMessage ??
        regenActionMessage ??
        bulkRegenActionMessage ??
        bulkDownloadMessage) !== null && (
        <div className="border-b bg-muted/10 px-4 py-1 text-center">
          {exportActionMessage !== null && (
            <span className="text-[10px] font-bold text-green-600">
              {exportActionMessage}
            </span>
          )}
          {regenActionMessage !== null && (
            <span className="text-[10px] font-bold text-blue-600">
              {regenActionMessage}
            </span>
          )}
          {bulkRegenActionMessage !== null && (
            <span className="text-[10px] font-bold text-blue-600">
              {bulkRegenActionMessage}
            </span>
          )}
          {bulkDownloadMessage !== null && (
            <span className="text-[10px] font-bold text-green-600">
              {bulkDownloadMessage}
            </span>
          )}
        </div>
      )}

      {/* 필터 바 (접이식) — 데스크톱 전용 */}
      {filtersExpanded && (
        <div className="hidden flex-wrap items-center gap-3 border-t border-dashed bg-muted/5 px-4 py-3 md:flex">
          {/* 분류 기준 설정 */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/50 px-2.5 py-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1">분류 기준:</span>
            <Select
              value={selectedAxis}
              onValueChange={(val) => {
                setSelectedAxis(val)
              }}
            >
              <SelectTrigger className="h-6 text-[10px] font-bold px-2 py-0 min-w-[130px]">
                <SelectValue placeholder="분류 기준 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value={encodeAxis({
                    kind: "template",
                    templateId: CURRENT_TEMPLATE_ID,
                  })}
                  className="text-[12px] font-bold"
                >
                  현재 템플릿 축 조합
                </SelectItem>
                {savedTemplates.map((t) => (
                  <SelectItem
                    key={t.id}
                    value={encodeAxis({
                      kind: "template",
                      templateId: t.id,
                    })}
                    className="text-[12px] font-bold"
                  >
                    {t.name} (축 조합)
                  </SelectItem>
                ))}
                {(Object.keys(FREE_GROUP_LABELS) as FreeGroupBy[]).map(
                  (mode) => {
                    let label = FREE_GROUP_LABELS[mode];
                    if (mode === "filename") label = "파일명 기준";
                    if (mode === "parsedFilename") label = "파일명 패턴 파싱";
                    if (mode === "tags") label = "태그별 분류";
                    if (mode === "savedTemplate") label = "템플릿 해시별";
                    return (
                      <SelectItem
                        key={mode}
                        value={encodeAxis({ kind: "free", mode })}
                        className="text-[12px] font-bold"
                      >
                        {label}
                      </SelectItem>
                    );
                  }
                )}
              </SelectContent>
            </Select>

            {/* 그룹 저장/수정/삭제 버튼 */}
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] font-bold text-muted-foreground hover:text-foreground"
              onClick={() => {
                const name = prompt("큐레이션 그룹 이름을 입력하세요:")
                if (name !== null) {
                  saveCurationGroup(name)
                }
              }}
            >
              새 그룹 저장
            </Button>

            {activeGroupId !== "__all__" && activeGroupId !== "custom" && !activeGroupId.startsWith("preset:") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] font-bold bg-primary/5 border-primary/20 text-primary"
                  onClick={() => {
                    const existingName = savedGroups.find((g) => g.id === activeGroupId)?.name ?? ""
                    if (confirm(`'${existingName}' 그룹 설정을 현재 필터/분류 기준으로 덮어쓰시겠습니까?`)) {
                      saveCurationGroup(existingName)
                    }
                  }}
                >
                  업데이트
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-[10px] font-bold bg-red-500 hover:bg-red-600 text-white border-0"
                  onClick={() => {
                    if (confirm("정말로 이 큐레이션 그룹을 삭제하시겠습니까?")) {
                      deleteCurationGroup(activeGroupId)
                    }
                  }}
                >
                  삭제
                </Button>
              </>
            )}
          </div>

          {/* 글로벌 필터 (동적 메타데이터 기준) */}
          {Object.entries(availableFilters).map(([key, options]) => {
            const currentVal = activeCurationFilters[key] ?? ""
            return (
              <div key={key} className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/50 px-2.5 py-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1">{key}:</span>
                <Select
                  value={currentVal !== "" ? currentVal : "__all__"}
                  onValueChange={(val) => {
                    if (val === "__all__") {
                      const { [key]: _, ...rest } = activeCurationFilters
                      setActiveCurationFilters(rest)
                    } else {
                      const next = { ...activeCurationFilters }
                      next[key] = val
                      setActiveCurationFilters(next)
                    }
                  }}
                >
                  <SelectTrigger className="h-6 text-[10px] font-bold px-2 py-0 border-0 bg-transparent hover:bg-muted/10">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {options.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}

          {/* 상태 필터 */}
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              withExpand(setStatusFilter, v as "all" | "done" | "pending")
            }}
          >
            <SelectTrigger className="h-9 w-full text-sm font-bold md:!h-7 md:w-28 md:!py-1 md:text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="done">완료만</SelectItem>
              <SelectItem value="pending">미완료만</SelectItem>
            </SelectContent>
          </Select>
          {/* 통합 검색바 */}
          <div className="w-[300px] md:w-[320px]">
            <TagInputSearch
              value={searchInput}
              tags={searchTags}
              candidates={candidates.filter((c) => {
                const valClean = searchInput.replace(/^[@$]/, "").toLowerCase()
                return c.value.toLowerCase().includes(valClean)
              })}
              placeholder="검색어 입력 (@파일명, $메타데이터)"
              onValueChange={setSearchInput}
              onAddTag={(tag) => {
                if (!searchTags.includes(tag)) {
                  setSearchTags([...searchTags, tag])
                }
                setSearchInput("")
              }}
              onRemoveTag={(tag) => {
                setSearchTags(searchTags.filter((t) => t !== tag))
              }}
              size="sm"
            />
          </div>
          {/* 필터 초기화 버튼 */}
          <div className="mt-1 flex w-full items-center justify-between md:mt-0 md:w-auto">
            {(statusFilter !== "all" || searchTags.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs font-bold text-muted-foreground hover:text-foreground active:bg-muted md:h-7 md:text-[10px]"
                onClick={() => {
                  setStatusFilter("all")
                  setSearchTags([])
                  setSearchInput("")
                }}
              >
                <XIcon className="mr-1.5 h-4 w-4 md:h-3 md:w-3" /> 초기화
              </Button>
            )}
            <div className="ml-auto text-[11px] font-black text-muted-foreground tabular-nums">
              {filteredRenderItems.length} / {renderItems.length}
            </div>
          </div>
        </div>
      )}

      {/* 모바일 전용 필터 Drawer (Sheet) */}
      <Sheet
        open={isMobile && filtersExpanded}
        onOpenChange={setFiltersExpanded}
      >
        <SheetContent
          side="bottom"
          className="flex h-auto max-h-[80dvh] flex-col overflow-hidden rounded-t-2xl border-t border-line bg-card px-6 pt-6 pb-6"
        >
          <SheetHeader className="mb-4 shrink-0 p-0">
            <SheetTitle className="text-base font-bold text-foreground">
              큐레이션 설정 & 필터
            </SheetTitle>
          </SheetHeader>

          {/* 스크롤 가능한 상세 필터 및 설정 목록 */}
          <div className="-mr-1 flex flex-1 flex-col gap-4 overflow-y-auto pr-1 pb-4">
            {/* 보기 형태 및 서브 기능 설정 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">
                상세 보기 형태
              </label>
              {viewMode === "gallery" || viewMode === "table" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={listLayout === "gallery" ? "default" : "outline"}
                    className="h-9 text-xs font-bold"
                    onClick={() => {
                      setListLayout("gallery")
                      onViewModeChange("gallery")
                    }}
                  >
                    갤러리 형식
                  </Button>
                  <Button
                    variant={listLayout === "table" ? "default" : "outline"}
                    className="h-9 text-xs font-bold"
                    onClick={() => {
                      setListLayout("table")
                      onViewModeChange("table")
                    }}
                  >
                    테이블 형식
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  <Button
                    variant={gridSubMode === "grid" ? "default" : "outline"}
                    className="h-9 px-1 text-[10px] font-bold"
                    onClick={() => {
                      setGridSubMode("grid")
                      onViewModeChange("grid")
                    }}
                  >
                    그리드
                  </Button>
                  <Button
                    variant={gridSubMode === "compare" ? "default" : "outline"}
                    disabled={compareImageCount < 2}
                    className="h-9 px-1 text-[10px] font-bold"
                    onClick={() => {
                      setGridSubMode("compare")
                      onViewModeChange("compare")
                    }}
                  >
                    비교
                  </Button>
                  <Button
                    variant={
                      gridSubMode === "tournament" ? "default" : "outline"
                    }
                    className="h-9 px-1 text-[10px] font-bold"
                    onClick={() => {
                      setGridSubMode("tournament")
                      onViewModeChange("tournament")
                    }}
                  >
                    토너먼트
                  </Button>
                </div>
              )}
            </div>

            {/* 상태 필터 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">
                상태 필터
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  withExpand(setStatusFilter, v as "all" | "done" | "pending")
                }}
              >
                <SelectTrigger className="h-10 w-full bg-background text-sm font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  <SelectItem value="done">완료만</SelectItem>
                  <SelectItem value="pending">미완료만</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 분류 기준 설정 — 모바일 */}
            <div className="space-y-1.5 border-t border-dashed pt-4">
              <label className="text-xs font-bold text-muted-foreground">
                분류 기준
              </label>
              <Select
                value={selectedAxis}
                onValueChange={(val) => {
                  setSelectedAxis(val)
                  setFiltersExpanded(false)
                }}
              >
                <SelectTrigger className="h-10 text-sm font-bold w-full bg-background">
                  <SelectValue placeholder="분류 기준 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value={encodeAxis({
                      kind: "template",
                      templateId: CURRENT_TEMPLATE_ID,
                    })}
                    className="text-[13px] font-bold"
                  >
                    현재 템플릿 축 조합
                  </SelectItem>
                  {savedTemplates.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={encodeAxis({
                        kind: "template",
                        templateId: t.id,
                      })}
                      className="text-[13px] font-bold"
                    >
                      {t.name} (축 조합)
                    </SelectItem>
                  ))}
                  {(Object.keys(FREE_GROUP_LABELS) as FreeGroupBy[]).map(
                    (mode) => {
                      let label = FREE_GROUP_LABELS[mode];
                      if (mode === "filename") label = "파일명 기준";
                      if (mode === "parsedFilename") label = "파일명 패턴 파싱";
                      if (mode === "tags") label = "태그별 분류";
                      if (mode === "savedTemplate") label = "템플릿 해시별";
                      return (
                        <SelectItem
                          key={mode}
                          value={encodeAxis({ kind: "free", mode })}
                          className="text-[13px] font-bold"
                        >
                          {label}
                        </SelectItem>
                      );
                    }
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* 그룹 관리 버튼 — 모바일 */}
            <div className="space-y-1.5 border-t border-dashed pt-4">
              <label className="text-xs font-bold text-muted-foreground">
                그룹 관리
              </label>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 text-xs font-bold flex-1"
                  onClick={() => {
                    const name = prompt("큐레이션 그룹 이름을 입력하세요:")
                    if (name !== null) {
                      saveCurationGroup(name)
                    }
                  }}
                >
                  새 그룹 저장
                </Button>

                {activeGroupId !== "__all__" && activeGroupId !== "custom" && !activeGroupId.startsWith("preset:") && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 text-xs font-bold bg-primary/5 border-primary/20 text-primary px-3"
                      onClick={() => {
                        const existingName = savedGroups.find((g) => g.id === activeGroupId)?.name ?? ""
                        if (confirm(`'${existingName}' 그룹 설정을 현재 필터/분류 기준으로 덮어쓰시겠습니까?`)) {
                          saveCurationGroup(existingName)
                        }
                      }}
                    >
                      업데이트
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-10 text-xs font-bold bg-red-500 hover:bg-red-600 text-white border-0 px-3"
                      onClick={() => {
                        if (confirm("정말로 이 큐레이션 그룹을 삭제하시겠습니까?")) {
                          deleteCurationGroup(activeGroupId)
                        }
                      }}
                    >
                      삭제
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* 글로벌 필터 — 모바일 */}
            {Object.entries(availableFilters).map(([key, options]) => {
              const currentVal = activeCurationFilters[key] ?? ""
              return (
                <div key={key} className="space-y-1.5 border-t border-dashed pt-4">
                  <label className="text-xs font-bold text-muted-foreground uppercase">
                    필터: {key}
                  </label>
                  <Select
                    value={currentVal !== "" ? currentVal : "__all__"}
                    onValueChange={(val) => {
                      if (val === "__all__") {
                        const { [key]: _, ...rest } = activeCurationFilters
                        setActiveCurationFilters(rest)
                      } else {
                        const next = { ...activeCurationFilters }
                        next[key] = val
                        setActiveCurationFilters(next)
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 text-sm font-bold bg-background">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">전체</SelectItem>
                      {options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}

            {/* 통합 검색 필터 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">
                통합 검색
              </label>
              <TagInputSearch
                value={searchInput}
                tags={searchTags}
                candidates={candidates.filter((c) => {
                  const valClean = searchInput
                    .replace(/^[@$]/, "")
                    .toLowerCase()
                  return c.value.toLowerCase().includes(valClean)
                })}
                placeholder="검색어 (@파일명, $메타데이터)"
                onValueChange={setSearchInput}
                onAddTag={(tag) => {
                  if (!searchTags.includes(tag)) {
                    setSearchTags([...searchTags, tag])
                  }
                  setSearchInput("")
                }}
                onRemoveTag={(tag) => {
                  setSearchTags(searchTags.filter((t) => t !== tag))
                }}
                size="md"
              />
            </div>

            {/* 썸네일 크기 조절 (모바일용 가로 슬라이더) */}
            {(viewMode === "gallery" ||
              viewMode === "grid" ||
              viewMode === "tournament") && (
              <div className="space-y-2 border-t border-dashed pt-4">
                <label className="flex justify-between text-xs font-bold text-muted-foreground">
                  <span>이미지 크기 조절</span>
                  <span className="font-mono font-black text-foreground">
                    {thumbnailSize}px
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <LayoutGridIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="range"
                    min="120"
                    max="600"
                    step="10"
                    value={thumbnailSize}
                    onChange={(e) => {
                      setThumbnailSize(Number(e.target.value))
                    }}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* 추가 작동 스위치 옵션 */}
            <div className="space-y-3 border-t border-dashed pt-4 pb-1">
              <label className="text-xs font-bold text-muted-foreground">
                큐레이션 상세 옵션
              </label>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  리젝 이미지 숨기기
                </span>
                <Switch
                  checked={hideRejected}
                  onCheckedChange={setHideRejected}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  선택 시 다음 조합으로 자동 이동
                </span>
                <Switch
                  checked={autoAdvance}
                  onCheckedChange={setAutoAdvance}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  중복 파일명 구분 전략
                </span>
                <Select
                  value={duplicateStrategy}
                  onValueChange={(v) => {
                    setDuplicateStrategy(v as "hash" | "number")
                  }}
                >
                  <SelectTrigger className="h-8 w-24 bg-background text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hash" className="text-xs font-bold">
                      HASH
                    </SelectItem>
                    <SelectItem value="number" className="text-xs font-bold">
                      NUM
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 데이터 새로고침 및 필터 초기화 버튼 영역 */}
            <div className="flex flex-col gap-2 border-t border-dashed pt-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 w-full gap-2 text-xs font-bold"
                    disabled={pendingRegenerateDisabled}
                  >
                    <RefreshCwIcon className="h-3.5 w-3.5" />
                    일괄 재생성 ({pendingRegenerateCount})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="center">
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                    재생성 범위 선택
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleRegeneratePending}
                    disabled={pendingRegenerateCount === 0}
                    className="py-3 text-xs"
                  >
                    <RefreshCwIcon className="mr-2 h-3.5 w-3.5 text-blue-500" />
                    미완료 조합 재생성 ({pendingRegenerateCount})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleRegenerateHeld}
                    disabled={heldRegenerateCount === 0}
                    className="py-3 text-xs"
                  >
                    <RefreshCwIcon className="mr-2 h-3.5 w-3.5 text-yellow-500" />
                    보류 조합 재생성 ({heldRegenerateCount})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleRegenerateEmpty}
                    disabled={emptyRegenerateCount === 0}
                    className="py-3 text-xs"
                  >
                    <RefreshCwIcon className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                    빈 폴더 조합 재생성 ({emptyRegenerateCount})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                className="h-10 w-full gap-2 text-xs font-bold"
                onClick={() => {
                  void fetchData()
                }}
              >
                <RefreshCwIcon className="h-3.5 w-3.5" />
                데이터 새로고침
              </Button>

              <Button
                variant="outline"
                className="h-10 w-full gap-2 border-primary/20 text-xs font-bold text-primary hover:bg-primary/5 active:bg-primary/10"
                onClick={handleExport}
                disabled={exportActionIsLoading}
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                큐레이션 내보내기
              </Button>

              <div className="mt-2 flex items-center justify-between">
                {statusFilter !== "all" || searchTags.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      setStatusFilter("all")
                      setSearchTags([])
                      setSearchInput("")
                    }}
                  >
                    <XIcon className="mr-1.5 h-3.5 w-3.5" /> 필터 초기화
                  </Button>
                ) : (
                  <div />
                )}
                <div className="text-[10px] font-black text-muted-foreground tabular-nums">
                  결과: {filteredRenderItems.length} / {renderItems.length}개
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
