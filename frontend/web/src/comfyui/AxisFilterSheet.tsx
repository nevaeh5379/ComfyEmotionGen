import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { PreviewTable } from "./PreviewTable"
import type { RenderItem } from "./renderTypes"
import { filterByItem } from "../lib/workflowUtils"

interface AxisFilterSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  axisValueFilter: Record<string, Record<string, boolean>>
  setAxisValueFilter: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, boolean>>>
  >
  collapsedAxes: Set<string>
  toggleAxisCollapse: (axis: string) => void
  estimatedRunCount: number | null
  fakeJobQueue: RenderItem[]
  axisFilteredItems: RenderItem[]
  axisExcludedItems: RenderItem[]
  uncheckedItems: Set<string>
  toggleItemCheck: (key: string) => void
}

export const AxisFilterSheet = ({
  open,
  onOpenChange,
  axisValueFilter,
  setAxisValueFilter,
  collapsedAxes,
  toggleAxisCollapse,
  estimatedRunCount,
  fakeJobQueue,
  axisFilteredItems,
  axisExcludedItems,
  uncheckedItems,
  toggleItemCheck,
}: AxisFilterSheetProps) => {
  const itemKey = (item: RenderItem) => `${item.filename} ${item.prompt}`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="min-w-[65vw]">
        <SheetHeader>
          <SheetTitle>축 필터</SheetTitle>
          <SheetDescription>
            체크 해제된 값은 실행에서 제외됩니다.
            {estimatedRunCount !== null
              ? ` 현재 설정 기준 ${estimatedRunCount}개 실행 예정.`
              : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="flex h-[65vh] gap-4">
          <div className="flex w-[35%] flex-col gap-2">
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setAxisValueFilter((prev) => {
                    const allEnabled = Object.values(prev).every((vals) =>
                      Object.values(vals).every(Boolean)
                    )
                    return Object.fromEntries(
                      Object.entries(prev).map(([k, vals]) => [
                        k,
                        Object.fromEntries(
                          Object.keys(vals).map((v) => [v, !allEnabled])
                        ),
                      ])
                    )
                  })
                }
              >
                전체{" "}
                {Object.values(axisValueFilter).every((vals) =>
                  Object.values(vals).every(Boolean)
                )
                  ? "비활성화"
                  : "활성화"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setAxisValueFilter((prev) =>
                    Object.fromEntries(
                      Object.entries(prev).map(([k, vals]) => [
                        k,
                        Object.fromEntries(
                          Object.keys(vals).map((v) => [v, true])
                        ),
                      ])
                    )
                  )
                }
              >
                초기화
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const allCollapsed =
                    collapsedAxes.size === Object.keys(axisValueFilter).length
                  if (allCollapsed) {
                    Object.keys(axisValueFilter).forEach(toggleAxisCollapse)
                  } else {
                    Object.keys(axisValueFilter)
                      .filter((a) => !collapsedAxes.has(a))
                      .forEach(toggleAxisCollapse)
                  }
                }}
              >
                {collapsedAxes.size === Object.keys(axisValueFilter).length
                  ? "모두 펴기"
                  : "모두 접기"}
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1 rounded-md border">
              {Object.entries(axisValueFilter).map(([axis, values]) => {
                const enabledCount =
                  Object.values(values).filter(Boolean).length
                const totalCount = Object.keys(values).length
                const axisChecked: boolean | "indeterminate" =
                  enabledCount === 0
                    ? false
                    : enabledCount === totalCount
                      ? true
                      : "indeterminate"
                const isCollapsed = collapsedAxes.has(axis)
                return (
                  <div key={axis}>
                    <div
                      className="flex cursor-pointer items-center gap-2 bg-muted/50 px-3 py-1.5 select-none"
                      onClick={() => toggleAxisCollapse(axis)}
                    >
                      <span className="w-3 text-xs text-muted-foreground transition-transform">
                        {isCollapsed ? "▸" : "▾"}
                      </span>
                      <Checkbox
                        checked={axisChecked}
                        onCheckedChange={() => {
                          const shouldEnable = enabledCount < totalCount
                          setAxisValueFilter((prev) => ({
                            ...prev,
                            [axis]: Object.fromEntries(
                              Object.keys(prev[axis] ?? {}).map((v) => [
                                v,
                                shouldEnable,
                              ])
                            ),
                          }))
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="font-mono text-sm font-semibold">
                        {axis}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {enabledCount}/{totalCount}
                      </span>
                    </div>
                    {!isCollapsed &&
                      Object.entries(values).map(([value, enabled]) => (
                        <div
                          key={value}
                          className="flex items-center gap-2 px-3 py-1 pl-9"
                        >
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              setAxisValueFilter((prev) => ({
                                ...prev,
                                [axis]: {
                                  ...prev[axis],
                                  [value]: checked === true,
                                },
                              }))
                            }
                          />
                          <span
                            className={`font-mono text-xs ${!enabled ? "text-muted-foreground line-through" : ""}`}
                          >
                            {value}
                          </span>
                        </div>
                      ))}
                  </div>
                )
              })}
            </ScrollArea>
          </div>
          <div className="flex w-[65%] flex-col gap-2">
            <PreviewTable
              title="제외된 항목"
              items={axisExcludedItems}
              accent="text-destructive"
              className="max-h-[40%]"
              onItemClick={(item) => filterByItem(item, setAxisValueFilter)}
              showCheckboxes
              getItemChecked={(item) => !uncheckedItems.has(itemKey(item))}
              onToggleItem={(item) => toggleItemCheck(itemKey(item))}
            />
            <PreviewTable
              title="포함된 항목"
              items={axisFilteredItems}
              accent="text-green-600"
              summary={`전체 ${fakeJobQueue.length}개 중 ${axisFilteredItems.length}개 실행 예정`}
              onItemClick={(item) => filterByItem(item, setAxisValueFilter)}
              showCheckboxes
              getItemChecked={(item) => !uncheckedItems.has(itemKey(item))}
              onToggleItem={(item) => toggleItemCheck(itemKey(item))}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
