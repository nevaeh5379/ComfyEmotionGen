import { memo, useMemo, useState } from "react"
import { CurationProvider } from "./CurationContext"
import { useCombinationData } from "./useCombinationData"
import { useCombinationSelection } from "./useCombinationSelection"
import { CombinationPickerContent } from "./CombinationPickerContent"
import type { SavedTemplate } from "../../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../../hooks/useSavedWorkflows"

interface Props {
  backendUrl: string
  cegTemplate: string
  savedTemplates: SavedTemplate[]
  savedWorkflows: SavedWorkflow[]
  enableHover?: boolean
  autoApplyReject?: boolean
}

export const CombinationPicker = memo(function CombinationPicker({
  backendUrl,
  cegTemplate,
  savedTemplates,
  savedWorkflows,
  enableHover = true,
  autoApplyReject = true,
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")

  const activeTemplate = useMemo(
    () =>
      savedTemplates.find((t) => t.id === selectedTemplateId)?.template ??
      cegTemplate,
    [savedTemplates, selectedTemplateId, cegTemplate]
  )

  const data = useCombinationData({ backendUrl, activeTemplate })
  const selection = useCombinationSelection(data.filteredRenderItems.map(i => i.filename))

  return (
    <CurationProvider
      backendUrl={backendUrl}
      cegTemplate={cegTemplate}
      savedTemplates={savedTemplates}
      savedWorkflows={savedWorkflows}
      enableHover={enableHover}
      autoApplyReject={autoApplyReject}
      data={data}
      selection={selection}
    >
      <CombinationPickerContent 
        selectedTemplateId={selectedTemplateId}
        setSelectedTemplateId={setSelectedTemplateId}
        activeTemplate={activeTemplate}
      />
    </CurationProvider>
  )
})
