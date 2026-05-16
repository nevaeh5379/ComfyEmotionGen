import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import CodeEditor from "@/components/CodeEditor"

import { SavedItemsManager } from "./SavedItemsManager"
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

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>CEG 탬플릿</FieldLabel>
        <div className="relative">
          <CodeEditor
            language="ceg"
            placeholder="CEG 탬플릿 입력 칸"
            value={cegTemplate}
            onChange={setCegTemplate}
            minHeight="100px"
          />
          {previewCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 z-10 h-6 px-2 text-xs opacity-50 hover:opacity-100"
              onClick={onPreviewOpen}
            >
              미리보기 ({previewCount})
            </Button>
          )}
        </div>
        <SavedItemsManager
          key={templateResetKey}
          items={savedTemplates}
          onSave={onSaveTemplate}
          onLoad={onLoadTemplate}
          onDelete={onDeleteTemplate}
          placeholder="탬플릿 이름"
          saveDisabled={!cegTemplate.trim()}
          activeItemId={activeTemplateId ?? undefined}
          onUpdate={onUpdateTemplate}
        />
      </Field>
    </FieldGroup>
  )
}
