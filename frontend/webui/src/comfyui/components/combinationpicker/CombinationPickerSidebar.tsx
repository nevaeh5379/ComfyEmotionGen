import { useCurationContext } from "./CurationContext"
import { StatusIcon } from "./CombinationPickerHelpers"
import { hasExportableApproved } from "../../types/Message"
import {
  CrosshairIcon,
  CheckSquareIcon,
  Clock3Icon,
  FolderIcon,
  ImageIcon,
  LoaderCircleIcon,
  SearchIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { RenderItem } from "./CombinationPickerComponents"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useMemo, useRef } from "react"
import { useBackend } from "../../hooks/useBackend"

export type SidebarFilter =
  | "all"
  | "done"
  | "pending"
  | "held"
  | "has-images"
  | "empty"

const FILTERS: { value: SidebarFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "done", label: "완료" },
  { value: "pending", label: "미완료" },
  { value: "held", label: "보류" },
  { value: "has-images", label: "이미지" },
  { value: "empty", label: "빈 폴더" },
]

interface SidebarProps {
  selectedFilename: string
  setSelectedFilename: (filename: string) => void
  items: RenderItem[]
  totalCount: number
  query: string
  setQuery: (value: string) => void
  filter: SidebarFilter
  setFilter: (value: SidebarFilter) => void
  heldFilenames?: string[]
}

export function CombinationPickerSidebar({
  selectedFilename,
  setSelectedFilename,
  items,
  totalCount,
  query,
  setQuery,
  filter,
  setFilter,
  heldFilenames = [],
}: SidebarProps): React.JSX.Element {
  const { backendUrl, data, selection } = useCurationContext()
  const { jobs } = useBackend()
  const { imagesByFilename } = data
  const { selectionMode, selectedFilenames, toggleSelect } = selection
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 104,
    overscan: 4,
  })
  const selectedIndex = useMemo(
    () => items.findIndex((item) => item.filename === selectedFilename),
    [items, selectedFilename]
  )
  const activeJobsByFilename = useMemo(() => {
    const grouped = new Map<
      string,
      { running: number; waiting: number; progress: number }
    >()
    for (const job of jobs) {
      if (
        job.status !== "running" &&
        job.status !== "queued" &&
        job.status !== "pending"
      ) {
        continue
      }
      const current = grouped.get(job.filename) ?? {
        running: 0,
        waiting: 0,
        progress: 0,
      }
      if (job.status === "running") {
        current.running += 1
        current.progress += job.progressPercent
      } else {
        current.waiting += 1
      }
      grouped.set(job.filename, current)
    }
    return grouped
  }, [jobs])

  const scrollToCurrent = (): void => {
    if (selectedIndex < 0) return
    rowVirtualizer.scrollToIndex(selectedIndex, {
      align: "center",
      behavior: "smooth",
    })
  }

  return (
    <div
      className="sticky flex w-64 flex-none flex-col self-start overflow-hidden rounded-lg border bg-card"
      style={{
        maxHeight: "calc(100vh - 45px - var(--toolbar-height, 60px) - 20px)",
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2 py-1.5">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Combinations
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[10px] font-bold"
          disabled={selectedIndex < 0}
          onClick={scrollToCurrent}
          title={
            selectedIndex < 0
              ? "현재 조합이 검색 또는 필터 결과에 없습니다."
              : `현재 조합으로 이동 (${String(selectedIndex + 1)} / ${String(items.length)})`
          }
        >
          <CrosshairIcon className="h-3.5 w-3.5" />
          현재 위치
        </Button>
      </div>
      <div className="border-b bg-background/80 p-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
            placeholder="조합 검색"
            className="h-8 pr-8 pl-7 text-xs"
          />
          {query !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 p-0 text-muted-foreground"
              onClick={() => {
                setQuery("")
              }}
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setFilter(item.value)
              }}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                filter === item.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-right text-[10px] font-bold text-muted-foreground tabular-nums">
          {items.length} / {totalCount}
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-1">
        {items.length > 0 && (
          <div
            className="relative w-full"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index]
              if (item === undefined) return null
              const imgs = imagesByFilename.get(item.filename) ?? []
              const isDone = hasExportableApproved(item.filename, imgs)
              const isActive = item.filename === selectedFilename
              const isBatchSelected = selectedFilenames.has(item.filename)
              const activeJobs = activeJobsByFilename.get(item.filename)
              return (
                <div
                  key={item.filename}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute top-0 left-0 w-full pb-0.5"
                  style={{
                    transform: `translateY(${String(virtualRow.start)}px)`,
                  }}
                >
                  <button
                    onClick={(event) => {
                      if (
                        selectionMode ||
                        event.ctrlKey ||
                        event.metaKey ||
                        event.shiftKey
                      ) {
                        toggleSelect(item.filename, event)
                      } else {
                        setSelectedFilename(item.filename)
                      }
                    }}
                    className={`flex w-full items-start gap-2 rounded-md p-2 text-left transition-colors ${
                      isBatchSelected
                        ? "bg-blue-500/15 text-foreground ring-1 ring-blue-500/50 ring-inset"
                        : isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <span className="mt-0.5 flex-none">
                      {selectionMode ? (
                        isBatchSelected ? (
                          <CheckSquareIcon className="h-4 w-4 text-blue-500" />
                        ) : (
                          <SquareIcon className="h-4 w-4 text-muted-foreground/50" />
                        )
                      ) : (
                        <StatusIcon done={isDone} active={isActive} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <FolderIcon
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isActive && !isBatchSelected
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground"
                          }`}
                        />
                        <div className="min-w-0 flex-1 truncate font-mono text-[10px] leading-tight font-bold">
                          {item.filename}
                        </div>
                        {activeJobs !== undefined && activeJobs.running > 0 && (
                          <span
                            className="flex shrink-0 items-center gap-0.5 rounded bg-violet-500/20 px-1 py-0.5 text-[8px] leading-none font-black text-violet-600 dark:text-violet-300"
                            title={`AI 생성 중 · 평균 ${String(Math.round(activeJobs.progress / activeJobs.running))}%`}
                          >
                            <LoaderCircleIcon className="h-2.5 w-2.5 animate-spin" />
                            생성 중
                            {activeJobs.running > 1
                              ? ` ${String(activeJobs.running)}`
                              : ""}
                          </span>
                        )}
                        {activeJobs !== undefined && activeJobs.waiting > 0 && (
                          <span
                            className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/20 px-1 py-0.5 text-[8px] leading-none font-black text-amber-700 dark:text-amber-300"
                            title={`작업 대기 중 ${String(activeJobs.waiting)}개`}
                          >
                            <Clock3Icon className="h-2.5 w-2.5" />
                            대기
                            {activeJobs.waiting > 1
                              ? ` ${String(activeJobs.waiting)}`
                              : ""}
                          </span>
                        )}
                        {heldFilenames.includes(item.filename) && (
                          <span className="shrink-0 rounded bg-yellow-500/20 px-1 py-0.5 text-[8px] leading-none font-black text-yellow-600 dark:text-yellow-400">
                            보류
                          </span>
                        )}
                        <span className="shrink-0 rounded-full bg-background/40 px-1.5 py-0.5 text-[9px] font-black tabular-nums opacity-70">
                          {imgs.length}
                        </span>
                      </div>
                      <div className="grid h-16 grid-cols-4 gap-1 overflow-hidden rounded-md border border-black/5 bg-black/5 p-1 dark:border-white/5 dark:bg-white/5">
                        {imgs.length === 0 ? (
                          <div
                            className={`col-span-4 flex h-full items-center justify-center rounded bg-background/50 ${
                              isActive
                                ? "text-primary-foreground/55"
                                : "text-muted-foreground/45"
                            }`}
                          >
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        ) : (
                          imgs.slice(0, 4).map((img) => (
                            <div
                              key={img.hash}
                              className="relative overflow-hidden rounded bg-background/60"
                            >
                              <img
                                src={`${backendUrl}/saved-images/${img.hash}`}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                              {img.status === "approved" && (
                                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-green-500 ring-1 ring-white/70" />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {items.length === 0 && (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-muted-foreground/60">
            <SearchIcon className="h-5 w-5" />
            <p className="text-xs font-bold">검색 결과 없음</p>
          </div>
        )}
      </div>
    </div>
  )
}
