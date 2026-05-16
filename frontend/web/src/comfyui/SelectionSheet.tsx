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
import type { RenderItem } from "./renderTypes"
import { itemKey } from "../lib/workflowUtils"

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
    <SheetContent className="flex min-w-[30vw] flex-col">
      <SheetHeader>
        <SheetTitle>선택 실행</SheetTitle>
        <SheetDescription>
          전체 {fakeJobQueue.length}개 중 {selectedCount}개 선택됨
        </SheetDescription>
      </SheetHeader>
      <div className="flex items-center gap-2 px-4">
        <Input
          type="search"
          placeholder="filename/prompt 검색..."
          value={previewFilter}
          onChange={(e) => onPreviewFilterChange(e.target.value)}
          className="h-8 flex-1"
        />
        <Button variant="ghost" size="sm" onClick={checkAllItems}>
          전체 선택
        </Button>
        <Button variant="ghost" size="sm" onClick={uncheckAllItems}>
          전체 해제
        </Button>
      </div>
      <ScrollArea className="flex-1 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>FileName</TableHead>
              <TableHead>Prompt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPreview.map((item, index) => {
              const key = itemKey(item)
              return (
                <TableRow
                  key={`sel-${key}-${index}`}
                  className={!uncheckedItems.has(key) ? "" : "opacity-40"}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={!uncheckedItems.has(key)}
                      onCheckedChange={() => toggleItemCheck(key)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.filename}
                  </TableCell>
                  <TableCell>{item.prompt}</TableCell>
                </TableRow>
              )
            })}
            {filteredPreview.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-xs text-muted-foreground"
                >
                  검색 결과가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <div className="flex justify-end px-4">
        <Button
          variant="default"
          onClick={onRunSelected}
          disabled={!canRun || selectedCount === 0}
        >
          실행 ({selectedCount})
        </Button>
      </div>
    </SheetContent>
  </Sheet>
)
