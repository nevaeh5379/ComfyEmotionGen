import { useState, useMemo, useRef } from "react"
import { Play, Star, Search, ChevronDown, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RenderItem } from "../types/renderTypes"
import { itemKey, substitute } from "../../lib/workflowUtils"

interface AxisFilterOption {
  axisName: string
  values: string[]
}

interface QuickTestPanelProps {
  activeQueue: RenderItem[]
  favoriteCombinations: Set<string>
  onRunTest: (item: RenderItem) => void
  onToggleFavorite: (key: string) => void
  axisFilterOptions: AxisFilterOption[]
  collapsed: boolean
  onToggleCollapsed: () => void
  externalAxisFilter?: { axisName: string; value: string } | null
  externalOnlyFavorites?: boolean
  onConsumeExternal?: () => void
}

export function QuickTestPanel({
  activeQueue,
  favoriteCombinations,
  onRunTest,
  onToggleFavorite,
  axisFilterOptions,
  collapsed,
  onToggleCollapsed,
  externalAxisFilter = null,
  externalOnlyFavorites = false,
  onConsumeExternal,
}: QuickTestPanelProps): React.JSX.Element {
  const [search, setSearch] = useState("")
  const [axisFilter, setAxisFilter] = useState<{
    axisName: string
    value: string
  } | null>(null)
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const favoritesRef = useRef<HTMLDivElement>(null)

  const effectiveAxisFilter = externalAxisFilter ?? axisFilter
  const effectiveOnlyFavorites = externalOnlyFavorites || onlyFavorites

  const matchingItems = useMemo(() => {
    let items = activeQueue
    if (effectiveAxisFilter !== null) {
      items = items.filter(
        (item) =>
          item.meta[effectiveAxisFilter.axisName] === effectiveAxisFilter.value
      )
    }
    return items
  }, [activeQueue, effectiveAxisFilter])

  const filteredItems = useMemo(() => {
    let items = matchingItems
    if (effectiveOnlyFavorites) {
      items = items.filter((item) => favoriteCombinations.has(itemKey(item)))
    }
    if (search.trim() !== "") {
      const lowerSearch = search.toLowerCase()
      items = items.filter((item) => {
        const fn = substitute(item.filename, item).toLowerCase()
        const pr = substitute(item.prompt, item).toLowerCase()
        return fn.includes(lowerSearch) || pr.includes(lowerSearch)
      })
    }
    return items
  }, [matchingItems, search, effectiveOnlyFavorites, favoriteCombinations])

  const favorites = useMemo(
    () =>
      filteredItems.filter((item) => favoriteCombinations.has(itemKey(item))),
    [filteredItems, favoriteCombinations]
  )
  const others = useMemo(
    () =>
      filteredItems.filter((item) => !favoriteCombinations.has(itemKey(item))),
    [filteredItems, favoriteCombinations]
  )

  const handleSelect = (item: RenderItem): void => {
    onRunTest(item)
  }

  const hasAxisFilter =
    axisFilterOptions.length > 0 && activeQueue.length > 0

  const handleClearExternal = (): void => {
    onConsumeExternal?.()
  }

  const externalActive =
    externalAxisFilter !== null || externalOnlyFavorites

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
        <Sparkles className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[10px] font-medium text-muted-foreground">
          빠른 테스트
        </span>
        {activeQueue.length > 0 && (
          <Badge variant="secondary" className="text-[9px]">
            {filteredItems.length}/{activeQueue.length}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "펼치기" : "접기"}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </Button>
      </div>

      {!collapsed && (
        <>
          {/* Filter bar */}
          <div className="shrink-0 space-y-1.5 border-b px-3 py-2">
            {hasAxisFilter && (
              <div className="flex gap-1.5">
                <Select
                  value={effectiveAxisFilter?.axisName ?? "__all__"}
                  onValueChange={(v) => {
                    onConsumeExternal?.()
                    if (v === "__all__") {
                      setAxisFilter(null)
                    } else {
                      const opt = axisFilterOptions.find(
                        (o) => o.axisName === v
                      )
                      setAxisFilter({
                        axisName: v,
                        value: opt?.values[0] ?? "",
                      })
                    }
                  }}
                >
                  <SelectTrigger className="h-7 flex-1 text-[11px]">
                    <SelectValue placeholder="축 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">모든 축</SelectItem>
                    {axisFilterOptions.map((opt) => (
                      <SelectItem key={opt.axisName} value={opt.axisName}>
                        {opt.axisName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {effectiveAxisFilter !== null && (
                  <Select
                    value={effectiveAxisFilter.value}
                    onValueChange={(v) => {
                      onConsumeExternal?.()
                      setAxisFilter((prev) =>
                        prev === null ? null : { ...prev, value: v }
                      )
                    }}
                  >
                    <SelectTrigger className="h-7 flex-1 text-[11px]">
                      <SelectValue placeholder="값 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {axisFilterOptions
                        .find((o) => o.axisName === effectiveAxisFilter.axisName)
                        ?.values.map((val) => (
                          <SelectItem key={val} value={val}>
                            {val}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <div className="relative w-full">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="조합 검색..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                }}
                className="h-8 pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant={effectiveOnlyFavorites ? "secondary" : "ghost"}
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                onClick={() => {
                  onConsumeExternal?.()
                  setOnlyFavorites((v) => !v)
                }}
              >
                <Star
                  className={`h-3 w-3 ${effectiveOnlyFavorites ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                />
                즐겨찾기만
              </Button>
              {externalActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-primary hover:text-primary/80"
                  onClick={handleClearExternal}
                >
                  단축 해제
                </Button>
              )}
              {(effectiveAxisFilter !== null ||
                search !== "" ||
                effectiveOnlyFavorites) &&
                !externalActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setAxisFilter(null)
                      setSearch("")
                      setOnlyFavorites(false)
                    }}
                  >
                    초기화
                  </Button>
                )}
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1">
            {activeQueue.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <p className="text-center text-[10px] text-muted-foreground/50">
                  템플릿을 편집하면 테스트할 조합이 표시됩니다.
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <p className="text-xs text-muted-foreground">
                  검색 결과가 없습니다.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div ref={scrollAreaRef} className="space-y-2 p-2">
                  {favorites.length > 0 && (
                    <div ref={favoritesRef}>
                      <div className="mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold text-muted-foreground">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{" "}
                        즐겨찾기
                      </div>
                      <div className="space-y-1">
                        {favorites.map((item) => (
                          <ItemRow
                            key={itemKey(item)}
                            item={item}
                            isFavorite={true}
                            onSelect={() => {
                              handleSelect(item)
                            }}
                            onToggleFavorite={() => {
                              onToggleFavorite(itemKey(item))
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {others.length > 0 && (
                    <div>
                      <div className="mb-1 px-2 text-[10px] font-semibold text-muted-foreground">
                        모든 조합
                      </div>
                      <div className="space-y-1">
                        {others.map((item) => (
                          <ItemRow
                            key={itemKey(item)}
                            item={item}
                            isFavorite={false}
                            onSelect={() => {
                              handleSelect(item)
                            }}
                            onToggleFavorite={() => {
                              onToggleFavorite(itemKey(item))
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ItemRow({
  item,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: {
  item: RenderItem
  isFavorite: boolean
  onSelect: () => void
  onToggleFavorite: () => void
}): React.JSX.Element {
  return (
    <div className="group flex w-full items-start gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
      <button
        onClick={onSelect}
        className="flex flex-1 cursor-pointer flex-col items-start gap-1 text-left"
      >
        <div className="flex flex-wrap gap-1">
          {Object.entries(item.meta)
            .slice(0, 3)
            .map(([k, v]) => (
              <Badge
                key={k}
                variant="outline"
                className="text-[9px] font-normal"
              >
                {v}
              </Badge>
            ))}
          {Object.keys(item.meta).length > 3 && (
            <Badge variant="outline" className="text-[9px] font-normal">
              +{Object.keys(item.meta).length - 3}
            </Badge>
          )}
        </div>
        <div className="line-clamp-1 text-[10px] break-all text-muted-foreground">
          {substitute(item.filename, item)}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 ${isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"} hover:text-yellow-500`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
        >
          <Star
            className={`h-3 w-3 ${isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
        >
          <Play className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}