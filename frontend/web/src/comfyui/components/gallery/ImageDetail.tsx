import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { curationApi } from "../../hooks/useSavedImages"
import type { CurationStatus, SavedImage } from "../../types/Message"

const STATUS_LABEL: Record<CurationStatus | "all", string> = {
  all: "전체",
  pending: "대기",
  approved: "통과",
  rejected: "탈락",
  trashed: "휴지통",
}

const STATUS_TINT: Record<CurationStatus, string> = {
  pending: "bg-slate-200 text-slate-800",
  approved: "bg-green-200 text-green-900",
  rejected: "bg-red-200 text-red-900",
  trashed: "bg-zinc-300 text-zinc-700",
}

export interface DetailProps {
  backendUrl: string
  image: SavedImage
  onClose: () => void
  onChanged: () => void
}

export function ImageDetail({ backendUrl, image, onClose, onChanged }: DetailProps) {
  const [note, setNote] = useState(image.note)
  const [newTag, setNewTag] = useState("")
  const [tags, setTags] = useState<string[]>(image.tags)

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
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TINT[image.status]}`}
          >
            {STATUS_LABEL[image.status]}
          </span>
          <h3 className="truncate font-mono text-sm">
            {image.originalFilename}
          </h3>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={onClose}
          >
            닫기
          </Button>
        </div>
        <img
          src={`${backendUrl}/saved-images/${image.hash}`}
          alt={image.originalFilename}
          className="max-h-[60vh] w-full object-contain"
        />
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
              <button
                key={t}
                type="button"
                className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-destructive/20"
                onClick={() => removeTag(t)}
                title="클릭하여 제거"
              >
                #{t} ×
              </button>
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
