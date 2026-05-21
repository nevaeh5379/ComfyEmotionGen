import {
  CheckIcon,
  CheckSquareIcon,
  FolderIcon,
  RefreshCwIcon,
  SquareIcon,
  Clock,
  Tag,
  FileText,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import { Spinner } from "@/components/ui/spinner"
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
import type { SavedImage } from "../../types/Message"
import type { SavedTemplate } from "../../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../../hooks/useSavedWorkflows"

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
  const approvedCount = images.filter((img) => img.status === "approved").length
  const rejectedCount = images.filter((img) => img.status === "rejected").length
  const pendingCount = images.filter((img) => img.status === "pending").length
  const trashedCount = images.filter((img) => img.status === "trashed").length

  const allTags = Array.from(
    new Set(images.flatMap((img) => img.tags || []))
  ).filter(Boolean).slice(0, 4)

  const sortedImages = useMemo(() => {
    return [...images].sort((a, b) => b.createdAt - a.createdAt)
  }, [images])

  const latestImage = sortedImages[0]
  const latestPrompt = latestImage?.prompt || ""
  const latestNote = latestImage?.note || ""
  const latestDate = latestImage?.createdAt
    ? new Date(latestImage.createdAt).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""

  return (
    <HoverCardContent 
      className="w-80 p-4 bg-popover/95 backdrop-blur-md border border-border/80 shadow-2xl rounded-xl transition-all duration-300 animate-in fade-in-50 zoom-in-95" 
      side="right" 
      align="start"
    >
      {/* Title & Info Header */}
      <div className="flex flex-col gap-2 pb-3 mb-3 border-b border-border/40">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-black tracking-tight text-foreground truncate max-w-[200px] bg-muted px-2 py-0.5 rounded border border-border/50">
            {filename}
          </span>
          <span className="shrink-0 bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase">
            {images.length}장
          </span>
        </div>

        {/* Curation Stat Pills */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {approvedCount > 0 && (
              <Badge
                variant="default"
                className="h-auto items-center gap-1 px-1.5 py-0.5 text-[9px] font-extrabold text-ok bg-ok-bg border border-ok/20"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse" />
                통과 {approvedCount}
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge
                variant="default"
                className="h-auto items-center gap-1 px-1.5 py-0.5 text-[9px] font-extrabold text-warn bg-warn-bg border border-warn/20"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                대기 {pendingCount}
              </Badge>
            )}
            {rejectedCount > 0 && (
              <Badge
                variant="default"
                className="h-auto items-center gap-1 px-1.5 py-0.5 text-[9px] font-extrabold text-bad bg-bad-bg border border-bad/20"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-bad" />
                탈락 {rejectedCount}
              </Badge>
            )}
            {trashedCount > 0 && (
              <Badge
                variant="default"
                className="h-auto items-center gap-1 px-1.5 py-0.5 text-[9px] font-extrabold text-muted-foreground bg-muted border border-border/30"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                휴지통 {trashedCount}
              </Badge>
            )}

          </div>
        )}
      </div>

      {/* Grid of Images */}
      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <FolderIcon className="h-8 w-8 text-muted-foreground/30 mb-2 stroke-1" />
          <p className="text-[10px] italic">저장된 이미지가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {images.slice(0, 12).map((img) => (
              <div
                key={img.hash}
                className="group relative aspect-square overflow-hidden rounded-lg bg-muted border border-border/40 hover:scale-105 hover:shadow-md hover:ring-2 hover:ring-primary/20 transition-all duration-200 cursor-pointer"
              >
                {/* Blurred Background to eliminate empty margins */}
                <img
                  src={`${backendUrl}/saved-images/${img.hash}`}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover blur-md opacity-35 scale-110 pointer-events-none select-none"
                  loading="lazy"
                />
                <img
                  src={`${backendUrl}/saved-images/${img.hash}`}
                  className="relative z-10 h-full w-full object-contain"
                  alt=""
                  loading="lazy"
                />
                
                {/* Status Overlays */}
                {img.status === "approved" && (
                  <div className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-ok text-white shadow-md">
                    <CheckIcon className="h-3 w-3 stroke-[3]" />
                  </div>
                )}
                {img.status === "rejected" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[0.5px]">
                    <span className="text-[8px] font-black tracking-widest text-white/90 bg-bad/80 px-1 rounded scale-90">
                      탈락
                    </span>
                  </div>
                )}
                {img.status === "trashed" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-[0.5px]">
                    <Trash2 className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            
            {images.length > 12 && (
              <div className="flex aspect-square items-center justify-center rounded-lg bg-muted hover:bg-muted/80 text-[11px] font-black text-muted-foreground border border-dashed border-border/60 transition-colors">
                +{images.length - 12}
              </div>
            )}
          </div>

          {/* Expanded Prompt & Metadata Details */}
          {(allTags.length > 0 || latestPrompt || latestNote || latestDate) && (
            <div className="pt-3 border-t border-border/30 space-y-2.5">
              {/* Tags Capsules */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {allTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="h-auto items-center gap-0.5 bg-muted/65 text-muted-foreground px-1.5 py-0.5 rounded-full text-[9px] font-black tracking-tight border border-border/20"
                    >
                      <Tag className="h-2 w-2 stroke-[2.5]" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}


              {/* Prompt Block */}
              {latestPrompt && (
                <div className="relative rounded-lg bg-muted/30 border border-border/20 p-2 text-left">
                  <div className="flex items-center gap-1.5 mb-1 text-[8px] font-bold text-muted-foreground tracking-wider uppercase">
                    <FileText className="h-2.5 w-2.5" />
                    최근 프롬프트
                  </div>
                  <p className="font-mono text-[9px] leading-normal text-muted-foreground line-clamp-3 select-all">
                    {latestPrompt}
                  </p>
                </div>
              )}

              {/* Note / Memo Block */}
              {latestNote && (
                <div className="border-l-2 border-warn/45 pl-2 py-0.5 text-left">
                  <p className="text-[9px] text-foreground/80 italic font-medium leading-normal">
                    💡 {latestNote}
                  </p>
                </div>
              )}

              {/* Latest update timestamp */}
              {latestDate && (
                <div className="flex items-center gap-1 text-[8.5px] text-muted-foreground/60 font-semibold justify-end">
                  <Clock className="h-2.5 w-2.5" />
                  <span>최근 저장: {latestDate}</span>
                </div>
              )}
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
      {isLoading ? <Spinner /> : <Icon />}
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
            <Select
              value={selectedWorkflowId || "__none__"}
              onValueChange={(v) =>
                setSelectedWorkflowId(v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {selectedWorkflowId
                    ? "워크플로우 해제"
                    : "워크플로우 직접 선택"}
                </SelectItem>
                {savedWorkflows.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>저장된 워크플로우</SelectLabel>
                      {savedWorkflows.map((sw) => (
                        <SelectItem key={sw.id} value={sw.id}>
                          {sw.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
                {historicalWorkflows.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>과거 사용 내역 (History)</SelectLabel>
                      {historicalWorkflows.map((hw) => (
                        <SelectItem key={hw.id} value={hw.id}>
                          {hw.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
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
            <Select
              value={selectedTemplate}
              onValueChange={setSelectedTemplate}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>현재 환경</SelectLabel>
                  <SelectItem value={currentCegTemplate}>
                    현재 편집 중인 템플릿
                  </SelectItem>
                  {savedTemplates.map((st) => (
                    <SelectItem key={st.id} value={st.template}>
                      프리셋: {st.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {historicalTemplates.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>과거 사용 내역 (History)</SelectLabel>
                      {historicalTemplates.map((t, i) => (
                        <SelectItem key={i} value={t}>
                          과거 기록 {i + 1} (길이: {t.length})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
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
            {isLoading && <Spinner className="mr-2 h-4 w-4" />}
            재생성 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
