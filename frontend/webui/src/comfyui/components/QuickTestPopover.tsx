import { useState, useMemo } from "react"
import { Play, Star, Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import type { RenderItem } from "../types/renderTypes"
import { itemKey } from "../../lib/workflowUtils"

interface QuickTestPopoverProps {
  factorType: "axis" | "variable"
  factorName: string
  factorValue: string
  activeQueue: RenderItem[]
  favoriteCombinations: Set<string>
  onRunTest: (item: RenderItem) => void
  onToggleFavorite: (key: string) => void
}

function substitute(text: string, item: RenderItem) {
  let r = text || ""
  Object.entries(item.meta).forEach(([k, v]) => {
    r = r.split(`{{${k}}}`).join(v)
    r = r.split(`{${k}}`).join(v)
  })
  r = r.split("{{input}}").join(item.prompt || "")
  r = r.split("{input}").join(item.prompt || "")
  return r
}

export function QuickTestPopover({
  factorType,
  factorName,
  factorValue,
  activeQueue,
  favoriteCombinations,
  onRunTest,
  onToggleFavorite,
}: QuickTestPopoverProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const matchingItems = useMemo(() => {
    if (factorType === "axis") {
      return activeQueue.filter((item) => item.meta[factorName] === factorValue)
    } else {
      // For variables, there is no direct metadata matching in activeQueue easily,
      // but if the user wants to test a specific variable, they might just want
      // any combination. To keep it simple, we just return the full queue for variables
      // or filter by checking if the substituted text contains the value.
      // Usually, 'variables' are global across the template, so any combination has it.
      return activeQueue
    }
  }, [activeQueue, factorType, factorName, factorValue])

  const filteredItems = useMemo(() => {
    if (!search.trim()) return matchingItems
    const lowerSearch = search.toLowerCase()
    return matchingItems.filter((item) => {
      const fn = substitute(item.filename, item).toLowerCase()
      const pr = substitute(item.prompt, item).toLowerCase()
      return fn.includes(lowerSearch) || pr.includes(lowerSearch)
    })
  }, [matchingItems, search])

  const favorites = useMemo(() => filteredItems.filter((item) => favoriteCombinations.has(itemKey(item))), [filteredItems, favoriteCombinations])
  const others = useMemo(() => filteredItems.filter((item) => !favoriteCombinations.has(itemKey(item))), [filteredItems, favoriteCombinations])

  const handleSelect = (item: RenderItem) => {
    setOpen(false)
    onRunTest(item)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-primary">
          <Play className="h-3 w-3" /> 테스트
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="조합 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus-visible:ring-0 shadow-none"
          />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-2 space-y-2">
            {favorites.length > 0 && (
              <div>
                <div className="mb-1 px-2 text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> 즐겨찾기
                </div>
                <div className="space-y-1">
                  {favorites.map((item) => (
                    <ItemRow key={itemKey(item)} item={item} isFavorite={true} onSelect={() => handleSelect(item)} onToggleFavorite={() => onToggleFavorite(itemKey(item))} />
                  ))}
                </div>
              </div>
            )}

            {others.length > 0 && (
              <div>
                <div className="mb-1 px-2 text-[10px] font-semibold text-muted-foreground">모든 조합</div>
                <div className="space-y-1">
                  {others.map((item) => (
                    <ItemRow key={itemKey(item)} item={item} isFavorite={false} onSelect={() => handleSelect(item)} onToggleFavorite={() => onToggleFavorite(itemKey(item))} />
                  ))}
                </div>
              </div>
            )}

            {filteredItems.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function ItemRow({ item, isFavorite, onSelect, onToggleFavorite }: { item: RenderItem; isFavorite: boolean; onSelect: () => void; onToggleFavorite: () => void }) {
  return (
    <div className="flex w-full items-start gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent group">
      <button onClick={onSelect} className="flex-1 flex flex-col gap-1 items-start text-left">
        <div className="flex flex-wrap gap-1">
          {Object.entries(item.meta).slice(0, 3).map(([k, v]) => (
            <Badge key={k} variant="outline" className="text-[9px] font-normal">
              {v}
            </Badge>
          ))}
          {Object.keys(item.meta).length > 3 && (
            <Badge variant="outline" className="text-[9px] font-normal">+{Object.keys(item.meta).length - 3}</Badge>
          )}
        </div>
        <div className="line-clamp-1 text-[10px] text-muted-foreground break-all">
          {substitute(item.filename, item)}
        </div>
      </button>
      <Button 
        variant="ghost" 
        size="icon" 
        className={`h-6 w-6 shrink-0 ${isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"} hover:text-yellow-500`}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
      >
        <Star className={`h-3 w-3 ${isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
      </Button>
    </div>
  )
}
