import { createContext, useContext, useState } from "react"
import { useLocalStorage } from "../useLocalStorage"
import { useSavedTemplates, type SavedTemplate } from "../useSavedTemplates"

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
  children: React.ReactNode
}

export function TemplateProvider({
  onPendingSave,
  children,
}: TemplateProviderProps): React.JSX.Element {
  const [cegTemplate, setCegTemplate] = useLocalStorage("cegTemplate", "")
  const [activeTemplateId, setActiveTemplateId] = useLocalStorage<
    string | null
  >("activeTemplateId", null)
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
      }}
    >
      {children}
    </TemplateContext.Provider>
  )
}
