import { FileCode2, Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import CodeEditor from "@/components/CodeEditor"

import { SaveInputBar } from "./SavedItemsManager"
import type { SavedTemplate } from "./useSavedTemplates"

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
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">CEG 탬플릿</span>
        </div>
        <div className="flex items-center gap-1">
          {previewCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={onPreviewOpen}
              title="미리보기"
            >
              <Eye className="h-3.5 w-3.5" />
              미리보기 <span className="mono">({previewCount})</span>
            </Button>
          )}
        </div>
      </div>
      <CodeEditor
        language="ceg"
        placeholder="CEG 탬플릿 입력 칸"
        value={cegTemplate}
        onChange={setCegTemplate}
        minHeight="100px"
        bareWrapper
        className="h-full min-h-0 w-full flex-1"
      />
      <div className="flex items-center justify-between border-t border-line px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          CEG 탬플릿 DSL 지원
        </span>
        <SaveInputBar
          key={templateResetKey}
          onSave={onSaveTemplate}
          placeholder={activeName ?? "탬플릿 이름"}
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
    </div>
  )
}
