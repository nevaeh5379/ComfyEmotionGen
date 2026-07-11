import {
  useEffect,
  useCallback,
  useState,
  useRef,
  type ReactNode,
  type ElementType,
} from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  FolderIcon,
  CheckSquareIcon,
  SquareIcon,
  CheckIcon,
} from "lucide-react"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card"
import type { SavedImage } from "../../types/Message"
import { hasApproved, findApproved } from "../../types/Message"
import {
  ImagePreviewHoverCard,
  CombinationContextMenu,
  type RenderItem,
} from "./CombinationPickerComponents"
import { StatusIcon, MetaTags } from "./CombinationPickerHelpers"
import { useCurationContext } from "./CurationContext"

const CURATION_PAGE_SIZE = 120

interface RenderItemPage {
  pageItems: RenderItem[]
  page: number
  pageCount: number
  setPage: (page: number) => void
}

function useRenderItemPage(items: RenderItem[]): RenderItemPage {
  const first = items[0]?.filename ?? ""
  const last = items[items.length - 1]?.filename ?? ""
  const pageKey = `${String(items.length)}:${first}:${last}`
  const [pageState, setPageState] = useState({ key: pageKey, page: 0 })
  const pageCount = Math.max(1, Math.ceil(items.length / CURATION_PAGE_SIZE))
  const page =
    pageState.key === pageKey ? Math.min(pageState.page, pageCount - 1) : 0
  const pageItems = items.slice(
    page * CURATION_PAGE_SIZE,
    (page + 1) * CURATION_PAGE_SIZE
  )
  const setPage = useCallback(
    (nextPage: number): void => {
      setPageState({
        key: pageKey,
        page: Math.max(0, Math.min(nextPage, pageCount - 1)),
      })
    },
    [pageCount, pageKey]
  )

  return { pageItems, page, pageCount, setPage }
}

function ResultPagination({
  page,
  pageCount,
  setPage,
}: Omit<RenderItemPage, "pageItems">): React.JSX.Element | null {
  if (pageCount <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => {
          setPage(page - 1)
        }}
      >
        이전
      </Button>
      <span className="text-xs font-bold text-muted-foreground tabular-nums">
        {page + 1} / {pageCount}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= pageCount - 1}
        onClick={() => {
          setPage(page + 1)
        }}
      >
        다음
      </Button>
    </div>
  )
}

/* ─── Magnifier ─── */
export function Magnifier({
  src,
  className = "",
}: {
  src: string
  className?: string
}): React.JSX.Element {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [show, setShow] = useState(false)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(
    null
  )

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - left) / width) * 100
    const y = ((e.clientY - top) / height) * 100
    setPos({ x, y })
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-black/5 ${className}`}
      onMouseEnter={() => {
        setShow(true)
      }}
      onMouseLeave={() => {
        setShow(false)
      }}
      onMouseMove={handleMouseMove}
      style={
        imgNatural
          ? { aspectRatio: `${String(imgNatural.w)}/${String(imgNatural.h)}` }
          : undefined
      }
    >
      <img
        src={src}
        className="max-h-[78vh] max-w-[90vw] object-contain"
        alt=""
        decoding="async"
        onLoad={(e) => {
          const img = e.currentTarget
          setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
        }}
      />
      {show && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backgroundImage: `url(${src})`,
            backgroundPosition: `${String(pos.x)}% ${String(pos.y)}%`,
            backgroundSize: "250%",
            backgroundRepeat: "no-repeat",
          }}
        />
      )}
    </div>
  )
}

/* ─── TournamentView ─── */
export function TournamentView({
  images,
  onComplete,
}: {
  images: SavedImage[]
  onComplete: (winnerHash: string) => void
}): React.JSX.Element {
  const { backendUrl } = useCurationContext()
  const [matches, setMatches] = useState<SavedImage[]>(() =>
    [...images].sort(() => Math.random() - 0.5)
  )
  const [nextRound, setNextRound] = useState<SavedImage[]>([])
  const [history, setHistory] = useState<
    { matches: SavedImage[]; nextRound: SavedImage[] }[]
  >([])

  const handlePick = useCallback(
    (winner: SavedImage) => {
      setHistory((prev) => [...prev, { matches, nextRound }])
      const newNext = [...nextRound, winner]
      const remaining = matches.slice(2)

      if (remaining.length === 0) {
        setMatches(newNext.sort(() => Math.random() - 0.5))
        setNextRound([])
      } else if (remaining.length === 1) {
        // Bye round for the last image
        const lastImg = remaining[0]
        if (lastImg) {
          setMatches([...newNext, lastImg].sort(() => Math.random() - 0.5))
        }
        setNextRound([])
      } else {
        setNextRound(newNext)
        setMatches(remaining)
      }
    },
    [matches, nextRound]
  )

  const handleUndo = useCallback(() => {
    if (history.length === 0) return
    const last = history[history.length - 1]
    if (!last) return
    setMatches(last.matches)
    setNextRound(last.nextRound)
    setHistory((prev) => prev.slice(0, -1))
  }, [history])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      if (matches.length < 2) return

      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "h") {
        const first = matches[0]
        if (first) handlePick(first)
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "l") {
        const second = matches[1]
        if (second) handlePick(second)
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        handleUndo()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return (): void => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [matches, handlePick, handleUndo])

  if (matches.length === 0 && nextRound.length === 0) {
    return (
      <div className="flex h-full items-center justify-center font-bold text-muted-foreground">
        이미지 없음
      </div>
    )
  }

  if (matches.length === 1 && nextRound.length === 0) {
    const winner = matches[0]
    if (!winner) {
      return (
        <div className="flex h-full items-center justify-center font-bold text-muted-foreground">
          이미지 없음
        </div>
      )
    }
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <h2 className="mb-6 text-2xl font-bold text-green-500">
          🏆 최종 우승 🏆
        </h2>
        <img
          src={`${backendUrl}/saved-images/${winner.hash}`}
          className="max-h-[60%] max-w-full rounded-lg border shadow-lg"
          alt="Winner"
          decoding="async"
        />
        <div className="mt-8 flex gap-4">
          <Button variant="outline" size="lg" onClick={handleUndo}>
            취소 (Undo)
          </Button>
          <Button
            className="px-8 py-6 text-lg font-bold"
            onClick={() => {
              onComplete(winner.hash)
            }}
          >
            이 이미지 선택 완료
          </Button>
        </div>
      </div>
    )
  }

  const left = matches[0]
  const right = matches[1]
  if (!left || !right) {
    return (
      <div className="flex h-full items-center justify-center font-bold text-muted-foreground">
        이미지 없음
      </div>
    )
  }

  const totalMatchesThisRound = Math.floor(
    (matches.length + nextRound.length * 2) / 2
  )
  const currentMatchNum = nextRound.length + 1

  return (
    <div className="flex h-full flex-col items-center justify-center p-2 md:p-4">
      <div className="mb-2 flex flex-col items-center md:mb-6">
        <h3 className="text-sm font-black md:text-xl">이상형 월드컵</h3>
        <span className="text-[11px] font-medium text-muted-foreground md:text-sm">
          라운드 매치: {currentMatchNum} / {totalMatchesThisRound}
        </span>
        <div className="mt-1 flex items-center gap-1.5 md:mt-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="h-6 px-2 text-[10px]"
          >
            Z: 되돌리기
          </Button>
          <span className="hidden text-[10px] text-muted-foreground md:inline">
            A/D 또는 방향키로 선택
          </span>
        </div>
      </div>
      <div className="flex w-full flex-1 flex-row justify-center gap-2 overflow-hidden px-1 md:gap-6">
        {[left, right].map((img, idx) => (
          <button
            key={img.hash}
            onClick={() => {
              handlePick(img)
            }}
            className="group relative w-1/2 flex-1 overflow-hidden rounded-xl border-2 border-transparent bg-black/5 transition-all hover:border-primary/40 focus:ring-4 focus:ring-primary/20 focus:outline-none md:border-4"
            style={{ maxHeight: "calc(100vh - 280px)" }}
          >
            {/* Blurred Background to eliminate empty margins */}
            <img
              src={`${backendUrl}/saved-images/${img.hash}`}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-md select-none"
              decoding="async"
              aria-hidden="true"
            />
            <img
              src={`${backendUrl}/saved-images/${img.hash}`}
              className="relative z-10 h-full w-full object-contain"
              alt=""
              decoding="async"
            />
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-2 text-center text-xs font-bold text-white opacity-100 md:p-4 md:text-sm md:opacity-0 md:group-hover:opacity-100">
              {idx === 0 ? "왼쪽 선택" : "오른쪽 선택"}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── LongPressWrapper ─── */
export function LongPressWrapper({
  children,
  onLongPress,
  onClick,
  className,
  style,
  as: Comp = "button",
  ...rest
}: {
  children: ReactNode
  onLongPress: () => void
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void
  className?: string
  as?: ElementType
} & Omit<
  React.HTMLAttributes<HTMLElement>,
  "children" | "onClick" | "className"
>): React.JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)
  const [pressing, setPressing] = useState(false)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      longPressTriggeredRef.current = false
      setPressing(true)
      timerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true
        setPressing(false)
        onLongPress()
      }, 500)
    },
    [onLongPress]
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      clear()
      setPressing(false)
      if (!longPressTriggeredRef.current) {
        onClick(e)
      }
    },
    [clear, onClick]
  )

  const handleMouseLeave = useCallback(() => {
    clear()
    setPressing(false)
  }, [clear])

  useEffect(() => {
    return (): void => {
      clear()
    }
  }, [clear])

  return (
    <Comp
      className={className}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e: React.MouseEvent): void => {
        if (longPressTriggeredRef.current) {
          e.preventDefault()
        }
      }}
      style={{ ...style, ...(pressing ? { opacity: 0.7 } : {}) }}
      {...rest}
    >
      {children}
    </Comp>
  )
}

/* ─── GalleryGridItem ─── */
function GalleryGridItem({
  item,
  imgs,
  backendUrl,
  enableHover,
  selectionMode,
  isSelected,
  toggleSelect,
  onSelect,
  onOpen,
  onLongPress,
  onRegenerate,
}: {
  item: RenderItem
  imgs: SavedImage[]
  backendUrl: string
  enableHover: boolean
  selectionMode: boolean
  isSelected: boolean
  toggleSelect: (
    filename: string,
    e?: React.MouseEvent | React.KeyboardEvent
  ) => void
  onSelect: (filename: string) => void
  onOpen: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
}): React.JSX.Element {
  const approved = findApproved(imgs)
  const preview = approved ?? imgs[0]
  const isDone = hasApproved(imgs)
  const [aspect, setAspect] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)
  const { data } = useCurationContext()

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setIsDragOver(true)
  }

  const handleDragLeave = (): void => {
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setIsDragOver(false)
    try {
      const dataStr = e.dataTransfer.getData("text/plain")
      if (!dataStr) return
      const dragData = JSON.parse(dataStr) as {
        type?: string
        hashes?: string[]
      }
      if (
        dragData.type === "unassigned-image" &&
        Array.isArray(dragData.hashes)
      ) {
        await Promise.all(
          dragData.hashes.map((hash) => data.updateImageMeta(hash, item.meta))
        )
        toast.success("이미지가 성공적으로 분류되었습니다.")
      }
    } catch (err) {
      console.error("Drop failed:", err)
    }
  }

  return (
    <ContextMenu key={item.filename}>
      <ContextMenuTrigger asChild>
        <div className="contents">
          <HoverCard openDelay={enableHover ? 500 : 99999} closeDelay={100}>
            <HoverCardTrigger asChild>
              <LongPressWrapper
                onLongPress={() => {
                  onLongPress(item.filename)
                }}
                onClick={(e: React.MouseEvent | React.KeyboardEvent) => {
                  if (
                    selectionMode ||
                    ("shiftKey" in e && e.shiftKey) ||
                    ("ctrlKey" in e && e.ctrlKey) ||
                    ("metaKey" in e && e.metaKey)
                  ) {
                    toggleSelect(item.filename, e)
                  } else {
                    onSelect(item.filename)
                  }
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(event) => {
                  void handleDrop(event)
                }}
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "240px 300px",
                }}
                className={`group relative rounded-xl border bg-card p-0.5 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:scale-[1.01] hover:shadow-[0_12px_32px_rgba(0,0,0,0.15)] md:p-1 ${
                  isDragOver
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : isSelected
                      ? "border-blue-500/80 bg-blue-50/10 shadow-md ring-2 shadow-blue-500/10 ring-blue-500"
                      : "border-border/80 hover:border-primary/50"
                }`}
              >
                <div
                  className="relative overflow-hidden rounded-lg bg-muted"
                  style={{ aspectRatio: aspect ?? 1 }}
                >
                  {preview ? (
                    <>
                      {loading && (
                        <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-muted">
                          <FolderIcon className="h-8 w-8 text-muted-foreground/15" />
                        </div>
                      )}
                      <img
                        src={`${backendUrl}/saved-images/${preview.hash}`}
                        className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${loading ? "opacity-0" : "opacity-100"}`}
                        alt=""
                        onLoad={(e) => {
                          setLoading(false)
                          const img = e.currentTarget
                          if (img.naturalWidth && img.naturalHeight) {
                            setAspect(img.naturalWidth / img.naturalHeight)
                          }
                        }}
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                      />
                    </>
                  ) : (
                    <div className="flex aspect-square h-full w-full items-center justify-center">
                      <FolderIcon className="h-10 w-10 text-muted-foreground/20" />
                    </div>
                  )}

                  {/* 선택 모드 체크박스 */}
                  {selectionMode && (
                    <div className="absolute top-1.5 left-1.5 z-10 flex h-8 w-8 items-center justify-center rounded md:top-2 md:left-2 md:h-7 md:w-7">
                      {isSelected ? (
                        <CheckSquareIcon className="h-6 w-6 text-blue-500 drop-shadow-sm" />
                      ) : (
                        <SquareIcon className="h-6 w-6 text-white/70 drop-shadow-sm" />
                      )}
                    </div>
                  )}

                  {!selectionMode && (
                    <div className="absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/45 text-white opacity-90 shadow-xs backdrop-blur-md transition-transform duration-300 group-hover:scale-105 md:top-2 md:left-2 md:h-6 md:w-6">
                      <FolderIcon className="h-3.5 w-3.5 md:h-3 md:w-3" />
                    </div>
                  )}

                  {isDone && (
                    <div className="absolute top-1.5 right-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-green-500 text-white shadow-md transition-transform duration-300 group-hover:scale-110 md:top-2 md:right-2 md:h-6 md:w-6">
                      <CheckIcon
                        className="h-4 w-4 md:h-3.5 md:w-3.5"
                        strokeWidth={3}
                      />
                    </div>
                  )}

                  {/* 장수 배지 - 승인 아이콘이 있으면 왼쪽으로 이동하여 겹치지 않게 처리 */}
                  <div
                    className={`absolute top-1.5 z-10 rounded-sm border border-white/5 bg-black/60 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-xs backdrop-blur-md transition-all duration-300 md:top-2 md:text-[9px] ${isDone ? "right-9 md:right-10" : "right-1.5 md:right-2"}`}
                  >
                    {imgs.length}장
                  </div>

                  {/* 파일명 & 태그 오버레이 */}
                  <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-1 bg-linear-to-t from-black/85 via-black/55 to-transparent px-2.5 pt-6 pb-2.5 text-center md:px-2 md:pb-2">
                    <div className="truncate font-mono text-[11px] font-black tracking-tight text-white/95 md:text-[10px]">
                      {item.filename}
                    </div>
                    {Object.keys(item.meta).length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1">
                        {Object.values(item.meta)
                          .slice(0, 2)
                          .map((tag, idx) => (
                            <span
                              key={idx}
                              className="rounded border border-white/5 bg-white/15 px-1 py-0.5 text-[9px] font-extrabold whitespace-nowrap text-white/80 uppercase backdrop-blur-md md:text-[8px]"
                            >
                              {tag}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </LongPressWrapper>
            </HoverCardTrigger>
            {enableHover && (
              <ImagePreviewHoverCard
                filename={item.filename}
                images={imgs}
                backendUrl={backendUrl}
              />
            )}
          </HoverCard>
        </div>
      </ContextMenuTrigger>
      <CombinationContextMenu
        filename={item.filename}
        isSelected={isSelected}
        selectionMode={selectionMode}
        onOpen={onOpen}
        onToggleSelect={(f) => {
          toggleSelect(f)
        }}
        onLongPress={onLongPress}
        {...(onRegenerate !== undefined && { onRegenerate })}
      />
    </ContextMenu>
  )
}

/* ─── GalleryView ─── */
export function GalleryView({
  onSelect,
  onOpen,
  onLongPress,
  onRegenerate,
}: {
  onSelect: (filename: string) => void
  onOpen: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
}): React.JSX.Element {
  const {
    backendUrl,
    enableHover,
    data,
    selection,
    thumbnailSize,
    fluidGridLayout,
  } = useCurationContext()
  const { filteredRenderItems: items, imagesByFilename } = data
  const { selectionMode, selectedFilenames, toggleSelect } = selection
  const { pageItems, page, pageCount, setPage } = useRenderItemPage(items)
  const listTopRef = useRef<HTMLDivElement | null>(null)
  const handlePageChange = useCallback(
    (nextPage: number): void => {
      setPage(nextPage)
      window.requestAnimationFrame(() => {
        listTopRef.current?.scrollIntoView({ block: "start" })
      })
    },
    [setPage]
  )

  return (
    <>
      <div
        ref={listTopRef}
        className="grid items-start gap-2 sm:gap-3 md:gap-4"
        style={{
          gridTemplateColumns: fluidGridLayout
            ? `repeat(auto-fill, minmax(${String(thumbnailSize)}px, 1fr))`
            : `repeat(auto-fill, ${String(thumbnailSize)}px)`,
        }}
      >
        {pageItems.map((item: RenderItem) => {
          const imgs = imagesByFilename.get(item.filename) ?? []
          const isSelected = selectedFilenames.has(item.filename)

          return (
            <GalleryGridItem
              key={item.filename}
              item={item}
              imgs={imgs}
              backendUrl={backendUrl}
              enableHover={enableHover}
              selectionMode={selectionMode}
              isSelected={isSelected}
              toggleSelect={toggleSelect}
              onSelect={onSelect}
              onOpen={onOpen}
              onLongPress={onLongPress}
              {...(onRegenerate && { onRegenerate })}
            />
          )
        })}
      </div>
      <ResultPagination
        page={page}
        pageCount={pageCount}
        setPage={handlePageChange}
      />
    </>
  )
}

/* ─── TableView ─── */
export function TableView({
  onSelect,
  onOpen,
  onLongPress,
  onRegenerate,
}: {
  onSelect: (filename: string) => void
  onOpen: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
}): React.JSX.Element {
  const { backendUrl, enableHover, data, selection } = useCurationContext()
  const { filteredRenderItems: items, imagesByFilename } = data
  const { selectionMode, selectedFilenames, toggleSelect } = selection
  const { pageItems, page, pageCount, setPage } = useRenderItemPage(items)
  const tableTopRef = useRef<HTMLDivElement | null>(null)
  const handlePageChange = useCallback(
    (nextPage: number): void => {
      setPage(nextPage)
      window.requestAnimationFrame(() => {
        tableTopRef.current?.scrollIntoView({ block: "start" })
      })
    },
    [setPage]
  )

  return (
    <>
      <div
        ref={tableTopRef}
        className="overflow-x-auto rounded-lg border bg-card"
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {selectionMode && (
                <th className="w-8 px-2 py-2 font-bold text-muted-foreground"></th>
              )}
              <th className="w-12 px-4 py-2 font-bold text-muted-foreground">
                상태
              </th>
              <th className="px-4 py-2 font-bold text-muted-foreground">
                파일명
              </th>
              <th className="px-4 py-2 font-bold text-muted-foreground">
                메타데이터
              </th>
              <th className="w-20 px-4 py-2 text-right font-bold text-muted-foreground">
                수
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageItems.map((item: RenderItem) => {
              const imgs = imagesByFilename.get(item.filename) ?? []
              const isDone = hasApproved(imgs)
              const isSelected = selectedFilenames.has(item.filename)

              return (
                <ContextMenu key={item.filename}>
                  <ContextMenuTrigger asChild>
                    <LongPressWrapper
                      onLongPress={() => {
                        onLongPress(item.filename)
                      }}
                      onClick={(e: React.MouseEvent | React.KeyboardEvent) => {
                        if (
                          selectionMode ||
                          ("shiftKey" in e && e.shiftKey) ||
                          ("ctrlKey" in e && e.ctrlKey) ||
                          ("metaKey" in e && e.metaKey)
                        ) {
                          toggleSelect(item.filename, e)
                        } else {
                          onSelect(item.filename)
                        }
                      }}
                      className={`group cursor-pointer hover:bg-accent/50 ${isSelected ? "bg-blue-50/30 ring-1 ring-blue-300 ring-inset" : ""}`}
                      as="tr"
                    >
                      {selectionMode && (
                        <td className="px-2 py-2">
                          {isSelected ? (
                            <CheckSquareIcon className="h-5 w-5 text-blue-500" />
                          ) : (
                            <SquareIcon className="h-5 w-5 text-muted-foreground/40" />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <StatusIcon done={isDone} />
                      </td>
                      <HoverCard
                        openDelay={enableHover ? 500 : 99999}
                        closeDelay={100}
                      >
                        <HoverCardTrigger asChild>
                          <td className="cursor-default px-4 py-2">
                            <span className="font-mono text-xs font-bold">
                              {item.filename}
                            </span>
                          </td>
                        </HoverCardTrigger>
                        {enableHover && (
                          <ImagePreviewHoverCard
                            filename={item.filename}
                            images={imgs}
                            backendUrl={backendUrl}
                          />
                        )}
                      </HoverCard>
                      <td className="px-4 py-2">
                        <MetaTags meta={item.meta} variant="default" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="font-mono text-xs text-muted-foreground">
                          {imgs.length}
                        </span>
                      </td>
                    </LongPressWrapper>
                  </ContextMenuTrigger>
                  <CombinationContextMenu
                    filename={item.filename}
                    isSelected={isSelected}
                    selectionMode={selectionMode}
                    onOpen={onOpen}
                    onToggleSelect={(f) => {
                      toggleSelect(f)
                    }}
                    onLongPress={onLongPress}
                    {...(onRegenerate !== undefined && { onRegenerate })}
                  />
                </ContextMenu>
              )
            })}
          </tbody>
        </table>
      </div>
      <ResultPagination
        page={page}
        pageCount={pageCount}
        setPage={handlePageChange}
      />
    </>
  )
}
