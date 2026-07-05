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
import { type CurationGroup } from "./CurationToolbarTypes"
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
  activeGroupId?: string
  setActiveGroupId?: (id: string) => void
  activeFilters?: Record<string, string>
  setActiveFilters?: (filters: Record<string, string>) => void
  savedGroups?: CurationGroup[]
  setSavedGroups?: (groups: CurationGroup[]) => void
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
  activeGroupId,
  setActiveGroupId,
  activeFilters,
  setActiveFilters,
  savedGroups,
  setSavedGroups,
}: Props) {
  const [localActiveGroupId, setLocalActiveGroupId] = useState<string>("preset:template:__current__")
  const [localActiveFilters, setLocalActiveFilters] = useState<Record<string, string>>({})
  const [localSavedGroups, setLocalSavedGroups] = useState<CurationGroup[]>([])

  const finalActiveGroupId = activeGroupId ?? localActiveGroupId
  const finalSetActiveGroupId = setActiveGroupId ?? setLocalActiveGroupId
  const finalActiveFilters = activeFilters ?? localActiveFilters
  const finalSetActiveFilters = setActiveFilters ?? setLocalActiveFilters
  const finalSavedGroups = savedGroups ?? localSavedGroups
  const finalSetSavedGroups = setSavedGroups ?? setLocalSavedGroups

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
    if (axisValue.kind === "template" && axisValue.templateId !== CURRENT_TEMPLATE_ID) {
      return (
        savedTemplates.find((t) => t.id === axisValue.templateId)?.template ??
        cegTemplate
      )
    }
    return cegTemplate
  }, [axisValue, cegTemplate, savedTemplates])

  const data = useCombinationData({
    backendUrl,
    activeTemplate,
    freeGroupMode,
    hideEmptyCurationFolders,
    selectedAxis,
    setSelectedAxis,
    activeGroupId: finalActiveGroupId,
    setActiveGroupId: finalSetActiveGroupId,
    activeFilters: finalActiveFilters,
    setActiveFilters: finalSetActiveFilters,
    savedGroups: finalSavedGroups,
    setSavedGroups: finalSetSavedGroups,
  })

  const { fetchData } = data

  useEffect(() => {
    void fetchData()
  }, [fetchData, backendUrl, activeTemplate, freeGroupMode])

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
