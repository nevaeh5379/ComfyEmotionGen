/**
 * 영속 저장된 이미지 큐레이션 갤러리.
 *
 * 기능:
 *  - 상태 필터 (pending/approved/rejected/trashed/all)
 *  - filename 필터, 태그 필터, 메타데이터 필터
 *  - 그리드/그룹 모드 토글
 *  - 통과(approved)/탈락(rejected)/휴지통(trashed) 액션
 *  - 선택 모드 + 일괄 작업 (approve/reject/trash)
 *  - 핀 고정 비교 뷰
 *  - 토너먼트 뷰 (이상형 월드컵)
 *  - 리젝 숨기기
 *  - 노트 + 태그 인라인 편집
 *  - 데이터셋 익스포트 (zip 다운로드) + duplicateStrategy
 *  - 휴지통 비우기, filename 그룹 재생성
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useRenderLog } from "@/lib/renderLogger"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  PinIcon,
  PinOffIcon,
  CheckSquareIcon,
  SquareIcon,
  XIcon,
  Trash2Icon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  FilterIcon,
  MoreVertical,
  RefreshCwIcon,
  DownloadIcon,
} from "lucide-react"
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
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { CurationStatus, SavedImage } from "../types/Message"
import { curationApi, useSavedImages } from "../hooks/useSavedImages"
import { Magnifier } from "./combinationpicker/CombinationPickerViews"

type GalleryViewMode = "grid" | "compare"

/** 1..totalPages를 ellipsis와 함께 압축. 현재 페이지 ±1 표시. */
function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 1) return [1]
  const pages = new Set<number>([1, totalPages, current])
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i)
  }
  const sorted = Array.from(pages).sort((a, b) => a - b)
  const out: (number | "…")[] = []
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]!)
    if (i < sorted.length - 1 && sorted[i + 1]! - sorted[i]! > 1) out.push("…")
  }
  return out
}

const STATUS_LABEL: Record<CurationStatus | "all", string> = {
  all: "전체",
  pending: "대기",
  approved: "통과",
  rejected: "탈락",
  trashed: "휴지통",
}

const STATUS_TINT: Record<CurationStatus, string> = {
  pending: "bg-slate-200 text-slate-800",
  approved: "bg-green-200 text-green-900",
  rejected: "bg-red-200 text-red-900",
  trashed: "bg-zinc-300 text-zinc-700",
}

export interface GalleryToolbarState {
  statusFilter: CurationStatus | "all"
  setStatusFilter: (v: CurationStatus | "all") => void
  galleryViewMode: GalleryViewMode
  setGalleryViewMode: (v: GalleryViewMode) => void
  groupMode: boolean
  setGroupMode: (v: boolean) => void
  showFilters: boolean
  setShowFilters: (v: boolean) => void
  hasAnyFilter: boolean
  hideRejected: boolean
  setHideRejected: (v: boolean) => void
  clearAllFilters: () => void
  reload: () => void
  handleExport: () => void
  handleEmptyTrash: () => void
}

interface Props {
  backendUrl: string
  enableHover?: boolean
  imagePageSize?: 24 | 48 | 96
  imageLazyLoad?: boolean
  toolbarState?: GalleryToolbarState
}

const DEFAULT_PAGE_SIZE = 48
const GROUP_PAGE_SIZE = 20

export const SavedImagesGallery = memo(function SavedImagesGallery({
  backendUrl,
  enableHover = true,
  imagePageSize = DEFAULT_PAGE_SIZE,
  imageLazyLoad = true,
  toolbarState,
}: Props) {
  useRenderLog("SavedImagesGallery")
  const [statusFilter, setStatusFilterState] = useState<CurationStatus | "all">(
    "pending"
  )
  const [filenameFilter, setFilenameFilterState] = useState("")
  const [tagFilter, setTagFilterState] = useState("")
  const [metadataFilter, setMetadataFilterState] = useState("")
  const [groupMode, setGroupModeState] = useState(false)
  const [selected, setSelected] = useState<SavedImage | null>(null)
  const [page, setPage] = useState(1)
  const [hideRejected, setHideRejected] = useState(false)
  const [duplicateStrategy, setDuplicateStrategy] = useState<"hash" | "number">(
    "hash"
  )
  const [groupPage, setGroupPage] = useState(1)

  // 필터 변경 시 page/groupPage도 함께 1로 초기화하는 래퍼
  const setStatusFilter = (v: CurationStatus | "all") => {
    setStatusFilterState(v)
    setPage(1)
    setGroupPage(1)
  }
  const setFilenameFilter = (v: string) => {
    setFilenameFilterState(v)
    setPage(1)
    setGroupPage(1)
  }
  const setTagFilter = (v: string) => {
    setTagFilterState(v)
    setPage(1)
    setGroupPage(1)
  }
  const setMetadataFilter = (v: string) => {
    setMetadataFilterState(v)
    setPage(1)
    setGroupPage(1)
  }
  const setGroupMode = (v: boolean) => {
    setGroupModeState(v)
    setGroupPage(1)
  }

  // 선택 모드
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(
    null
  )

  // 핀 고정 + 뷰 모드
  const [pinnedHashes, setPinnedHashes] = useState<string[]>([])
  const [galleryViewMode, setGalleryViewMode] =
    useState<GalleryViewMode>("grid")
  const [showFilters, setShowFilters] = useState(false)

  // When toolbarState is provided (from App.tsx nav bar), use those values
  const effectiveStatusFilter = toolbarState
    ? toolbarState.statusFilter
    : statusFilter
  const effectiveGroupMode = toolbarState ? toolbarState.groupMode : groupMode
  const effectiveHideRejected = toolbarState
    ? toolbarState.hideRejected
    : hideRejected
  const effectiveGalleryViewMode = toolbarState
    ? toolbarState.galleryViewMode
    : galleryViewMode

  const {
    images,
    groups,
    groupImagesMap,
    total,
    groupTotal,
    loading,
    error,
    reload,
  } = useSavedImages({
    backendUrl,
    status: effectiveGroupMode ? "all" : effectiveStatusFilter,
    filename: filenameFilter || undefined,
    tag: tagFilter || undefined,
    page: effectiveGroupMode ? 1 : page,
    pageSize: effectiveGroupMode ? 500 : imagePageSize,
    groupMode: effectiveGroupMode,
    groupPage,
    groupPageSize: GROUP_PAGE_SIZE,
  })

  const totalPages = Math.max(1, Math.ceil(total / imagePageSize))
  const pageList = useMemo(
    () => buildPageList(page, totalPages),
    [page, totalPages]
  )

  const groupTotalPages = Math.max(1, Math.ceil(groupTotal / GROUP_PAGE_SIZE))
  const groupPageList = useMemo(
    () => buildPageList(groupPage, groupTotalPages),
    [groupPage, groupTotalPages]
  )

  // total 변동으로 현재 page가 범위 밖이면 클램프
  // (totalPages는 비동기 API 결과에서 파생되므로 렌더 중 파생값으로 처리할 수 없음)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  // groupTotal 변동으로 groupPage 범위 밖이면 클램프
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (groupPage > groupTotalPages) setGroupPage(groupTotalPages)
  }, [groupPage, groupTotalPages])

  // 메타데이터로 필터링된 이미지 (그리드 모드 전용)
  const metadataFilteredImages = useMemo(() => {
    if (!metadataFilter.trim()) return images
    const lowerFilter = metadataFilter.toLowerCase().trim()
    return images.filter((img) => {
      const prompt = img.prompt.toLowerCase()
      return prompt.includes(lowerFilter)
    })
  }, [images, metadataFilter])

  // 리젝 숨기기 적용
  const visibleImages = useMemo(
    () =>
      metadataFilteredImages.filter(
        (img) => !effectiveHideRejected || img.status !== "rejected"
      ),
    [metadataFilteredImages, effectiveHideRejected]
  )

  // 그룹 모드: groups + groupImagesMap 기반 visible 데이터
  const visibleGroups = useMemo(() => {
    if (!effectiveGroupMode) return []
    const lowerMeta = metadataFilter.trim().toLowerCase() || null
    const result: { name: string; items: SavedImage[] }[] = []
    for (const g of groups) {
      let items = groupImagesMap.get(g.filename) ?? []
      if (metadataFilter.trim() && lowerMeta) {
        items = items.filter((img) =>
          img.prompt.toLowerCase().includes(lowerMeta)
        )
      }
      if (effectiveHideRejected) {
        items = items.filter((img) => img.status !== "rejected")
      }
      if (items.length > 0) {
        result.push({ name: g.filename, items })
      }
    }
    return result
  }, [
    effectiveGroupMode,
    groups,
    groupImagesMap,
    metadataFilter,
    effectiveHideRejected,
  ])

  const setStatus = async (hash: string, status: CurationStatus) => {
    try {
      await curationApi.patchStatus(backendUrl, hash, status)
      reload()
    } catch (err) {
      console.error("setStatus failed", err)
    }
  }

  // 선택 모드 토글
  const toggleSelectHash = useCallback((hash: string) => {
    setSelectedHashes((prev) => {
      const next = new Set(prev)
      if (next.has(hash)) {
        next.delete(hash)
        if (next.size === 0) setSelectionMode(false)
      } else {
        next.add(hash)
        setSelectionMode(true)
      }
      return next
    })
  }, [])

  const handleLongPress = useCallback(
    (hash: string) => {
      if (!selectionMode) {
        setSelectionMode(true)
        setSelectedHashes(new Set([hash]))
      }
    },
    [selectionMode]
  )

  const selectAll = useCallback(() => {
    const allHashes = visibleImages.map((img) => img.hash)
    if (selectedHashes.size === allHashes.length && allHashes.length > 0) {
      setSelectedHashes(new Set())
      setSelectionMode(false)
    } else {
      setSelectedHashes(new Set(allHashes))
    }
  }, [visibleImages, selectedHashes])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedHashes(new Set())
  }, [])

  // 일괄 상태 변경
  const handleBulkAction = useCallback(
    async (targetStatus: CurationStatus) => {
      if (bulkActionLoading || selectedHashes.size === 0) return
      setBulkActionLoading(true)
      setBulkActionMessage(null)
      let count = 0
      try {
        for (const hash of selectedHashes) {
          await curationApi.patchStatus(backendUrl, hash, targetStatus)
          count++
        }
        setBulkActionMessage(`${count}개 → ${STATUS_LABEL[targetStatus]} 완료`)
        exitSelectionMode()
        setTimeout(() => setBulkActionMessage(null), 3000)
        reload()
      } catch {
        setBulkActionMessage("일괄 작업 실패")
        setTimeout(() => setBulkActionMessage(null), 3000)
      } finally {
        setBulkActionLoading(false)
      }
    },
    [backendUrl, selectedHashes, bulkActionLoading, exitSelectionMode, reload]
  )

  const handleEmptyTrash = async () => {
    if (!confirm("휴지통의 이미지를 영구 삭제합니다. 계속하시겠습니까?")) return
    try {
      const n = await curationApi.emptyTrash(backendUrl)
      alert(`${n}개 영구 삭제됨`)
      reload()
    } catch (err) {
      console.error(err)
    }
  }

  const handleExport = async () => {
    try {
      await curationApi.exportDataset(backendUrl, {
        status: "approved",
        duplicateStrategy,
      })
    } catch (err) {
      console.error(err)
    }
  }

  const handleRegenerate = async (filename: string) => {
    const raw = prompt(`'${filename}' 그룹에 몇 장을 추가 생성할까요?`, "4")
    if (!raw) return
    const count = Number(raw)
    if (!Number.isFinite(count) || count < 1) return
    try {
      await curationApi.regenerate(backendUrl, filename, count, "random")
    } catch (err) {
      console.error(err)
    }
  }

  const togglePin = useCallback((hash: string) => {
    setPinnedHashes((prev) =>
      prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash]
    )
  }, [])

  const hasAnyFilter = useMemo(
    () =>
      !!(
        filenameFilter.trim() ||
        tagFilter.trim() ||
        metadataFilter.trim() ||
        effectiveHideRejected
      ),
    [filenameFilter, tagFilter, metadataFilter, effectiveHideRejected]
  )

  return (
    <div className="flex flex-col">
      {/* ── Sticky Toolbar Header (내부 렌더링: toolbarState 없을 때만) ── */}
      {!toolbarState && (
        <div className="sticky top-0 z-40 shrink-0 border-b border-line bg-panel px-4 py-2">
          {/* Single row: 4 consolidated items */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: Status filter + View mode */}
            <div className="flex items-center gap-2">
              {/* 1. Status filter dropdown */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[80px] border-line bg-background px-2 text-[11px] font-bold shadow-none focus:ring-0">
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
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 2. View mode dropdown (group toggle + grid/compare) */}
              <Select
                value={groupMode ? "group" : galleryViewMode}
                onValueChange={(v) => {
                  if (v === "group") {
                    setGroupMode(true)
                  } else {
                    setGroupMode(false)
                    setGalleryViewMode(v as GalleryViewMode)
                  }
                }}
              >
                <SelectTrigger className="h-8 w-[70px] border-line bg-background px-2 text-[11px] font-bold shadow-none focus:ring-0">
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
            </div>

            {/* Right: Filter + More actions */}
            <div className="flex items-center gap-2">
              {/* 3. Filter button */}
              <Button
                size="sm"
                variant={showFilters ? "secondary" : "outline"}
                onClick={() => setShowFilters(!showFilters)}
                className="relative h-8 w-8 p-0"
              >
                <FilterIcon className="h-4 w-4" />
                {hasAnyFilter && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary"></span>
                  </span>
                )}
              </Button>

              {/* 4. More actions dropdown (export, strategy, reload, trash) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[180px]">
                  <DropdownMenuLabel className="text-[11px] font-bold">
                    내보내기
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={async () => {
                      setDuplicateStrategy("hash")
                      await handleExport()
                    }}
                    className="text-[12px] font-bold"
                  >
                    <DownloadIcon className="mr-2 h-3.5 w-3.5" />
                    HASH 기반
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      setDuplicateStrategy("number")
                      await handleExport()
                    }}
                    className="text-[12px] font-bold"
                  >
                    <DownloadIcon className="mr-2 h-3.5 w-3.5" />
                    NUM 기반
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={reload}>
                    <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
                    새로고침
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleEmptyTrash}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash2Icon className="mr-2 h-3.5 w-3.5" />
                    휴지통 비우기
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* ── Collapsible Filters ── */}
          {showFilters && (
            <div className="mt-3 flex animate-in flex-col gap-3 rounded-md border bg-muted/10 px-3 py-3 duration-200 fade-in slide-in-from-top-1 md:flex-row md:items-center">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">
                  검색
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center">
                  <Input
                    className="h-9 w-full text-sm md:h-7 md:w-40 md:text-xs"
                    type="search"
                    placeholder="파일명 필터"
                    value={filenameFilter}
                    onChange={(e) => setFilenameFilter(e.target.value)}
                  />
                  <Input
                    className="h-9 w-full text-sm md:h-7 md:w-36 md:text-xs"
                    type="search"
                    placeholder="태그 필터"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                  />
                  <Input
                    className="h-9 w-full text-sm sm:col-span-2 md:h-7 md:w-48 md:text-xs"
                    type="search"
                    placeholder="메타데이터/prompt 검색"
                    value={metadataFilter}
                    onChange={(e) => setMetadataFilter(e.target.value)}
                  />
                </div>
              </div>

              <div className="hidden h-4 w-px bg-line md:block" />

              <div className="flex items-center justify-between border-t border-line/40 pt-2 md:border-0 md:pt-0">
                <div className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    id="hide-rejected"
                    checked={hideRejected}
                    onCheckedChange={(v) => setHideRejected(v === true)}
                  />
                  <Label
                    htmlFor="hide-rejected"
                    className="cursor-pointer text-xs font-bold text-muted-foreground md:text-[11px]"
                  >
                    리젝 숨기기
                  </Label>
                </div>

                <div className="md:ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs font-bold text-muted-foreground md:h-7 md:text-[10px]"
                    onClick={() => {
                      setFilenameFilter("")
                      setTagFilter("")
                      setMetadataFilter("")
                      setHideRejected(false)
                    }}
                  >
                    <XIcon className="mr-1 h-3.5 w-3.5 md:h-3 md:w-3" />
                    필터 초기화
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 선택 모드 액션 바 */}
          {selectionMode && (
            <div className="mt-2 flex items-center gap-3 rounded-lg border bg-blue-50/30 px-4 py-2.5">
              <span className="text-sm font-bold text-blue-700">
                {selectedHashes.size}개 이미지 선택됨
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-green-600 text-[10px] font-bold hover:bg-green-700"
                  onClick={() => handleBulkAction("approved")}
                  disabled={bulkActionLoading}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  일괄 통과
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-red-300 text-[10px] font-bold text-red-700 hover:bg-red-50"
                  onClick={() => handleBulkAction("rejected")}
                  disabled={bulkActionLoading}
                >
                  <XIcon className="h-3.5 w-3.5" />
                  일괄 탈락
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-[10px] font-bold"
                  onClick={() => handleBulkAction("trashed")}
                  disabled={bulkActionLoading}
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                  일괄 휴지통
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-[10px] font-bold text-muted-foreground"
                onClick={exitSelectionMode}
              >
                <XIcon className="h-3.5 w-3.5" />
                선택 종료
              </Button>
              {bulkActionMessage && (
                <span className="text-xs font-bold text-blue-600">
                  {bulkActionMessage}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Scrollable Content ── */}
      <div className="flex-1 px-4">
        {error && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading &&
          ((!effectiveGroupMode && visibleImages.length === 0) ||
            (effectiveGroupMode && visibleGroups.length === 0)) && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>표시할 이미지가 없습니다</EmptyTitle>
                <EmptyDescription>
                  작업을 실행하거나 필터 조건을 바꿔보세요.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

        {/* 비교 뷰 (그룹 모드 off + 비교 선택 시) */}
        {!effectiveGroupMode &&
          effectiveGalleryViewMode === "compare" &&
          pinnedHashes.length > 0 && (
            <div
              className={`grid gap-3 ${
                pinnedHashes.length === 1
                  ? "grid-cols-1"
                  : pinnedHashes.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3"
              }`}
              style={{ minHeight: 400 }}
            >
              {pinnedHashes.map((hash) => {
                const img = visibleImages.find((i) => i.hash === hash)
                return (
                  <div
                    key={hash}
                    className="relative overflow-hidden rounded-lg border bg-black/5 shadow-inner"
                  >
                    <button
                      type="button"
                      onClick={() => togglePin(hash)}
                      className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl"
                    >
                      <PinIcon className="h-5 w-5" />
                    </button>
                    {img &&
                      (enableHover ? (
                        <Magnifier src={`${backendUrl}/saved-images/${hash}`} />
                      ) : (
                        <img
                          src={`${backendUrl}/saved-images/${hash}`}
                          className="max-h-full max-w-full object-contain"
                          alt=""
                        />
                      ))}
                  </div>
                )
              })}
            </div>
          )}

        {/* 그룹 모드 */}
        {effectiveGroupMode ? (
          <div className="flex flex-col gap-4">
            {visibleGroups.map(({ name, items }) => {
              const groupMeta = groups.find((g) => g.filename === name)
              return (
                <div key={name} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      총 {groupMeta?.total ?? items.length} · 통과{" "}
                      {groupMeta?.approvedCount ?? 0} · 탈락{" "}
                      {groupMeta?.rejectedCount ?? 0} · 휴지통{" "}
                      {groupMeta?.trashedCount ?? 0}
                    </span>
                    <div className="ml-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRegenerate(name)}
                      >
                        재생성
                      </Button>
                    </div>
                  </div>
                  <ImageGrid
                    items={items}
                    backendUrl={backendUrl}
                    setStatus={setStatus}
                    onOpen={setSelected}
                    selectionMode={selectionMode}
                    selectedHashes={selectedHashes}
                    onToggleSelect={toggleSelectHash}
                    onLongPress={handleLongPress}
                    togglePin={togglePin}
                    pinnedHashes={pinnedHashes}
                    imageLazyLoad={imageLazyLoad}
                  />
                </div>
              )
            })}

            {/* 그룹 페이지네이션 */}
            {groupTotal > GROUP_PAGE_SIZE && (
              <div className="flex flex-col items-center gap-2">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() =>
                          groupPage > 1 && setGroupPage(groupPage - 1)
                        }
                        aria-disabled={groupPage <= 1}
                        className={
                          groupPage <= 1
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                      />
                    </PaginationItem>
                    {groupPageList.map((p, i) =>
                      p === "…" ? (
                        <PaginationItem key={`ge-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <PaginationLink
                            isActive={p === groupPage}
                            onClick={() => setGroupPage(p)}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() =>
                          groupPage < groupTotalPages &&
                          setGroupPage(groupPage + 1)
                        }
                        aria-disabled={groupPage >= groupTotalPages}
                        className={
                          groupPage >= groupTotalPages
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
                <p className="text-xs text-muted-foreground">
                  총 {groupTotal}개 그룹 · {groupPage}/{groupTotalPages} 페이지
                </p>
              </div>
            )}
          </div>
        ) : effectiveGalleryViewMode === "grid" ||
          (effectiveGalleryViewMode === "compare" &&
            pinnedHashes.length === 0) ? (
          <ImageGrid
            items={visibleImages}
            backendUrl={backendUrl}
            setStatus={setStatus}
            onOpen={setSelected}
            selectionMode={selectionMode}
            selectedHashes={selectedHashes}
            onToggleSelect={toggleSelectHash}
            onLongPress={handleLongPress}
            togglePin={togglePin}
            pinnedHashes={pinnedHashes}
            imageLazyLoad={imageLazyLoad}
          />
        ) : null}

        {!effectiveGroupMode &&
          effectiveGalleryViewMode === "grid" &&
          total > imagePageSize && (
            <div className="flex flex-col items-center gap-2">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => page > 1 && setPage(page - 1)}
                      aria-disabled={page <= 1}
                      className={
                        page <= 1 ? "pointer-events-none opacity-50" : undefined
                      }
                    />
                  </PaginationItem>
                  {pageList.map((p, i) =>
                    p === "…" ? (
                      <PaginationItem key={`e-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === page}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => page < totalPages && setPage(page + 1)}
                      aria-disabled={page >= totalPages}
                      className={
                        page >= totalPages
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <p className="text-xs text-muted-foreground">
                총 {total}개 · {page}/{totalPages} 페이지
              </p>
              {selectionMode && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] font-bold"
                    onClick={selectAll}
                  >
                    {selectedHashes.size === visibleImages.length &&
                    visibleImages.length > 0
                      ? "전체 해제"
                      : "전체 선택"}
                  </Button>
                </div>
              )}
            </div>
          )}

        {selected && (
          <ImageDetail
            key={selected.hash}
            backendUrl={backendUrl}
            image={selected}
            onClose={() => setSelected(null)}
            onChanged={reload}
          />
        )}
      </div>
    </div>
  )
})

interface GridProps {
  items: SavedImage[]
  backendUrl: string
  setStatus: (hash: string, status: CurationStatus) => void
  onOpen: (img: SavedImage) => void
  selectionMode?: boolean
  selectedHashes?: Set<string>
  onToggleSelect?: (hash: string) => void
  onLongPress?: (hash: string) => void
  togglePin?: (hash: string) => void
  pinnedHashes?: string[]
  imageLazyLoad?: boolean
}

function ImageGrid({
  items,
  backendUrl,
  setStatus,
  onOpen,
  selectionMode = false,
  selectedHashes = new Set(),
  onToggleSelect,
  // onLongPress,
  togglePin,
  pinnedHashes = [],
  imageLazyLoad = true,
}: GridProps) {
  if (items.length === 0) return null
  return (
    <div className="columns-2 gap-3 sm:gap-4 md:columns-3 lg:columns-4 xl:columns-5">
      {items.map((img) => {
        const isSelected = selectedHashes.has(img.hash)
        const isPinned = pinnedHashes.includes(img.hash)

        return (
          <ContextMenu key={img.hash}>
            <ContextMenuTrigger>
              <div
                className={`m-1 flex break-inside-avoid flex-col rounded-lg border bg-card transition-all hover:shadow-md ${
                  isSelected
                    ? "scale-[1.02] bg-primary/5 shadow-lg ring-2 ring-primary"
                    : ""
                }`}
              >
                <div className="relative">
                  <button
                    type="button"
                    className="group block h-full w-full overflow-hidden rounded-md"
                    onClick={() => {
                      if (isSelected || selectionMode) {
                        onToggleSelect?.(img.hash)
                      } else {
                        onOpen(img)
                      }
                    }}
                  >
                    <img
                      src={`${backendUrl}/saved-images/${img.hash}`}
                      alt={img.originalFilename}
                      loading={imageLazyLoad ? "lazy" : "eager"}
                      className="w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>

                  {/* 체크박스 - 왼쪽 위 (모바일/데스크톱 모두) */}
                  <div
                    className="absolute top-2 left-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/40 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSelect?.(img.hash)
                    }}
                  >
                    {isSelected ? (
                      <CheckSquareIcon className="h-5 w-5 text-blue-400 drop-shadow-sm" />
                    ) : isPinned ? (
                      <PinIcon className="h-4 w-4 text-amber-400 drop-shadow-sm" />
                    ) : (
                      <SquareIcon className="h-5 w-5 text-white/60 drop-shadow-sm" />
                    )}
                  </div>

                  {/* 상태 라벨 - 왼쪽 위 (데스크톱만) */}
                  <span
                    className={`absolute top-2 left-10 hidden rounded-full px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase shadow-sm backdrop-blur-sm md:inline ${STATUS_TINT[img.status]}`}
                  >
                    {STATUS_LABEL[img.status]}
                  </span>

                  {/* 휴지통 버튼 - 오른쪽 위 (데스크톱만) */}
                  <button
                    type="button"
                    className={`absolute top-2 right-2 hidden h-7 w-7 items-center justify-center rounded-md bg-black/40 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60 md:flex ${
                      img.status === "trashed"
                        ? "text-red-400"
                        : "text-white/60 hover:text-white"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setStatus(
                        img.hash,
                        img.status === "trashed" ? "pending" : "trashed"
                      )
                    }}
                    title={img.status === "trashed" ? "복원" : "휴지통"}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>

                  {/* 통과/탈락 버튼 - 이미지 하단 오버레이 */}
                  <div className="absolute right-2 bottom-2 left-2 flex rounded-md bg-black/50 backdrop-blur-sm">
                    <button
                      type="button"
                      className={`flex flex-1 items-center justify-center rounded-l-md py-2 transition-colors ${
                        img.status === "approved"
                          ? "bg-green-600 text-white"
                          : "bg-white/10 text-white/80 hover:bg-green-600 hover:text-white"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setStatus(img.hash, "approved")
                      }}
                    >
                      <CheckIcon className="h-5 w-5" strokeWidth={3} />
                    </button>
                    <button
                      type="button"
                      className={`flex flex-1 items-center justify-center rounded-r-md border-l py-2 transition-colors ${
                        img.status === "rejected"
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-white/20 bg-white/10 text-white/80 hover:bg-red-600 hover:text-white"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setStatus(img.hash, "rejected")
                      }}
                    >
                      <XIcon className="h-5 w-5" strokeWidth={3} />
                    </button>
                  </div>
                </div>

                {/* 태그 (데스크톱만) */}
                {img.tags.length > 0 && (
                  <div className="hidden flex-wrap gap-1 px-0.5 md:flex">
                    {img.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-line/20 bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/80"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem
                onClick={() => togglePin?.(img.hash)}
                className="gap-2 font-bold"
              >
                {isPinned ? (
                  <>
                    <PinOffIcon className="h-3.5 w-3.5" />
                    비교에서 제거
                  </>
                ) : (
                  <>
                    <PinIcon className="h-3.5 w-3.5" />
                    비교에 추가
                  </>
                )}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => setStatus(img.hash, "approved")}
                className="gap-2 font-bold text-green-700"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                통과
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => setStatus(img.hash, "rejected")}
                className="gap-2 font-bold text-red-700"
              >
                <XIcon className="h-3.5 w-3.5" />
                탈락
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() =>
                  setStatus(
                    img.hash,
                    img.status === "trashed" ? "pending" : "trashed"
                  )
                }
                className="gap-2 font-bold"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                {img.status === "trashed" ? "복원" : "휴지통"}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => onOpen(img)}
                className="gap-2 font-bold"
              >
                <EyeIcon className="h-3.5 w-3.5" />
                상세 보기
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  const url = `${backendUrl}/saved-images/${img.hash}`
                  navigator.clipboard.writeText(url).catch(() => {})
                }}
                className="gap-2 font-bold"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                이미지 URL 복사
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </div>
  )
}

interface DetailProps {
  backendUrl: string
  image: SavedImage
  onClose: () => void
  onChanged: () => void
}

function ImageDetail({ backendUrl, image, onClose, onChanged }: DetailProps) {
  const [note, setNote] = useState(image.note)
  const [newTag, setNewTag] = useState("")
  const [tags, setTags] = useState<string[]>(image.tags)

  const saveNote = async () => {
    await curationApi.patchNote(backendUrl, image.hash, note)
    onChanged()
  }
  const addTag = async () => {
    const t = newTag.trim()
    if (!t) return
    await curationApi.addTags(backendUrl, image.hash, [t])
    setNewTag("")
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
    onChanged()
  }
  const removeTag = async (tag: string) => {
    await curationApi.removeTag(backendUrl, image.hash, tag)
    setTags((prev) => prev.filter((x) => x !== tag))
    onChanged()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col gap-3 overflow-auto rounded-lg bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TINT[image.status]}`}
          >
            {STATUS_LABEL[image.status]}
          </span>
          <h3 className="truncate font-mono text-sm">
            {image.originalFilename}
          </h3>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={onClose}
          >
            닫기
          </Button>
        </div>
        <img
          src={`${backendUrl}/saved-images/${image.hash}`}
          alt={image.originalFilename}
          className="max-h-[60vh] w-full object-contain"
        />
        <div className="space-y-1 text-xs">
          <div className="font-mono text-muted-foreground">
            hash: {image.hash}
          </div>
          <div>
            <span className="font-semibold">prompt:</span> {image.prompt}
          </div>
          <div className="text-muted-foreground">
            {(image.sizeBytes / 1024).toFixed(1)} KB · worker{" "}
            {image.workerId ?? "—"}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold">노트</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <Button size="sm" variant="outline" onClick={saveNote}>
            노트 저장
          </Button>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold">태그</label>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-destructive/20"
                onClick={() => removeTag(t)}
                title="클릭하여 제거"
              >
                #{t} ×
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-48"
              placeholder="새 태그"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag()
              }}
            />
            <Button size="sm" variant="outline" onClick={addTag}>
              추가
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
