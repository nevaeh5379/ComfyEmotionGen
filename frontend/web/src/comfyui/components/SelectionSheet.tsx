import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
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
}: SelectionSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="flex w-full sm:min-w-[35vw] flex-col gap-4">
      <SheetHeader className="px-1">
        <SheetTitle>선택 실행</SheetTitle>
        <SheetDescription className="text-xs font-medium text-muted-foreground">
          전체 {fakeJobQueue.length}개 중 {selectedCount}개 선택됨
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="relative flex-1 min-w-[200px]">
          <Input
            type="search"
            placeholder="filename/prompt 검색..."
            value={previewFilter}
            onChange={(e) => onPreviewFilterChange(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={checkAllItems} className="h-8 text-xs font-bold">
            전체 선택
          </Button>
          <Button variant="ghost" size="sm" onClick={uncheckAllItems} className="h-8 text-xs font-bold">
            전체 해제
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0 rounded-md border shadow-inner">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-panel/95 backdrop-blur-sm">
            <TableRow>
              <TableHead className="w-8 px-2" />
              <TableHead className="px-2">파일명</TableHead>
              <TableHead className="px-2">프롬프트</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPreview.map((item, index) => {
              const key = itemKey(item)
              return (
                <TableRow
                  key={`sel-${key}-${index}`}
                  className={cn("cursor-pointer transition-opacity", !uncheckedItems.has(key) ? "" : "opacity-40")}
                  onClick={() => toggleItemCheck(key)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()} className="px-2 py-3">
                    <Checkbox
                      checked={!uncheckedItems.has(key)}
                      onCheckedChange={() => toggleItemCheck(key)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[11px] font-bold px-2">
                    {item.filename}
                  </TableCell>
                  <TableCell className="px-2 text-muted-foreground line-clamp-1">
                    {item.prompt}
                  </TableCell>
                </TableRow>
              )
            })}
            {filteredPreview.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-40 text-center text-muted-foreground"
                >
                  검색 결과가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <div className="flex justify-end pt-2 border-t mt-auto px-1">
        <Button
          variant="default"
          size="lg"
          onClick={onRunSelected}
          disabled={!canRun || selectedCount === 0}
          className="w-full sm:w-auto h-11 sm:h-10 text-base sm:text-sm font-black"
        >
          {selectedCount}개 작업 실행하기
        </Button>
      </div>
    </SheetContent>
  </Sheet>
)
