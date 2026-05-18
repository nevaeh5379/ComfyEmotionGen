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
import { Button } from "@/components/ui/button"
import { LayersIcon, SearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RenderItem } from "../types/renderTypes"
import { itemKey } from "../../lib/workflowUtils"

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
}: ParserPreviewDialogProps) => {
  const substitute = (text: string, item: RenderItem) => {
    let res = text || ""
    // Meta variables
    Object.entries(item.meta).forEach(([k, v]) => {
      res = res.split(`{{${k}}}`).join(v)
      res = res.split(`{${k}}`).join(v)
    })
    // Built-ins
    res = res.split("{{input}}").join(item.prompt || "")
    res = res.split("{input}").join(item.prompt || "")
    return res
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayersIcon className="size-5 text-primary opacity-60" />
            파서 렌더링 결과
          </DialogTitle>
          <DialogDescription>
            작성한 템플릿 문법에 따라 생성될{" "}
            <strong>{fakeJobQueue.length}개</strong>의 작업 목록입니다.
            {previewFilter ? ` (검색 결과 ${filteredPreview.length}개)` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border border-line/50 bg-muted/30 p-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="파일명 또는 프롬프트 내용으로 검색..."
              value={previewFilter}
              onChange={(e) => onPreviewFilterChange(e.target.value)}
              className="h-8 bg-background/50 pl-8 text-xs shadow-none focus-visible:ring-1"
            />
          </div>
        </div>

        <ScrollArea className="mt-2 min-h-0 flex-1 rounded-md border shadow-inner">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/90 shadow-sm backdrop-blur-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[35%] px-3 py-2">
                  파일명 (FileName)
                </TableHead>
                <TableHead className="px-3 py-2">프롬프트 (Prompt)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody id="rendered-items-table-body">
              {filteredPreview.map((item, index) => {
                const key = itemKey(item)
                const wouldRun =
                  !filteredByAxisSet || filteredByAxisSet.has(key)
                const renderedFilename = substitute(item.filename, item)

                return (
                  <TableRow
                    key={`fake-${key}-${index}`}
                    className={cn(
                      "group transition-colors",
                      !wouldRun
                        ? "italic opacity-30 grayscale"
                        : "hover:bg-accent/30"
                    )}
                  >
                    <TableCell className="px-3 py-3.5 align-top font-mono text-xs font-black">
                      <div className="leading-relaxed break-all whitespace-pre-wrap text-foreground">
                        {renderedFilename}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3.5 align-top">
                      <div className="line-clamp-4 font-mono text-[11px] leading-snug font-medium text-muted-foreground transition-all group-hover:line-clamp-none group-hover:text-foreground">
                        {substitute(item.prompt, item)}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredPreview.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="h-40 text-center text-muted-foreground"
                  >
                    일치하는 검색 결과가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <div className="mt-2 flex justify-end border-t border-line pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="font-bold"
          >
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
