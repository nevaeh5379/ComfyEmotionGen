import { useRef, useState, useLayoutEffect, useCallback } from "react"
import {
  FolderIcon,
  LayoutListIcon,
  LayoutGridIcon,
  Maximize2Icon,
  ColumnsIcon,
  SwordsIcon,
  FilterIcon,
  Settings2Icon,
  RefreshCwIcon,
  AlertTriangleIcon,
  DownloadIcon,
  XIcon,
  SearchIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
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
import { LoadingButton } from "./CombinationPickerComponents"
import { useCurationContext } from "./CurationContext"
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
  const { savedTemplates, data, selection, thumbnailSize, setThumbnailSize } = useCurationContext()
  const {
    renderItems,
    doneCount,
    statusFilter,
    setStatusFilter,
    filenameFilter,
    setFilenameFilter,
    metadataFilter,
    setMetadataFilter,
    filteredRenderItems,
    fetchData,
  } = data

  const { selectionMode, selectedFilenames, exitSelectionMode } = selection

  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = useState(0)

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

  const handleTabChange = (v: string) => {
    onViewModeChange(v as ViewMode)
  }

  return (
    <div
      ref={toolbarRef}
      className="sticky z-40 shrink-0 border-t border-line bg-panel shadow-sm"
      style={
        { "--toolbar-height": `${toolbarHeight}px` } as React.CSSProperties
      }
    >
      {/* 메인 툴바: 1 줄 (모바일에서는 줄바꿈 허용) */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/5 px-4 py-2 md:gap-3">
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
        {/* Mobile dropdown */}
        <Select value={viewMode} onValueChange={handleTabChange}>
          <SelectTrigger className="h-8 w-[110px] border-line bg-background px-2 text-[11px] font-bold shadow-none focus:ring-0 sm:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="gallery"
              className="flex items-center gap-2 text-[12px] font-bold"
            >
              <FolderIcon className="mr-2 h-3.5 w-3.5" />
              갤러리
            </SelectItem>
            <SelectItem
              value="table"
              className="flex items-center gap-2 text-[12px] font-bold"
            >
              <LayoutListIcon className="mr-2 h-3.5 w-3.5" />
              테이블
            </SelectItem>
            <SelectItem
              value="grid"
              className="flex items-center gap-2 text-[12px] font-bold"
              disabled={!selectedFilename}
            >
              <Maximize2Icon className="mr-2 h-3.5 w-3.5" />
              그리드
            </SelectItem>
            <SelectItem
              value="compare"
              className="flex items-center gap-2 text-[12px] font-bold"
              disabled={compareImageCount < 2}
            >
              <ColumnsIcon className="mr-2 h-3.5 w-3.5" />
              비교
            </SelectItem>
            <SelectItem
              value="tournament"
              className="flex items-center gap-2 text-[12px] font-bold"
              disabled={!selectedFilename}
            >
              <SwordsIcon className="mr-2 h-3.5 w-3.5" />
              토너먼트
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Desktop tabs */}
        <Tabs
          value={viewMode}
          onValueChange={handleTabChange}
          className="hidden w-full sm:block sm:w-auto"
        >
          <TabsList className="no-scrollbar h-8 w-full justify-start gap-0.5 overflow-x-auto bg-muted/50 p-1 sm:w-auto">
            <TabsTrigger
              value="gallery"
              className="flex-1 gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background sm:flex-none"
            >
              <FolderIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="table"
              className="flex-1 gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background sm:flex-none"
            >
              <LayoutListIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <div className="mx-0.5 hidden h-4 w-px bg-border/60 sm:block" />
            <TabsTrigger
              value="grid"
              className="flex-1 gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background sm:flex-none"
              disabled={!selectedFilename}
            >
              <Maximize2Icon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="compare"
              className="flex-1 gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background sm:flex-none"
              disabled={compareImageCount < 2}
            >
              <ColumnsIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="tournament"
              className="flex-1 gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background sm:flex-none"
              disabled={!selectedFilename}
            >
              <SwordsIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
          {(viewMode === "gallery" || viewMode === "grid" || viewMode === "tournament") && (
            <div className="hidden items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-2 py-1 md:flex shadow-xs h-8">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center text-muted-foreground">
                    <LayoutGridIcon className="h-3.5 w-3.5" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">크기 조절</TooltipContent>
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
              <span className="text-[10px] font-mono font-bold text-muted-foreground w-[34px] text-right whitespace-nowrap tabular-nums">
                {thumbnailSize}px
              </span>
            </div>
          )}

          {/* 필터 토글 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={
                  filtersExpanded ||
                  statusFilter !== "all" ||
                  filenameFilter ||
                  metadataFilter
                    ? "secondary"
                    : "outline"
                }
                size="sm"
                className={`h-9 shrink-0 gap-1.5 px-3 text-[11px] font-bold shadow-xs transition-all md:h-8 ${(statusFilter !== "all" || filenameFilter || metadataFilter) && !filtersExpanded ? "ring-2 ring-primary/20" : ""}`}
                onClick={() => setFiltersExpanded(!filtersExpanded)}
              >
                <FilterIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
                <span className="hidden sm:inline">필터</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>필터 토글</TooltipContent>
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

        {/* 선택 모드 (인라인) */}
        {selectionMode && (
          <>
            <div className="h-4 w-px bg-border" />
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
          </>
        )}
      </div>

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

      {/* 필터 바 (접이식) */}
      {filtersExpanded && (
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed bg-muted/5 px-4 py-3">
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
          {/* 파일명 필터 */}
          <div className="relative w-full md:w-auto">
            <SearchIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground md:h-3 md:w-3" />
            <Input
              type="text"
              placeholder="파일명 검색..."
              value={filenameFilter}
              onChange={(e) => withExpand(setFilenameFilter, e.target.value)}
              className="h-9 w-full pl-8 text-sm font-bold md:h-7 md:w-40 md:text-[10px]"
            />
          </div>
          {/* 메타데이터 필터 */}
          <div className="relative w-full md:w-auto">
            <SearchIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground md:h-3 md:w-3" />
            <Input
              type="text"
              placeholder="메타데이터 검색..."
              value={metadataFilter}
              onChange={(e) => withExpand(setMetadataFilter, e.target.value)}
              className="h-9 w-full pl-8 text-sm font-bold md:h-7 md:w-44 md:text-[10px]"
            />
          </div>
          {/* 필터 초기화 버튼 */}
          <div className="mt-1 flex w-full items-center justify-between md:mt-0 md:w-auto">
            {(statusFilter !== "all" || filenameFilter || metadataFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs font-bold text-muted-foreground hover:text-foreground active:bg-muted md:h-7 md:text-[10px]"
                onClick={() => {
                  setStatusFilter("all")
                  setFilenameFilter("")
                  setMetadataFilter("")
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
    </div>
  )
}
