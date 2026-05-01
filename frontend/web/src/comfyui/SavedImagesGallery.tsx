/**
 * 영속 저장된 이미지 큐레이션 갤러리.
 *
 * 기능:
 *  - 상태 필터 (pending/approved/rejected/trashed/all)
 *  - filename 필터, 태그 필터
 *  - 그리드/그룹 모드 토글
 *  - 통과(approved)/탈락(rejected)/휴지통(trashed) 액션
 *  - 노트 + 태그 인라인 편집
 *  - 데이터셋 익스포트 (zip 다운로드)
 *  - 휴지통 비우기, filename 그룹 재생성
 */

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { CurationStatus, SavedImage } from "./Message"
import { curationApi, useSavedImages } from "./useSavedImages"

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

interface Props {
  backendUrl: string
}

export function SavedImagesGallery({ backendUrl }: Props) {
  const [statusFilter, setStatusFilter] = useState<CurationStatus | "all">("pending")
  const [filenameFilter, setFilenameFilter] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const [groupMode, setGroupMode] = useState(false)
  const [selected, setSelected] = useState<SavedImage | null>(null)

  const { images, groups, loading, error, reload } = useSavedImages({
    backendUrl,
    status: statusFilter,
    filename: filenameFilter || undefined,
    tag: tagFilter || undefined,
  })

  const grouped = useMemo(() => {
    if (!groupMode) return null
    const map = new Map<string, SavedImage[]>()
    for (const img of images) {
      const list = map.get(img.originalFilename) ?? []
      list.push(img)
      map.set(img.originalFilename, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [images, groupMode])

  const setStatus = async (hash: string, status: CurationStatus) => {
    try {
      await curationApi.patchStatus(backendUrl, hash, status)
    } catch (err) {
      console.error("setStatus failed", err)
    }
  }

  const handleEmptyTrash = async () => {
    if (!confirm("휴지통의 이미지를 영구 삭제합니다. 계속하시겠습니까?")) return
    try {
      const n = await curationApi.emptyTrash(backendUrl)
      alert(`${n}개 영구 삭제됨`)
      reload()
    } catch (err) {
      console.error(err)
    }
  }

  const handleExport = async () => {
    try {
      await curationApi.exportDataset(backendUrl, { status: "approved" })
    } catch (err) {
      console.error(err)
    }
  }

  const handleRegenerate = async (filename: string) => {
    const raw = prompt(`'${filename}' 그룹에 몇 장을 추가 생성할까요?`, "4")
    if (!raw) return
    const count = Number(raw)
    if (!Number.isFinite(count) || count < 1) return
    try {
      await curationApi.regenerate(backendUrl, filename, count, "random")
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as CurationStatus | "all")}
        >
          <TabsList>
            {(["all", "pending", "approved", "rejected", "trashed"] as const).map(
              (s) => (
                <TabsTrigger key={s} value={s}>
                  {STATUS_LABEL[s]}
                </TabsTrigger>
              )
            )}
          </TabsList>
        </Tabs>
        <Input
          className="h-8 w-48"
          type="search"
          placeholder="filename 필터"
          value={filenameFilter}
          onChange={(e) => setFilenameFilter(e.target.value)}
        />
        <Input
          className="h-8 w-40"
          type="search"
          placeholder="태그 필터"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
        <Button
          size="sm"
          variant={groupMode ? "default" : "outline"}
          onClick={() => setGroupMode((v) => !v)}
        >
          {groupMode ? "그리드 모드" : "그룹 모드"}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="default" onClick={handleExport}>
            데이터셋 익스포트
          </Button>
          <Button size="sm" variant="destructive" onClick={handleEmptyTrash}>
            휴지통 비우기
          </Button>
          <Button size="sm" variant="ghost" onClick={reload}>
            새로고침
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && images.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>표시할 이미지가 없습니다</EmptyTitle>
            <EmptyDescription>
              잡을 실행하거나 필터 조건을 바꿔보세요.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {groupMode && grouped ? (
        <div className="flex flex-col gap-4">
          {grouped.map(([filename, items]) => {
            const groupMeta = groups.find((g) => g.filename === filename)
            return (
              <div key={filename} className="rounded-md border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{filename}</span>
                  <span className="text-xs text-muted-foreground">
                    총 {groupMeta?.total ?? items.length} · 통과{" "}
                    {groupMeta?.approvedCount ?? 0} · 탈락{" "}
                    {groupMeta?.rejectedCount ?? 0} · 휴지통{" "}
                    {groupMeta?.trashedCount ?? 0}
                  </span>
                  <div className="ml-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRegenerate(filename)}
                    >
                      재생성
                    </Button>
                  </div>
                </div>
                <ImageGrid
                  items={items}
                  backendUrl={backendUrl}
                  setStatus={setStatus}
                  onOpen={setSelected}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <ImageGrid
          items={images}
          backendUrl={backendUrl}
          setStatus={setStatus}
          onOpen={setSelected}
        />
      )}

      {selected && (
        <ImageDetail
          backendUrl={backendUrl}
          image={selected}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}

interface GridProps {
  items: SavedImage[]
  backendUrl: string
  setStatus: (hash: string, status: CurationStatus) => void
  onOpen: (img: SavedImage) => void
}

function ImageGrid({ items, backendUrl, setStatus, onOpen }: GridProps) {
  if (items.length === 0) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((img) => (
        <div
          key={img.hash}
          className="flex flex-col gap-1 rounded-md border bg-card p-2"
        >
          <button
            type="button"
            className="block w-full overflow-hidden rounded"
            onClick={() => onOpen(img)}
          >
            <img
              src={`${backendUrl}/saved-images/${img.hash}`}
              alt={img.originalFilename}
              loading="lazy"
              className="h-40 w-full object-cover"
            />
          </button>
          <div className="flex items-center gap-1 text-xs">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_TINT[img.status]}`}
            >
              {STATUS_LABEL[img.status]}
            </span>
            <span className="truncate font-mono">{img.originalFilename}</span>
          </div>
          {img.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 text-[10px]">
              {img.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 flex items-center justify-between gap-1">
            <Button
              size="sm"
              variant={img.status === "approved" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setStatus(img.hash, "approved")}
            >
              ✓
            </Button>
            <Button
              size="sm"
              variant={img.status === "rejected" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setStatus(img.hash, "rejected")}
            >
              ✗
            </Button>
            <Button
              size="sm"
              variant={img.status === "trashed" ? "destructive" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() =>
                setStatus(
                  img.hash,
                  img.status === "trashed" ? "pending" : "trashed"
                )
              }
            >
              🗑
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

interface DetailProps {
  backendUrl: string
  image: SavedImage
  onClose: () => void
  onChanged: () => void
}

function ImageDetail({ backendUrl, image, onClose, onChanged }: DetailProps) {
  const [note, setNote] = useState(image.note)
  const [newTag, setNewTag] = useState("")
  const [tags, setTags] = useState<string[]>(image.tags)

  useEffect(() => {
    setNote(image.note)
    setTags(image.tags)
  }, [image.hash, image.note, image.tags])

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
          <h3 className="truncate font-mono text-sm">{image.originalFilename}</h3>
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
            {(image.sizeBytes / 1024).toFixed(1)} KB · worker {image.workerId ?? "—"}
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
