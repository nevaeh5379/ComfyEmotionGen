import { createContext, useContext, useState, useCallback, useMemo, useRef } from "react"

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

const CurationToolbarContext = createContext<CurationToolbarValue | null>(null)

export function useCurationToolbar(): CurationToolbarValue {
  const ctx = useContext(CurationToolbarContext)
  if (!ctx)
    throw new Error(
      "useCurationToolbar must be used within CurationToolbarProvider"
    )
  return ctx
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
  const [viewMode, setViewMode] = useState<CurationViewMode>("gallery")
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [hideRejected, setHideRejected] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [duplicateStrategy, setDuplicateStrategy] = useState<"hash" | "number">("hash")
  const [showUnassignedPanel, setShowUnassignedPanel] = useState(false)
  const [unassignedGroupsSize, setUnassignedGroupsSize] = useState(0)
  const exportRef = useRef<() => void>(() => {})
  const refreshRef = useRef<() => void>(() => {})

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
