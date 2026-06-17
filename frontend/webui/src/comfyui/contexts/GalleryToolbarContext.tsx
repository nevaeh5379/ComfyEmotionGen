import {
  createContext,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react"
import { useContextRequired } from "@/lib/context"
import { useSyncedStorage } from "../hooks/useSyncedStorage"
import { useLatestRef } from "../hooks/useLatestRef"
import { useSettings } from "../hooks/useSettings"
import { useConfirm } from "../hooks/useConfirm"
import { curationApi } from "../hooks/useSavedImages"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { toast } from "sonner"
import type { CurationStatus } from "../types/Message"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GalleryViewMode = "grid" | "compare"
export type GallerySortKey = "createdAt" | "filename" | "sizeBytes"

export interface GalleryToolbarValue {
  statusFilter: CurationStatus | "all"
  setStatusFilter: (v: CurationStatus | "all") => void
  viewMode: GalleryViewMode
  setViewMode: (v: GalleryViewMode) => void
  groupMode: boolean
  setGroupMode: (v: boolean) => void
  showFilters: boolean
  setShowFilters: (v: boolean) => void
  hideRejected: boolean
  setHideRejected: (v: boolean) => void
  searchTags: string[]
  setSearchTags: (tags: string[]) => void
  searchInput: string
  setSearchInput: (v: string) => void
  candidates: { value: string; type: "filename" | "tag" | "metadata" }[]
  setCandidates: (
    c: { value: string; type: "filename" | "tag" | "metadata" }[]
  ) => void
  sortKey: GallerySortKey
  setSortKey: (k: GallerySortKey) => void
  sortDir: "asc" | "desc"
  setSortDir: (d: "asc" | "desc") => void
  thumbnailSize: number
  setThumbnailSize: (v: number) => void
  duplicateStrategy: "hash" | "number"
  setDuplicateStrategy: (v: "hash" | "number") => void

  // Compatibility aliases (SavedImagesGallery expects these names)
  galleryViewMode: GalleryViewMode
  setGalleryViewMode: (v: GalleryViewMode) => void
  reload: () => void

  // Derived
  filenameFilter: string
  tagFilter: string
  metadataFilter: string
  generalFilters: string[]
  hasAnyFilter: boolean

  // Actions
  handleExport: () => Promise<void>
  handleRefresh: () => void
  handleEmptyTrash: () => Promise<void>
  clearAllFilters: () => void
  registerReload: (fn: (() => void) | null) => void
  triggerReload: () => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GalleryToolbarContext = createContext<GalleryToolbarValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useGalleryToolbar(): GalleryToolbarValue {
  return useContextRequired(GalleryToolbarContext, "useGalleryToolbar")
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GalleryToolbarProvider({
  children,
  backendUrl,
}: {
  children: React.ReactNode
  backendUrl: string
}): React.JSX.Element {
  const { settings } = useSettings()
  const confirm = useConfirm()

  const [statusFilter, setStatusFilter] = useState<CurationStatus | "all">(
    "pending"
  )
  const [viewMode, setViewMode] = useState<GalleryViewMode>("grid")
  const [groupMode, setGroupMode] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [hideRejected, setHideRejected] = useState(false)
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState("")
  const [candidates, setCandidates] = useState<
    { value: string; type: "filename" | "tag" | "metadata" }[]
  >([])
  const [sortKey, setSortKey] = useState<GallerySortKey>("createdAt")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [thumbnailSize, setThumbnailSize] = useSyncedStorage<number>(
    STORAGE_KEYS.galleryThumbnailSize,
    180
  )
  const [duplicateStrategy, setDuplicateStrategy] = useState<"hash" | "number">(
    "hash"
  )

  // Derived filters
  const filenameFilter = useMemo(() => {
    return searchTags
      .filter((t) => t.startsWith("@"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [searchTags])

  const tagFilter = useMemo(() => {
    return searchTags
      .filter((t) => t.startsWith("#"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [searchTags])

  const metadataFilter = useMemo(() => {
    return searchTags
      .filter((t) => t.startsWith("$"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [searchTags])

  const generalFilters = useMemo(() => {
    return searchTags.filter(
      (t) => !t.startsWith("@") && !t.startsWith("#") && !t.startsWith("$")
    )
  }, [searchTags])

  const hasAnyFilter = !!(searchTags.length > 0 || hideRejected)

  // Reload ref
  const reloadRef = useRef<(() => void) | null>(null)

  // ── Refs for latest values ────────────────────────────────────────
  const backendUrlRef = useLatestRef(backendUrl)
  const settingsRef = useLatestRef(settings)
  const confirmRef = useLatestRef(confirm)

  const registerReload = useCallback((fn: (() => void) | null) => {
    reloadRef.current = fn
  }, [])

  const triggerReload = useCallback(() => {
    reloadRef.current?.()
  }, [])

  // Actions
  const handleExport = useCallback(async () => {
    try {
      await curationApi.exportDataset(backendUrlRef.current, {
        ...(settingsRef.current.galleryExportScope === "approved"
          ? { status: "approved" }
          : {}),
        duplicateStrategy: settingsRef.current.galleryExportStrategy,
      })
      toast.success("내보내기가 완료되었습니다.")
    } catch {
      toast.error("내보내기 요청에 실패했습니다.")
    }
  }, [])

  const handleRefresh = useCallback(() => {
    reloadRef.current?.()
  }, [])

  const handleEmptyTrash = useCallback(async () => {
    if (
      !(await confirmRef.current({
        title: "휴지통 비우기",
        description: "휴지통의 이미지를 영구 삭제합니다. 계속하시겠습니까?",
        variant: "destructive",
        confirmText: "영구 삭제",
      }))
    )
      return
    try {
      const n = await curationApi.emptyTrash(backendUrlRef.current)
      toast.success(`${n}개 영구 삭제됨`)
      reloadRef.current?.()
    } catch {
      toast.error("휴지통 비우기에 실패했습니다.")
    }
  }, [])

  const clearAllFilters = useCallback(() => {
    setSearchTags([])
    setSearchInput("")
    setHideRejected(false)
  }, [])

  const value = useMemo<GalleryToolbarValue>(
    () => ({
      statusFilter,
      setStatusFilter,
      viewMode,
      setViewMode,
      groupMode,
      setGroupMode,
      showFilters,
      setShowFilters,
      hideRejected,
      setHideRejected,
      searchTags,
      setSearchTags,
      searchInput,
      setSearchInput,
      candidates,
      setCandidates,
      sortKey,
      setSortKey,
      sortDir,
      setSortDir,
      thumbnailSize,
      setThumbnailSize,
      duplicateStrategy,
      setDuplicateStrategy,
      // Compatibility aliases for SavedImagesGallery
      galleryViewMode: viewMode,
      setGalleryViewMode: setViewMode,
      reload: handleRefresh,
      filenameFilter,
      tagFilter,
      metadataFilter,
      generalFilters,
      hasAnyFilter,
      handleExport,
      handleRefresh,
      handleEmptyTrash,
      clearAllFilters,
      registerReload,
      triggerReload,
    }),
    [
      statusFilter,
      viewMode,
      groupMode,
      showFilters,
      hideRejected,
      searchTags,
      searchInput,
      candidates,
      sortKey,
      sortDir,
      thumbnailSize,
      setThumbnailSize,
      duplicateStrategy,
      handleRefresh,
      filenameFilter,
      tagFilter,
      metadataFilter,
      generalFilters,
      hasAnyFilter,
      handleExport,
      handleEmptyTrash,
      clearAllFilters,
      registerReload,
      triggerReload,
    ]
  )

  return (
    <GalleryToolbarContext.Provider value={value}>
      {children}
    </GalleryToolbarContext.Provider>
  )
}
