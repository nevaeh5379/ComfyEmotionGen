import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface SaveableItem {
  id: string
  name: string
  savedAt: number
}

export interface SavedItemsManagerProps<T extends SaveableItem> {
  items: T[]
  /** true = 저장 성공 (입력 초기화), false = 충돌 다이얼로그 표시 (초기화 안 함) */
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
  const [name, setName] = useState("")

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (onSave(trimmed)) setName("")
  }

  return (
    <>
      <div className="flex gap-2 pt-1">
        <Input
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !saveDisabled) {
              handleSave()
            }
          }}
          className="h-8 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={saveDisabled || !name.trim()}
          onClick={handleSave}
        >
          저장
        </Button>
      </div>
      {items.length === 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          저장된 항목이 없습니다
        </p>
      )}
      {items.length > 0 && (
        <div className="mt-1 space-y-1 rounded-md border bg-muted/30 p-2">
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
      )}
    </>
  )
}
