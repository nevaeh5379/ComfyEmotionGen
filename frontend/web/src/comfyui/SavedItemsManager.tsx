import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface SaveableItem {
  id: string
  name: string
  savedAt: number
}

/* ── shared props (without onLoad / onDelete) ─────────────── */
interface SaveInputProps {
  /** true = 저장 성공 (입력 초기화), false = 충돌 다이얼로그 표시 (초기화 안 함) */
  onSave: (name: string) => boolean
  placeholder: string
  saveDisabled: boolean
  /** 현재 활성화된 프리셋 이름 — 입력이 비어있을 때 이 값으로 저장(업데이트) */
  activeName?: string | undefined
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
   Render this inside an InputGroupAddon (align="block-end")    */
export function SaveInputBar({
  onSave,
  placeholder,
  saveDisabled,
  activeName,
}: SaveInputProps) {
  const [name, setName] = useState("")

  const hasActivePreset = !!activeName
  const canSave = !saveDisabled && (name.trim() || hasActivePreset)

  const handleSave = () => {
    const trimmed = name.trim()
    const targetName = trimmed || activeName!
    if (onSave(targetName)) {
      // 새 이름으로 저장했을 때만 초기화
      if (trimmed) setName("")
    }
  }

  return (
    <div className="flex w-full items-center gap-1.5">
      <Input
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSave) {
            handleSave()
          }
        }}
        className="h-7 border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <Button
        variant="default"
        size="sm"
        disabled={!canSave}
        onClick={handleSave}
        className="h-7 shrink-0 px-3 text-xs"
        title={
          hasActivePreset ? "저장 (빈 입력: 현재 프리셋 업데이트)" : "저장"
        }
      >
        저장
      </Button>
    </div>
  )
}

/* ── SavedItemsList ─────────────────────────────────────────
   Renders the items list + empty state                        */
export function SavedItemsList<T extends SaveableItem>({
  items,
  onLoad,
  onDelete,
  activeItemId,
  onUpdate,
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
    <div className={cn("space-y-1 rounded-md border bg-muted/30 p-2", className)}>
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
            {isActive && onUpdate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-xs"
                onClick={onUpdate}
              >
                업데이트
              </Button>
            )}
            <span className="flex-none text-xs text-muted-foreground">
              {new Date(item.savedAt).toLocaleDateString()}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 flex-none p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(item.id)}
            >
              ×
            </Button>
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
