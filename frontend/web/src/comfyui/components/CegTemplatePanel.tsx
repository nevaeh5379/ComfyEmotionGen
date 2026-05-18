import { FileCode2, Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import CodeEditor from "@/components/CodeEditor"

import { SaveInputBar } from "./SavedItemsManager"
import type { SavedTemplate } from "../hooks/useSavedTemplates"

interface CegTemplatePanelProps {
  cegTemplate: string
  setCegTemplate: (value: string) => void
  previewCount: number
  onPreviewOpen: () => void
  templateResetKey: number
  savedTemplates: SavedTemplate[]
  activeTemplateId: string | null
  onSaveTemplate: (name: string) => boolean
  onLoadTemplate: (template: SavedTemplate) => void
  onDeleteTemplate: (id: string) => void
  onUpdateTemplate: (() => void) | undefined
}

export function CegTemplatePanel({
  cegTemplate,
  setCegTemplate,
  previewCount,
  onPreviewOpen,
  templateResetKey,
  savedTemplates,
  activeTemplateId,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  onUpdateTemplate,
}: CegTemplatePanelProps) {
  const activeName = activeTemplateId
    ? savedTemplates.find((t) => t.id === activeTemplateId)?.name
    : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-muted/40 px-3 py-1.5">
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary opacity-70" />
        <div className="min-w-0 flex-1 rounded-md border border-line bg-background/50 shadow-xs transition-all focus-within:ring-1 focus-within:ring-primary/20">
          <SaveInputBar
            key={templateResetKey}
            onSave={onSaveTemplate}
            placeholder={activeName ?? "템플릿 이름 입력..."}
            saveDisabled={!cegTemplate.trim()}
            activeName={activeName}
            items={savedTemplates}
            getFilterText={(t) => t.template}
            onLoad={onLoadTemplate}
            onDelete={onDeleteTemplate}
            activeItemId={activeTemplateId ?? undefined}
            onUpdate={onUpdateTemplate}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {previewCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
              onClick={onPreviewOpen}
              title="미리보기"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <CodeEditor
          language="ceg"
          placeholder="CEG 템플릿 입력 칸"
          value={cegTemplate}
          onChange={setCegTemplate}
          minHeight="100px"
          bareWrapper
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
