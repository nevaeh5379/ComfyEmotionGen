import {
  useEffect,
  useCallback,
  useState,
  useRef,
  type ReactNode,
  type ElementType,
} from "react"
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
import {
  StatusIcon,
  MetaTags,
  ImageWithSkeleton,
} from "./CombinationPickerHelpers"
import { useCurationContext } from "./CurationContext"

/* ─── Magnifier ─── */
export function Magnifier({
  src,
  className = "",
}: {
  src: string
  className?: string
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [show, setShow] = useState(false)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(
    null
  )

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - left) / width) * 100
    const y = ((e.clientY - top) / height) * 100
    setPos({ x, y })
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-black/5 ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onMouseMove={handleMouseMove}
      style={
        imgNatural
          ? { aspectRatio: `${imgNatural.w}/${imgNatural.h}` }
          : undefined
      }
    >
      <img
        src={src}
        className="max-h-[78vh] max-w-[90vw] object-contain"
        alt=""
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
            backgroundPosition: `${pos.x}% ${pos.y}%`,
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
}) {
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
        setMatches([...newNext, remaining[0]!].sort(() => Math.random() - 0.5))
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      if (matches.length < 2) return

      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "h") {
        handlePick(matches[0]!)
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "l") {
        handlePick(matches[1]!)
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        handleUndo()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [matches, handlePick, handleUndo])

  if (matches.length === 0 && nextRound.length === 0) {
    return (
      <div className="flex h-full items-center justify-center font-bold text-muted-foreground">
        이미지 없음
      </div>
    )
  }

  if (matches.length === 1 && nextRound.length === 0) {
    const winner = matches[0]!
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <h2 className="mb-6 text-2xl font-bold text-green-500">
          🏆 최종 우승 🏆
        </h2>
        <img
          src={`${backendUrl}/saved-images/${winner.hash}`}
          className="max-h-[60%] max-w-full rounded-lg border shadow-lg"
          alt="Winner"
        />
        <div className="mt-8 flex gap-4">
          <Button variant="outline" size="lg" onClick={handleUndo}>
            취소 (Undo)
          </Button>
          <Button
            className="px-8 py-6 text-lg font-bold"
            onClick={() => onComplete(winner.hash)}
          >
            이 이미지 선택 완료
          </Button>
        </div>
      </div>
    )
  }

  const left = matches[0]!
  const right = matches[1]!

  const totalMatchesThisRound = Math.floor(
    (matches.length + nextRound.length * 2) / 2
  )
  const currentMatchNum = nextRound.length + 1

  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <div className="mb-6 flex flex-col items-center">
        <h3 className="text-xl font-bold">이상형 월드컵</h3>
        <span className="text-sm font-medium text-muted-foreground">
          라운드 매치: {currentMatchNum} / {totalMatchesThisRound}
        </span>
        <div className="mt-2 flex gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleUndo}
            disabled={history.length === 0}
          >
            Z: 되돌리기
          </Button>
          <span className="text-[10px] text-muted-foreground">
            A/D 또는 방향키로 선택
          </span>
        </div>
      </div>
      <div className="flex w-full flex-1 flex-col gap-4 overflow-hidden md:flex-row md:gap-6">
        {[left, right].map((img, idx) => (
          <button
            key={img.hash}
            onClick={() => handlePick(img)}
            className="group relative flex-1 overflow-hidden rounded-xl border-4 border-transparent bg-black/5 transition-all hover:border-primary/40 focus:ring-4 focus:ring-primary/20 focus:outline-none"
          >
            <img
              src={`${backendUrl}/saved-images/${img.hash}`}
              className="h-full w-full object-contain"
              alt=""
            />
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-4 text-center font-bold text-white opacity-100 md:opacity-0 md:group-hover:opacity-100">
              {idx === 0 ? "왼쪽 (또는 위) 선택" : "오른쪽 (또는 아래) 선택"}
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
  as: Component = "button",
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
>) {
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
    return () => clear()
  }, [clear])

  return (
    <Component
      className={className}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e: React.MouseEvent) => {
        if (longPressTriggeredRef.current) {
          e.preventDefault()
        }
      }}
      style={pressing ? { opacity: 0.7 } : undefined}
      {...rest}
    >
      {children}
    </Component>
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
}) {
  const { backendUrl, enableHover, data, selection } = useCurationContext()
  const { filteredRenderItems: items, imagesByFilename } = data
  const { selectionMode, selectedFilenames, toggleSelect } = selection

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item: RenderItem) => {
        const imgs = imagesByFilename.get(item.filename) ?? []
        const approved = findApproved(imgs)
        const preview = approved || imgs[0]
        const isDone = hasApproved(imgs)
        const isSelected = selectedFilenames.has(item.filename)

        return (
          <ContextMenu key={item.filename}>
            <ContextMenuTrigger asChild>
              <div className="contents">
                <HoverCard
                  openDelay={enableHover ? 500 : 99999}
                  closeDelay={100}
                >
                  <HoverCardTrigger asChild>
                    <LongPressWrapper
                      onLongPress={() => onLongPress(item.filename)}
                      onClick={(e) => {
                        if (
                          selectionMode ||
                          e.shiftKey ||
                          e.ctrlKey ||
                          e.metaKey
                        ) {
                          toggleSelect(item.filename, e)
                        } else {
                          onSelect(item.filename)
                        }
                      }}
                      className={`group relative flex flex-col gap-2 rounded-lg border bg-card p-2 hover:border-primary hover:shadow-md ${isSelected ? "bg-blue-50/30 ring-2 ring-blue-500" : ""}`}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                        {preview ? (
                          <ImageWithSkeleton
                            src={`${backendUrl}/saved-images/${preview.hash}`}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <FolderIcon className="h-10 w-10 text-muted-foreground/20" />
                          </div>
                        )}

                        {/* 선택 모드 체크박스 */}
                        {selectionMode && (
                          <div className="absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded">
                            {isSelected ? (
                              <CheckSquareIcon className="h-6 w-6 text-blue-500 drop-shadow-sm" />
                            ) : (
                              <SquareIcon className="h-6 w-6 text-white/70 drop-shadow-sm" />
                            )}
                          </div>
                        )}

                        {!selectionMode && (
                          <div className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded bg-black/60 text-white backdrop-blur-sm">
                            <FolderIcon className="h-3.5 w-3.5" />
                          </div>
                        )}

                        {isDone && (
                          <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded bg-green-500 text-white shadow-sm">
                            <CheckIcon className="h-4 w-4" strokeWidth={3} />
                          </div>
                        )}

                        <div className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {imgs.length}장
                        </div>
                      </div>

                      <div className="px-1 text-left">
                        <div className="truncate font-mono text-[11px] font-bold">
                          {item.filename}
                        </div>
                        <MetaTags meta={item.meta} variant="compact" max={2} />
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
              onToggleSelect={(f) => toggleSelect(f)}
              onLongPress={onLongPress}
              {...(onRegenerate && { onRegenerate })}
            />
          </ContextMenu>
        )
      })}
    </div>
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
}) {
  const { backendUrl, enableHover, data, selection } = useCurationContext()
  const { filteredRenderItems: items, imagesByFilename } = data
  const { selectionMode, selectedFilenames, toggleSelect } = selection

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
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
          {items.map((item: RenderItem) => {
            const imgs = imagesByFilename.get(item.filename) ?? []
            const isDone = hasApproved(imgs)
            const isSelected = selectedFilenames.has(item.filename)

            return (
              <ContextMenu key={item.filename}>
                <ContextMenuTrigger asChild>
                  <LongPressWrapper
                    onLongPress={() => onLongPress(item.filename)}
                    onClick={(e) => {
                      if (
                        selectionMode ||
                        e.shiftKey ||
                        e.ctrlKey ||
                        e.metaKey
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
                  onToggleSelect={(f) => toggleSelect(f)}
                  onLongPress={onLongPress}
                  {...(onRegenerate && { onRegenerate })}
                />
              </ContextMenu>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
