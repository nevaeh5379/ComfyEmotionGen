import { createContext, useState } from "react"
import { useContextRequired } from "@/lib/context"
import { useSyncedStorage } from "../hooks/useSyncedStorage"
import {
  useSavedTemplates,
  type SavedTemplate,
} from "../hooks/useSavedTemplates"
import { usePendingDialog } from "./PendingDialogContext"
import { STORAGE_KEYS } from "@/lib/storageKeys"

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
  groupedTemplates: Record<string, any[]>
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
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TemplateContext = createContext<TemplateContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useTemplateContext(): TemplateContextValue {
  return useContextRequired(TemplateContext, "useTemplateContext")
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface TemplateProviderProps {
  children: React.ReactNode
}

export function TemplateProvider({
  children,
}: TemplateProviderProps): React.JSX.Element {
  const { setPendingSave, handlePendingUpdate } = usePendingDialog()

  const [cegTemplate, setCegTemplate] = useSyncedStorage(
    STORAGE_KEYS.cegTemplate,
    ""
  )
  const [activeTemplateId, setActiveTemplateId] = useSyncedStorage<
    string | null
  >(STORAGE_KEYS.activeTemplateId, null)
  const [templateResetKey, setTemplateResetKey] = useState(0)
  const {
    templates: savedTemplates,
    saveTemplate,
    deleteTemplate,
  } = useSavedTemplates()
  const [generatorToolbarProps, setGeneratorToolbarProps] = useState<GeneratorToolbarProps | null>(null)

  return (
    <TemplateContext.Provider
      value={{
        cegTemplate,
        setCegTemplate,
        activeTemplateId,
        setActiveTemplateId,
        savedTemplates,
        saveTemplate,
        deleteTemplate,
        templateResetKey,
        setTemplateResetKey,
        onPendingSave: (name: string, type: "template") =>
          setPendingSave({ name, type }),
        onPendingUpdate: (
          name: string,
          type: "template",
          oldContent: string,
          newContent: string
        ) => handlePendingUpdate(name, type, oldContent, newContent),
        generatorToolbarProps,
        setGeneratorToolbarProps,
      }}
    >
      {children}
    </TemplateContext.Provider>
  )
}
