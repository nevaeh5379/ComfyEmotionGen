import { useState, useMemo, useCallback } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LayersIcon, Copy, Check, Search, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { RenderItem, RenderItemsResponse } from "../types/renderTypes"
import { itemKey } from "../../lib/workflowUtils"

/* ---------- types ---------- */
interface ParserPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  renderResponse: RenderItemsResponse | null
  filteredByAxisSet: Set<string> | null
}

/* ---------- helpers ---------- */
function substitute(text: string, item: RenderItem) {
  let res = text || ""
  Object.entries(item.meta).forEach(([k, v]) => {
    res = res.split(`{{${k}}}`).join(v)
    res = res.split(`{${k}}`).join(v)
  })
  res = res.split("{{input}}").join(item.prompt || "")
  res = res.split("{input}").join(item.prompt || "")
  return res
}

/* ---------- component ---------- */
export const ParserPreviewDialog = ({
  open,
  onOpenChange,
  renderResponse,
  filteredByAxisSet,
}: ParserPreviewDialogProps) => {
  const [searchInput, setSearchInput] = useState("")
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null)

  const items = renderResponse?.items ?? []
  const axes = renderResponse?.axes ?? {}
  const sets = renderResponse?.sets ?? {}
  const lines = renderResponse?.template_structure ?? []

  const filteredItems = useMemo(() => {
    if (!searchInput.trim()) return items
    const needle = searchInput.trim().toLowerCase()
    return items.filter((item) => {
      const rf = substitute(item.filename, item).toLowerCase()
      const rp = substitute(item.prompt, item).toLowerCase()
      return (
        rf.includes(needle) ||
        rp.includes(needle) ||
        Object.entries(item.meta).some(
          ([k, v]) => k.toLowerCase().includes(needle) || v.toLowerCase().includes(needle)
        )
      )
    })
  }, [items, searchInput])

  const handleCopyPrompt = useCallback((text: string, index: number) => {
    navigator.clipboard.writeText(text)
    toast.success("프롬프트가 클립보드에 복사되었습니다.")
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }, [])

  const isLineHighlighted = useCallback(
    (lineKeys: string[]) => {
      if (selectedKeys.length === 0) return false
      return lineKeys.some((k) => selectedKeys.includes(k))
    },
    [selectedKeys]
  )

  const handleItemClick = useCallback((item: RenderItem) => {
    const key = itemKey(item)
    setSelectedItemKey((prev) => {
      const isSelecting = prev !== key
      if (isSelecting) {
        // qualifier만: axisName:valueKey — axis 헤더는 매칭 안 됨
        const qualifiers = Object.entries(item.meta).map(
          ([k, v]) => `${k}:${v}`
        )
        setSelectedKeys(qualifiers)
      } else {
        setSelectedKeys([])
      }
      return isSelecting ? key : null
    })
  }, [])

  /* ---- render ---- */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] sm:max-w-[95vw] max-w-[95vw] flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayersIcon className="size-5 text-primary opacity-60" />
            파서 렌더링 결과
          </DialogTitle>
          <DialogDescription className="text-xs">
            작성한 템플릿 문법에 따라 생성될{" "}
            <strong>{items.length}개</strong>의 작업 목록입니다.
            {searchInput.trim() ? ` (검색 결과 ${filteredItems.length}개)` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Body — split pane */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ---------- LEFT: Original Template ---------- */}
          <div className="flex w-[45%] flex-col border-r">
            <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2">
              <span className="text-xs font-semibold text-muted-foreground">원본 템플릿</span>
              {selectedKeys.length > 0 && (
                <span className="text-[10px] text-primary font-medium">
                  {selectedKeys.length}개 변수 강조 중
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              <div className="font-mono text-[11px] leading-5">
                {lines.map((ln) => {
                  const highlighted = isLineHighlighted(ln.keys)
                  const dimmed = selectedKeys.length > 0 && !highlighted
                  return (
                    <div
                      key={ln.line_num}
                      className={cn(
                        "flex gap-2 px-3 py-0.5 transition-colors duration-150",
                        highlighted && "bg-primary/10 border-l-2 border-primary",
                        dimmed && "opacity-30",
                        ln.type === "set-header" && !highlighted && selectedKeys.length === 0 && "bg-emerald-500/5",
                        ln.type === "axis-header" && !highlighted && selectedKeys.length === 0 && "bg-violet-500/5",
                        ln.type === "axis-body" && !highlighted && selectedKeys.length === 0 && "bg-violet-500/[0.03]",
                        ln.type === "axis-end" && !highlighted && selectedKeys.length === 0 && "bg-violet-500/5",
                        ln.type === "template-header" && !highlighted && selectedKeys.length === 0 && "bg-amber-500/5",
                        ln.type === "template-body" && !highlighted && selectedKeys.length === 0 && "bg-amber-500/[0.03]",
                        ln.type === "template-end" && !highlighted && selectedKeys.length === 0 && "bg-amber-500/5",
                        ln.type === "filename-header" && !highlighted && selectedKeys.length === 0 && "bg-sky-500/5",
                        ln.type === "filename-body" && !highlighted && selectedKeys.length === 0 && "bg-sky-500/[0.03]",
                        ln.type === "filename-end" && !highlighted && selectedKeys.length === 0 && "bg-sky-500/5",
                        ln.type === "end" && !highlighted && selectedKeys.length === 0 && "opacity-50",
                      )}
                    >
                      <span className="w-7 shrink-0 select-none text-right text-muted-foreground/60">
                        {ln.line_num}
                      </span>
                      <span className="whitespace-pre text-foreground/90">{ln.text}</span>
                    </div>
                  )
                })}
                {lines.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground italic">
                    템플릿이 비어 있습니다.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---------- RIGHT: Items ---------- */}
          <div className="flex w-[55%] flex-col">
            {/* Search */}
            <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="파일명, 프롬프트, 변수값 검색..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Set summary */}
            {Object.keys(sets).length > 0 && (
              <div className="flex flex-wrap gap-1 border-b px-3 py-2">
                {Object.entries(sets).map(([sk, sv]) => (
                  <Badge key={sk} variant="secondary" className="text-[10px] font-mono">
                    set {sk} = {sv}
                  </Badge>
                ))}
              </div>
            )}

            {/* Items list */}
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {filteredItems.map((item, index) => {
                const key = itemKey(item)
                const wouldRun = !filteredByAxisSet || filteredByAxisSet.has(key)
                const rf = substitute(item.filename, item)
                const rp = substitute(item.prompt, item)
                const isSelected = selectedItemKey === key
                const anySelected = selectedItemKey !== null

                return (
                  <div
                    key={`item-${key}-${index}`}
                    onClick={(e) => {
                      e.preventDefault()
                      handleItemClick(item)
                    }}
                    className={cn(
                      "group flex flex-col gap-1.5 rounded-lg border border-line bg-background p-3 shadow-xs transition-all cursor-pointer select-none",
                      !wouldRun && "opacity-30 grayscale",
                      anySelected && !isSelected && "opacity-40",
                      isSelected && "ring-1 ring-primary/40 border-primary/30"
                    )}
                  >
                    {/* filename */}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-muted text-muted-foreground select-none shrink-0">
                        #{index + 1}
                      </span>
                      <span className="font-mono text-xs font-bold break-all text-foreground leading-tight flex-1">
                        {rf}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(rf)
                          toast.success("파일명이 복사되었습니다.")
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* meta badges */}
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(item.meta).map(([k, v]) => {
                        const axisInfo = axes[k]
                        const matched = axisInfo?.values.find((val) => val.key === v)
                        return (
                          <span
                            key={k}
                            className={cn(
                              "font-mono text-[9px] font-bold border px-2 py-0.5 rounded transition-colors",
                              isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-line bg-muted/40 text-foreground"
                            )}
                          >
                            {k}: {matched?.value || v}
                          </span>
                        )
                      })}
                    </div>

                    {/* prompt preview */}
                    <div className="relative group/prompt flex items-start gap-2 rounded-md border border-line bg-muted/20 p-2">
                      <div className="flex-1 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-all line-clamp-2">
                        {rp}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-5 w-5 shrink-0 opacity-0 group-hover/prompt:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCopyPrompt(rp, index)
                        }}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}

              {filteredItems.length === 0 && (
                <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-background p-6 text-center text-muted-foreground text-xs italic">
                  일치하는 검색 결과가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="font-bold">
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
