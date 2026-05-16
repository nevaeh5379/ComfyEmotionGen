import { FileCode2, Eye } from "lucide-react"

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
} from "@/components/ui/input-group"
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
        <InputGroup>
          {/* ── top addon bar ─────────────────────── */}
          <InputGroupAddon align="block-start">
            <InputGroupText>
              <FileCode2 className="h-3.5 w-3.5" />
              CEG 탬플릿
            </InputGroupText>
            <div className="ml-auto flex items-center gap-1">
              {previewCount > 0 && (
                <InputGroupButton
                  onClick={onPreviewOpen}
                  size="sm"
                  title="미리보기"
                >
                  <Eye className="h-3.5 w-3.5" />
                  미리보기 ({previewCount})
                </InputGroupButton>
              )}
            </div>
          </InputGroupAddon>

          {/* ── editor ───────────────────────────── */}
          <CodeEditor
            language="ceg"
            placeholder="CEG 탬플릿 입력 칸"
            value={cegTemplate}
            onChange={setCegTemplate}
            minHeight="100px"
            bareWrapper
          />
        </InputGroup>
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
