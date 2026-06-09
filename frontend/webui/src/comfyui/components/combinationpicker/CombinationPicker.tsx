import { memo, useEffect, useMemo, useState } from "react"
import { CurationProvider } from "./CurationContext.tsx"
import { useCombinationData } from "./useCombinationData"
import { useCombinationSelection } from "./useCombinationSelection"
import { CombinationPickerContent } from "./CombinationPickerContent"
import type { SavedTemplate } from "../../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../../hooks/useSavedWorkflows"
import type { CurationToolbarState } from "./CurationToolbarTypes"
import { useSyncedStorage } from "../../hooks/useSyncedStorage"
import { STORAGE_KEYS } from "../../../lib/storageKeys"
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
  hideEmptyCurationFolders?: boolean
  toolbarState?: CurationToolbarState
  fluidGridLayout?: boolean
}

export const CombinationPicker = memo(function CombinationPicker({
  backendUrl,
  cegTemplate,
  savedTemplates,
  savedWorkflows,
  enableHover = true,
  autoApplyReject = true,
  hideEmptyCurationFolders = false,
  toolbarState,
  fluidGridLayout = true,
}: Props) {
  const [internalAxis, setInternalAxis] = useState<string>(DEFAULT_AXIS)
  const selectedAxis = toolbarState?.selectedAxis ?? internalAxis
  const setSelectedAxis = toolbarState?.setSelectedAxis ?? setInternalAxis

  const [thumbnailSize, setThumbnailSize] = useSyncedStorage<number>(
    STORAGE_KEYS.curationThumbnailSize,
    180
  )

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
    hideEmptyCurationFolders,
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
      fluidGridLayout={fluidGridLayout}
      thumbnailSize={thumbnailSize}
      setThumbnailSize={setThumbnailSize}
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
