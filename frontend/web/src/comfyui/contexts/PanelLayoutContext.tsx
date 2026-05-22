import { createContext, useContext, useEffect } from "react"
import { useLocalStorage } from "../hooks/useLocalStorage"
import { useSettings } from "../hooks/useSettings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FloatingState {
  isFloating: boolean
  setIsFloating: (v: boolean) => void
  pos: { x: number; y: number }
  setPos: (p: { x: number; y: number }) => void
  size: { w: number; h: number }
  setSize: (s: { w: number; h: number }) => void
}

export interface DockableState extends FloatingState {
  isDocked: boolean
  setIsDocked: (v: boolean) => void
  dockedSide: "start" | "end"
  setDockedSide: (s: "start" | "end") => void
}

export interface PanelLayoutValue {
  composition: FloatingState
  jobManager: FloatingState
  gallery: DockableState
  stats: DockableState
  curation: DockableState
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PanelLayoutContext = createContext<PanelLayoutValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function usePanelLayout(): PanelLayoutValue {
  const ctx = useContext(PanelLayoutContext)
  if (!ctx)
    throw new Error("usePanelLayout must be used within PanelLayoutProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PanelLayoutProvider({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const { settings } = useSettings()

  const [isGalleryFloating, setIsGalleryFloating] = useLocalStorage<boolean>(
    "ceg_isGalleryFloating",
    false
  )
  const [galleryFloatingPos, setGalleryFloatingPos] = useLocalStorage<{
    x: number
    y: number
  }>("ceg_galleryFloatingPos", { x: 100, y: 100 })
  const [galleryFloatingSize, setGalleryFloatingSize] = useLocalStorage<{
    w: number
    h: number
  }>("ceg_galleryFloatingSize", { w: 600, h: 500 })

  const [isCompositionFloating, setIsCompositionFloating] =
    useLocalStorage<boolean>("ceg_isCompositionFloating", false)
  const [compositionFloatingPos, setCompositionFloatingPos] = useLocalStorage<{
    x: number
    y: number
  }>("ceg_compositionFloatingPos", { x: 50, y: 150 })
  const [compositionFloatingSize, setCompositionFloatingSize] =
    useLocalStorage<{
      w: number
      h: number
    }>("ceg_compositionFloatingSize", { w: 420, h: 650 })

  const [isJobManagerFloating, setIsJobManagerFloating] =
    useLocalStorage<boolean>("ceg_isJobManagerFloating", false)
  const [jobManagerFloatingPos, setJobManagerFloatingPos] = useLocalStorage<{
    x: number
    y: number
  }>("ceg_jobManagerFloatingPos", { x: 500, y: 150 })
  const [jobManagerFloatingSize, setJobManagerFloatingSize] = useLocalStorage<{
    w: number
    h: number
  }>("ceg_jobManagerFloatingSize", { w: 750, h: 650 })

  const [isStatsFloating, setIsStatsFloating] = useLocalStorage<boolean>(
    "ceg_isStatsFloating",
    false
  )
  const [statsFloatingPos, setStatsFloatingPos] = useLocalStorage<{
    x: number
    y: number
  }>("ceg_statsFloatingPos", { x: 200, y: 100 })
  const [statsFloatingSize, setStatsFloatingSize] = useLocalStorage<{
    w: number
    h: number
  }>("ceg_statsFloatingSize", { w: 700, h: 500 })

  const [isCurationFloating, setIsCurationFloating] = useLocalStorage<boolean>(
    "ceg_isCurationFloating",
    false
  )
  const [curationFloatingPos, setCurationFloatingPos] = useLocalStorage<{
    x: number
    y: number
  }>("ceg_curationFloatingPos", { x: 300, y: 100 })
  const [curationFloatingSize, setCurationFloatingSize] = useLocalStorage<{
    w: number
    h: number
  }>("ceg_curationFloatingSize", { w: 800, h: 600 })

  const [isStatsDocked, setIsStatsDocked] = useLocalStorage<boolean>(
    "ceg_isStatsDocked",
    false
  )
  const [statsDockedSide, setStatsDockedSide] = useLocalStorage<
    "start" | "end"
  >("ceg_statsDockedSide", "end")

  const [isGalleryDocked, setIsGalleryDocked] = useLocalStorage<boolean>(
    "ceg_isGalleryDocked",
    false
  )
  const [galleryDockedSide, setGalleryDockedSide] = useLocalStorage<
    "start" | "end"
  >("ceg_galleryDockedSide", "end")

  const [isCurationDocked, setIsCurationDocked] = useLocalStorage<boolean>(
    "ceg_isCurationDocked",
    false
  )
  const [curationDockedSide, setCurationDockedSide] = useLocalStorage<
    "start" | "end"
  >("ceg_curationDockedSide", "end")

  // When window mode is off, collapse all floating/docked panels
  useEffect(() => {
    if (!settings.useWindowMode) {
      setIsGalleryFloating(false)
      setIsGalleryDocked(false)
      setIsCompositionFloating(false)
      setIsJobManagerFloating(false)
      setIsStatsFloating(false)
      setIsStatsDocked(false)
      setIsCurationFloating(false)
      setIsCurationDocked(false)
    }
  }, [
    settings.useWindowMode,
    setIsGalleryFloating,
    setIsGalleryDocked,
    setIsCompositionFloating,
    setIsJobManagerFloating,
    setIsStatsFloating,
    setIsStatsDocked,
    setIsCurationFloating,
    setIsCurationDocked,
  ])

  const value: PanelLayoutValue = {
    composition: {
      isFloating: isCompositionFloating,
      setIsFloating: setIsCompositionFloating,
      pos: compositionFloatingPos,
      setPos: setCompositionFloatingPos,
      size: compositionFloatingSize,
      setSize: setCompositionFloatingSize,
    },
    jobManager: {
      isFloating: isJobManagerFloating,
      setIsFloating: setIsJobManagerFloating,
      pos: jobManagerFloatingPos,
      setPos: setJobManagerFloatingPos,
      size: jobManagerFloatingSize,
      setSize: setJobManagerFloatingSize,
    },
    gallery: {
      isFloating: isGalleryFloating,
      setIsFloating: setIsGalleryFloating,
      pos: galleryFloatingPos,
      setPos: setGalleryFloatingPos,
      size: galleryFloatingSize,
      setSize: setGalleryFloatingSize,
      isDocked: isGalleryDocked,
      setIsDocked: setIsGalleryDocked,
      dockedSide: galleryDockedSide,
      setDockedSide: setGalleryDockedSide,
    },
    stats: {
      isFloating: isStatsFloating,
      setIsFloating: setIsStatsFloating,
      pos: statsFloatingPos,
      setPos: setStatsFloatingPos,
      size: statsFloatingSize,
      setSize: setStatsFloatingSize,
      isDocked: isStatsDocked,
      setIsDocked: setIsStatsDocked,
      dockedSide: statsDockedSide,
      setDockedSide: setStatsDockedSide,
    },
    curation: {
      isFloating: isCurationFloating,
      setIsFloating: setIsCurationFloating,
      pos: curationFloatingPos,
      setPos: setCurationFloatingPos,
      size: curationFloatingSize,
      setSize: setCurationFloatingSize,
      isDocked: isCurationDocked,
      setIsDocked: setIsCurationDocked,
      dockedSide: curationDockedSide,
      setDockedSide: setCurationDockedSide,
    },
  }

  return (
    <PanelLayoutContext.Provider value={value}>
      {children}
    </PanelLayoutContext.Provider>
  )
}
