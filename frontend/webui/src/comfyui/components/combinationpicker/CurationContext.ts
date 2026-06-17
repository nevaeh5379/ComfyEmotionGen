import { createContext, useContext } from "react"
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
  fluidGridLayout: boolean
  thumbnailSize: number
  setThumbnailSize: (v: number) => void

  // Data
  data: ReturnType<typeof useCombinationData>

  // Selection
  selection: ReturnType<typeof useCombinationSelection>
}

const CurationContext = createContext<CurationContextValue | null>(null)

export function useCurationContext() {
  const context = useContext(CurationContext)
  if (!context) {
    throw new Error("useCurationContext must be used within a CurationProvider")
  }
  return context
}

// Re-export context for provider
export { CurationContext }
