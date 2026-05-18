export type CurationViewMode =
  | "gallery"
  | "table"
  | "grid"
  | "compare"
  | "tournament"

export interface CurationToolbarState {
  selectedTemplateId: string
  setSelectedTemplateId: (id: string) => void
  viewMode: CurationViewMode
  setViewMode: (v: CurationViewMode) => void
  hideTopSection: boolean
  exportIsLoading: boolean
  setExportIsLoading: (v: boolean) => void
  exportMessage: string | null
  setExportMessage: (v: string | null) => void
  regenMessage: string | null
  setRegenMessage: (v: string | null) => void
  onExport: () => void
  onRegenerate: () => void
}
