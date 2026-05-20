import { memo, useEffect, useMemo, useState } from "react"
import { CurationProvider } from "./CurationContext.tsx"
import { useCombinationData } from "./useCombinationData"
import { useCombinationSelection } from "./useCombinationSelection"
import { CombinationPickerContent } from "./CombinationPickerContent"
import type { SavedTemplate } from "../../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../../hooks/useSavedWorkflows"
import type { CurationToolbarState } from "./CurationToolbarTypes"
import {
  CURRENT_TEMPLATE_ID,
  DEFAULT_AXIS,
  decodeAxis,
} from "./freeCurationGroupers"

interface Props {
  backendUrl: string
  cegTemplate: string
  savedTemplates: SavedTemplate[]
  savedWorkflows: SavedWorkflow[]
  enableHover?: boolean
  autoApplyReject?: boolean
  toolbarState?: CurationToolbarState
}

export const CombinationPicker = memo(function CombinationPicker({
  backendUrl,
  cegTemplate,
  savedTemplates,
  savedWorkflows,
  enableHover = true,
  autoApplyReject = true,
  toolbarState,
}: Props) {
  const [internalAxis, setInternalAxis] = useState<string>(DEFAULT_AXIS)
  const selectedAxis = toolbarState?.selectedAxis ?? internalAxis
  const setSelectedAxis = toolbarState?.setSelectedAxis ?? setInternalAxis

  const axisValue = useMemo(() => decodeAxis(selectedAxis), [selectedAxis])
  const isFreeMode = axisValue.kind === "free"
  const freeGroupMode = axisValue.kind === "free" ? axisValue.mode : null

  const activeTemplate = useMemo(() => {
    if (axisValue.kind === "free") return ""
    if (axisValue.templateId === CURRENT_TEMPLATE_ID) return cegTemplate
    return (
      savedTemplates.find((t) => t.id === axisValue.templateId)?.template ??
      cegTemplate
    )
  }, [axisValue, cegTemplate, savedTemplates])

  const data = useCombinationData({
    backendUrl,
    activeTemplate,
    freeGroupMode,
  })

  useEffect(() => {
    data.fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, activeTemplate, freeGroupMode])

  const selection = useCombinationSelection(
    data.filteredRenderItems.map((i) => i.filename)
  )

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
        selectedAxis={selectedAxis}
        setSelectedAxis={setSelectedAxis}
        activeTemplate={activeTemplate}
        isFreeMode={isFreeMode}
        freeGroupMode={freeGroupMode}
        {...(toolbarState && { toolbarState })}
      />
    </CurationProvider>
  )
})
