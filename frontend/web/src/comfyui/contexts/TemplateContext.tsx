import { useState, useCallback, useMemo } from "react"
import { useSyncedStorage } from "../hooks/useSyncedStorage"
import {
  useSavedTemplates,
  type SavedTemplate,
} from "../hooks/useSavedTemplates"
import type { TemplateItem } from "../components/TemplateGeneratorPanel"
import { usePendingDialog } from "./PendingDialogContext"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { toast } from "sonner"
import { TemplateContext } from "./TemplateContextObject"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratorToolbarProps {
  generatedCode: string
  saveName: string
  setSaveName: (name: string) => void
  handleSave: () => void
  handleApply: () => void
  effectiveId: string
  setSelectedTemplateId: (id: string) => void
  groupedTemplates: Record<string, TemplateItem[]>
  catLabel: (c: string) => string
}

export interface TemplateContextValue {
  cegTemplate: string
  setCegTemplate: (value: string) => void
  activeTemplateId: string | null
  setActiveTemplateId: (id: string | null) => void
  savedTemplates: SavedTemplate[]
  saveTemplate: (name: string, template: string) => SavedTemplate
  deleteTemplate: (id: string) => void
  templateResetKey: number
  setTemplateResetKey: (key: number | ((prev: number) => number)) => void
  /** Called when a name conflict needs App-level resolution */
  onPendingSave: (name: string, type: "template") => void
  /** Called when updating a saved item; shows diff if content changed */
  onPendingUpdate: (
    name: string,
    type: "template",
    oldContent: string,
    newContent: string
  ) => boolean | null
  generatorToolbarProps: GeneratorToolbarProps | null
  setGeneratorToolbarProps: (props: GeneratorToolbarProps | null) => void
  isDirty?: boolean
  saveToServer?: () => Promise<boolean>
  revert?: () => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TemplateProviderProps {
  children: React.ReactNode
}

export function TemplateProvider({
  children,
}: TemplateProviderProps): React.JSX.Element {
  const { setPendingSave, handlePendingUpdate } = usePendingDialog()

  const [cegTemplate, setCegTemplate, { isDirty: isCegDirty, saveToServer: saveCegToServer, revert: revertCeg }] = useSyncedStorage(
    STORAGE_KEYS.cegTemplate,
    "",
    { manual: true }
  )
  const [activeTemplateId, setActiveTemplateId] = useSyncedStorage<
    string | null
  >(STORAGE_KEYS.activeTemplateId, null)
  const [templateResetKey, setTemplateResetKey] = useState(0)
  const {
    templates: savedTemplates,
    saveTemplate: originalSaveTemplate,
    deleteTemplate,
  } = useSavedTemplates()

  const saveTemplate = useCallback(
    (name: string, templateContent: string) => {
      try {
        const res = originalSaveTemplate(name, templateContent)
        saveCegToServer()
        return res
      } catch (err) {
        toast.error("템플릿 저장에 실패했습니다.")
        throw err
      }
    },
    [originalSaveTemplate, saveCegToServer]
  )
  const [generatorToolbarProps, setGeneratorToolbarProps] = useState<GeneratorToolbarProps | null>(null)

  const onPendingSave = useCallback(
    (name: string, type: "template") => setPendingSave({ name, type }),
    [setPendingSave]
  )

  const onPendingUpdate = useCallback(
    (
      name: string,
      type: "template",
      oldContent: string,
      newContent: string
    ) => handlePendingUpdate(name, type, oldContent, newContent),
    [handlePendingUpdate]
  )

  const value = useMemo<TemplateContextValue>(
    () => ({
      cegTemplate,
      setCegTemplate,
      activeTemplateId,
      setActiveTemplateId,
      savedTemplates,
      saveTemplate,
      deleteTemplate,
      templateResetKey,
      setTemplateResetKey,
      onPendingSave,
      onPendingUpdate,
      generatorToolbarProps,
      setGeneratorToolbarProps,
      isDirty: isCegDirty,
      saveToServer: saveCegToServer,
      revert: revertCeg,
    }),
    [
      cegTemplate,
      setCegTemplate,
      activeTemplateId,
      setActiveTemplateId,
      savedTemplates,
      saveTemplate,
      deleteTemplate,
      templateResetKey,
      setTemplateResetKey,
      onPendingSave,
      onPendingUpdate,
      generatorToolbarProps,
      setGeneratorToolbarProps,
      isCegDirty,
      saveCegToServer,
      revertCeg,
    ]
  )

  return (
    <TemplateContext.Provider value={value}>
      {children}
    </TemplateContext.Provider>
  )
}
