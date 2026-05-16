import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { RenderItem } from "./renderTypes"
import { itemKey } from "../lib/workflowUtils"

interface ParserPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fakeJobQueue: RenderItem[]
  previewFilter: string
  onPreviewFilterChange: (v: string) => void
  filteredPreview: RenderItem[]
  filteredByAxisSet: Set<string> | null
}

export const ParserPreviewDialog = ({
  open,
  onOpenChange,
  fakeJobQueue,
  previewFilter,
  onPreviewFilterChange,
  filteredPreview,
  filteredByAxisSet,
}: ParserPreviewDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>파서 결과</DialogTitle>
        <DialogDescription>
          전체 {fakeJobQueue.length}개
          {previewFilter ? ` · 검색 ${filteredPreview.length}개` : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="px-1">
        <Input
          type="search"
          placeholder="filename/prompt 검색..."
          value={previewFilter}
          onChange={(e) => onPreviewFilterChange(e.target.value)}
          className="h-8"
        />
      </div>
      <ScrollArea className="max-h-[50vh] overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>FileName</TableHead>
              <TableHead>Prompt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody id="rendered-items-table-body">
            {filteredPreview.map((item, index) => {
              const key = itemKey(item)
              const wouldRun = !filteredByAxisSet || filteredByAxisSet.has(key)
              return (
                <TableRow
                  key={`fake-${key}-${index}`}
                  className={!wouldRun ? "opacity-40" : ""}
                >
                  <TableCell className="font-mono text-xs">
                    {item.filename}
                  </TableCell>
                </TableRow>
              )
            })}
            {filteredPreview.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={2}
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
    </DialogContent>
  </Dialog>
)
