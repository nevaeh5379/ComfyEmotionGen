/**
 * 영속 저장된 이미지 갤러리 뷰어.
 *
 * 기능:
 *  - 상태 필터 (pending/approved/rejected/trashed/all) — 읽기 전용 뷰
 *  - filename 필터, 태그 필터, 메타데이터 필터
 *  - 그리드/그룹/비교 모드 토글
 *  - 휴지통(trashed) 액션
 *  - 선택 모드 + 일괄 휴지통
 *  - 핀 고정 비교 뷰
 *  - 리젝 숨기기
 *  - 노트 + 태그 인라인 편집
 *  - 데이터셋 익스포트 (zip 다운로드) + duplicateStrategy
 *  - 휴지통 비우기, filename 그룹 재생성
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRenderLog } from "@/lib/renderLogger"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircleIcon,
  ChevronDown,
  ChevronUp,
  DownloadIcon,
  LayoutGrid,
  PinIcon,
  RotateCcwIcon,
  XCircleIcon,
  XIcon,
  FilterIcon,
  MoreVertical,
  RefreshCwIcon,
  Trash2Icon,
  Folder,
  FolderOpen,
  Home,
  Search,
  FolderPlus,
  Copy,
  Scissors,
  Eye,
} from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { CurationStatus, SavedImage } from "../types/Message"
import { STATUS_LABEL } from "../types/Message"
import { curationApi, useSavedImages } from "../hooks/useSavedImages"
import { downloadImagesAsZip, getImageFilename } from "../utils/downloadImages"
import { Magnifier } from "./combinationpicker/CombinationPickerViews"
import { useConfirm } from "@/comfyui/hooks/useConfirm"
import { toast } from "sonner"
import { ImageGrid } from "./gallery/ImageGrid"
import { ImageDetail } from "./gallery/ImageDetail"
import { Kbd } from "@/components/ui/kbd"

type GalleryViewMode = "grid" | "compare"
type GallerySortKey = "createdAt" | "filename" | "sizeBytes"

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
  sortKey: GallerySortKey
  setSortKey: (k: GallerySortKey) => void
  sortDir: "asc" | "desc"
  setSortDir: (d: "asc" | "desc") => void
  clearAllFilters: () => void
  reload: () => void
  handleExport: () => void
  handleEmptyTrash: () => void
  thumbnailSize?: number
  setThumbnailSize?: (v: number) => void
}

interface Props {
  backendUrl: string
  enableHover?: boolean
  imagePageSize?: 24 | 48 | 96
  imageLazyLoad?: boolean
  toolbarState?: GalleryToolbarState
  filenameFilter?: string
  tagFilter?: string
  metadataFilter?: string
  generalFilters?: string[]
  onTokensExtracted?: (
    tokens: { value: string; type: "filename" | "tag" | "metadata" }[]
  ) => void
  /** Callback to register the gallery's reload function for external triggers (Header dropdown, keyboard shortcuts) */
  onReloadReady?: (reload: () => void) => void
  /** 단일 이미지 다운로드 방식 */
  singleDownloadMode?: "newtab" | "direct"
}

const DEFAULT_PAGE_SIZE = 48
const GROUP_PAGE_SIZE = 20

export const SavedImagesGallery = memo(function SavedImagesGallery({
  backendUrl,
  enableHover = true,
  imagePageSize = DEFAULT_PAGE_SIZE,
  imageLazyLoad = true,
  toolbarState,
  filenameFilter,
  tagFilter,
  metadataFilter,
  generalFilters,
  onTokensExtracted,
  onReloadReady,
  singleDownloadMode,
}: Props) {
  useRenderLog("SavedImagesGallery")
  const confirm = useConfirm()
  const [statusFilter, setStatusFilterState] = useState<CurationStatus | "all">(
    "pending"
  )
  const [localFilenameFilter, setFilenameFilterState] = useState("")
  const [localTagFilter, setTagFilterState] = useState("")
  const [localMetadataFilter, setMetadataFilterState] = useState("")
  const [groupMode, setGroupModeState] = useState(false)
  const [selected, setSelected] = useState<SavedImage | null>(null)
  const [focusedHash, setFocusedHash] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hideRejected, setHideRejected] = useState(false)
  const [sortKey, setSortKeyLocal] = useState<GallerySortKey>("createdAt")
  const [sortDir, setSortDirLocal] = useState<"asc" | "desc">("desc")

  const [groupPage, setGroupPage] = useState(1)

  // 그룹 접기/펴기 상태
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroupCollapse = (name: string) =>
    setCollapsedGroups((prev) =>
      prev.has(name)
        ? new Set([...prev].filter((a) => a !== name))
        : new Set([...prev, name])
    )
  const collapseAll = () =>
    setCollapsedGroups(new Set(groups.map((g) => g.filename)))
  const expandAll = () => setCollapsedGroups(new Set())

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
  const [bulkDownloadLoading, setBulkDownloadLoading] = useState(false)

  // ── Breadcrumb tag folder navigation states ──
  const [breadcrumbTags, setBreadcrumbTags] = useState<string[]>([])
  const [subTagQuery, setSubTagQuery] = useState("")

  // Dynamic token extractor
  const getTokens = useCallback((img: SavedImage): string[] => {
    const tokensSet = new Set<string>()
    const fn = img.originalFilename || img.comfyFilename || ""
    const fnWithoutExt = fn.replace(/\.[^/.]+$/, "")
    fnWithoutExt.split(/[_\s-]+/).forEach((token) => {
      const t = token.trim().toLowerCase()
      if (t && t.length >= 2) tokensSet.add(t)
    })
    if (img.tags && Array.isArray(img.tags)) {
      img.tags.forEach((tag) => {
        tag.split(/[_\s-]+/).forEach((token) => {
          const t = token.trim().toLowerCase()
          if (t && t.length >= 2) tokensSet.add(t)
        })
      })
    }
    return Array.from(tokensSet)
  }, [])

  // 핀 고정 + 뷰 모드
  const [pinnedHashes, setPinnedHashes] = useState<string[]>([])
  const [galleryViewMode, setGalleryViewMode] =
    useState<GalleryViewMode>("grid")
  const [showFilters, setShowFilters] = useState(false)

  // ── Marquee Drag-to-Select optimized refs & handlers ──
  const marqueeRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const initialSelectionRef = useRef<Set<string>>(new Set())
  const cachedCardsRef = useRef<{ hash: string; rect: DOMRect }[]>([])
  const lastSelectedHashesRef = useRef<Set<string>>(new Set())
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const initialScrollPosRef = useRef<{ top: number; left: number }>({
    top: 0,
    left: 0,
  })
  const cleanupListenersRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      cleanupListenersRef.current?.()
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return // Left click only

      const target = e.target as HTMLElement
      // Ignore interactive elements
      if (
        target.closest("button") ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest("a") ||
        target.closest('[role="button"]') ||
        target.closest('[data-selectable="true"]') ||
        target.closest(".sticky")
      ) {
        return
      }

      e.preventDefault() // Prevents default browser text selection/drag

      const startPos = { x: e.clientX, y: e.clientY }
      dragStartRef.current = startPos

      // Find and cache the closest scroll container to adjust coordinates if scrolled during drag
      const scrollContainer = target.closest(
        ".overflow-y-auto"
      ) as HTMLElement | null
      scrollContainerRef.current = scrollContainer
      if (scrollContainer) {
        initialScrollPosRef.current = {
          top: scrollContainer.scrollTop,
          left: scrollContainer.scrollLeft,
        }
      } else {
        initialScrollPosRef.current = { top: 0, left: 0 }
      }

      // Determine initial selection
      const isCumulative = e.shiftKey || e.ctrlKey || e.metaKey
      const initialSet = isCumulative
        ? new Set(selectedHashes)
        : new Set<string>()
      initialSelectionRef.current = initialSet
      lastSelectedHashesRef.current = new Set(initialSet)

      // Cache the bounding rects of all selectable cards to avoid layout thrashing in mousemove
      const cardElements = document.querySelectorAll('[data-selectable="true"]')
      cachedCardsRef.current = Array.from(cardElements).map((el) => ({
        hash: el.getAttribute("data-image-hash") || "",
        rect: el.getBoundingClientRect(),
      }))

      // Clear selection if not cumulative
      if (!isCumulative) {
        setSelectedHashes(new Set())
      }

      // Clean up any stray listeners
      cleanupListenersRef.current?.()

      const handleMouseMove = (ev: MouseEvent) => {
        const start = dragStartRef.current
        if (!start) return

        const left = Math.min(start.x, ev.clientX)
        const top = Math.min(start.y, ev.clientY)
        const right = Math.max(start.x, ev.clientX)
        const bottom = Math.max(start.y, ev.clientY)

        // 1. Direct DOM manipulation for marquee box (Zero React renders during dragging!)
        if (marqueeRef.current) {
          marqueeRef.current.style.left = `${left}px`
          marqueeRef.current.style.top = `${top}px`
          marqueeRef.current.style.width = `${right - left}px`
          marqueeRef.current.style.height = `${bottom - top}px`
          marqueeRef.current.style.display = "block"
        }

        // 2. Adjust for scroll container movement
        let deltaY = 0
        let deltaX = 0
        if (scrollContainerRef.current) {
          deltaY =
            scrollContainerRef.current.scrollTop -
            initialScrollPosRef.current.top
          deltaX =
            scrollContainerRef.current.scrollLeft -
            initialScrollPosRef.current.left
        }

        // 3. Mathematical intersection tests on cached rects (Zero layout reflows!)
        const newlyIntersected = new Set<string>()
        cachedCardsRef.current.forEach((card) => {
          const adjustedLeft = card.rect.left - deltaX
          const adjustedRight = card.rect.right - deltaX
          const adjustedTop = card.rect.top - deltaY
          const adjustedBottom = card.rect.bottom - deltaY

          const intersects = !(
            adjustedLeft > right ||
            adjustedRight < left ||
            adjustedTop > bottom ||
            adjustedBottom < top
          )

          if (intersects) {
            newlyIntersected.add(card.hash)
          }
        })

        // 4. Merge selection
        const merged = new Set<string>(initialSelectionRef.current)
        newlyIntersected.forEach((hash) => merged.add(hash))

        // 5. Diff-based updates: Only call state setter if selection changed
        let hasChanged = merged.size !== lastSelectedHashesRef.current.size
        if (!hasChanged) {
          for (const hash of merged) {
            if (!lastSelectedHashesRef.current.has(hash)) {
              hasChanged = true
              break
            }
          }
        }

        if (hasChanged) {
          lastSelectedHashesRef.current = merged
          if (merged.size > 0) {
            setSelectionMode(true)
            setSelectedHashes(merged)
          } else {
            setSelectedHashes(new Set())
          }
        }
      }

      const handleMouseUp = () => {
        cleanup()

        if (marqueeRef.current) {
          marqueeRef.current.style.display = "none"
        }

        dragStartRef.current = null
        initialSelectionRef.current = new Set()
        cachedCardsRef.current = []

        setSelectedHashes((current) => {
          if (current.size === 0) {
            setSelectionMode(false)
          }
          return current
        })
      }

      const cleanup = () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
        cleanupListenersRef.current = null
      }

      cleanupListenersRef.current = cleanup
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    },
    [selectedHashes, setSelectedHashes]
  )

  // 썸네일 크기 조절 (로컬 상태 폴백)
  const [localThumbnailSize, setLocalThumbnailSize] = useState<number>(180)
  const thumbnailSize = toolbarState?.thumbnailSize ?? localThumbnailSize
  const setThumbnailSize =
    toolbarState?.setThumbnailSize ?? setLocalThumbnailSize

  const effectiveFilenameFilter =
    filenameFilter !== undefined ? filenameFilter : localFilenameFilter
  const effectiveTagFilter =
    tagFilter !== undefined ? tagFilter : localTagFilter
  const effectiveMetadataFilter =
    metadataFilter !== undefined ? metadataFilter : localMetadataFilter
  const effectiveGeneralFilters = useMemo(
    () => generalFilters ?? [],
    [generalFilters]
  )

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
  const effectiveSortKey = toolbarState ? toolbarState.sortKey : sortKey
  const effectiveSortDir = toolbarState ? toolbarState.sortDir : sortDir

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

  // Register reload function for external triggers (Header dropdown, keyboard shortcuts)
  useEffect(() => {
    onReloadReady?.(reload)
  }, [onReloadReady, reload])

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
  const prevTotalPagesRef = useRef(totalPages)
  useEffect(() => {
    if (prevTotalPagesRef.current !== totalPages && page > totalPages) {
      setPage(totalPages)
    }
    prevTotalPagesRef.current = totalPages
  }, [page, totalPages])

  // groupTotal 변동으로 groupPage 범위 밖이면 클램프
  const prevGroupTotalPagesRef = useRef(groupTotalPages)
  useEffect(() => {
    if (
      prevGroupTotalPagesRef.current !== groupTotalPages &&
      groupPage > groupTotalPages
    ) {
      setGroupPage(groupTotalPages)
    }
    prevGroupTotalPagesRef.current = groupTotalPages
  }, [groupPage, groupTotalPages])

  const setStatus = useCallback(
    async (hash: string, status: CurationStatus) => {
      try {
        await curationApi.patchStatus(backendUrl, hash, status)
        reload()
      } catch (err) {
        console.error("setStatus failed", err)
      }
    },
    [backendUrl, reload]
  )

  // 메타데이터로 필터링된 이미지 (그리드 모드 전용)
  const metadataFilteredImages = useMemo(() => {
    if (!effectiveMetadataFilter.trim()) return images
    const lowerFilter = effectiveMetadataFilter.toLowerCase().trim()
    return images.filter((img) => {
      const prompt = img.prompt.toLowerCase()
      return prompt.includes(lowerFilter)
    })
  }, [images, effectiveMetadataFilter])

  // 일반 검색어(OR) 필터링 추가
  const finalFilteredImages = useMemo(() => {
    if (effectiveGeneralFilters.length === 0) return metadataFilteredImages
    return metadataFilteredImages.filter((img) => {
      return effectiveGeneralFilters.every((term) => {
        const lowerTerm = term.toLowerCase()
        const inFilename = img.originalFilename
          ? img.originalFilename.toLowerCase().includes(lowerTerm)
          : false
        const inTags = img.tags
          ? img.tags.some((t) => t.toLowerCase().includes(lowerTerm))
          : false
        const inPrompt = img.prompt
          ? img.prompt.toLowerCase().includes(lowerTerm)
          : false
        return inFilename || inTags || inPrompt
      })
    })
  }, [metadataFilteredImages, effectiveGeneralFilters])

  // ── Breadcrumb filter applied to finalFilteredImages ──
  const breadcrumbFilteredImages = useMemo(() => {
    if (breadcrumbTags.length === 0) return finalFilteredImages
    return finalFilteredImages.filter((img) => {
      const tokens = getTokens(img)
      return breadcrumbTags.every((bTag) => tokens.includes(bTag.toLowerCase()))
    })
  }, [finalFilteredImages, breadcrumbTags, getTokens])

  // Get next available sub-folders/sub-tags
  const nextAvailableTokens = useMemo(() => {
    const freqMap = new Map<string, number>()
    breadcrumbFilteredImages.forEach((img) => {
      const tokens = getTokens(img)
      tokens.forEach((token) => {
        if (!breadcrumbTags.includes(token)) {
          freqMap.set(token, (freqMap.get(token) || 0) + 1)
        }
      })
    })

    const sorted = Array.from(freqMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([token, count]) => ({ token, count }))

    if (subTagQuery.trim()) {
      const query = subTagQuery.toLowerCase().trim()
      return sorted.filter((item) => item.token.includes(query))
    }
    return sorted
  }, [breadcrumbFilteredImages, breadcrumbTags, getTokens, subTagQuery])

  // 리젝 숨기기 + 정렬 적용
  const visibleImages = useMemo(() => {
    const filtered = breadcrumbFilteredImages.filter(
      (img) => !effectiveHideRejected || img.status !== "rejected"
    )
    const dir = effectiveSortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (effectiveSortKey) {
        case "filename":
          return (
            dir *
            (a.originalFilename || a.comfyFilename).localeCompare(
              b.originalFilename || b.comfyFilename
            )
          )
        case "sizeBytes":
          return dir * (a.sizeBytes - b.sizeBytes)
        case "createdAt":
        default:
          return dir * (a.createdAt - b.createdAt)
      }
    })
  }, [
    breadcrumbFilteredImages,
    effectiveHideRejected,
    effectiveSortKey,
    effectiveSortDir,
  ])

  // 그룹 모드: groups + groupImagesMap 기반 visible 데이터
  const visibleGroups = useMemo(() => {
    if (!effectiveGroupMode) return []
    const lowerMeta = effectiveMetadataFilter.trim().toLowerCase() || null
    const result: { name: string; items: SavedImage[] }[] = []
    for (const g of groups) {
      let items = groupImagesMap.get(g.filename) ?? []
      if (effectiveMetadataFilter.trim() && lowerMeta) {
        items = items.filter((img) =>
          img.prompt.toLowerCase().includes(lowerMeta)
        )
      }
      if (effectiveGeneralFilters.length > 0) {
        items = items.filter((img) => {
          return effectiveGeneralFilters.every((term) => {
            const lowerTerm = term.toLowerCase()
            const inFilename = img.originalFilename
              ? img.originalFilename.toLowerCase().includes(lowerTerm)
              : false
            const inTags = img.tags
              ? img.tags.some((t) => t.toLowerCase().includes(lowerTerm))
              : false
            const inPrompt = img.prompt
              ? img.prompt.toLowerCase().includes(lowerTerm)
              : false
            return inFilename || inTags || inPrompt
          })
        })
      }
      if (breadcrumbTags.length > 0) {
        items = items.filter((img) => {
          const tokens = getTokens(img)
          return breadcrumbTags.every((bTag) =>
            tokens.includes(bTag.toLowerCase())
          )
        })
      }
      if (effectiveHideRejected) {
        items = items.filter((img) => img.status !== "rejected")
      }
      if (items.length > 0) {
        const dir = effectiveSortDir === "asc" ? 1 : -1
        items.sort((a, b) => {
          switch (effectiveSortKey) {
            case "filename":
              return (
                dir *
                (a.originalFilename || a.comfyFilename).localeCompare(
                  b.originalFilename || b.comfyFilename
                )
              )
            case "sizeBytes":
              return dir * (a.sizeBytes - b.sizeBytes)
            case "createdAt":
            default:
              return dir * (a.createdAt - b.createdAt)
          }
        })
        result.push({ name: g.filename, items })
      }
    }
    return result
  }, [
    effectiveGroupMode,
    groups,
    groupImagesMap,
    effectiveMetadataFilter,
    effectiveGeneralFilters,
    effectiveHideRejected,
    effectiveSortKey,
    effectiveSortDir,
    breadcrumbTags,
    getTokens,
  ])

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

  const togglePin = useCallback((hash: string) => {
    setPinnedHashes((prev) =>
      prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash]
    )
  }, [])

  // ── Keyboard Navigation Logic ──
  const flatGroupImages = useMemo(() => {
    if (!effectiveGroupMode) return []
    const list: SavedImage[] = []
    for (const group of visibleGroups) {
      const isCollapsed = collapsedGroups.has(group.name)
      if (!isCollapsed) {
        list.push(...group.items)
      }
    }
    return list
  }, [effectiveGroupMode, visibleGroups, collapsedGroups])

  const navImages = useMemo(() => {
    return effectiveGroupMode ? flatGroupImages : visibleImages
  }, [effectiveGroupMode, flatGroupImages, visibleImages])

  useEffect(() => {
    if (focusedHash && navImages.length > 0) {
      const index = navImages.findIndex((img) => img.hash === focusedHash)
      if (index === -1) {
        // Auto focus the item at the same position or fallback to first
        setFocusedHash(navImages[0]?.hash ?? null)
      }
    }
  }, [navImages, focusedHash])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in editable element
      const activeEl = document.activeElement
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return
      }

      // Esc: close detail view or clear focus
      if (e.key === "Escape") {
        if (selected) {
          setSelected(null)
          e.preventDefault()
        } else if (focusedHash) {
          setFocusedHash(null)
          e.preventDefault()
        }
        return
      }

      // If detail view is open, do not handle navigation
      if (selected) return

      const currentIndex = navImages.findIndex(
        (img) => img.hash === focusedHash
      )

      const focusIndex = (index: number) => {
        if (index >= 0 && index < navImages.length) {
          const nextImg = navImages[index]
          if (nextImg) {
            setFocusedHash(nextImg.hash)
            // Gently scroll focused card into view if needed
            setTimeout(() => {
              const el = document.querySelector(`[class*="ring-blue-500"]`)
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "nearest" })
              }
            }, 50)
          }
        }
      }

      // Arrow Left / h
      if (e.key === "ArrowLeft" || e.key === "h") {
        e.preventDefault()
        if (currentIndex === -1) {
          focusIndex(0)
        } else {
          focusIndex(currentIndex - 1)
        }
        return
      }

      // Arrow Right / l
      if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault()
        if (currentIndex === -1) {
          focusIndex(0)
        } else {
          focusIndex(currentIndex + 1)
        }
        return
      }

      // Arrow Up / k
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        if (currentIndex === -1) {
          focusIndex(0)
        } else {
          focusIndex(Math.max(0, currentIndex - 4))
        }
        return
      }

      // Arrow Down / j
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        if (currentIndex === -1) {
          focusIndex(0)
        } else {
          focusIndex(Math.min(navImages.length - 1, currentIndex + 4))
        }
        return
      }

      // Enter / Space -> toggle select in selectionMode, otherwise open details
      if (e.key === "Enter" || e.key === " ") {
        if (focusedHash && currentIndex !== -1) {
          e.preventDefault()
          const img = navImages[currentIndex]
          if (img) {
            if (selectionMode) {
              toggleSelectHash(img.hash)
            } else {
              setSelected(img)
            }
          }
        }
        return
      }

      // 1 -> approved
      if (e.key === "1") {
        if (focusedHash && currentIndex !== -1) {
          e.preventDefault()
          const img = navImages[currentIndex]
          if (img) {
            setStatus(img.hash, "approved")
            toast.success("선택된 이미지를 통과시켰습니다.")
          }
        }
        return
      }

      // 2 -> rejected
      if (e.key === "2") {
        if (focusedHash && currentIndex !== -1) {
          e.preventDefault()
          const img = navImages[currentIndex]
          if (img) {
            setStatus(img.hash, "rejected")
            toast.success("선택된 이미지를 탈락시켰습니다.")
          }
        }
        return
      }

      // 3 -> trashed / restore
      if (e.key === "3") {
        if (focusedHash && currentIndex !== -1) {
          e.preventDefault()
          const img = navImages[currentIndex]
          if (img) {
            const targetStatus =
              img.status === "trashed" ? "pending" : "trashed"
            setStatus(img.hash, targetStatus)
            toast.success(
              targetStatus === "trashed"
                ? "휴지통으로 이동했습니다."
                : "대기로 복원했습니다."
            )
          }
        }
        return
      }

      // p -> pin toggle
      if (e.key === "p") {
        if (focusedHash && currentIndex !== -1) {
          e.preventDefault()
          const img = navImages[currentIndex]
          if (img) {
            togglePin(img.hash)
            const isPinned = pinnedHashes.includes(img.hash)
            toast.success(
              isPinned ? "비교에서 제거했습니다." : "비교에 추가했습니다."
            )
          }
        }
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    focusedHash,
    navImages,
    selectionMode,
    toggleSelectHash,
    togglePin,
    pinnedHashes,
    selected,
    setStatus,
  ])

  // 갤러리 이미지 토큰 실시간 추출 후 상위 컴포넌트 전달
  useEffect(() => {
    if (!onTokensExtracted || images.length === 0) return

    const tokenMap = new Map<string, "filename" | "tag" | "metadata">()

    images.forEach((img) => {
      // 1. 파일명 추가
      if (img.originalFilename) {
        tokenMap.set(img.originalFilename, "filename")
      }

      // 2. 태그 추가
      if (img.tags && Array.isArray(img.tags)) {
        img.tags.forEach((tag) => {
          if (tag.trim()) tokenMap.set(tag.trim(), "tag")
        })
      }

      // 3. 프롬프트 단어들 추가 (특수문자 제외)
      if (img.prompt) {
        const words = img.prompt
          .replace(/[():,.\\_'"*?/|{}[]-]/g, " ")
          .split(/\s+/)
        words.forEach((word) => {
          const cleaned = word.trim()
          if (cleaned.length >= 3) {
            tokenMap.set(cleaned, "metadata")
          }
        })
      }
    })

    const extracted = Array.from(tokenMap.entries()).map(([value, type]) => ({
      value,
      type,
    }))

    onTokensExtracted(extracted.slice(0, 150))
  }, [images, onTokensExtracted])

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

  // Build combined image lookup from all available sources
  const imageLookup = useMemo(() => {
    const map = new Map<string, SavedImage>()
    for (const img of images) map.set(img.hash, img)
    for (const [, imgs] of groupImagesMap) {
      for (const img of imgs) map.set(img.hash, img)
    }
    return map
  }, [images, groupImagesMap])

  const handleBulkDownload = useCallback(async () => {
    if (selectedHashes.size === 0) return
    setBulkDownloadLoading(true)
    try {
      const downloads: Array<{ url: string; filename: string }> = []
      for (const hash of selectedHashes) {
        const img = imageLookup.get(hash)
        const filename = img ? getImageFilename(img) : `${hash}.png`
        downloads.push({ url: `${backendUrl}/saved-images/${hash}`, filename })
      }
      await downloadImagesAsZip(downloads, "gallery-images.zip")
    } finally {
      setBulkDownloadLoading(false)
    }
  }, [backendUrl, selectedHashes, imageLookup])

  const handleEmptyTrash = async () => {
    if (
      !(await confirm({
        title: "휴지통 비우기",
        description: "휴지통의 이미지를 영구 삭제합니다. 계속하시겠습니까?",
        variant: "destructive",
        confirmText: "영구 삭제",
      }))
    )
      return
    try {
      const n = await curationApi.emptyTrash(backendUrl)
      toast.success(`${n}개 영구 삭제됨`)
      reload()
    } catch (err) {
      console.error(err)
      toast.error("삭제 실패")
    }
  }

  // 재생성 다이얼로그 상태
  const [regenTarget, setRegenTarget] = useState<string | null>(null)
  const [regenCount, setRegenCount] = useState("4")

  const handleRegenerate = async (filename: string) => {
    setRegenTarget(filename)
    setRegenCount("4")
  }

  const handleRegenConfirm = async () => {
    if (!regenTarget) return
    const count = Number(regenCount)
    if (!Number.isFinite(count) || count < 1) {
      toast.error("유효한 숫자를 입력해주세요.")
      return
    }
    setRegenTarget(null)
    try {
      await curationApi.regenerate(backendUrl, regenTarget, count, "random")
      toast.success(`'${regenTarget}' 그룹에 ${count}장 생성 요청 완료`)
    } catch (err) {
      console.error(err)
      toast.error("재생성 요청에 실패했습니다.")
    }
  }

  const toggleSort = useCallback(
    (key: GallerySortKey) => {
      if (toolbarState) {
        if (toolbarState.sortKey === key) {
          toolbarState.setSortDir(
            toolbarState.sortDir === "asc" ? "desc" : "asc"
          )
        } else {
          toolbarState.setSortKey(key)
          toolbarState.setSortDir("asc")
        }
      } else {
        if (sortKey === key) {
          setSortDirLocal((d) => (d === "asc" ? "desc" : "asc"))
        } else {
          setSortKeyLocal(key)
          setSortDirLocal("asc")
        }
      }
    },
    [toolbarState, sortKey]
  )

  const hasAnyFilter = useMemo(
    () =>
      !!(
        effectiveFilenameFilter.trim() ||
        effectiveTagFilter.trim() ||
        effectiveMetadataFilter.trim() ||
        effectiveHideRejected
      ),
    [
      effectiveFilenameFilter,
      effectiveTagFilter,
      effectiveMetadataFilter,
      effectiveHideRejected,
    ]
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex flex-1 flex-col">
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
                      <SelectItem
                        value="group"
                        className="text-[12px] font-bold"
                      >
                        그룹
                      </SelectItem>
                      <SelectItem
                        value="grid"
                        className="text-[12px] font-bold"
                      >
                        그리드
                      </SelectItem>
                      <SelectItem
                        value="compare"
                        className="text-[12px] font-bold"
                      >
                        비교
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* 3. Sort: key select + direction toggle */}
                  <Select
                    value={sortKey}
                    onValueChange={(k) => toggleSort(k as GallerySortKey)}
                  >
                    <SelectTrigger className="h-8 w-[72px] border-line bg-background px-1.5 text-[11px] font-bold shadow-none focus:ring-0">
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleSort(sortKey)}
                    className="h-8 w-8 shrink-0 border-line bg-background p-0 shadow-none hover:bg-muted"
                  >
                    {sortDir === "asc" ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )}
                  </Button>

                  {/* 썸네일 크기 조절 슬라이더 */}
                  {(effectiveGroupMode ||
                    effectiveGalleryViewMode === "grid") && (
                    <div className="hidden h-8 items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-2 py-1 shadow-xs md:flex">
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
                        value={thumbnailSize}
                        onChange={(e) =>
                          setThumbnailSize(Number(e.target.value))
                        }
                        className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                      />
                      <span className="w-[34px] text-right font-mono text-[9px] font-bold whitespace-nowrap text-muted-foreground tabular-nums">
                        {thumbnailSize}px
                      </span>
                    </div>
                  )}
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

                  {/* More actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[160px]">
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
                        onContextMenu={(e) => e.stopPropagation()}
                      />
                      <Input
                        className="h-9 w-full text-sm md:h-7 md:w-36 md:text-xs"
                        type="search"
                        placeholder="태그 필터"
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                        onContextMenu={(e) => e.stopPropagation()}
                      />
                      <Input
                        className="h-9 w-full text-sm sm:col-span-2 md:h-7 md:w-48 md:text-xs"
                        type="search"
                        placeholder="메타데이터/prompt 검색"
                        value={metadataFilter}
                        onChange={(e) => setMetadataFilter(e.target.value)}
                        onContextMenu={(e) => e.stopPropagation()}
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
                          setBreadcrumbTags([])
                          setSubTagQuery("")
                        }}
                      >
                        <XIcon className="mr-1 h-3.5 w-3.5 md:h-3 md:w-3" />
                        필터 초기화
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 선택 모드 액션 바 */}
          {selectionMode && (
            <div className="sticky top-0 z-40 shrink-0 border-b border-line bg-blue-50/30 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-blue-700">
                  {selectedHashes.size}개 이미지 선택됨
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[10px] font-bold text-ok"
                    onClick={() => handleBulkAction("approved")}
                    disabled={bulkActionLoading}
                  >
                    <CheckCircleIcon className="h-3.5 w-3.5" />
                    <span>일괄 통과</span>
                    <Kbd className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      1
                    </Kbd>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[10px] font-bold text-bad"
                    onClick={() => handleBulkAction("rejected")}
                    disabled={bulkActionLoading}
                  >
                    <XCircleIcon className="h-3.5 w-3.5" />
                    <span>일괄 탈락</span>
                    <Kbd className="border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400">
                      2
                    </Kbd>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[10px] font-bold text-info"
                    onClick={() => handleBulkAction("pending")}
                    disabled={bulkActionLoading}
                  >
                    <RotateCcwIcon className="h-3.5 w-3.5" />
                    <span>일괄 대기</span>
                    <Kbd className="border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400">
                      3
                    </Kbd>
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[10px] font-bold"
                    onClick={() => handleBulkAction("trashed")}
                    disabled={bulkActionLoading}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                    <span>일괄 휴지통</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[10px] font-bold"
                    onClick={handleBulkDownload}
                    disabled={bulkDownloadLoading}
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    일괄 다운로드
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-[10px] font-bold text-muted-foreground"
                  onClick={exitSelectionMode}
                >
                  <XIcon className="h-3.5 w-3.5" />
                  <span>선택 종료</span>
                  <Kbd className="ml-1 bg-muted/40">Esc</Kbd>
                </Button>
                {bulkActionMessage && (
                  <span className="text-xs font-bold text-blue-600">
                    {bulkActionMessage}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Scrollable Content ── */}
          <div className="flex-1 p-4" onMouseDown={handleMouseDown}>
            {/* ── Danbooru Folder-like Breadcrumb tag system ── */}
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
              {breadcrumbTags.length > 0 ? (
                <FolderOpen
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.6}
                />
              ) : (
                <Folder
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.6}
                />
              )}

              <div className="h-3 w-px shrink-0 bg-border" />

              <Breadcrumb>
                <BreadcrumbList className="flex-nowrap items-center text-xs font-medium">
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      onClick={() => {
                        setBreadcrumbTags([])
                        setPage(1)
                        setGroupPage(1)
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-1 font-medium transition-colors hover:text-foreground",
                        breadcrumbTags.length === 0
                          ? "cursor-default font-semibold text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      <Home
                        className="h-3.5 w-3.5 text-muted-foreground/80"
                        strokeWidth={1.6}
                      />
                      Home
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {breadcrumbTags.map((tag, idx) => {
                    const isLast = idx === breadcrumbTags.length - 1
                    return (
                      <React.Fragment key={tag}>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <ContextMenu>
                            <ContextMenuTrigger asChild>
                              {isLast ? (
                                <span className="block rounded border border-border/40 bg-muted/60 px-2 py-0.5 text-[11px] leading-none font-semibold text-foreground select-none">
                                  {tag}
                                </span>
                              ) : (
                                <span
                                  className="block cursor-pointer font-medium text-muted-foreground transition-colors select-none hover:text-foreground"
                                  onClick={() => {
                                    setBreadcrumbTags(
                                      breadcrumbTags.slice(0, idx + 1)
                                    )
                                    setPage(1)
                                    setGroupPage(1)
                                  }}
                                >
                                  {tag}
                                </span>
                              )}
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-44">
                              <ContextMenuItem
                                onClick={() => {
                                  setBreadcrumbTags(
                                    breadcrumbTags.slice(0, idx + 1)
                                  )
                                  setPage(1)
                                  setGroupPage(1)
                                }}
                                className="gap-2 font-bold"
                              >
                                <Scissors className="h-3.5 w-3.5" />이
                                위치까지 경로 자르기
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => {
                                  setBreadcrumbTags(
                                    breadcrumbTags.filter((_, i) => i !== idx)
                                  )
                                  setPage(1)
                                  setGroupPage(1)
                                }}
                                className="gap-2 font-bold"
                              >
                                <Trash2Icon className="h-3.5 w-3.5" />
                                경로에서 제거
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() => {
                                  navigator.clipboard
                                    .writeText(tag)
                                    .catch(() => {})
                                }}
                                className="gap-2 font-bold"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                태그명 복사
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        </BreadcrumbItem>
                      </React.Fragment>
                    )
                  })}
                </BreadcrumbList>
              </Breadcrumb>

              <div className="h-3 w-px shrink-0 bg-border" />

              {nextAvailableTokens.length > 0 ? (
                <div className="flex flex-1 gap-2 overflow-x-auto">
                  {nextAvailableTokens
                    .slice(0, 30)
                    .map(({ token, count }) => (
                      <ContextMenu key={token}>
                        <ContextMenuTrigger asChild>
                          <button
                            onClick={() => {
                              setBreadcrumbTags([...breadcrumbTags, token])
                              setSubTagQuery("")
                              setPage(1)
                              setGroupPage(1)
                            }}
                            className="group flex h-7 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground active:scale-95"
                          >
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <Folder
                                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80 group-hover:text-accent-foreground"
                                strokeWidth={1.6}
                              />
                              <span className="max-w-[100px] truncate leading-none font-medium text-foreground/80 group-hover:text-foreground sm:max-w-[130px]">
                                {token}
                              </span>
                            </div>
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] font-medium text-muted-foreground group-hover:bg-background">
                              {count}
                            </span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-44">
                          <ContextMenuItem
                            onClick={() => {
                              setBreadcrumbTags([token, ...breadcrumbTags])
                              setSubTagQuery("")
                              setPage(1)
                              setGroupPage(1)
                            }}
                            className="gap-2 font-bold"
                          >
                            <FolderPlus className="h-3.5 w-3.5" />맨 앞에 경로
                            추가
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() => {
                              navigator.clipboard
                                .writeText(token)
                                .catch(() => {})
                            }}
                            className="gap-2 font-bold"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            태그명 복사
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {breadcrumbTags.length > 0 ? (
                    <button
                      onClick={() => {
                        setBreadcrumbTags(breadcrumbTags.slice(0, -1))
                        setPage(1)
                        setGroupPage(1)
                      }}
                      className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium transition-all hover:bg-accent hover:text-accent-foreground active:scale-95"
                    >
                      <ArrowLeft
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.6}
                      />
                      <span>뒤로 가기</span>
                    </button>
                  ) : (
                    <div className="text-xs font-medium text-muted-foreground">
                      더 이상 하위 폴더가 없습니다.
                    </div>
                  )}
                </div>
              )}

              <div className="h-3 w-px shrink-0 bg-border" />

              <div className="relative w-32 shrink-0">
                <Search
                  className="absolute top-1 left-2.5 h-3.5 w-3.5 text-muted-foreground/80"
                  strokeWidth={1.6}
                />
                <input
                  type="text"
                  placeholder="폴더 검색..."
                  value={subTagQuery}
                  onChange={(e) => setSubTagQuery(e.target.value)}
                  onContextMenu={(e) => e.stopPropagation()}
                  className="h-7 w-full rounded-md border border-input bg-transparent pr-2.5 pl-8 text-xs font-normal transition-all placeholder:text-muted-foreground focus:border-input focus:ring-1 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            {error && (
              <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {loading && (
              <div className="columns-2 gap-3 sm:gap-4 md:columns-3 lg:columns-4 xl:columns-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="m-1 break-inside-avoid overflow-hidden rounded-lg border bg-card"
                  >
                    <Skeleton
                      className="w-full"
                      style={{ height: `${140 + ((i * 47) % 120)}px` }}
                    />
                  </div>
                ))}
              </div>
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
                      <ContextMenu key={hash}>
                        <ContextMenuTrigger asChild>
                          <div className="relative cursor-pointer overflow-hidden rounded-lg border bg-black/5 shadow-inner">
                            <button
                              type="button"
                              onClick={() => togglePin(hash)}
                              className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl transition-colors hover:bg-blue-600"
                            >
                              <PinIcon className="h-5 w-5" />
                            </button>
                            {img &&
                              (enableHover ? (
                                <Magnifier
                                  src={`${backendUrl}/saved-images/${hash}`}
                                />
                              ) : (
                                <img
                                  src={`${backendUrl}/saved-images/${hash}`}
                                  className="max-h-full max-w-full object-contain"
                                  alt=""
                                />
                              ))}
                          </div>
                        </ContextMenuTrigger>
                        {img && (
                          <ContextMenuContent className="w-48">
                            <ContextMenuItem
                              onClick={() => togglePin(hash)}
                              className="gap-2 font-bold"
                            >
                              <PinIcon className="h-3.5 w-3.5" />
                              비교에서 제거
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => setStatus(hash, "approved")}
                              className="gap-2 font-bold text-ok"
                              disabled={img.status === "approved"}
                            >
                              <CheckCircleIcon className="h-3.5 w-3.5" />
                              통과
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => setStatus(hash, "rejected")}
                              className="gap-2 font-bold text-bad"
                              disabled={img.status === "rejected"}
                            >
                              <XCircleIcon className="h-3.5 w-3.5" />
                              탈락
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => setStatus(hash, "pending")}
                              className="gap-2 font-bold text-info"
                              disabled={img.status === "pending"}
                            >
                              <RotateCcwIcon className="h-3.5 w-3.5" />
                              대기
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => setSelected(img)}
                              className="gap-2 font-bold"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              상세 보기
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => {
                                const url = `${backendUrl}/saved-images/${hash}`
                                navigator.clipboard
                                  .writeText(url)
                                  .catch(() => {})
                              }}
                              className="gap-2 font-bold"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              이미지 URL 복사
                            </ContextMenuItem>
                          </ContextMenuContent>
                        )}
                      </ContextMenu>
                    )
                  })}
                </div>
              )}

            {/* 그룹 모드 */}
            {effectiveGroupMode ? (
              <div className="flex flex-col gap-4">
                {/* 모두 접기/펴기 컨트롤 */}
                {visibleGroups.length > 0 && (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px] font-bold text-muted-foreground"
                      onClick={
                        collapsedGroups.size === visibleGroups.length
                          ? expandAll
                          : collapseAll
                      }
                    >
                      {collapsedGroups.size === visibleGroups.length
                        ? "모두 펴기"
                        : "모두 접기"}
                    </Button>
                  </div>
                )}
                {visibleGroups.map(({ name, items }) => {
                  const groupMeta = groups.find((g) => g.filename === name)
                  const isCollapsed = collapsedGroups.has(name)
                  return (
                    <div key={name} className="rounded-md border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {/* Collapse toggle */}
                        <button
                          type="button"
                          onClick={() => toggleGroupCollapse(name)}
                          className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded transition-transform hover:bg-muted/50 ${isCollapsed && "rotate-180"}`}
                          aria-label={isCollapsed ? "펴기" : "접기"}
                        >
                          {isCollapsed ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronUp className="h-4 w-4" />
                          )}
                        </button>
                        <span className="font-mono text-sm font-semibold">
                          {name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          총 {groupMeta?.total ?? items.length} · 통과{" "}
                          {groupMeta?.approvedCount ?? 0} · 탈락{" "}
                          {groupMeta?.rejectedCount ?? 0} · 휴지통{" "}
                          {groupMeta?.trashedCount ?? 0}
                        </span>
                        {!isCollapsed && (
                          <div className="ml-auto">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRegenerate(name)}
                            >
                              재생성
                            </Button>
                          </div>
                        )}
                      </div>
                      {!isCollapsed && (
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
                          focusedHash={focusedHash}
                          onFocus={setFocusedHash}
                          thumbnailSize={thumbnailSize}
                        />
                      )}
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
                      총 {groupTotal}개 그룹 · {groupPage}/{groupTotalPages}{" "}
                      페이지
                    </p>
                  </div>
                )}
              </div>
            ) : effectiveGalleryViewMode === "grid" ||
              (effectiveGalleryViewMode === "compare" &&
                pinnedHashes.length === 0) ? (
              <>
                {effectiveGalleryViewMode === "compare" &&
                  pinnedHashes.length === 0 && (
                    <div className="mx-auto mb-4 flex max-w-lg items-center gap-3 rounded-xl border border-info/20 bg-info-bg px-4 py-3 text-sm">
                      <PinIcon className="h-5 w-5 shrink-0 text-info" />
                      <div>
                        <p className="font-bold text-foreground">
                          비교할 이미지를 핀 고정하세요
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          이미지를 우클릭하여 "비교에 추가"를 선택하면 핀 고정된
                          이미지들이 나란히 표시됩니다.
                        </p>
                      </div>
                    </div>
                  )}
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
                  focusedHash={focusedHash}
                  onFocus={setFocusedHash}
                  thumbnailSize={thumbnailSize}
                />
              </>
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
                            page <= 1
                              ? "pointer-events-none opacity-50"
                              : undefined
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
                {...(singleDownloadMode && { singleDownloadMode })}
              />
            )}
          </div>

          {/* 재생성 수량 입력 다이얼로그 */}
          <Dialog
            open={regenTarget !== null}
            onOpenChange={(open) => {
              if (!open) setRegenTarget(null)
            }}
          >
            <DialogContent className="sm:max-w-[340px]">
              <DialogHeader>
                <DialogTitle>추가 생성</DialogTitle>
                <DialogDescription>
                  '{regenTarget}' 그룹에 몇 장을 추가 생성할까요?
                </DialogDescription>
              </DialogHeader>
              <Input
                type="number"
                min={1}
                max={100}
                value={regenCount}
                onChange={(e) => setRegenCount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRegenConfirm()
                }}
                className="text-center text-lg font-bold"
                autoFocus
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setRegenTarget(null)}>
                  취소
                </Button>
                <Button onClick={handleRegenConfirm}>생성</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div
            ref={marqueeRef}
            className="pointer-events-none fixed z-[9999] rounded-sm border border-primary/60 bg-primary/10 shadow-xs"
            style={{ display: "none" }}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          disabled={breadcrumbTags.length === 0}
          onClick={() => {
            setBreadcrumbTags(breadcrumbTags.slice(0, -1))
            setPage(1)
            setGroupPage(1)
          }}
          className="gap-2 font-bold"
        >
          <ArrowUp className="h-3.5 w-3.5" />
          상위 폴더로 이동
        </ContextMenuItem>
        <ContextMenuItem
          disabled={breadcrumbTags.length === 0}
          onClick={() => {
            setBreadcrumbTags([])
            setPage(1)
            setGroupPage(1)
          }}
          className="gap-2 font-bold"
        >
          <Home className="h-3.5 w-3.5" />홈 폴더로 이동
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger
            className="gap-2 font-bold"
            disabled={nextAvailableTokens.length === 0}
          >
            <Folder className="h-3.5 w-3.5 text-muted-foreground/80" />
            하위 폴더로 이동
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-[300px] w-48 overflow-y-auto">
            {nextAvailableTokens.slice(0, 40).map(({ token, count }) => (
              <ContextMenuItem
                key={token}
                onClick={() => {
                  setBreadcrumbTags([...breadcrumbTags, token])
                  setPage(1)
                  setGroupPage(1)
                }}
                className="gap-2 font-bold"
              >
                <Folder className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span className="flex-1 truncate font-medium">{token}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] font-medium text-muted-foreground">
                  {count}
                </span>
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={reload} className="gap-2 font-bold">
          <RefreshCwIcon className="h-3.5 w-3.5" />
          경로 새로고침
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})
