import { useState, useCallback, useMemo, useRef } from "react"

import { CurationToolbarContext } from "./CurationToolbarContext"
import { useLocalStorage } from "../../hooks/useLocalStorage"
import { STORAGE_KEYS } from "@/lib/storageKeys"

export type CurationViewMode =
  | "gallery"
  | "table"
  | "grid"
  | "compare"
  | "tournament"

export interface CurationToolbarState {
  selectedAxis: string
  setSelectedAxis: (axis: string) => void
  viewMode: CurationViewMode
  setViewMode: (v: CurationViewMode) => void
  hideTopSection: boolean
  exportIsLoading?: boolean
  setExportIsLoading?: (v: boolean) => void
  exportMessage?: string | null
  setExportMessage?: (v: string | null) => void
  regenMessage?: string | null
  setRegenMessage?: (v: string | null) => void
  onExport?: () => void
  onRegenerate?: () => void
}

export interface CurationToolbarValue {
  selectedAxis: string
  setSelectedAxis: (v: string) => void
  savedTemplates: { id: string; name: string }[]
  viewMode: CurationViewMode
  setViewMode: (v: CurationViewMode) => void
  listLayout: "gallery" | "table"
  setListLayout: (v: "gallery" | "table") => void
  gridSubMode: "grid" | "compare" | "tournament"
  setGridSubMode: (v: "grid" | "compare" | "tournament") => void
  filtersExpanded: boolean
  setFiltersExpanded: (v: boolean) => void
  hideRejected: boolean
  setHideRejected: (v: boolean) => void
  autoAdvance: boolean
  setAutoAdvance: (v: boolean) => void
  duplicateStrategy: "hash" | "number"
  setDuplicateStrategy: (v: "hash" | "number") => void
  showUnassignedPanel: boolean
  setShowUnassignedPanel: (v: boolean) => void
  unassignedGroupsSize: number
  setUnassignedGroupsSize: (v: number) => void
  handleExport: () => void
  setExportHandler: (fn: () => void) => void
  onRefresh: () => void
  setRefreshHandler: (fn: () => void) => void
}

export function CurationToolbarProvider({
  children,
  selectedAxis,
  setSelectedAxis,
  savedTemplates,
}: {
  children: React.ReactNode
  selectedAxis: string
  setSelectedAxis: (v: string) => void
  savedTemplates: { id: string; name: string }[]
}): React.JSX.Element {
  const [viewMode, setViewModeState] = useLocalStorage<CurationViewMode>(
    STORAGE_KEYS.curationViewMode,
    "gallery"
  )
  const [listLayout, setListLayoutState] = useLocalStorage<"gallery" | "table">(
    STORAGE_KEYS.curationListLayout,
    "gallery"
  )
  const [gridSubMode, setGridSubModeState] = useLocalStorage<"grid" | "compare" | "tournament">(
    STORAGE_KEYS.curationGridSubMode,
    "grid"
  )
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [hideRejected, setHideRejected] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [duplicateStrategy, setDuplicateStrategy] = useState<"hash" | "number">("hash")
  const [showUnassignedPanel, setShowUnassignedPanel] = useState(false)
  const [unassignedGroupsSize, setUnassignedGroupsSize] = useState(0)
  const exportRef = useRef<() => void>(() => {})
  const refreshRef = useRef<() => void>(() => {})

  const setViewMode = useCallback((mode: CurationViewMode) => {
    setViewModeState(mode)
    if (mode === "gallery" || mode === "table") {
      setListLayoutState(mode)
    } else {
      setGridSubModeState(mode)
    }
  }, [])

  const setListLayout = useCallback((layout: "gallery" | "table") => {
    setListLayoutState(layout)
    setViewModeState(layout)
  }, [])

  const setGridSubMode = useCallback((subMode: "grid" | "compare" | "tournament") => {
    setGridSubModeState(subMode)
    setViewModeState(subMode)
  }, [])

  const setExportHandler = useCallback((fn: () => void) => {
    exportRef.current = fn
  }, [])

  const handleExport = useCallback(() => {
    exportRef.current()
  }, [])

  const setRefreshHandler = useCallback((fn: () => void) => {
    refreshRef.current = fn
  }, [])

  const onRefresh = useCallback(() => {
    refreshRef.current()
  }, [])

  const value = useMemo(
    () => ({
      selectedAxis,
      setSelectedAxis,
      savedTemplates,
      viewMode,
      setViewMode,
      listLayout,
      setListLayout,
      gridSubMode,
      setGridSubMode,
      filtersExpanded,
      setFiltersExpanded,
      hideRejected,
      setHideRejected,
      autoAdvance,
      setAutoAdvance,
      duplicateStrategy,
      setDuplicateStrategy,
      showUnassignedPanel,
      setShowUnassignedPanel,
      unassignedGroupsSize,
      setUnassignedGroupsSize,
      handleExport,
      setExportHandler,
      onRefresh,
      setRefreshHandler,
    }),
    [
      selectedAxis,
      setSelectedAxis,
      savedTemplates,
      viewMode,
      setViewMode,
      listLayout,
      setListLayout,
      gridSubMode,
      setGridSubMode,
      filtersExpanded,
      setFiltersExpanded,
      hideRejected,
      setHideRejected,
      autoAdvance,
      setAutoAdvance,
      duplicateStrategy,
      setDuplicateStrategy,
      showUnassignedPanel,
      setShowUnassignedPanel,
      unassignedGroupsSize,
      setUnassignedGroupsSize,
      handleExport,
      setExportHandler,
      onRefresh,
      setRefreshHandler,
    ]
  )

  return (
    <CurationToolbarContext.Provider value={value}>
      {children}
    </CurationToolbarContext.Provider>
  )
}
