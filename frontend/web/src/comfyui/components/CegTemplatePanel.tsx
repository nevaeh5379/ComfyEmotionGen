import { Download, FileCode2, Eye, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import CodeEditor from "@/components/CodeEditor"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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
  onDownloadSingle?: (() => void) | undefined
  onFileOpen?: ((content: string, name: string) => void) | undefined
  isDirty?: boolean | undefined
  onRevert?: (() => void) | undefined
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
  onDownloadSingle,
  onFileOpen,
  isDirty,
  onRevert,
}: CegTemplatePanelProps) {
  const activeName = activeTemplateId
    ? savedTemplates.find((t) => t.id === activeTemplateId)?.name
    : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-muted/40 px-3 py-1.5">
        <div className="relative flex items-center justify-center shrink-0">
          <FileCode2 className="h-3.5 w-3.5 text-primary opacity-70" />
          {isDirty && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500"></span>
          )}
        </div>
        <div className="min-w-0 flex-1">
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
            allowEmptySave
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isDirty && onRevert && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={onRevert}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>변경사항 취소 (되돌리기)</TooltipContent>
            </Tooltip>
          )}
          {previewCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  onClick={onPreviewOpen}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>미리보기</TooltipContent>
            </Tooltip>
          )}
          {activeTemplateId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  onClick={onDownloadSingle}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>템플릿 다운로드</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault()
            if (onUpdateTemplate) {
              onUpdateTemplate()
            } else {
              const input = e.currentTarget.parentElement?.querySelector("input")
              input?.focus()
            }
          }
        }}
      >
        <CodeEditor
          language="ceg"
          placeholder="CEG 템플릿 입력 칸"
          value={cegTemplate}
          onChange={setCegTemplate}
          onFileOpen={onFileOpen}
          minHeight="100px"
          bareWrapper
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
