import {
  CheckIcon,
  CheckSquareIcon,
  FolderIcon,
  Loader2Icon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HoverCardContent } from "@/components/ui/hover-card"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useState, useMemo, useEffect, type ComponentProps } from "react"
import type { SavedImage } from "./Message"
import type { SavedTemplate } from "./useSavedTemplates"
import type { SavedWorkflow } from "./useSavedWorkflows"

export interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
}

export interface CombinationViewProps {
  items: RenderItem[]
  imagesByFilename: Map<string, SavedImage[]>
  backendUrl: string
  onSelect: (filename: string) => void
  onOpen: (filename: string) => void
  selectionMode: boolean
  selectedFilenames: Set<string>
  onToggleSelect: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
  enableHover?: boolean
}

export function ImagePreviewHoverCard({
  filename,
  images,
  backendUrl,
}: {
  filename: string
  images: SavedImage[]
  backendUrl: string
}) {
  return (
    <HoverCardContent className="w-72 p-3" side="right" align="start">
      <div className="mb-2 border-b pb-1.5 text-[10px] font-black tracking-widest text-primary uppercase">
        {filename} ({images.length}장)
      </div>
      {images.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">이미지 없음</p>
      ) : (
        <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
          {images.slice(0, 12).map((img) => (
            <div
              key={img.hash}
              className="relative aspect-square overflow-hidden rounded-md bg-muted"
            >
              <img
                src={`${backendUrl}/saved-images/${img.hash}`}
                className="h-full w-full object-cover"
                alt=""
                loading="lazy"
              />
              {img.status === "approved" && (
                <div className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-green-500 text-white">
                  <CheckIcon className="h-3 w-3" strokeWidth={3} />
                </div>
              )}
              {img.status === "rejected" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-[8px] font-bold text-white/80">
                    REJ
                  </span>
                </div>
              )}
            </div>
          ))}
          {images.length > 12 && (
            <div className="flex aspect-square items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
              +{images.length - 12}
            </div>
          )}
        </div>
      )}
    </HoverCardContent>
  )
}

export function CombinationContextMenu({
  filename,
  isSelected,
  selectionMode,
  onOpen,
  onToggleSelect,
  onLongPress,
  onRegenerate,
}: {
  filename: string
  isSelected: boolean
  selectionMode: boolean
  onOpen: (filename: string) => void
  onToggleSelect: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
}) {
  return (
    <ContextMenuContent className="w-52">
      <ContextMenuLabel className="truncate font-mono text-[10px]">
        {filename}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onOpen(filename)}>
        <FolderIcon className="h-4 w-4" /> 열기
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() =>
          selectionMode ? onToggleSelect(filename) : onLongPress(filename)
        }
      >
        {isSelected ? (
          <CheckSquareIcon className="h-4 w-4" />
        ) : (
          <SquareIcon className="h-4 w-4" />
        )}
        {isSelected ? "선택 해제" : "선택하기"}
      </ContextMenuItem>
      {onRegenerate && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onRegenerate(filename)}>
            <RefreshCwIcon className="h-4 w-4" /> 재생성
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )
}

interface LoadingButtonProps extends ComponentProps<typeof Button> {
  isLoading: boolean
  icon: React.ComponentType<{ className?: string }>
}

export function LoadingButton({
  isLoading,
  icon: Icon,
  children,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <Button {...props} disabled={isLoading || disabled}>
      {isLoading ? <Loader2Icon className="animate-spin" /> : <Icon />}
      {children}
    </Button>
  )
}

export interface RegenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filenames: string[]
  imagesByFilename: Map<string, SavedImage[]>
  currentCegTemplate: string
  savedTemplates: SavedTemplate[]
  savedWorkflows: SavedWorkflow[]
  onRegenerate: (count: number, template: string, workflow?: string) => void
  isLoading: boolean
}

export function RegenerateDialog({
  open,
  onOpenChange,
  filenames,
  imagesByFilename,
  currentCegTemplate,
  savedTemplates,
  savedWorkflows,
  onRegenerate,
  isLoading,
}: RegenerateDialogProps) {
  const [count, setCount] = useState(4)
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("")

  const historicalTemplates = useMemo(() => {
    const templates = new Set<string>()
    for (const filename of filenames) {
      const images = imagesByFilename.get(filename) ?? []
      for (const img of images) {
        if (img.cegTemplate) {
          templates.add(img.cegTemplate)
        }
      }
    }
    return Array.from(templates)
  }, [filenames, imagesByFilename])

  const historicalWorkflows = useMemo(() => {
    const items: { id: string; name: string; workflow: string }[] = []
    const seen = new Set<string>()
    let idx = 0
    for (const filename of filenames) {
      const images = imagesByFilename.get(filename) ?? []
      for (const img of images) {
        if (!img.workflow) continue
        const wf = JSON.stringify(img.workflow)
        if (seen.has(wf)) continue
        seen.add(wf)
        idx++
        const preview = wf.substring(0, 80)
        items.push({
          id: `__history_wf__${idx}`,
          name: `기록 ${idx} (${preview}${wf.length > 80 ? "..." : ""})`,
          workflow: wf,
        })
      }
    }
    return items
  }, [filenames, imagesByFilename])

  const selectedWorkflow = useMemo(() => {
    const sw = savedWorkflows.find((w) => w.id === selectedWorkflowId)
    if (sw) return { id: sw.id, name: sw.name, workflow: sw.workflow }
    return historicalWorkflows.find((w) => w.id === selectedWorkflowId)
  }, [selectedWorkflowId, savedWorkflows, historicalWorkflows])

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTemplate(currentCegTemplate || historicalTemplates[0] || "")
      setSelectedWorkflowId("")
    }
  }, [open, currentCegTemplate, historicalTemplates])

  const handleConfirm = () => {
    onRegenerate(count, selectedTemplate, selectedWorkflow?.workflow)
  }

  const canConfirm = isLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCwIcon className="h-5 w-5" />
            재생성 설정
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="regen-count"
              className="text-xs font-bold uppercase"
            >
              생성 갯수 (Count)
            </Label>
            <Input
              id="regen-count"
              type="number"
              min={1}
              max={64}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              className="font-mono font-bold"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="workflow-select"
              className="text-xs font-bold uppercase"
            >
              ComfyUI 워크플로우 선택
            </Label>
            <select
              id="workflow-select"
              value={selectedWorkflowId}
              onChange={(e) => {
                setSelectedWorkflowId(e.target.value)
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
            >
              <option value="">
                {selectedWorkflowId
                  ? "워크플로우 해제"
                  : "워크플로우 직접 선택"}
              </option>
              {savedWorkflows.length > 0 && (
                <optgroup label="저장된 워크플로우">
                  {savedWorkflows.map((sw) => (
                    <option key={sw.id} value={sw.id}>
                      {sw.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {historicalWorkflows.length > 0 && (
                <optgroup label="과거 사용 내역 (History)">
                  {historicalWorkflows.map((hw) => (
                    <option key={hw.id} value={hw.id}>
                      {hw.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {selectedWorkflow && (
            <div className="rounded-md bg-muted p-3">
              <div className="mb-1 text-[10px] font-bold text-muted-foreground uppercase">
                Workflow Preview
              </div>
              <pre className="max-h-32 overflow-y-auto font-mono text-[11px] leading-tight whitespace-pre-wrap">
                {selectedWorkflow.workflow}
              </pre>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="template-select"
              className="text-xs font-bold uppercase"
            >
              사용할 템플릿 (CEG Template)
            </Label>
            <select
              id="template-select"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
            >
              <optgroup label="현재 환경">
                <option value={currentCegTemplate}>
                  현재 편집 중인 템플릿
                </option>
                {savedTemplates.map((st) => (
                  <option key={st.id} value={st.template}>
                    프리셋: {st.name}
                  </option>
                ))}
              </optgroup>
              {historicalTemplates.length > 0 && (
                <optgroup label="과거 사용 내역 (History)">
                  {historicalTemplates.map((t, i) => (
                    <option key={i} value={t}>
                      과거 기록 {i + 1} (길이: {t.length})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {selectedTemplate && !selectedWorkflowId && (
            <div className="rounded-md bg-muted p-3">
              <div className="mb-1 text-[10px] font-bold text-muted-foreground uppercase">
                Template Preview
              </div>
              <pre className="max-h-32 overflow-y-auto font-mono text-[11px] leading-tight whitespace-pre-wrap">
                {selectedTemplate}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={canConfirm}>
            {isLoading && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            재생성 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
