import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { RenderItem } from "../types/renderTypes"
import { itemKey } from "../../lib/workflowUtils"
import { useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

interface SelectionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fakeJobQueue: RenderItem[]
  filteredPreview: RenderItem[]
  previewFilter: string
  onPreviewFilterChange: (v: string) => void
  uncheckedItems: Set<string>
  selectedCount: number | null
  canRun: boolean
  checkAllItems: () => void
  uncheckAllItems: () => void
  toggleItemCheck: (key: string) => void
  onRunSelected: () => Promise<void>
  onExcludeApproved: () => void
}

export const SelectionSheet = ({
  open,
  onOpenChange,
  fakeJobQueue,
  filteredPreview,
  previewFilter,
  onPreviewFilterChange,
  uncheckedItems,
  selectedCount,
  canRun,
  checkAllItems,
  uncheckAllItems,
  toggleItemCheck,
  onRunSelected,
  onExcludeApproved,
}: SelectionSheetProps) => {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: filteredPreview.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 45,
    overscan: 10,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 sm:min-w-[35vw]">
        <SheetHeader className="px-1">
          <SheetTitle>선택 실행</SheetTitle>
          <SheetDescription className="text-xs font-medium text-muted-foreground">
            전체 {fakeJobQueue.length}개 중 {selectedCount}개 선택됨
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <div className="relative min-w-[200px] flex-1">
            <Input
              type="search"
              placeholder="filename/prompt 검색..."
              value={previewFilter}
              onChange={(e) => onPreviewFilterChange(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={checkAllItems}
              className="h-8 text-xs font-bold"
            >
              전체 선택
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={uncheckAllItems}
              className="h-8 text-xs font-bold"
            >
              전체 해제
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExcludeApproved}
              className="h-8 text-xs font-bold text-amber-500 hover:bg-amber-500/10 hover:text-amber-600"
            >
              통과 항목 제외
            </Button>
          </div>
        </div>
        <div
          ref={setScrollElement}
          className="min-h-0 flex-1 overflow-auto rounded-md border shadow-inner scrollbar-thin"
        >
          <Table className="text-xs flex flex-col w-full relative">
            <TableHeader className="sticky top-0 z-10 bg-panel/95 backdrop-blur-sm flex w-full border-b shrink-0">
              <TableRow className="flex w-full hover:bg-transparent">
                <TableHead className="w-10 px-2 flex items-center justify-center" />
                <TableHead className="flex-1 px-2 flex items-center font-bold">파일명</TableHead>
                <TableHead className="flex-1 px-2 flex items-center font-bold">프롬프트</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody style={{ height: `${totalSize}px`, position: "relative", display: "block", width: "100%" }}>
              {virtualItems.map((virtualItem) => {
                const item = filteredPreview[virtualItem.index]
                if (!item) return null
                const key = itemKey(item)
                return (
                  <TableRow
                    key={`sel-${key}-${virtualItem.index}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className={cn(
                      "flex cursor-pointer transition-opacity items-center hover:bg-muted/30 border-b",
                      !uncheckedItems.has(key) ? "" : "opacity-40"
                    )}
                    onClick={() => toggleItemCheck(key)}
                  >
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="w-10 px-2 py-3 flex items-center justify-center shrink-0"
                    >
                      <input
                        type="checkbox"
                        checked={!uncheckedItems.has(key)}
                        onChange={() => toggleItemCheck(key)}
                        className="size-4 shrink-0 rounded-[4px] border border-input accent-primary cursor-pointer focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
                      />
                    </TableCell>
                    <TableCell className="flex-1 min-w-0 px-2 font-mono text-[11px] font-bold truncate shrink-0">
                      {item.filename}
                    </TableCell>
                    <TableCell className="flex-1 min-w-0 px-2 text-muted-foreground truncate">
                      {item.prompt}
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredPreview.length === 0 && (
                <TableRow key="no-results" className="flex items-center justify-center h-40 text-muted-foreground w-full">
                  <TableCell className="text-center font-medium">
                    검색 결과가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-auto flex justify-end border-t px-1 pt-2">
          <Button
            variant="default"
            size="lg"
            onClick={onRunSelected}
            disabled={!canRun || selectedCount === 0}
            className="h-11 w-full text-base font-black sm:h-10 sm:w-auto sm:text-sm"
          >
            {selectedCount}개 작업 실행하기
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
