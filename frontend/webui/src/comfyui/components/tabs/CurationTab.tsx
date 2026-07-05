import { CombinationPicker } from "../combinationpicker/CombinationPicker"
import { type CurationGroup } from "../combinationpicker/CurationToolbarTypes"
import type {
  CurationToolbarState,
  CurationViewMode,
} from "../combinationpicker/CurationToolbarTypes"
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
  curationActiveGroupId: string
  setCurationActiveGroupId: (id: string) => void
  curationActiveFilters: Record<string, string>
  setCurationActiveFilters: (filters: Record<string, string>) => void
  curationSavedGroups: CurationGroup[]
  setCurationSavedGroups: (groups: CurationGroup[]) => void
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
  curationActiveGroupId,
  setCurationActiveGroupId,
  curationActiveFilters,
  setCurationActiveFilters,
  curationSavedGroups,
  setCurationSavedGroups,
}: CurationTabProps): React.JSX.Element {
  const toolbarState: CurationToolbarState = {
    selectedAxis: curationSelectedAxis,
    setSelectedAxis: setCurationSelectedAxis,
    viewMode: "gallery" as const,
    setViewMode: (_mode: CurationViewMode) => void 0,
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
        activeGroupId={curationActiveGroupId}
        setActiveGroupId={setCurationActiveGroupId}
        activeFilters={curationActiveFilters}
        setActiveFilters={setCurationActiveFilters}
        savedGroups={curationSavedGroups}
        setSavedGroups={setCurationSavedGroups}
      />
    </div>
  )
}
