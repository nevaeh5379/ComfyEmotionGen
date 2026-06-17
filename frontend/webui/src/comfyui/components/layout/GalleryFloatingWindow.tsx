import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowDown,
  ArrowUp,
  RefreshCw as RefreshCwIcon,
  Download as DownloadIcon,
  Trash2 as Trash2Icon,
  Filter as FilterIcon,
  LayoutGrid,
} from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { TagInputSearch } from "../TagInputSearch"
import { FloatingWindow } from "../layout/FloatingWindow"
import { SavedImagesGallery } from "../SavedImagesGallery"
import type { GalleryToolbarValue } from "../../contexts/GalleryToolbarContext"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GalleryFloatingWindowProps {
  isOpen: boolean
  onClose: () => void
  onDock: () => void
  initialPos: { x: number; y: number }
  initialSize: { w: number; h: number }
  onPosChange: (pos: { x: number; y: number }) => void
  onSizeChange: (size: { w: number; h: number }) => void
  onDragProgress: (
    clientX: number,
    clientY: number,
    screenW: number,
    screenH: number,
    isEnding: boolean
  ) => void
  backendUrl: string
  enableHover: boolean
  imagePageSize: 24 | 48 | 96
  imageLazyLoad: boolean
  singleDownloadMode: "newtab" | "direct"
  tb: GalleryToolbarValue
}

// ---------------------------------------------------------------------------
// GalleryFloatingWindow
// ---------------------------------------------------------------------------

export function GalleryFloatingWindow({
  isOpen,
  onClose,
  onDock,
  initialPos,
  initialSize,
  onPosChange,
  onSizeChange,
  onDragProgress,
  backendUrl,
  enableHover,
  imagePageSize,
  imageLazyLoad,
  singleDownloadMode,
  tb,
}: GalleryFloatingWindowProps) {
  if (!isOpen) return null

  return (
    <FloatingWindow
      id="floating-window-gallery"
      isOpen={isOpen}
      onClose={onClose}
      onDock={onDock}
      initialPos={initialPos}
      initialSize={initialSize}
      onPosChange={onPosChange}
      onSizeChange={onSizeChange}
      title="갤러리 플로팅 창"
      onDragProgress={onDragProgress}
      toolbar={
        <div className="flex w-full flex-wrap items-center gap-1.5">
          {/* 상태 필터 Select */}
          <Select
            value={tb.statusFilter}
            onValueChange={(v: string) => {
              tb.setStatusFilter(
                v as "pending" | "approved" | "rejected" | "trashed" | "all"
              )
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

          {/* 뷰 모드 Select */}
          <Select
            value={tb.groupMode ? "group" : tb.viewMode}
            onValueChange={(v: string) => {
              if (v === "group") {
                tb.setGroupMode(true)
              } else {
                tb.setGroupMode(false)
                tb.setViewMode(v as "grid" | "compare")
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

          {/* 정렬 기준 Select */}
          <Select
            value={tb.sortKey}
            onValueChange={(k: string) => {
              if (tb.sortKey === k) {
                tb.setSortDir(tb.sortDir === "asc" ? "desc" : "asc")
              } else {
                tb.setSortKey(k as "createdAt" | "filename" | "sizeBytes")
                tb.setSortDir("desc")
              }
            }}
          >
            <SelectTrigger className="!h-7 w-[74px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
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

          {/* 정렬 방향 토글 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  tb.setSortDir(tb.sortDir === "asc" ? "desc" : "asc")
                }
                className="!h-7 !w-7 shrink-0 border-line bg-background p-0 shadow-none hover:bg-muted"
              >
                {tb.sortDir === "asc" ? (
                  <ArrowDown className="h-3.5 w-3.5" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs font-bold">
              정렬 방향 토글
            </TooltipContent>
          </Tooltip>

          {/* 썸네일 크기 조절 슬라이더 */}
          {(tb.groupMode || tb.viewMode === "grid") && (
            <div className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-background/50 px-1.5 shadow-none">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center text-muted-foreground">
                    <LayoutGrid className="h-3 w-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">
                  이미지 크기 조절
                </TooltipContent>
              </Tooltip>
              <input
                type="range"
                min="100"
                max="300"
                step="10"
                value={tb.thumbnailSize}
                onChange={(e) =>
                  tb.setThumbnailSize(Number(e.target.value))
                }
                className="h-1 w-12 cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
              />
              <span className="w-[34px] text-right font-mono text-[9px] font-bold whitespace-nowrap text-muted-foreground tabular-nums">
                {tb.thumbnailSize}px
              </span>
            </div>
          )}

          <div className="h-4 w-px shrink-0 bg-line/60" />

          {/* 새로고침 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="!h-7 !w-7 p-0"
                onClick={tb.handleRefresh}
              >
                <RefreshCwIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs font-bold">
              새로고침
            </TooltipContent>
          </Tooltip>

          {/* 내보내기 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="!h-7 !w-7 p-0"
                onClick={tb.handleExport}
              >
                <DownloadIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs font-bold">
              내보내기
            </TooltipContent>
          </Tooltip>

          {/* 휴지통 비우기 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="!h-7 !w-7 p-0 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                onClick={tb.handleEmptyTrash}
              >
                <Trash2Icon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-destructive-foreground bg-destructive text-xs font-bold">
              휴지통 비우기
            </TooltipContent>
          </Tooltip>

          {/* 검색 필터 토글 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={tb.showFilters ? "secondary" : "outline"}
                className="relative !h-7 !w-7 p-0"
                onClick={() => tb.setShowFilters(!tb.showFilters)}
              >
                <FilterIcon className="h-3.5 w-3.5" />
                {tb.hasAnyFilter && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs font-bold">
              검색 토글
            </TooltipContent>
          </Tooltip>

          {/* 검색창 조건부 렌더링 */}
          {tb.showFilters && (
            <div className="mt-1.5 flex w-full items-center gap-2 border-t border-line/40 pt-1.5">
              <div className="flex-1">
                <TagInputSearch
                  value={tb.searchInput}
                  tags={tb.searchTags}
                  candidates={tb.candidates.filter((c) => {
                    const valClean = tb.searchInput
                      .replace(/^[@#$]/, "")
                      .toLowerCase()
                    return c.value.toLowerCase().includes(valClean)
                  })}
                  placeholder="검색어 입력 (@파일명, #태그, $메타데이터)"
                  onValueChange={(val: string) => tb.setSearchInput(val)}
                  onAddTag={(tag: string) => {
                    if (!tb.searchTags.includes(tag)) {
                      tb.setSearchTags([...tb.searchTags, tag])
                    }
                    tb.setSearchInput("")
                  }}
                  onRemoveTag={(tag: string) => {
                    tb.setSearchTags(tb.searchTags.filter((t) => t !== tag))
                  }}
                  size="sm"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-1.5 text-[10px] font-bold text-muted-foreground"
                onClick={tb.clearAllFilters}
              >
                초기화
              </Button>
            </div>
          )}
        </div>
      }
    >
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
    </FloatingWindow>
  )
}