import { createContext } from "react"
import { useContextRequired } from "@/lib/context"
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

export const GalleryToolbarContext = createContext<GalleryToolbarValue | null>(
  null
)

export function useGalleryToolbar(): GalleryToolbarValue {
  return useContextRequired(GalleryToolbarContext, "useGalleryToolbar")
}
