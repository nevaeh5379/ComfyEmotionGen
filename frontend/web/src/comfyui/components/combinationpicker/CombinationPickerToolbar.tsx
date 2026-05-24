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
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
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
import { TagInputSearch } from "../TagInputSearch"
import { useCurationToolbar } from "./CurationToolbarTypes"
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
  bulkRegenActionMessage: string | null

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
  bulkRegenActionMessage,
  handleBulkDownload,
  bulkDownloadIsLoading,
  bulkDownloadMessage,
  handleExport,
  exportActionIsLoading,
  exportActionMessage,
  regenActionMessage,
}: ToolbarProps) {
  const { savedTemplates, data, selection, thumbnailSize, setThumbnailSize } =
    useCurationContext()
  const {
    renderItems,
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
  } = data

  const { selectionMode, selectedFilenames, exitSelectionMode } = selection

  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = useState(0)
  const {
    listLayout,
    setListLayout,
    gridSubMode,
    setGridSubMode,
  } = useCurationToolbar()
  const [isMobile, setIsMobile] = useState(false)

  useLayoutEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    const update = () => setToolbarHeight(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
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
        { "--toolbar-height": `${toolbarHeight}px` } as React.CSSProperties
      }
    >
      {/* 메인 툴바: 모바일에서는 헤더로 이동했으므로 숨김 */}
      <div className="hidden flex-wrap items-center gap-2 border-b bg-muted/5 px-4 py-2 md:flex md:gap-3">
        {/* 분류 축 선택 (hideTopSection일 때 숨김) */}
        {!hideTopSection && (
          <>
            <Select value={selectedAxis} onValueChange={setSelectedAxis}>
              <SelectTrigger className="h-8 w-full border-0 bg-transparent text-[12px] font-bold shadow-none focus:ring-0 sm:w-56 sm:text-[13px]">
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
                  >
                    현재 편집 중인 템플릿
                  </SelectItem>
                  {savedTemplates.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={encodeAxis({
                        kind: "template",
                        templateId: t.id,
                      })}
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
                      >
                        {FREE_GROUP_LABELS[mode]}
                      </SelectItem>
                    )
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
            viewMode === "gallery" || viewMode === "table"
              ? "list"
              : "grid"
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
          <TabsList className="bg-muted/65 p-0.5 h-8 gap-0.5">
            <TabsTrigger
              value="list"
              className="px-3.5 py-1 text-xs font-bold gap-1.5 data-[state=active]:bg-background"
            >
              <FolderIcon className="h-3.5 w-3.5" />
              <span>목록</span>
            </TabsTrigger>
            <TabsTrigger
              value="grid"
              disabled={!selectedFilename}
              className="px-3.5 py-1 text-xs font-bold gap-1.5 data-[state=active]:bg-background"
            >
              <Maximize2Icon className="h-3.5 w-3.5" />
              <span>그리드</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Sub Mode Selectors (toggled contextually) */}
        {(viewMode === "gallery" || viewMode === "table") ? (
          <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-background/50 p-0.5 h-8">
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
          <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-background/50 p-0.5 h-8">
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
        <div className="flex flex-1 items-center justify-end gap-2 md:justify-start md:gap-3">
          <Progress
            value={(doneCount / renderItems.length) * 100}
            className="hidden h-1.5 w-24 bg-muted shadow-inner md:block md:flex-1"
          />
          <span className="shrink-0 text-[11px] font-black text-foreground/70 tabular-nums">
            {Math.round((doneCount / renderItems.length) * 100)}%
            <span className="xs:inline ml-1 hidden opacity-50">
              ({doneCount}/{renderItems.length})
            </span>
          </span>
        </div>

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
                max="320"
                step="10"
                value={thumbnailSize}
                onChange={(e) => setThumbnailSize(Number(e.target.value))}
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
              onClick={() => setFiltersExpanded(true)}
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
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                >
                  <FilterIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  <span className="hidden sm:inline">필터</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>필터 토글</TooltipContent>
            </Tooltip>
          )}

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
                onClick={fetchData}
                className="py-2.5 md:py-1.5"
              >
                <RefreshCwIcon className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" />
                새로고침
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={hideRejected}
                onCheckedChange={(v) => setHideRejected(v)}
                className="py-2.5 md:py-1.5"
              >
                리젝 숨기기
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={autoAdvance}
                onCheckedChange={(v) => setAutoAdvance(v)}
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
                onClick={() => setDuplicateStrategy("hash")}
              >
                HASH
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "py-2.5 md:py-1.5",
                  duplicateStrategy === "number" ? "bg-accent" : ""
                )}
                onClick={() => setDuplicateStrategy("number")}
              >
                NUM
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {unassignedGroupsSize > 0 && (
                <DropdownMenuItem
                  onClick={() => setShowUnassignedPanel(!showUnassignedPanel)}
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
      {(exportActionMessage ||
        regenActionMessage ||
        bulkRegenActionMessage ||
        bulkDownloadMessage) && (
        <div className="border-b bg-muted/10 px-4 py-1 text-center">
          {exportActionMessage && (
            <span className="text-[10px] font-bold text-green-600">
              {exportActionMessage}
            </span>
          )}
          {regenActionMessage && (
            <span className="text-[10px] font-bold text-blue-600">
              {regenActionMessage}
            </span>
          )}
          {bulkRegenActionMessage && (
            <span className="text-[10px] font-bold text-blue-600">
              {bulkRegenActionMessage}
            </span>
          )}
          {bulkDownloadMessage && (
            <span className="text-[10px] font-bold text-green-600">
              {bulkDownloadMessage}
            </span>
          )}
        </div>
      )}

      {/* 필터 바 (접이식) — 데스크톱 전용 */}
      {filtersExpanded && (
        <div className="hidden md:flex flex-wrap items-center gap-3 border-t border-dashed bg-muted/5 px-4 py-3">
          {/* 상태 필터 */}
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              withExpand(setStatusFilter, v as "all" | "done" | "pending")
            }
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
                const valClean = searchInput
                  .replace(/^[@$]/, "")
                  .toLowerCase()
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
      <Sheet open={isMobile && filtersExpanded} onOpenChange={setFiltersExpanded}>
        <SheetContent side="bottom" className="rounded-t-2xl px-6 pt-6 pb-6 h-auto max-h-[80dvh] flex flex-col overflow-hidden bg-card border-t border-line">
          <SheetHeader className="mb-4 shrink-0 p-0">
            <SheetTitle className="text-base font-bold text-foreground">큐레이션 설정 & 필터</SheetTitle>
          </SheetHeader>
          
          {/* 스크롤 가능한 상세 필터 및 설정 목록 */}
          <div className="flex-1 overflow-y-auto pr-1 -mr-1 flex flex-col gap-4 pb-4">
            {/* 보기 형태 및 서브 기능 설정 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">상세 보기 형태</label>
              {(viewMode === "gallery" || viewMode === "table") ? (
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
                    className="h-9 text-[10px] font-bold px-1"
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
                    className="h-9 text-[10px] font-bold px-1"
                    onClick={() => {
                      setGridSubMode("compare")
                      onViewModeChange("compare")
                    }}
                  >
                    비교
                  </Button>
                  <Button
                    variant={gridSubMode === "tournament" ? "default" : "outline"}
                    className="h-9 text-[10px] font-bold px-1"
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
              <label className="text-xs font-bold text-muted-foreground">상태 필터</label>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  withExpand(setStatusFilter, v as "all" | "done" | "pending")
                }
              >
                <SelectTrigger className="h-10 w-full text-sm font-bold bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  <SelectItem value="done">완료만</SelectItem>
                  <SelectItem value="pending">미완료만</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 통합 검색 필터 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">통합 검색</label>
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
            {(viewMode === "gallery" || viewMode === "grid" || viewMode === "tournament") && (
              <div className="space-y-2 border-t border-dashed pt-4">
                <label className="text-xs font-bold text-muted-foreground flex justify-between">
                  <span>이미지 크기 조절</span>
                  <span className="font-mono text-foreground font-black">{thumbnailSize}px</span>
                </label>
                <div className="flex items-center gap-3">
                  <LayoutGridIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    type="range"
                    min="120"
                    max="320"
                    step="10"
                    value={thumbnailSize}
                    onChange={(e) => setThumbnailSize(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* 추가 작동 스위치 옵션 */}
            <div className="space-y-3 border-t border-dashed pt-4 pb-1">
              <label className="text-xs font-bold text-muted-foreground">큐레이션 상세 옵션</label>
              
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">리젝 이미지 숨기기</span>
                <Switch
                  checked={hideRejected}
                  onCheckedChange={setHideRejected}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">선택 시 다음 조합으로 자동 이동</span>
                <Switch
                  checked={autoAdvance}
                  onCheckedChange={setAutoAdvance}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">중복 파일명 구분 전략</span>
                <Select
                  value={duplicateStrategy}
                  onValueChange={(v) => setDuplicateStrategy(v as "hash" | "number")}
                >
                  <SelectTrigger className="h-8 w-24 text-xs font-bold bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hash" className="text-xs font-bold">HASH</SelectItem>
                    <SelectItem value="number" className="text-xs font-bold">NUM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 데이터 새로고침 및 필터 초기화 버튼 영역 */}
            <div className="flex flex-col gap-2 border-t border-dashed pt-4">
              <Button
                variant="outline"
                className="w-full h-10 text-xs font-bold gap-2"
                onClick={fetchData}
              >
                <RefreshCwIcon className="h-3.5 w-3.5" />
                데이터 새로고침
              </Button>

              <Button
                variant="outline"
                className="w-full h-10 text-xs font-bold gap-2 text-primary border-primary/20 hover:bg-primary/5 active:bg-primary/10"
                onClick={handleExport}
                disabled={exportActionIsLoading}
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                큐레이션 내보내기
              </Button>

              <div className="flex items-center justify-between mt-2">
                {(statusFilter !== "all" || searchTags.length > 0) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted"
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
