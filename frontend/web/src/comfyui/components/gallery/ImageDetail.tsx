import { useState } from "react"
import { Download, ImageOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { curationApi } from "../../hooks/useSavedImages"
import { useWorkflowContext } from "../../contexts/WorkflowContext"
import { useTemplateContext } from "../../contexts/TemplateContext"
import { STATUS_LABEL, STATUS_TINT, type SavedImage } from "../../types/Message"
import { Badge } from "@/components/ui/badge"

function defaultName(filename: string) {
  return filename.replace(/\.[^/.]+$/, "")
}

export interface DetailProps {
  backendUrl: string
  image: SavedImage
  onClose: () => void
  onChanged: () => void
  singleDownloadMode?: "newtab" | "direct"
}

export function ImageDetail({
  backendUrl,
  image,
  onClose,
  onChanged,
  singleDownloadMode = "newtab",
}: DetailProps) {
  const [note, setNote] = useState(image.note)
  const [newTag, setNewTag] = useState("")
  const [tags, setTags] = useState<string[]>(image.tags)
  const [imgError, setImgError] = useState(false)

  const [workflowName, setWorkflowName] = useState(
    defaultName(image.originalFilename)
  )
  const [templateName, setTemplateName] = useState(
    defaultName(image.originalFilename)
  )
  const [workflowSaved, setWorkflowSaved] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)

  const { saveWorkflow } = useWorkflowContext()
  const { saveTemplate } = useTemplateContext()

  const saveNote = async () => {
    await curationApi.patchNote(backendUrl, image.hash, note)
    onChanged()
  }
  const addTag = async () => {
    const t = newTag.trim()
    if (!t) return
    await curationApi.addTags(backendUrl, image.hash, [t])
    setNewTag("")
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
    onChanged()
  }
  const removeTag = async (tag: string) => {
    await curationApi.removeTag(backendUrl, image.hash, tag)
    setTags((prev) => prev.filter((x) => x !== tag))
    onChanged()
  }

  const handleSaveWorkflow = () => {
    if (!image.workflow || !workflowName.trim()) return
    saveWorkflow(workflowName.trim(), JSON.stringify(image.workflow))
    setWorkflowSaved(true)
    setTimeout(() => setWorkflowSaved(false), 2000)
  }

  const handleSaveTemplate = () => {
    if (!image.cegTemplate || !templateName.trim()) return
    saveTemplate(templateName.trim(), image.cegTemplate)
    setTemplateSaved(true)
    setTimeout(() => setTemplateSaved(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col gap-3 overflow-auto rounded-lg bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="default"
            className={`border-none px-1.5 py-0.5 text-[10px] font-black tracking-wider uppercase ${STATUS_TINT[image.status]}`}
          >
            {STATUS_LABEL[image.status]}
          </Badge>

          <h3 className="truncate font-mono text-sm">
            {image.originalFilename}
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={async () => {
                  const url = `${backendUrl}/saved-images/${image.hash}`
                  if (singleDownloadMode === "direct") {
                    try {
                      const response = await fetch(url)
                      const blob = await response.blob()
                      const blobUrl = URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = blobUrl
                      a.download = image.originalFilename || image.hash
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(blobUrl)
                    } catch {
                      window.open(url, "_blank")
                    }
                  } else {
                    window.open(url, "_blank")
                  }
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>다운로드</TooltipContent>
          </Tooltip>
          <Button size="sm" variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>
        {imgError ? (
          <div className="flex h-64 w-full items-center justify-center bg-muted text-muted-foreground">
            <ImageOff className="h-10 w-10" />
          </div>
        ) : (
          <img
            src={`${backendUrl}/saved-images/${image.hash}`}
            alt={image.originalFilename}
            className="max-h-[60vh] w-full object-contain"
            onError={() => setImgError(true)}
          />
        )}
        <div className="space-y-1 text-xs">
          <div className="font-mono text-muted-foreground">
            hash: {image.hash}
          </div>
          <div>
            <span className="font-semibold">prompt:</span> {image.prompt}
          </div>
          <div className="text-muted-foreground">
            {(image.sizeBytes / 1024).toFixed(1)} KB · worker{" "}
            {image.workerId ?? "—"}
          </div>
        </div>
        {(image.workflow || image.cegTemplate) && (
          <div className="space-y-2 rounded-md border p-3">
            {image.workflow && (
              <div className="space-y-1">
                <label className="text-xs font-semibold">워크플로우 저장</label>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 flex-1"
                    placeholder="워크플로우 이름"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveWorkflow()
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveWorkflow}
                    disabled={!workflowName.trim()}
                  >
                    저장
                  </Button>
                </div>
                {workflowSaved && (
                  <p className="text-xs text-green-600">저장되었습니다</p>
                )}
              </div>
            )}
            {image.cegTemplate && (
              <div className="space-y-1">
                <label className="text-xs font-semibold">템플릿 저장</label>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 flex-1"
                    placeholder="템플릿 이름"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTemplate()
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim()}
                  >
                    저장
                  </Button>
                </div>
                {templateSaved && (
                  <p className="text-xs text-green-600">저장되었습니다</p>
                )}
              </div>
            )}
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-semibold">노트</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <Button size="sm" variant="outline" onClick={saveNote}>
            노트 저장
          </Button>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold">태그</label>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Tooltip key={t}>
                <TooltipTrigger asChild>
                  <Badge
                    asChild
                    variant="outline"
                    className="h-auto cursor-pointer border border-line/20 bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:border-destructive/30 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      aria-label={`${t} 태그 제거`}
                    >
                      #{t} ×
                    </button>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>태그 삭제</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-48"
              placeholder="새 태그"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag()
              }}
            />
            <Button size="sm" variant="outline" onClick={addTag}>
              추가
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
