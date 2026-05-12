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

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  PinIcon,
  PinOffIcon,
  ColumnsIcon,
  Maximize2Icon,
  CheckSquareIcon,
  SquareIcon,
  XIcon,
  Trash2Icon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
} from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { CurationStatus, SavedImage } from "./Message"
import { curationApi, useSavedImages } from "./useSavedImages"
import { Magnifier } from "./CombinationPicker"

const PAGE_SIZE = 48

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

interface Props {
  backendUrl: string
}

const GROUP_PAGE_SIZE = 20

export function SavedImagesGallery({ backendUrl }: Props) {
  const [statusFilter, setStatusFilter] = useState<CurationStatus | "all">("pending")
  const [filenameFilter, setFilenameFilter] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const [metadataFilter, setMetadataFilter] = useState("")
  const [groupMode, setGroupMode] = useState(false)
  const [selected, setSelected] = useState<SavedImage | null>(null)
  const [page, setPage] = useState(1)
  const [hideRejected, setHideRejected] = useState(false)
  const [duplicateStrategy, setDuplicateStrategy] = useState<"hash" | "number">("hash")
  const [groupPage, setGroupPage] = useState(1)

  // 선택 모드
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(null)

  // 핀 고정 + 뷰 모드
  const [pinnedHashes, setPinnedHashes] = useState<string[]>([])
  const [galleryViewMode, setGalleryViewMode] = useState<GalleryViewMode>("grid")

  // 필터 변경 시 첫 페이지로
  useEffect(() => {
    setPage(1)
  }, [statusFilter, filenameFilter, tagFilter, metadataFilter])

  // 그룹 모드 전환 / 필터 변경 시 groupPage 초기화
  useEffect(() => {
    setGroupPage(1)
  }, [groupMode, statusFilter, filenameFilter, tagFilter, metadataFilter])

  const { images, groups, groupImagesMap, total, groupTotal, loading, error, reload } = useSavedImages({
    backendUrl,
    status: groupMode ? "all" : statusFilter,
    filename: filenameFilter || undefined,
    tag: tagFilter || undefined,
    page: groupMode ? 1 : page,
    pageSize: groupMode ? 500 : PAGE_SIZE,
    groupMode,
    groupPage,
    groupPageSize: GROUP_PAGE_SIZE,
  })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageList = useMemo(() => buildPageList(page, totalPages), [page, totalPages])

  const groupTotalPages = Math.max(1, Math.ceil(groupTotal / GROUP_PAGE_SIZE))
  const groupPageList = useMemo(() => buildPageList(groupPage, groupTotalPages), [groupPage, groupTotalPages])

  // total 변동으로 현재 page가 범위 밖이면 클램프
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  // groupTotal 변동으로 groupPage 범위 밖이면 클램프
  useEffect(() => {
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
    () => metadataFilteredImages.filter((img) => !hideRejected || img.status !== "rejected"),
    [metadataFilteredImages, hideRejected]
  )

  // 그룹 모드: groups + groupImagesMap 기반 visible 데이터
  const visibleGroups = useMemo(() => {
    if (!groupMode) return []
    const lowerMeta = metadataFilter.trim().toLowerCase() || null
    const result: { name: string; items: SavedImage[] }[] = []
    for (const g of groups) {
      let items = groupImagesMap.get(g.filename) ?? []
      if (metadataFilter.trim() && lowerMeta) {
        items = items.filter((img) => img.prompt.toLowerCase().includes(lowerMeta))
      }
      if (hideRejected) {
        items = items.filter((img) => img.status !== "rejected")
      }
      if (items.length > 0) {
        result.push({ name: g.filename, items })
      }
    }
    return result
  }, [groupMode, groups, groupImagesMap, metadataFilter, hideRejected])

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
        setBulkActionMessage(
          `${count}개 → ${STATUS_LABEL[targetStatus]} 완료`
        )
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as CurationStatus | "all")}
        >
          <TabsList>
            {(["all", "pending", "approved", "rejected", "trashed"] as const).map(
              (s) => (
                <TabsTrigger key={s} value={s}>
                  {STATUS_LABEL[s]}
                </TabsTrigger>
              )
            )}
          </TabsList>
        </Tabs>
        <Input
          className="h-8 w-48"
          type="search"
          placeholder="filename 필터"
          value={filenameFilter}
          onChange={(e) => setFilenameFilter(e.target.value)}
        />
        <Input
          className="h-8 w-40"
          type="search"
          placeholder="태그 필터"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
        <Input
          className="h-8 w-48"
          type="search"
          placeholder="메타데이터/prmpt 검색"
          value={metadataFilter}
          onChange={(e) => setMetadataFilter(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={hideRejected}
            onChange={(e) => setHideRejected(e.target.checked)}
            className="rounded"
          />
          리젝 숨기기
        </label>
        <Button
          size="sm"
          variant={groupMode ? "default" : "outline"}
          onClick={() => setGroupMode((v) => !v)}
        >
          {groupMode ? "그리드 모드" : "그룹 모드"}
        </Button>
        {/* 뷰 모드 토글 */}
        <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
          <Button
            size="sm"
            variant={galleryViewMode === "grid" ? "default" : "ghost"}
            className="h-7 px-2 text-[10px] font-bold"
            onClick={() => setGalleryViewMode("grid")}
          >
            <Maximize2Icon className="h-3 w-3 mr-1" />그리드
          </Button>
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <Button
                size="sm"
                variant={galleryViewMode === "compare" ? "default" : "ghost"}
                className="h-7 px-2 text-[10px] font-bold"
                onClick={() => setGalleryViewMode("compare")}
              >
                <ColumnsIcon className="h-3 w-3 mr-1" />비교
              </Button>
            </HoverCardTrigger>
            {pinnedHashes.length === 0 && (
              <HoverCardContent side="bottom" className="w-auto px-3 py-2 text-[11px] font-bold">
                이미지를 우클릭 → "비교에 추가"로 이미지를 먼저 고정하세요
              </HoverCardContent>
            )}
          </HoverCard>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border bg-background p-1">
            <select
              value={duplicateStrategy}
              onChange={(e) =>
                setDuplicateStrategy(e.target.value as "hash" | "number")
              }
              className="h-7 bg-transparent px-2 text-[10px] font-bold focus:outline-none"
            >
              <option value="hash">HASH</option>
              <option value="number">NUM</option>
            </select>
            <Button
              size="sm"
              className="h-7 text-[10px] font-black px-3"
              onClick={handleExport}
            >
              데이터셋 익스포트
            </Button>
          </div>
          <Button size="sm" variant="destructive" onClick={handleEmptyTrash}>
            휴지통 비우기
          </Button>
          <Button size="sm" variant="ghost" onClick={reload}>
            새로고침
          </Button>
        </div>
      </div>

      {/* 선택 모드 액션 바 */}
      {selectionMode && (
        <div className="flex items-center gap-3 rounded-lg border bg-blue-50/30 px-4 py-2.5">
          <span className="text-sm font-bold text-blue-700">
            {selectedHashes.size}개 이미지 선택됨
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-[10px] font-bold bg-green-600 hover:bg-green-700"
              onClick={() => handleBulkAction("approved")}
              disabled={bulkActionLoading}
            >
              <CheckIcon className="h-3.5 w-3.5" />
              일괄 통과
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-[10px] font-bold border-red-300 text-red-700 hover:bg-red-50"
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

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading &&
        ((!groupMode && visibleImages.length === 0) ||
          (groupMode && visibleGroups.length === 0)) && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>표시할 이미지가 없습니다</EmptyTitle>
              <EmptyDescription>
                잡을 실행하거나 필터 조건을 바꿔보세요.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

      {/* 비교 뷰 (그룹 모드 off + 비교 선택 시) */}
      {!groupMode && galleryViewMode === "compare" && pinnedHashes.length > 0 && (
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
                className="relative rounded-lg border overflow-hidden bg-black/5 shadow-inner"
              >
                <button
                  type="button"
                  onClick={() => togglePin(hash)}
                  className="absolute right-4 top-4 z-20 h-9 w-9 flex items-center justify-center rounded-full bg-blue-500 text-white shadow-xl"
                >
                  <PinIcon className="h-5 w-5" />
                </button>
                {img && (
                  <Magnifier src={`${backendUrl}/saved-images/${hash}`} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 그룹 모드 */}
      {groupMode ? (
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
                      onClick={() => groupPage > 1 && setGroupPage(groupPage - 1)}
                      aria-disabled={groupPage <= 1}
                      className={
                        groupPage <= 1 ? "pointer-events-none opacity-50" : undefined
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
                      onClick={() => groupPage < groupTotalPages && setGroupPage(groupPage + 1)}
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
      ) : galleryViewMode === "grid" || (galleryViewMode === "compare" && pinnedHashes.length === 0) ? (
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
        />
      ) : null}

      {!groupMode && galleryViewMode === "grid" && total > PAGE_SIZE && (
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
          backendUrl={backendUrl}
          image={selected}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}

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
}: GridProps) {
  if (items.length === 0) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((img) => {
        const isSelected = selectedHashes.has(img.hash)
        const isPinned = pinnedHashes.includes(img.hash)

        return (
          <ContextMenu key={img.hash}>
            <ContextMenuTrigger>
              <div
                className={`flex flex-col h-full gap-1 rounded-md border bg-card p-2 ${
                  isSelected ? "ring-2 ring-blue-500 bg-blue-50/30" : ""
                }`}
              >
                <div className="relative">
                  <button
                    type="button"
                    className="block w-full overflow-hidden rounded"
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
                      loading="lazy"
                      className="w-full object-cover aspect-square"
                    />
                  </button>

                  {/* 선택 체크박스 - 항상 표시 */}
                  <div
                    className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSelect?.(img.hash)
                    }}
                  >
                    {isSelected ? (
                      <CheckSquareIcon className="h-5 w-5 text-blue-500 drop-shadow-sm" />
                    ) : isPinned ? (
                      <PinIcon className="h-5 w-5 text-blue-400 drop-shadow-sm" />
                    ) : (
                      <SquareIcon className="h-5 w-5 text-white/70 drop-shadow-sm" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_TINT[img.status]}`}
                  >
                    {STATUS_LABEL[img.status]}
                  </span>
                  <span className="truncate font-mono">{img.originalFilename}</span>
                </div>
                {img.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {img.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-1 flex items-center justify-between gap-1">
                  <Button
                    size="sm"
                    variant={img.status === "approved" ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setStatus(img.hash, "approved")}
                  >
                    ✓
                  </Button>
                  <Button
                    size="sm"
                    variant={img.status === "rejected" ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setStatus(img.hash, "rejected")}
                  >
                    ✗
                  </Button>
                  <Button
                    size="sm"
                    variant={img.status === "trashed" ? "destructive" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setStatus(
                        img.hash,
                        img.status === "trashed" ? "pending" : "trashed"
                      )
                    }
                  >
                    🗑
                  </Button>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem
                onClick={() => togglePin?.(img.hash) }
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
                  setStatus(img.hash, img.status === "trashed" ? "pending" : "trashed")
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

  useEffect(() => {
    setNote(image.note)
    setTags(image.tags)
  }, [image.hash, image.note, image.tags])

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