import { CombinationPicker } from "../combinationpicker/CombinationPicker"
import type { CurationToolbarState } from "../combinationpicker/CurationToolbarTypes"
import type { SavedTemplate } from "../../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../../hooks/useSavedWorkflows"
import type { AppSettings } from "../../hooks/useSettings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurationTabProps {
  backendUrl: string
  cegTemplate: string
  savedTemplates: SavedTemplate[]
  enableHover: AppSettings["enableHover"]
  autoApplyReject: AppSettings["autoApplyReject"]
  hideEmptyCurationFolders: AppSettings["hideEmptyCurationFolders"]
  savedWorkflows: SavedWorkflow[]
  fluidGridLayout: AppSettings["fluidGridLayout"]
  curationSelectedAxis: string
  setCurationSelectedAxis: (axis: string) => void
}

// ---------------------------------------------------------------------------
// CurationTab
// ---------------------------------------------------------------------------

export function CurationTab({
  backendUrl,
  cegTemplate,
  savedTemplates,
  enableHover,
  autoApplyReject,
  hideEmptyCurationFolders,
  savedWorkflows,
  fluidGridLayout,
  curationSelectedAxis,
  setCurationSelectedAxis,
}: CurationTabProps) {
  const toolbarState: CurationToolbarState = {
    selectedAxis: curationSelectedAxis,
    setSelectedAxis: setCurationSelectedAxis,
    viewMode: "gallery" as const,
    setViewMode: () => {},
    hideTopSection: true,
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <CombinationPicker
        backendUrl={backendUrl}
        cegTemplate={cegTemplate}
        savedTemplates={savedTemplates}
        enableHover={enableHover}
        autoApplyReject={autoApplyReject}
        hideEmptyCurationFolders={hideEmptyCurationFolders}
        savedWorkflows={savedWorkflows}
        fluidGridLayout={fluidGridLayout}
        toolbarState={toolbarState}
      />
    </div>
  )
}