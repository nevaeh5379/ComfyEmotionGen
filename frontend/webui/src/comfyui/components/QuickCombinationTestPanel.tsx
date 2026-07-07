import { useMemo, useState } from "react"
import { Play, Search, Shuffle, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { InlineImagePreview } from "./InlineImagePreview"
import type { RenderItem } from "../types/renderTypes"
import { itemKey } from "@/lib/workflowUtils"

interface QuickCombinationTestPanelProps {
  items: RenderItem[]
  canRun: boolean
  backendUrl: string
  onRunSingle: (item: RenderItem) => Promise<boolean>
}

function filenameFor(item: RenderItem): string {
  return item.filename
}

export function QuickCombinationTestPanel({
  items,
  canRun,
  backendUrl,
  onRunSingle,
}: QuickCombinationTestPanelProps): React.JSX.Element | null {
  const [search, setSearch] = useState("")
  const [activeItem, setActiveItem] = useState<RenderItem | null>(null)
  const [recentItems, setRecentItems] = useState<RenderItem[]>([])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (needle === "") return items
    return items.filter((item) => {
      const metaText = Object.entries(item.meta)
        .map(([key, value]) => `${key}:${value}`)
        .join(" ")
        .toLowerCase()
      return (
        itemKey(item).toLowerCase().includes(needle) ||
        metaText.includes(needle) ||
        item.filename.toLowerCase().includes(needle) ||
        item.prompt.toLowerCase().includes(needle)
      )
    })
  }, [items, search])

  const runItem = (item: RenderItem): void => {
    const key = itemKey(item)
    setActiveItem(item)
    setRecentItems((prev) => {
      const withoutSame = prev.filter((prevItem) => itemKey(prevItem) !== key)
      return [item, ...withoutSame].slice(0, 8)
    })
    void onRunSingle(item)
  }

  const runRandom = (): void => {
    if (filtered.length === 0) return
    const item = filtered[Math.floor(Math.random() * filtered.length)]
    if (item !== undefined) runItem(item)
  }

  if (items.length === 0) return null

  return (
    <div className="flex max-h-[38vh] min-h-52 flex-col border-t border-line bg-muted/20">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-bold">빠른 테스트</span>
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {filtered.length}/{items.length}
        </Badge>
        <div className="relative ml-auto w-44">
          <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
            placeholder="조합 검색"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={!canRun || filtered.length === 0}
          onClick={runRandom}
        >
          <Shuffle className="h-3 w-3" />
          랜덤
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(220px,42%)]">
        <ScrollArea className="min-h-0 border-b border-line md:border-r md:border-b-0">
          <div className="space-y-1 p-2">
            {filtered.slice(0, 80).map((item) => {
              const key = itemKey(item)
              const selected =
                activeItem !== null && itemKey(activeItem) === key
              return (
                <button
                  key={key}
                  type="button"
                  className={`flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-background/80 ${
                    selected ? "border-primary/40 bg-primary/5" : "bg-panel"
                  }`}
                  onClick={() => {
                    setActiveItem(item)
                  }}
                  onDoubleClick={() => {
                    runItem(item)
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] font-semibold">
                      {item.filename}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(item.meta)
                        .slice(0, 4)
                        .map(([keyName, value]) => (
                          <Badge
                            key={keyName}
                            variant="outline"
                            className="px-1 py-0 text-[9px] font-normal"
                          >
                            {keyName}: {value}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={!canRun}
                    onClick={(event) => {
                      event.stopPropagation()
                      runItem(item)
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </button>
              )
            })}
            {filtered.length > 80 && (
              <div className="px-2 py-1 text-[10px] text-muted-foreground">
                검색 결과가 많아 80개까지만 표시됩니다.
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="min-h-0 overflow-y-auto p-3">
          {activeItem === null ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
              조합을 선택하거나 실행하면 결과가 여기에 표시됩니다.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px] font-bold">
                    {filenameFor(activeItem)}
                  </div>
                  {recentItems.length > 1 && (
                    <div className="mt-1 flex gap-1 overflow-x-auto">
                      {recentItems.map((item, idx) => (
                        <Button
                          key={itemKey(item)}
                          type="button"
                          variant={
                            itemKey(item) === itemKey(activeItem)
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          className="h-6 shrink-0 px-2 text-[10px]"
                          onClick={() => {
                            setActiveItem(item)
                          }}
                        >
                          {idx + 1}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                  disabled={!canRun}
                  onClick={() => {
                    runItem(activeItem)
                  }}
                >
                  <Play className="h-3 w-3" />
                  실행
                </Button>
              </div>
              <div className="rounded-md border bg-background/70 p-2 text-[11px] text-muted-foreground">
                <div className="line-clamp-3 whitespace-pre-wrap">
                  {activeItem.prompt}
                </div>
              </div>
              <InlineImagePreview
                filename={filenameFor(activeItem)}
                backendUrl={backendUrl}
                showCurationActions
                onRegenerate={() => {
                  runItem(activeItem)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
