import { forwardRef } from "react"
import {
  ArrowDown,
  ArrowUp,
  DownloadIcon,
  ExternalLink,
  FilterIcon,
  LayoutGrid,
  MoreVertical,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  type GallerySortKey,
  type GalleryToolbarValue,
  type GalleryViewMode,
  useGalleryToolbar,
} from "../../contexts/GalleryToolbarContext"
import { usePanelLayout } from "../../contexts/PanelLayoutContext"
import type { CurationStatus } from "../../types/Message"

type StatusFilter = CurationStatus | "all"
type GalleryDisplayMode = GalleryViewMode | "group"

interface GalleryHeaderControlsProps {
  active: boolean
  compact: boolean
  ultraCompact: boolean
  useWindowMode: boolean
  onPopOut: () => void
}

interface GalleryOptionsMenuProps {
  toolbar: GalleryToolbarValue
  compact: boolean
  ultraCompact: boolean
  useWindowMode: boolean
  onPopOut: () => void
  mobile?: boolean
}

const STATUS_OPTIONS: readonly {
  value: StatusFilter
  label: string
}[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "approved", label: "통과" },
  { value: "rejected", label: "탈락" },
  { value: "trashed", label: "휴지통" },
]

const VIEW_OPTIONS: readonly {
  value: GalleryDisplayMode
  label: string
}[] = [
  { value: "group", label: "그룹" },
  { value: "grid", label: "그리드" },
  { value: "compare", label: "비교" },
]

const SORT_OPTIONS: readonly {
  value: GallerySortKey
  label: string
}[] = [
  { value: "createdAt", label: "날짜순" },
  { value: "filename", label: "파일명순" },
  { value: "sizeBytes", label: "크기순" },
]

function optionLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T
): string {
  return options.find((option) => option.value === value)?.label ?? value
}

function displayMode(toolbar: GalleryToolbarValue): GalleryDisplayMode {
  return toolbar.groupMode ? "group" : toolbar.viewMode
}

function setDisplayMode(
  toolbar: GalleryToolbarValue,
  mode: GalleryDisplayMode
): void {
  if (mode === "group") {
    toolbar.setGroupMode(true)
    return
  }
  toolbar.setGroupMode(false)
  toolbar.setViewMode(mode)
}

function toggleSort(toolbar: GalleryToolbarValue, key: GallerySortKey): void {
  if (toolbar.sortKey === key) {
    toolbar.setSortDir(toolbar.sortDir === "asc" ? "desc" : "asc")
    return
  }
  toolbar.setSortKey(key)
  toolbar.setSortDir("asc")
}

function StatusSelect({
  toolbar,
  hidden,
}: {
  toolbar: GalleryToolbarValue
  hidden: boolean
}): React.JSX.Element {
  return (
    <Select
      value={toolbar.statusFilter}
      onValueChange={(value) => {
        toolbar.setStatusFilter(value as StatusFilter)
      }}
    >
      <SelectTrigger
        className={`hidden !h-7 w-[82px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 ${hidden ? "md:hidden" : "md:inline-flex"}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="text-[12px] font-bold"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ViewSelect({
  toolbar,
  hidden,
}: {
  toolbar: GalleryToolbarValue
  hidden: boolean
}): React.JSX.Element {
  return (
    <Select
      value={displayMode(toolbar)}
      onValueChange={(value) => {
        setDisplayMode(toolbar, value as GalleryDisplayMode)
      }}
    >
      <SelectTrigger
        className={`hidden !h-7 w-[78px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 ${hidden ? "md:hidden" : "md:inline-flex"}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VIEW_OPTIONS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="text-[12px] font-bold"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SortSelect({
  toolbar,
  hidden,
}: {
  toolbar: GalleryToolbarValue
  hidden: boolean
}): React.JSX.Element {
  return (
    <Select
      value={toolbar.sortKey}
      onValueChange={(value) => {
        toggleSort(toolbar, value as GallerySortKey)
      }}
    >
      <SelectTrigger
        className={`hidden !h-7 w-[74px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 ${hidden ? "md:hidden" : "md:inline-flex"}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="text-[12px] font-bold"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SortDirectionButton({
  toolbar,
  hidden,
}: {
  toolbar: GalleryToolbarValue
  hidden: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            toggleSort(toolbar, toolbar.sortKey)
          }}
          className={`hidden !h-7 !w-7 shrink-0 border-line bg-background p-0 shadow-none hover:bg-muted ${hidden ? "md:hidden" : "md:inline-flex"}`}
        >
          {toolbar.sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>정렬 방향</TooltipContent>
    </Tooltip>
  )
}

function ThumbnailControl({
  toolbar,
  menu = false,
}: {
  toolbar: GalleryToolbarValue
  menu?: boolean
}): React.JSX.Element {
  return (
    <div
      className={
        menu
          ? "my-1 flex flex-col gap-1.5 border-b border-line/45 px-2.5 py-2"
          : "hidden h-7 items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-2 py-1 shadow-xs md:flex"
      }
    >
      <div
        className={
          menu
            ? "flex items-center justify-between text-[11px] font-bold text-muted-foreground"
            : "flex items-center text-muted-foreground"
        }
      >
        <span className="flex items-center gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5" />
          {menu && "크기 조절"}
        </span>
        {menu && (
          <span className="font-mono text-[10px] text-primary">
            {toolbar.thumbnailSize}px
          </span>
        )}
      </div>
      <input
        type="range"
        min="120"
        max="320"
        step="10"
        value={toolbar.thumbnailSize}
        onChange={(event) => {
          toolbar.setThumbnailSize(Number(event.target.value))
        }}
        onClick={
          menu
            ? (event: React.MouseEvent<HTMLInputElement>): void => {
                event.stopPropagation()
              }
            : undefined
        }
        className={`h-1 cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none ${menu ? "w-full" : "w-16"}`}
      />
      {!menu && (
        <span className="w-[34px] text-right font-mono text-[9px] font-bold whitespace-nowrap text-muted-foreground tabular-nums">
          {toolbar.thumbnailSize}px
        </span>
      )}
    </div>
  )
}

function StatusSubmenu({
  toolbar,
}: {
  toolbar: GalleryToolbarValue
}): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
        필터: {optionLabel(STATUS_OPTIONS, toolbar.statusFilter)}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-[120px] p-1">
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                toolbar.setStatusFilter(option.value)
              }}
              className="text-[12px] font-bold"
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

function ViewSubmenu({
  toolbar,
}: {
  toolbar: GalleryToolbarValue
}): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
        보기: {optionLabel(VIEW_OPTIONS, displayMode(toolbar))}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-[120px] p-1">
          {VIEW_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                setDisplayMode(toolbar, option.value)
              }}
              className="text-[12px] font-bold"
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

function SortSubmenu({
  toolbar,
}: {
  toolbar: GalleryToolbarValue
}): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex items-center gap-2 text-[12px] font-bold">
        정렬: {optionLabel(SORT_OPTIONS, toolbar.sortKey)}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-[120px] p-1">
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                toggleSort(toolbar, option.value)
              }}
              className="text-[12px] font-bold"
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

function MenuConfiguration({
  toolbar,
}: {
  toolbar: GalleryToolbarValue
}): React.JSX.Element {
  return (
    <>
      <StatusSubmenu toolbar={toolbar} />
      <ViewSubmenu toolbar={toolbar} />
      <SortSubmenu toolbar={toolbar} />
      <DropdownMenuItem
        onClick={() => {
          toggleSort(toolbar, toolbar.sortKey)
        }}
        className="mb-1 flex items-center gap-2 border-b border-line/45 pb-2 text-[12px] font-bold"
      >
        {toolbar.sortDir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 opacity-60" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 opacity-60" />
        )}
        정렬 방향: {toolbar.sortDir === "asc" ? "오름차순" : "내림차순"}
      </DropdownMenuItem>
    </>
  )
}

function CompactActions({
  toolbar,
  useWindowMode,
  onPopOut,
}: {
  toolbar: GalleryToolbarValue
  useWindowMode: boolean
  onPopOut: () => void
}): React.JSX.Element {
  const supportsThumbnails = toolbar.groupMode || toolbar.viewMode === "grid"
  return (
    <>
      <DropdownMenuItem
        onClick={() => {
          toolbar.setShowFilters(!toolbar.showFilters)
        }}
        className="flex items-center gap-2 text-[12px] font-bold"
      >
        <FilterIcon
          className={`h-3.5 w-3.5 ${toolbar.showFilters ? "text-primary" : "opacity-60"}`}
        />
        필터 {toolbar.showFilters ? "숨기기" : "표시"}
        {toolbar.hasAnyFilter && (
          <span className="ml-auto h-2 w-2 rounded-full bg-primary" />
        )}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => void toolbar.handleExport()}
        className="flex items-center gap-2 text-[12px] font-bold"
      >
        <DownloadIcon className="h-3.5 w-3.5 opacity-60" />
        갤러리 내보내기
      </DropdownMenuItem>
      {useWindowMode && (
        <DropdownMenuItem
          onClick={onPopOut}
          className="flex items-center gap-2 text-[12px] font-bold"
        >
          <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          창으로 분리 (Pop out)
        </DropdownMenuItem>
      )}
      {supportsThumbnails && <ThumbnailControl toolbar={toolbar} menu />}
      <DropdownMenuSeparator />
    </>
  )
}

/**
 * 모바일과 데스크톱의 overflow 메뉴가 동일한 명령 집합을 사용하게 한다.
 * 반응형 단계는 어떤 명령을 overflow 안으로 이동할지만 결정한다.
 */
function GalleryOptionsMenu({
  toolbar,
  compact,
  ultraCompact,
  useWindowMode,
  onPopOut,
  mobile = false,
}: GalleryOptionsMenuProps): React.JSX.Element {
  const showCompactActions = compact || ultraCompact
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={
            mobile
              ? "!h-8 !w-8 p-0 md:hidden"
              : "hidden !h-7 !w-7 p-0 md:inline-flex"
          }
        >
          <MoreVertical className={mobile ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={
          ultraCompact
            ? "w-[220px] p-2"
            : compact
              ? "w-[200px] p-2"
              : "w-[160px]"
        }
      >
        {ultraCompact && <MenuConfiguration toolbar={toolbar} />}
        {showCompactActions && (
          <CompactActions
            toolbar={toolbar}
            useWindowMode={useWindowMode}
            onPopOut={onPopOut}
          />
        )}
        <DropdownMenuItem
          onClick={toolbar.handleRefresh}
          className="text-[12px] font-bold"
        >
          <RefreshCwIcon className="mr-2 h-3.5 w-3.5 opacity-60" />
          새로고침
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void toolbar.handleEmptyTrash()}
          className="text-[12px] font-bold text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2Icon className="mr-2 h-3.5 w-3.5 opacity-60" />
          휴지통 비우기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DirectActions({
  toolbar,
  hidden,
  useWindowMode,
  onPopOut,
}: {
  toolbar: GalleryToolbarValue
  hidden: boolean
  useWindowMode: boolean
  onPopOut: () => void
}): React.JSX.Element {
  const buttonClass = `hidden !h-7 !w-7 p-0 ${hidden ? "md:hidden" : "md:inline-flex"}`
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant={toolbar.showFilters ? "secondary" : "outline"}
            onClick={() => {
              toolbar.setShowFilters(!toolbar.showFilters)
            }}
            className={`relative ${buttonClass}`}
          >
            <FilterIcon className="h-3.5 w-3.5" />
            {toolbar.hasAnyFilter && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
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
            className={buttonClass}
            onClick={() => void toolbar.handleExport()}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>갤러리 내보내기</TooltipContent>
      </Tooltip>
      {useWindowMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className={buttonClass}
              onClick={onPopOut}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>창으로 분리 (Pop out)</TooltipContent>
        </Tooltip>
      )}
    </>
  )
}

export const GalleryHeaderControls = forwardRef<
  HTMLDivElement,
  GalleryHeaderControlsProps
>(function GalleryHeaderControls(
  { active, compact, ultraCompact, useWindowMode, onPopOut },
  ref
) {
  const toolbar = useGalleryToolbar()
  const panel = usePanelLayout()
  if (!active) return null

  const popOut = (): void => {
    panel.gallery.setIsFloating(true)
    onPopOut()
  }
  const hideDirectActions = compact || ultraCompact
  const supportsThumbnails = toolbar.groupMode || toolbar.viewMode === "grid"

  return (
    <>
      <div ref={ref} className="hidden items-center gap-1.5 md:flex">
        <StatusSelect toolbar={toolbar} hidden={ultraCompact} />
        <ViewSelect toolbar={toolbar} hidden={ultraCompact} />
        <SortSelect toolbar={toolbar} hidden={ultraCompact} />
        <SortDirectionButton toolbar={toolbar} hidden={ultraCompact} />
        {supportsThumbnails && !hideDirectActions && (
          <ThumbnailControl toolbar={toolbar} />
        )}
        <DirectActions
          toolbar={toolbar}
          hidden={hideDirectActions}
          useWindowMode={useWindowMode}
          onPopOut={popOut}
        />
        <GalleryOptionsMenu
          toolbar={toolbar}
          compact={compact}
          ultraCompact={ultraCompact}
          useWindowMode={useWindowMode}
          onPopOut={popOut}
        />
        <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
      </div>
      <GalleryOptionsMenu
        toolbar={toolbar}
        compact={compact}
        ultraCompact={ultraCompact}
        useWindowMode={useWindowMode}
        onPopOut={popOut}
        mobile
      />
      <div className="h-4 w-px bg-border/60 md:hidden" />
    </>
  )
})
