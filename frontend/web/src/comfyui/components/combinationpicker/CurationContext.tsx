import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { SavedTemplate } from "../../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../../hooks/useSavedWorkflows"
import type { useCombinationData } from "./useCombinationData"
import type { useCombinationSelection } from "./useCombinationSelection"

export interface CurationContextValue {
  backendUrl: string
  cegTemplate: string
  savedTemplates: SavedTemplate[]
  savedWorkflows: SavedWorkflow[]
  enableHover: boolean
  autoApplyReject: boolean

  // Data
  data: ReturnType<typeof useCombinationData>
  
  // Selection
  selection: ReturnType<typeof useCombinationSelection>
}

const CurationContext = createContext<CurationContextValue | null>(null)

export function useCurationContext() {
  const context = useContext(CurationContext)
  if (!context) {
    throw new Error(
      "useCurationContext must be used within a CurationProvider"
    )
  }
  return context
}

interface CurationProviderProps {
  children: ReactNode
  backendUrl: string
  cegTemplate: string
  savedTemplates: SavedTemplate[]
  savedWorkflows: SavedWorkflow[]
  enableHover?: boolean
  autoApplyReject?: boolean
  data: ReturnType<typeof useCombinationData>
  selection: ReturnType<typeof useCombinationSelection>
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
