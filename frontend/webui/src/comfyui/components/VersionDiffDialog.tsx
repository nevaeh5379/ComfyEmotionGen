/**
 * 버전 차이 비교 다이얼로그.
 *
 * 저장된 템플릿/워크플로우 업데이트 시, 기존 버전과 새 버전의 차이를
 * 라인별 +/- 마커로 표시하고 확인/취소할 수 있다.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface DiffLine {
  type: "added" | "removed" | "unchanged"
  content: string
}

/** 간단한 라인별 diff. LCS 기반이 아닌 단순 비교. */
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")
  const result: DiffLine[] = []

  let oldIdx = 0
  let newIdx = 0

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length) {
      if (oldLines[oldIdx] === newLines[newIdx]) {
        result.push({ type: "unchanged", content: oldLines[oldIdx]! })
        oldIdx++
        newIdx++
      } else {
        // Try to find the matching line within a window
        const windowSize = 5
        let found = -1
        for (let w = 0; w < windowSize && newIdx + w < newLines.length; w++) {
          if (newLines[newIdx + w] === oldLines[oldIdx]) {
            found = w
            break
          }
        }

        if (found >= 0) {
          for (let w = 0; w < found; w++) {
            result.push({ type: "added", content: newLines[newIdx + w]! })
          }
          newIdx += found
        } else {
          result.push({ type: "removed", content: oldLines[oldIdx]! })
          oldIdx++
        }
      }
    } else if (oldIdx < oldLines.length) {
      result.push({ type: "removed", content: oldLines[oldIdx]! })
      oldIdx++
    } else {
      result.push({ type: "added", content: newLines[newIdx]! })
      newIdx++
    }
  }

  return result
}

interface VersionDiffDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  oldContent: string
  newContent: string
  itemName: string
}

export function VersionDiffDialog({
  open,
  onClose,
  onConfirm,
  oldContent,
  newContent,
  itemName,
}: VersionDiffDialogProps) {
  const diff = computeDiff(oldContent, newContent)

  // Collapse consecutive unchanged lines
  const collapsed: {
    type: DiffLine["type"]
    content: string
    count: number
  }[] = []
  for (const line of diff) {
    if (
      line.type === "unchanged" &&
      collapsed.length > 0 &&
      collapsed[collapsed.length - 1]!.type === "unchanged"
    ) {
      collapsed[collapsed.length - 1]!.count++
    } else {
      collapsed.push({ type: line.type, content: line.content, count: 1 })
    }
  }

  const changedCount = diff.filter((d) => d.type !== "unchanged").length

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>'{itemName}' 업데이트</DialogTitle>
          <DialogDescription>
            {changedCount > 0
              ? `${changedCount}개의 라인이 변경되었습니다. 확인 후 업데이트를 진행하세요.`
              : "변경된 내용이 없습니다."}
          </DialogDescription>
        </DialogHeader>

        <div
          className="overflow-auto rounded-md border bg-muted/30 font-mono text-xs"
          style={{ maxHeight: "50vh" }}
        >
          <table className="w-full">
            <tbody>
              {collapsed.map((block, i) => {
                if (block.type === "unchanged") {
                  if (block.count <= 3) {
                    return Array.from({ length: block.count }).map((_, j) => (
                      <tr key={`u-${i}-${j}`} className="text-muted-foreground">
                        <td className="px-2 py-0.5 text-right select-none">
                          {" "}
                        </td>
                        <td className="px-2 py-0.5 break-all whitespace-pre-wrap">
                          {block.content}
                        </td>
                      </tr>
                    ))
                  } else {
                    return (
                      <tr key={`u-${i}`} className="text-muted-foreground/50">
                        <td className="px-2 py-0.5 text-right select-none">
                          {" "}
                        </td>
                        <td className="px-2 py-0.5 italic">
                          {"…"} {block.count} lines unchanged {"…"}
                        </td>
                      </tr>
                    )
                  }
                }
                return Array.from({ length: block.count }).map((_, j) => (
                  <tr
                    key={`c-${i}-${j}`}
                    className={
                      block.type === "added"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/10 text-red-600 dark:text-red-400"
                    }
                  >
                    <td className="px-2 py-0.5 text-right font-bold select-none">
                      {block.type === "added" ? "+" : "-"}
                    </td>
                    <td className="px-2 py-0.5 break-all whitespace-pre-wrap">
                      {block.content}
                    </td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            업데이트 적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
