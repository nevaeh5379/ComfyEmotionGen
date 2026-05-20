import { createContext, useContext, useState } from "react"
import { useSyncedStorage } from "../hooks/useSyncedStorage"
import {
  useSavedTemplates,
  type SavedTemplate,
} from "../hooks/useSavedTemplates"
import { STORAGE_KEYS } from "@/lib/storageKeys"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  onPendingUpdate?: (
    name: string,
    type: "template",
    oldContent: string,
    newContent: string
  ) => boolean | null
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TemplateContext = createContext<TemplateContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useTemplateContext(): TemplateContextValue {
  const ctx = useContext(TemplateContext)
  if (!ctx)
    throw new Error("useTemplateContext must be used within TemplateProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface TemplateProviderProps {
  onPendingSave: (name: string, type: "template") => void
  onPendingUpdate?: (
    name: string,
    type: "template",
    oldContent: string,
    newContent: string
  ) => boolean | null
  children: React.ReactNode
}

export function TemplateProvider({
  onPendingSave,
  onPendingUpdate,
  children,
}: TemplateProviderProps): React.JSX.Element {
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
        onPendingSave,
        ...(onPendingUpdate ? { onPendingUpdate } : {}),
      }}
    >
      {children}
    </TemplateContext.Provider>
  )
}
