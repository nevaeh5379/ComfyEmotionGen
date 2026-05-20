import {
  PinIcon,
  PinOffIcon,
  CheckSquareIcon,
  SquareIcon,
  Trash2Icon,
  CopyIcon,
  EyeIcon,
} from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { CurationStatus, SavedImage } from "../../types/Message"

const STATUS_LABEL: Record<CurationStatus | "all", string> = {
  all: "전체",
  pending: "대기",
  approved: "통과",
  rejected: "탈락",
  trashed: "휴지통",
}

const STATUS_TINT: Record<CurationStatus, string> = {
  pending: "bg-slate-200 text-slate-800",
  approved: "bg-green-200 text-green-900",
  rejected: "bg-red-200 text-red-900",
  trashed: "bg-zinc-300 text-zinc-700",
}

export interface GridProps {
  items: SavedImage[]
  backendUrl: string
  setStatus: (hash: string, status: CurationStatus) => void
  onOpen: (img: SavedImage) => void
  selectionMode?: boolean
  selectedHashes?: Set<string>
  onToggleSelect?: (hash: string) => void
  onLongPress?: (hash: string) => void
  togglePin?: (hash: string) => void
  pinnedHashes?: string[]
  imageLazyLoad?: boolean
}

export function ImageGrid({
  items,
  backendUrl,
  setStatus,
  onOpen,
  selectionMode = false,
  selectedHashes = new Set(),
  onToggleSelect,
  // onLongPress,
  togglePin,
  pinnedHashes = [],
  imageLazyLoad = true,
}: GridProps) {
  if (items.length === 0) return null
  return (
    <div className="columns-2 gap-3 sm:gap-4 md:columns-3 lg:columns-4 xl:columns-5">
      {items.map((img) => {
        const isSelected = selectedHashes.has(img.hash)
        const isPinned = pinnedHashes.includes(img.hash)

        return (
          <ContextMenu key={img.hash}>
            <ContextMenuTrigger>
              <div
                className={`m-1 flex break-inside-avoid flex-col rounded-lg border bg-card transition-all hover:shadow-md ${
                  isSelected
                    ? "scale-[1.02] bg-primary/5 shadow-lg ring-2 ring-primary"
                    : ""
                }`}
              >
                <div className="relative">
                  <button
                    type="button"
                    className="group block h-full w-full overflow-hidden rounded-md"
                    onClick={() => {
                      if (isSelected || selectionMode) {
                        onToggleSelect?.(img.hash)
                      } else {
                        onOpen(img)
                      }
                    }}
                  >
                    <img
                      src={`${backendUrl}/saved-images/${img.hash}`}
                      alt={img.originalFilename}
                      loading={imageLazyLoad ? "lazy" : "eager"}
                      className="w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>

                  {/* 체크박스 - 왼쪽 위 */}
                  <div
                    className="absolute top-2 left-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/40 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSelect?.(img.hash)
                    }}
                  >
                    {isSelected ? (
                      <CheckSquareIcon className="h-5 w-5 text-blue-400 drop-shadow-sm" />
                    ) : isPinned ? (
                      <PinIcon className="h-4 w-4 text-amber-400 drop-shadow-sm" />
                    ) : (
                      <SquareIcon className="h-5 w-5 text-white/60 drop-shadow-sm" />
                    )}
                  </div>

                  {/* 상태 라벨 - 왼쪽 위 (데스크톱만) */}
                  <span
                    className={`absolute top-2 left-10 hidden rounded-full px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase shadow-sm backdrop-blur-sm md:inline ${STATUS_TINT[img.status]}`}
                  >
                    {STATUS_LABEL[img.status]}
                  </span>

                  {/* 휴지통 버튼 - 오른쪽 위 (데스크톱만) */}
                  <button
                    type="button"
                    className={`absolute top-2 right-2 hidden h-7 w-7 items-center justify-center rounded-md bg-black/40 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60 md:flex ${
                      img.status === "trashed"
                        ? "text-red-400"
                        : "text-white/60 hover:text-white"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setStatus(
                        img.hash,
                        img.status === "trashed" ? "pending" : "trashed"
                      )
                    }}
                    title={img.status === "trashed" ? "복원" : "휴지통"}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </div>

                {/* 태그 (데스크톱만) */}
                {img.tags.length > 0 && (
                  <div className="hidden flex-wrap gap-1 px-0.5 md:flex">
                    {img.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-line/20 bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/80"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem
                onClick={() => togglePin?.(img.hash)}
                className="gap-2 font-bold"
              >
                {isPinned ? (
                  <>
                    <PinOffIcon className="h-3.5 w-3.5" />
                    비교에서 제거
                  </>
                ) : (
                  <>
                    <PinIcon className="h-3.5 w-3.5" />
                    비교에 추가
                  </>
                )}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() =>
                  setStatus(
                    img.hash,
                    img.status === "trashed" ? "pending" : "trashed"
                  )
                }
                className="gap-2 font-bold"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                {img.status === "trashed" ? "복원" : "휴지통"}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => onOpen(img)}
                className="gap-2 font-bold"
              >
                <EyeIcon className="h-3.5 w-3.5" />
                상세 보기
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  const url = `${backendUrl}/saved-images/${img.hash}`
                  navigator.clipboard.writeText(url).catch(() => {})
                }}
                className="gap-2 font-bold"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                이미지 URL 복사
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </div>
  )
}
