import { useEffect, type ReactNode } from "react"
import { useSettings } from "../hooks/useSettings"
import {
  usePanelState,
  useDockablePanel,
} from "../hooks/usePanelState"
import {
  type PanelLayoutValue,
  PanelLayoutContext,
} from "./PanelLayoutContext"

export function PanelLayoutProvider({
  children,
}: {
  children: ReactNode
}): React.JSX.Element {
  const { settings } = useSettings()

  const composition = usePanelState("Composition", {
    pos: { x: 50, y: 150 },
    size: { w: 420, h: 650 },
  })
  const jobManager = usePanelState("JobManager", {
    pos: { x: 500, y: 150 },
    size: { w: 750, h: 650 },
  })
  const gallery = useDockablePanel("Gallery", {
    pos: { x: 100, y: 100 },
    size: { w: 600, h: 500 },
  })
  const stats = useDockablePanel("Stats", {
    pos: { x: 200, y: 100 },
    size: { w: 700, h: 500 },
  })
  const curation = useDockablePanel("Curation", {
    pos: { x: 300, y: 100 },
    size: { w: 800, h: 600 },
  })

  // When window mode is off, collapse all floating/docked panels
  useEffect(() => {
    if (!settings.useWindowMode) {
      composition.setIsFloating(false)
      jobManager.setIsFloating(false)
      gallery.setIsFloating(false)
      gallery.setIsDocked(false)
      stats.setIsFloating(false)
      stats.setIsDocked(false)
      curation.setIsFloating(false)
      curation.setIsDocked(false)
    }
  }, [
    settings.useWindowMode,
    composition,
    jobManager,
    gallery,
    stats,
    curation,
  ])

  const value: PanelLayoutValue = {
    composition,
    jobManager,
    gallery,
    stats,
    curation,
  }

  return (
    <PanelLayoutContext.Provider value={value}>
      {children}
    </PanelLayoutContext.Provider>
  )
}
