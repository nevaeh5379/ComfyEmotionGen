import { useState } from "react"
import {
  PinIcon,
  PinOffIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  CopyIcon,
  EyeIcon,
  ImageOff,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import {
  STATUS_LABEL,
  STATUS_TINT,
  type CurationStatus,
  type SavedImage,
} from "../../types/Message"
import { Badge } from "@/components/ui/badge"

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
  focusedHash?: string | null
  onFocus?: (hash: string | null) => void
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
  focusedHash = null,
  onFocus,
}: GridProps) {
  const [brokenHashes, setBrokenHashes] = useState<Set<string>>(new Set())

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageOff className="size-6" />
          </EmptyMedia>
          <EmptyTitle>이미지가 없습니다</EmptyTitle>
          <EmptyDescription>
            해당 조건에 맞는 이미지를 찾을 수 없습니다.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="columns-2 gap-3 sm:gap-4 md:columns-3 lg:columns-4 xl:columns-5">
      {items.map((img) => {
        const isSelected = selectedHashes.has(img.hash)
        const isPinned = pinnedHashes.includes(img.hash)
        const isFocused = img.hash === focusedHash

        return (
          <ContextMenu key={img.hash}>
            <ContextMenuTrigger>
              <div
                onClick={() => onFocus?.(img.hash)}
                className={`m-1 flex break-inside-avoid flex-col rounded-lg border bg-card transition-all hover:shadow-md cursor-pointer ${
                  isSelected
                    ? "scale-[1.02] bg-primary/5 shadow-lg ring-2 ring-primary"
                    : ""
                } ${
                  isFocused
                    ? "ring-4 ring-blue-500 ring-offset-1 scale-[1.01] shadow-xl dark:ring-blue-400 dark:ring-offset-background"
                    : ""
                }`}
              >
                <div className="relative">
                  <button
                    type="button"
                    className="group block h-full w-full overflow-hidden rounded-md"
                    aria-label={`${img.originalFilename} 상세 보기`}
                    onClick={() => {
                      if (isSelected || selectionMode) {
                        onToggleSelect?.(img.hash)
                      } else {
                        onOpen(img)
                      }
                    }}
                  >
                    {brokenHashes.has(img.hash) ? (
                      <div className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground">
                        <ImageOff className="h-8 w-8" />
                      </div>
                    ) : (
                      <img
                        src={`${backendUrl}/saved-images/${img.hash}`}
                        alt={img.originalFilename}
                        loading={imageLazyLoad ? "lazy" : "eager"}
                        className="w-full object-cover transition-transform group-hover:scale-105"
                        onError={() =>
                          setBrokenHashes((prev) => new Set(prev).add(img.hash))
                        }
                      />
                    )}
                  </button>

                  {/* 체크박스 - 왼쪽 위 */}
                  <button
                    type="button"
                    className="absolute top-2 left-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/40 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60"
                    aria-label={isSelected ? "선택 해제" : "선택"}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSelect?.(img.hash)
                    }}
                  >
                    {isSelected ? (
                      <CheckSquareIcon className="h-5 w-5 text-info drop-shadow-sm" />
                    ) : isPinned ? (
                      <PinIcon className="h-4 w-4 text-warn drop-shadow-sm" />
                    ) : (
                      <SquareIcon className="h-5 w-5 text-white/60 drop-shadow-sm" />
                    )}
                  </button>

                  {/* 상태 라벨 - 왼쪽 위 (데스크톱만) */}
                  <Badge
                    variant="default"
                    className={`absolute top-2 left-10 hidden border-none text-[10px] font-black tracking-wider uppercase shadow-sm backdrop-blur-sm md:inline-flex ${STATUS_TINT[img.status]}`}
                  >
                    {STATUS_LABEL[img.status]}
                  </Badge>

                  {/* 휴지통 버튼 - 오른쪽 위 (데스크톱만) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`absolute top-2 right-2 hidden h-7 w-7 items-center justify-center rounded-md bg-black/40 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60 md:flex ${
                          img.status === "trashed"
                            ? "text-bad"
                            : "text-white/60 hover:text-white"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setStatus(
                            img.hash,
                            img.status === "trashed" ? "pending" : "trashed"
                          )
                        }}
                        aria-label={img.status === "trashed" ? "복원" : "휴지통"}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {img.status === "trashed" ? "복원" : "휴지통"}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* 태그 (데스크톱만) */}
                {img.tags.length > 0 && (
                  <div className="hidden flex-wrap gap-1 px-0.5 md:flex">
                    {img.tags.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="h-auto border border-line/20 bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground/85"
                      >
                        #{t}
                      </Badge>
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
                onClick={() => setStatus(img.hash, "approved")}
                className="gap-2 font-bold text-ok"
                disabled={img.status === "approved"}
              >
                <CheckCircleIcon className="h-3.5 w-3.5" />
                통과
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => setStatus(img.hash, "rejected")}
                className="gap-2 font-bold text-bad"
                disabled={img.status === "rejected"}
              >
                <XCircleIcon className="h-3.5 w-3.5" />
                탈락
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => setStatus(img.hash, "pending")}
                className="gap-2 font-bold text-info"
                disabled={img.status === "pending"}
              >
                <RotateCcwIcon className="h-3.5 w-3.5" />
                대기
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
