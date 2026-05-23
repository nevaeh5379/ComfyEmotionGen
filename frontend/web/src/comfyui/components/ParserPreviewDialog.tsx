import { useState, useMemo, useEffect } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LayersIcon, Copy, Check } from "lucide-react"
import { TagInputSearch, type Candidate } from "./TagInputSearch"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { RenderItem } from "../types/renderTypes"
import { itemKey } from "../../lib/workflowUtils"

interface ParserPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fakeJobQueue: RenderItem[]
  previewFilter: string
  onPreviewFilterChange: (v: string) => void
  filteredPreview: RenderItem[]
  filteredByAxisSet: Set<string> | null
}

export const ParserPreviewDialog = ({
  open,
  onOpenChange,
  fakeJobQueue,
  previewFilter,
  filteredByAxisSet,
}: ParserPreviewDialogProps) => {
  const [searchInput, setSearchInput] = useState("")
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const substitute = (text: string, item: RenderItem) => {
    let res = text || ""
    // Meta variables
    Object.entries(item.meta).forEach(([k, v]) => {
      res = res.split(`{{${k}}}`).join(v)
      res = res.split(`{${k}}`).join(v)
    })
    // Built-ins
    res = res.split("{{input}}").join(item.prompt || "")
    res = res.split("{input}").join(item.prompt || "")
    return res
  }

  // Sync initial parent search filter when open
  useEffect(() => {
    if (open) {
      setSearchInput(previewFilter || "")
      setSearchTags([])
    }
  }, [open, previewFilter])

  // Generate unique tag candidates from current queue data
  const candidates = useMemo<Candidate[]>(() => {
    const filenameSet = new Set<string>()
    const metadataSet = new Set<string>()
    const promptWordSet = new Set<string>()

    fakeJobQueue.forEach((item) => {
      // Filenames
      const filenameClean = substitute(item.filename, item)
      filenameSet.add(filenameClean)

      // Meta parameters
      Object.entries(item.meta).forEach(([k, v]) => {
        metadataSet.add(`${k}:${v}`)
        metadataSet.add(v)
      })

      // Prompt keywords
      const promptClean = substitute(item.prompt, item)
      promptClean.split(/\s+/).forEach((word) => {
        const cleanWord = word.replace(/[^a-zA-Z가-힣]/g, "")
        if (cleanWord.length > 2) {
          promptWordSet.add(cleanWord.toLowerCase())
        }
      })
    })

    const list: Candidate[] = []

    Array.from(filenameSet).slice(0, 15).forEach((f) => {
      list.push({ value: f, type: "filename" })
    })

    Array.from(metadataSet).slice(0, 25).forEach((m) => {
      list.push({ value: m, type: "metadata" })
    })

    Array.from(promptWordSet).slice(0, 20).forEach((p) => {
      list.push({ value: p, type: "prompt" })
    })

    return list
  }, [fakeJobQueue])

  // Filter items in real-time based on selected tags and search input
  const filteredPreview = useMemo(() => {
    if (searchTags.length === 0 && !searchInput.trim()) {
      return fakeJobQueue
    }

    return fakeJobQueue.filter((item) => {
      const renderedFilename = substitute(item.filename, item).toLowerCase()
      const renderedPrompt = substitute(item.prompt, item).toLowerCase()

      const matchesTags = searchTags.every((tag) => {
        if (tag.startsWith("@")) {
          const val = tag.slice(1).toLowerCase()
          return renderedFilename.includes(val)
        }
        if (tag.startsWith("#")) {
          const val = tag.slice(1).toLowerCase()
          return renderedPrompt.includes(val)
        }
        if (tag.startsWith("$")) {
          const val = tag.slice(1).toLowerCase()
          if (val.includes(":")) {
            const parts = val.split(":")
            const k = parts[0]
            const v = parts[1]
            if (k && v) {
              return item.meta[k]?.toLowerCase().includes(v)
            }
          }
          return Object.entries(item.meta).some(
            ([k, v]) => k.toLowerCase().includes(val) || v.toLowerCase().includes(val)
          )
        }
        const val = tag.toLowerCase()
        return renderedFilename.includes(val) || renderedPrompt.includes(val)
      })

      const textClean = searchInput.trim().toLowerCase()
      if (!textClean) return matchesTags

      const matchesInput =
        renderedFilename.includes(textClean) ||
        renderedPrompt.includes(textClean) ||
        Object.entries(item.meta).some(
          ([k, v]) => k.toLowerCase().includes(textClean) || v.toLowerCase().includes(textClean)
        )

      return matchesTags && matchesInput
    })
  }, [fakeJobQueue, searchTags, searchInput])

  const handleCopyPrompt = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    toast.success("프롬프트가 클립보드에 복사되었습니다.")
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[55vw] sm:max-w-[55vw] flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayersIcon className="size-5 text-primary opacity-60" />
            파서 렌더링 결과
          </DialogTitle>
          <DialogDescription>
            작성한 템플릿 문법에 따라 생성될{" "}
            <strong>{fakeJobQueue.length}개</strong>의 작업 목록입니다.
            {(searchTags.length > 0 || searchInput) ? ` (검색 결과 ${filteredPreview.length}개)` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Reusing existing TagInputSearch component for premium filtering */}
        <div className="flex items-center gap-3 rounded-md border border-line/50 bg-muted/30 p-2">
          <div className="flex-1">
            <TagInputSearch
              value={searchInput}
              tags={searchTags}
              candidates={candidates.filter((c) => {
                const valClean = searchInput
                  .replace(/^[@#$]/, "")
                  .toLowerCase()
                return c.value.toLowerCase().includes(valClean)
              })}
              placeholder="검색어 입력 (@파일명, #프롬프트키워드, $변수명:값)"
              onValueChange={setSearchInput}
              onAddTag={(tag: string) => {
                if (!searchTags.includes(tag)) {
                  setSearchTags([...searchTags, tag])
                }
                setSearchInput("")
              }}
              onRemoveTag={(tag: string) => {
                setSearchTags(searchTags.filter((t) => t !== tag))
              }}
              size="sm"
            />
          </div>
          {(searchTags.length > 0 || searchInput) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs font-bold text-muted-foreground hover:bg-background/80 hover:text-foreground"
              onClick={() => {
                setSearchTags([])
                setSearchInput("")
              }}
            >
              초기화
            </Button>
          )}
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-md border border-line/45 bg-muted/5 p-4 space-y-4 shadow-inner">
          {filteredPreview.map((item, index) => {
            const key = itemKey(item)
            const wouldRun = !filteredByAxisSet || filteredByAxisSet.has(key)
            const renderedFilename = substitute(item.filename, item)
            const renderedPrompt = substitute(item.prompt, item)

            return (
              <div
                key={`fake-card-${key}-${index}`}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-line bg-background p-4 shadow-xs transition-all",
                  !wouldRun && "italic opacity-30 grayscale"
                )}
              >
                {/* 카드 헤더 (인덱스, 파일명 및 파일명 복사, 메타데이터 뱃지 세트) */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/35 pb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="mono text-[10px] font-black px-1.5 py-0.5 rounded bg-muted text-muted-foreground select-none">
                      #{index + 1}
                    </span>
                    <span className="font-mono text-xs font-black break-all text-foreground select-all leading-tight">
                      {renderedFilename}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                      onClick={() => {
                        navigator.clipboard.writeText(renderedFilename)
                        toast.success("파일명이 복사되었습니다.")
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* 주입된 치환 변수 세트 */}
                  {Object.keys(item.meta).length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-end">
                      {Object.entries(item.meta).map(([k, v]) => (
                        <span
                          key={k}
                          className="font-mono text-[9px] font-bold border border-line bg-muted/40 px-2 py-0.5 rounded text-foreground select-all"
                        >
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 프롬프트 본문 영역 */}
                <div className="relative group/prompt flex items-start gap-4 rounded-lg border border-line bg-muted/20 p-3.5">
                  <div className="flex-1 font-mono text-[11.5px] leading-relaxed text-foreground select-all whitespace-pre-wrap break-all">
                    {renderedPrompt}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-md border-line/50 opacity-0 group-hover/prompt:opacity-100 hover:bg-muted hover:text-foreground transition-all"
                    onClick={() => handleCopyPrompt(renderedPrompt, index)}
                  >
                    {copiedIndex === index ? (
                      <Check className="h-3 w-3 text-good" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
          {filteredPreview.length === 0 && (
            <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-background p-6 text-center text-muted-foreground text-xs italic">
              일치하는 검색 결과가 없습니다.
            </div>
          )}
        </div>
        <div className="mt-2 flex justify-end border-t border-line pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="font-bold"
          >
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
