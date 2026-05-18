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
