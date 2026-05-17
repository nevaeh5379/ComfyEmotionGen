import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Trash2Icon } from "lucide-react"

export interface SaveableItem {
  id: string
  name: string
  savedAt: number
}

/* ── shared props (without onLoad / onDelete) ─────────────── */
interface SaveInputProps<T extends SaveableItem = SaveableItem> {
  /** true = 저장 성공 (입력 초기화), false = 충돌 다이얼로그 표시 (초기화 안 함) */
  onSave: (name: string) => boolean
  placeholder: string
  saveDisabled: boolean
  /** 현재 활성화된 프리셋 이름 — 입력이 비어있을 때 이 값으로 저장(업데이트) */
  activeName?: string | undefined
  /** 드롭다운으로 표시할 저장 항목 목록 */
  items?: T[]
  /** 이름 외에 필터링할 추가 텍스트 반환 함수 (예: 템플릿 내용) */
  getFilterText?: (item: T) => string
  onLoad?: (item: T) => void
  onDelete?: (id: string) => void
  activeItemId?: string | undefined
  onUpdate?: (() => void) | undefined
}

/* ── shared props (with onLoad / onDelete) ─────────────── */
interface SavedListProps<T extends SaveableItem> {
  items: T[]
  onLoad: (item: T) => void
  onDelete: (id: string) => void
  activeItemId?: string | undefined
  onUpdate?: (() => void) | undefined
  className?: string
}

/* ── SaveInputBar ───────────────────────────────────────────
   Render this inside an InputGroupAddon (align="block-end").
   items 가 전달되면 포커스 시 드롭다운 Combobox로 동작한다.
   ArrowDown/Up/Tab으로 항목 이동, Enter로 선택, Escape로 닫기. */
export function SaveInputBar<T extends SaveableItem = SaveableItem>({
  onSave,
  placeholder,
  saveDisabled,
  activeName,
  items,
  getFilterText,
  onLoad,
  onDelete,
  activeItemId,
}: SaveInputProps<T>) {
  const [name, setName] = useState("")
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasItems = items !== undefined
  const hasActivePreset = !!activeName
  const canSave = !saveDisabled && (name.trim() || hasActivePreset)

  const filteredItems = hasItems
    ? (items ?? []).filter((item) => {
        const q = name.trim().toLowerCase()
        if (!q) return true
        return (
          item.name.toLowerCase().includes(q) ||
          (getFilterText?.(item).toLowerCase().includes(q) ?? false)
        )
      })
    : []

  // 포커스된 항목을 뷰에 스크롤
  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelectorAll("[data-item]")[
      focusedIndex
    ] as HTMLElement
    el?.scrollIntoView({ block: "nearest" })
  }, [focusedIndex])

  const handleSave = () => {
    const trimmed = name.trim()
    const targetName = trimmed || activeName!
    if (onSave(targetName)) {
      if (trimmed) setName("")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && filteredItems.length > 0) {
      if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, filteredItems.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, -1))
        return
      }
      if (e.key === "Enter" && focusedIndex >= 0) {
        const target = filteredItems[focusedIndex]
        if (target) {
          e.preventDefault()
          onLoad?.(target)
          setOpen(false)
          setFocusedIndex(-1)
          return
        }
      }
    }
    if (!open && hasItems && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault()
      requestAnimationFrame(() => {
        setOpen(true)
        setFocusedIndex(0)
      })
      return
    }
    if (e.key === "Enter" && canSave) handleSave()
    if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const inner = (
    <div className="flex w-full items-center gap-1.5">
      <Input
        placeholder={placeholder}
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setFocusedIndex(-1)
        }}
        onFocus={() => {
          if (hasItems) setOpen(true)
        }}
        onBlur={() => {
          if (!document.hasFocus()) return
          setOpen(false)
          setFocusedIndex(-1)
        }}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        className="h-7 border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <Button
        variant="default"
        size="sm"
        disabled={!canSave}
        onClick={handleSave}
        className="h-6 shrink-0 bg-foreground px-3 text-[11px] font-semibold text-background hover:bg-foreground/90"
        title={
          hasActivePreset ? "저장 (빈 입력: 현재 프리셋 업데이트)" : "저장"
        }
      >
        저장
      </Button>
    </div>
  )

  if (!hasItems) return inner

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>{inner}</PopoverAnchor>
      <PopoverContent
        className="p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) return
          setOpen(false)
          setFocusedIndex(-1)
        }}
      >
        {filteredItems.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">
            {name.trim()
              ? "일치하는 항목이 없습니다"
              : "저장된 항목이 없습니다"}
          </p>
        ) : (
          <div ref={listRef} className="max-h-64 space-y-1 overflow-y-auto p-2">
            {filteredItems.map((item, index) => {
              const isActive = item.id === activeItemId
              const isFocused = index === focusedIndex
              return (
                <div
                  key={item.id}
                  data-item
                  className={cn(
                    "flex items-center gap-2 rounded px-1",
                    isActive && "bg-primary/10",
                    isFocused && "bg-accent ring-1 ring-primary/50 outline-none"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <button
                    className={`min-w-0 flex-1 truncate text-left text-sm hover:underline ${isActive ? "font-semibold" : ""}`}
                    onClick={() => {
                      onLoad?.(item)
                      setOpen(false)
                    }}
                    title="불러오기"
                  >
                    {item.name}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.savedAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 flex-none p-0 text-muted-foreground hover:text-destructive"
                      title="삭제"
                      onClick={() => onDelete?.(item.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/* ── SavedItemsList ─────────────────────────────────────────
   Renders the items list + empty state                        */
export function SavedItemsList<T extends SaveableItem>({
  items,
  onLoad,
  onDelete,
  activeItemId,

  className,
}: SavedListProps<T>) {
  if (items.length === 0) {
    return (
      <p className="py-2 text-center text-xs text-muted-foreground">
        저장된 항목이 없습니다
      </p>
    )
  }

  return (
    <div
      className={cn("space-y-1 rounded-md border bg-muted/30 p-2", className)}
    >
      {items.map((item) => {
        const isActive = item.id === activeItemId
        return (
          <div
            key={item.id}
            className={`flex items-center gap-2 rounded px-1 ${isActive ? "bg-primary/10" : ""}`}
          >
            <button
              className={`min-w-0 flex-1 truncate text-left text-sm hover:underline ${isActive ? "font-semibold" : ""}`}
              onClick={() => onLoad(item)}
              title="불러오기"
            >
              {item.name}
            </button>
            <span className="text-left text-xs text-muted-foreground">
              {new Date(item.savedAt).toLocaleDateString()}
            </span>

            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 flex-none p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(item.id)}
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── SavedItemsManager (backward-compatible, for non-group use) ── */
export interface SavedItemsManagerProps<T extends SaveableItem> {
  items: T[]
  onSave: (name: string) => boolean
  onLoad: (item: T) => void
  onDelete: (id: string) => void
  placeholder: string
  saveDisabled: boolean
  activeItemId?: string | undefined
  onUpdate?: (() => void) | undefined
}

export function SavedItemsManager<T extends SaveableItem>({
  items,
  onSave,
  onLoad,
  onDelete,
  placeholder,
  saveDisabled,
  activeItemId,
  onUpdate,
}: SavedItemsManagerProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <SaveInputBar
        onSave={onSave}
        placeholder={placeholder}
        saveDisabled={saveDisabled}
      />
      <SavedItemsList
        items={items}
        onLoad={onLoad}
        onDelete={onDelete}
        activeItemId={activeItemId}
        onUpdate={onUpdate}
      />
    </div>
  )
}
