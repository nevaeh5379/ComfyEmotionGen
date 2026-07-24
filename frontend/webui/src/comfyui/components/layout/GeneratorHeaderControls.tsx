import { useState } from "react"
import { ArrowRight, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTemplateContext } from "../../contexts/useTemplateContext"

interface GeneratorHeaderControlsProps {
  active: boolean
}

/**
 * 생성기 헤더와 저장 다이얼로그의 상태를 함께 소유한다.
 *
 * 저장 다이얼로그는 생성기 툴바에서만 열리므로 open 상태를 전역 Header에
 * 올리지 않는다. 이렇게 하면 다른 탭의 헤더 변경이 저장 흐름에 결합되지
 * 않는다.
 */
export function GeneratorHeaderControls({
  active,
}: GeneratorHeaderControlsProps): React.JSX.Element | null {
  const { generatorToolbarProps: toolbar } = useTemplateContext()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  if (!active || toolbar === null) return null

  const saveAndClose = (): void => {
    toolbar.handleSave()
    setSaveDialogOpen(false)
  }

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="hidden shrink-0 text-xs font-semibold text-muted-foreground sm:inline">
            템플릿
          </span>
          <Select
            value={toolbar.effectiveId}
            onValueChange={toolbar.setSelectedTemplateId}
          >
            <SelectTrigger className="!h-7 w-full border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 sm:w-[160px]">
              <SelectValue placeholder="선택..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                value="new"
                className="cursor-pointer text-[11px] font-bold text-primary focus:bg-primary/10 focus:text-primary-foreground"
              >
                + 새 템플릿 만들기
              </SelectItem>
              <SelectSeparator />
              {Object.entries(toolbar.groupedTemplates).map(
                ([category, templates]) => {
                  if (category === "new") return null
                  return (
                    <SelectGroup key={category}>
                      <SelectLabel className="text-[9px] font-bold tracking-widest uppercase">
                        {toolbar.catLabel(category)}
                      </SelectLabel>
                      {templates.map((template) => (
                        <SelectItem
                          key={template.id}
                          value={template.id}
                          className="text-[11px] font-bold"
                        >
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                }
              )}
            </SelectContent>
          </Select>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSaveDialogOpen(true)
              }}
              disabled={!toolbar.generatedCode}
              className="!h-7 shrink-0 gap-1 border-line px-2 text-[10px] font-bold hover:bg-muted"
            >
              <Save className="h-3 w-3" />
              <span className="hidden sm:inline">저장</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>템플릿 저장</TooltipContent>
        </Tooltip>

        <Button
          onClick={toolbar.handleApply}
          disabled={!toolbar.generatedCode}
          className="!h-7 shrink-0 gap-1 px-2.5 text-[10px] font-bold"
        >
          적용
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              템플릿 저장
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              현재 작성된 템플릿 구성을 저장합니다. 새로운 이름을 입력해 주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label
              htmlFor="dialog-save-name"
              className="mb-2 block text-xs font-semibold text-muted-foreground"
            >
              저장 이름
            </Label>
            <Input
              id="dialog-save-name"
              value={toolbar.saveName}
              onChange={(event) => {
                toolbar.setSaveName(event.target.value)
              }}
              placeholder="저장 이름 입력..."
              className="h-9 w-full font-mono text-sm"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                saveAndClose()
              }}
            />
          </div>
          <DialogFooter className="mt-2 flex flex-row justify-end gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSaveDialogOpen(false)
              }}
              className="h-8 px-4 text-xs font-semibold"
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={saveAndClose}
              disabled={!toolbar.saveName.trim() || !toolbar.generatedCode}
              className="h-8 px-4 text-xs font-semibold"
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
