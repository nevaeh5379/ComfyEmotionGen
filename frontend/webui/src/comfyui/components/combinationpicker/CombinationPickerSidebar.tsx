import { useCurationContext } from "./CurationContext"
import { StatusIcon } from "./CombinationPickerHelpers"
import { hasApproved } from "../../types/Message"
import { FolderIcon, ImageIcon, SearchIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { RenderItem } from "./CombinationPickerComponents"

export type SidebarFilter = "all" | "done" | "pending" | "has-images" | "empty"

const FILTERS: { value: SidebarFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "done", label: "완료" },
  { value: "pending", label: "미완료" },
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
}: SidebarProps): React.JSX.Element {
  const { backendUrl, data } = useCurationContext()
  const { imagesByFilename } = data

  return (
    <div
      className="sticky flex w-64 flex-none flex-col self-start overflow-hidden rounded-lg border bg-card"
      style={{
        maxHeight: "calc(100vh - 45px - var(--toolbar-height, 60px) - 20px)",
      }}
    >
      <div className="border-b bg-muted/30 p-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        Combinations
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
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
        {items.map((item) => {
          const imgs = imagesByFilename.get(item.filename) ?? []
          const isDone = hasApproved(imgs)
          const isActive = item.filename === selectedFilename
          return (
            <button
              key={item.filename}
              onClick={() => {
                setSelectedFilename(item.filename)
              }}
              className={`flex w-full items-start gap-2 rounded-md p-2 text-left transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-accent/50"
              }`}
            >
              <span className="mt-0.5 flex-none">
                <StatusIcon done={isDone} active={isActive} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <FolderIcon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isActive
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0 flex-1 truncate font-mono text-[10px] leading-tight font-bold">
                    {item.filename}
                  </div>
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
          )
        })}
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
