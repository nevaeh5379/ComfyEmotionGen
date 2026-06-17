import { useMemo, type ReactNode } from "react"
import { CurationContext, type CurationContextValue } from "./CurationContext"

interface CurationProviderProps {
  children: ReactNode
  backendUrl: string
  cegTemplate: string
  savedTemplates: CurationContextValue["savedTemplates"]
  savedWorkflows: CurationContextValue["savedWorkflows"]
  enableHover?: boolean
  autoApplyReject?: boolean
  fluidGridLayout?: boolean
  thumbnailSize: number
  setThumbnailSize: (v: number) => void
  data: CurationContextValue["data"]
  selection: CurationContextValue["selection"]
}

export function CurationProvider({
  children,
  backendUrl,
  cegTemplate,
  savedTemplates,
  savedWorkflows,
  enableHover = true,
  autoApplyReject = true,
  fluidGridLayout = true,
  thumbnailSize,
  setThumbnailSize,
  data,
  selection,
}: CurationProviderProps) {
  const value = useMemo(
    () => ({
      backendUrl,
      cegTemplate,
      savedTemplates,
      savedWorkflows,
      enableHover,
      autoApplyReject,
      fluidGridLayout,
      thumbnailSize,
      setThumbnailSize,
      data,
      selection,
    }),
    [
      backendUrl,
      cegTemplate,
      savedTemplates,
      savedWorkflows,
      enableHover,
      autoApplyReject,
      fluidGridLayout,
      thumbnailSize,
      setThumbnailSize,
      data,
      selection,
    ]
  )

  return (
    <CurationContext.Provider value={value}>
      {children}
    </CurationContext.Provider>
  )
}
