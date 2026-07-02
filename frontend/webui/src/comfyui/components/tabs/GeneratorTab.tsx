import { TemplateGeneratorPanel } from "../TemplateGeneratorPanel"
import type { TabId } from "../layout/nav-tabs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratorTabProps {
  setActiveTab: (tab: TabId) => void
  backendUrl: string
}

// ---------------------------------------------------------------------------
// GeneratorTab
// ---------------------------------------------------------------------------

export function GeneratorTab({
  setActiveTab,
  backendUrl,
}: GeneratorTabProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TemplateGeneratorPanel
        setActiveTab={setActiveTab}
        backendUrl={backendUrl}
      />
    </div>
  )
}
