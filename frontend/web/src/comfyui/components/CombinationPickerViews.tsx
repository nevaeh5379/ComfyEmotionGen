import {
  useEffect,
  useCallback,
  useState,
  useRef,
  type ReactNode,
  type ElementType,
} from "react"
import { Button } from "@/components/ui/button"
import type { SavedImage } from "../types/Message"

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
  backendUrl,
  onComplete,
}: {
  images: SavedImage[]
  backendUrl: string
  onComplete: (winnerHash: string) => void
}) {
  const [matches, setMatches] = useState<SavedImage[]>(() =>
    [...images].sort(() => Math.random() - 0.5)
  )
  const [nextRound, setNextRound] = useState<SavedImage[]>([])

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
        <Button
          className="mt-8 px-8 py-6 text-lg font-bold"
          onClick={() => onComplete(winner.hash)}
        >
          이 이미지 선택 완료
        </Button>
      </div>
    )
  }

  const left = matches[0]!
  const right = matches[1]!

  const handlePick = (winner: SavedImage) => {
    const newNext = [...nextRound, winner]
    const remaining = matches.slice(2)

    if (remaining.length === 0) {
      setMatches(newNext.sort(() => Math.random() - 0.5))
      setNextRound([])
    } else if (remaining.length === 1) {
      setMatches([...newNext, remaining[0]!].sort(() => Math.random() - 0.5))
      setNextRound([])
    } else {
      setNextRound(newNext)
      setMatches(remaining)
    }
  }

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
      </div>
      <div className="flex w-full flex-1 gap-6 overflow-hidden">
        {[left, right].map((img) => (
          <button
            key={img.hash}
            onClick={() => handlePick(img)}
            className="group relative flex-1 overflow-hidden rounded-xl border-4 border-transparent bg-black/5 focus:outline-none"
          >
            <img
              src={`${backendUrl}/saved-images/${img.hash}`}
              className="h-full w-full object-contain"
              alt=""
            />
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-4 text-center font-bold text-white opacity-0 group-hover:opacity-100">
              이 이미지 선택
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
  onClick: () => void
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
        onClick()
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
      style={pressing ? { opacity: 0.7 } : undefined}
      {...rest}
    >
      {children}
    </Component>
  )
}
