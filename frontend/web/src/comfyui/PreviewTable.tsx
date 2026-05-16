import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
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

interface PreviewTableProps {
  title: string
  items: RenderItem[]
  accent?: string
  summary?: string
  className?: string
  onItemClick?: (item: RenderItem) => void
  showCheckboxes?: boolean
  getItemChecked?: (item: RenderItem) => boolean
  onToggleItem?: (item: RenderItem) => void
}

export const PreviewTable = ({
  title,
  items,
  accent,
  summary,
  className,
  onItemClick,
  showCheckboxes,
  getItemChecked,
  onToggleItem,
}: PreviewTableProps) => (
  <div className={`flex min-h-0 flex-col ${className ?? "flex-1"}`}>
    <div className="mb-1 flex shrink-0 items-baseline gap-2">
      <span className="text-sm font-semibold">{title}</span>
      <span className={accent}>{items.length}</span>
      {summary && (
        <span className="text-xs text-muted-foreground">{summary}</span>
      )}
    </div>
    <ScrollArea className="min-h-0 flex-1 rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckboxes && <TableHead className="w-8" />}
            <TableHead className="w-[40%]">FileName</TableHead>
            <TableHead>Prompt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, i) => (
            <TableRow
              key={`${title}-${itemKey(item)}-${i}`}
              className={onItemClick ? "cursor-pointer" : ""}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
            >
              {showCheckboxes && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={getItemChecked?.(item) ?? true}
                    onCheckedChange={() => onToggleItem?.(item)}
                  />
                </TableCell>
              )}
              <TableCell className="font-mono text-xs">
                {item.filename}
              </TableCell>
              <TableCell className="text-xs">{item.prompt}</TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={showCheckboxes ? 3 : 2}
                className="text-center text-xs text-muted-foreground"
              >
                없음
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  </div>
)
