import {
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react"
import {
  FolderIcon,
  LayoutListIcon,
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
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
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
import type { SavedTemplate } from "../../hooks/useSavedTemplates"
import { LoadingButton } from "./CombinationPickerComponents"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

interface ToolbarProps {
  // 템플릿
  selectedTemplateId: string
  setSelectedTemplateId: (id: string) => void
  savedTemplates: SavedTemplate[]

  // 뷰 모드
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedFilename: string | null
  renderItemsLength: number

  // 진행률
  doneCount: number

  // 필터
  filtersExpanded: boolean
  setFiltersExpanded: (v: boolean) => void
  statusFilter: "all" | "done" | "pending"
  setStatusFilter: Dispatch<SetStateAction<"all" | "done" | "pending">>
  filenameFilter: string
  setFilenameFilter: Dispatch<SetStateAction<string>>
  metadataFilter: string
  setMetadataFilter: Dispatch<SetStateAction<string>>
  filteredRenderItemsLength: number

  // 설정
  hideRejected: boolean
  setHideRejected: (v: boolean) => void
  autoAdvance: boolean
  setAutoAdvance: (v: boolean) => void
  duplicateStrategy: "hash" | "number"
  setDuplicateStrategy: (v: "hash" | "number") => void

  // 미할당
  unassignedGroupsSize: number
  unassignedTotalCount: number
  showUnassignedPanel: boolean
  setShowUnassignedPanel: (v: boolean) => void

  // 선택 모드
  selectionMode: boolean
  selectedFilenamesSize: number
  handleBulkRegenerate: () => void
  exitSelectionMode: () => void
  bulkRegenActionMessage: string | null

  // 액션
  handleExport: () => void
  exportActionIsLoading: boolean
  exportActionMessage: string | null
  regenActionMessage: string | null
  fetchData: () => void
}

export function CombinationPickerToolbar({
  selectedTemplateId,
  setSelectedTemplateId,
  savedTemplates,
  viewMode,
  onViewModeChange,
  selectedFilename,
  renderItemsLength,
  doneCount,
  filtersExpanded,
  setFiltersExpanded,
  statusFilter,
  setStatusFilter,
  filenameFilter,
  setFilenameFilter,
  metadataFilter,
  setMetadataFilter,
  filteredRenderItemsLength,
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
  selectionMode,
  selectedFilenamesSize,
  handleBulkRegenerate,
  exitSelectionMode,
  bulkRegenActionMessage,
  handleExport,
  exportActionIsLoading,
  exportActionMessage,
  regenActionMessage,
  fetchData,
}: ToolbarProps) {
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
      {/* 메인 툴바: 1 줄 */}
      <div className="flex flex-nowrap items-center gap-3 px-4 py-2 border-b bg-muted/5">
        {/* 템플릿 선택 */}
        <Select
          value={selectedTemplateId || "__current__"}
          onValueChange={(v) =>
            setSelectedTemplateId(v === "__current__" ? "" : v)
          }
        >
          <SelectTrigger className="h-8 w-52 border-0 bg-transparent font-bold shadow-none focus:ring-0 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__current__">현재 편집 중인 템플릿</SelectItem>
            {savedTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
<div className="h-5 w-px bg-border/60" />
        {/* 뷰 모드 탭 */}
        <Tabs value={viewMode} onValueChange={handleTabChange}>
          <TabsList className="h-8 bg-muted/50 p-1 gap-0.5">
            <TabsTrigger
              value="gallery"
              className="gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background"
            >
              <FolderIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="table"
              className="gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background"
            >
              <LayoutListIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <div className="mx-0.5 h-4 w-px bg-border/60" />
            <TabsTrigger
              value="grid"
              className="gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background"
              disabled={!selectedFilename}
            >
              <Maximize2Icon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="compare"
              className="gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background"
              disabled={!selectedFilename}
            >
              <ColumnsIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="tournament"
              className="gap-1.5 px-3 text-[11px] font-bold data-[state=active]:bg-background"
              disabled={!selectedFilename}
            >
              <SwordsIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
<div className="h-5 w-px bg-border/60" />
        {/* 진행률 */}
        <div className="flex flex-1 items-center gap-3">
          <Progress
            value={(doneCount / renderItemsLength) * 100}
            className="h-2 flex-1 bg-muted shadow-inner"
          />
          <span className="shrink-0 text-[11px] font-bold text-muted-foreground tabular-nums">
            {doneCount} / {renderItemsLength}
          </span>
        </div>

        <div className="h-5 w-px bg-border/60" />

        {/* 필터 토글 */}
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
          className={`h-8 gap-1.5 px-3 text-[11px] font-bold shadow-xs transition-all ${(statusFilter !== "all" || filenameFilter || metadataFilter) && !filtersExpanded ? "ring-2 ring-primary/20" : ""}`}
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          title="필터"
        >
          <FilterIcon className="h-3.5 w-3.5" />
          필터
          {(statusFilter !== "all" || filenameFilter || metadataFilter) &&
            !filtersExpanded && (
              <span className="ml-0.5 inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            )}
        </Button>

        {/* 설정 드롭다운 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-3 text-[10px] font-bold"
              title="설정"
            >
              <Settings2Icon className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>설정</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={fetchData}>
              <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
              새로고침
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={hideRejected}
              onCheckedChange={(v) => setHideRejected(v)}
            >
              리젝 숨기기
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={autoAdvance}
              onCheckedChange={(v) => setAutoAdvance(v)}
            >
              자동 다음 이동
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {/* 중복 전략 */}
            <DropdownMenuLabel>중복 전략</DropdownMenuLabel>
            <DropdownMenuItem
              className={duplicateStrategy === "hash" ? "bg-accent" : ""}
              onClick={() => setDuplicateStrategy("hash")}
            >
              HASH
            </DropdownMenuItem>
            <DropdownMenuItem
              className={duplicateStrategy === "number" ? "bg-accent" : ""}
              onClick={() => setDuplicateStrategy("number")}
            >
              NUM
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {unassignedGroupsSize > 0 && (
              <DropdownMenuItem
                onClick={() => setShowUnassignedPanel(!showUnassignedPanel)}
              >
                <AlertTriangleIcon className="mr-2 h-3.5 w-3.5 text-amber-600" />
                미할당: {unassignedGroupsSize}파일 ({unassignedTotalCount}장)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 선택 모드 (인라인) */}
        {selectionMode && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50/60 px-2 py-0.5">
              <span className="text-[10px] font-bold text-blue-700">
                {selectedFilenamesSize}개
              </span>
              <Button
                size="sm"
                className="h-6 px-1.5 text-[9px] font-bold"
                onClick={handleBulkRegenerate}
                disabled={selectedFilenamesSize === 0}
              >
                <RefreshCwIcon className="h-2.5 w-2.5" />
                재생성
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
            {bulkRegenActionMessage && (
              <span className="text-[10px] font-bold text-blue-600">
                {bulkRegenActionMessage}
              </span>
            )}
          </>
        )}

        {/* EXPORT 버튼 */}
        <LoadingButton
          size="sm"
          className="h-7 px-3 text-[10px] font-black"
          onClick={handleExport}
          isLoading={exportActionIsLoading}
          disabled={doneCount === 0}
          icon={DownloadIcon}
        >
        </LoadingButton>

        {/* 메시지 */}
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
      </div>

      {/* 필터 바 (접이식) */}
      {filtersExpanded && (
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed px-3 py-2">
          {/* 상태 필터 */}
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              withExpand(setStatusFilter, v as "all" | "done" | "pending")
            }
          >
            <SelectTrigger className="h-7 w-28 text-[10px] font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="done">완료만</SelectItem>
              <SelectItem value="pending">미완료만</SelectItem>
            </SelectContent>
          </Select>
          {/* 파일명 필터 */}
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="파일명 검색..."
              value={filenameFilter}
              onChange={(e) => withExpand(setFilenameFilter, e.target.value)}
              className="h-7 w-40 pl-7 text-[10px] font-bold"
            />
          </div>
          {/* 메타데이터 필터 */}
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="메타데이터 검색..."
              value={metadataFilter}
              onChange={(e) => withExpand(setMetadataFilter, e.target.value)}
              className="h-7 w-44 pl-7 text-[10px] font-bold"
            />
          </div>
          {/* 필터 초기화 버튼 */}
          {(statusFilter !== "all" || filenameFilter || metadataFilter) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] font-bold text-muted-foreground"
              onClick={() => {
                setStatusFilter("all")
                setFilenameFilter("")
                setMetadataFilter("")
              }}
            >
              <XIcon className="mr-1 h-3 w-3" /> 초기화
            </Button>
          )}
          <div className="ml-auto text-[10px] font-bold text-muted-foreground">
            {filteredRenderItemsLength} / {renderItemsLength}개
          </div>
        </div>
      )}
    </div>
  )
}
