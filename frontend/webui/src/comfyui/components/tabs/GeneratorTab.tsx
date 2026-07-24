import { TemplateGeneratorPanel } from "../TemplateGeneratorPanel"
import type { TabId } from "../layout/nav-tabs"
import type { RenderItem } from "../../types/renderTypes"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratorTabProps {
  setActiveTab: (tab: TabId) => void
  backendUrl: string
  handleRunSingle: (
    item: RenderItem,
    options?: { cegTemplate?: string }
  ) => Promise<boolean>
}

// ---------------------------------------------------------------------------
// GeneratorTab
// ---------------------------------------------------------------------------

export function GeneratorTab({
  setActiveTab,
  backendUrl,
  handleRunSingle,
}: GeneratorTabProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TemplateGeneratorPanel
        setActiveTab={setActiveTab}
        backendUrl={backendUrl}
        handleRunSingle={handleRunSingle}
      />
    </div>
  )
}
