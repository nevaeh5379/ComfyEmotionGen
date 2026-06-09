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

export function GeneratorTab({ setActiveTab, backendUrl }: GeneratorTabProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <TemplateGeneratorPanel
        setActiveTab={setActiveTab}
        backendUrl={backendUrl}
      />
    </div>
  )
}