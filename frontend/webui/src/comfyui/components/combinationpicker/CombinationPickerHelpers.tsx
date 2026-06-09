import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import { CheckCircle2Icon, CircleIcon, ImageIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

/* ─── StatusIcon ─── */
export function StatusIcon({
  done,
  active,
}: {
  done: boolean
  active?: boolean
}) {
  if (active) {
    return done ? (
      <CheckCircle2Icon className="h-4 w-4" />
    ) : (
      <CircleIcon className="h-4 w-4" />
    )
  }
  return done ? (
    <CheckCircle2Icon className="h-4 w-4 text-green-500" />
  ) : (
    <CircleIcon className="h-4 w-4 text-muted-foreground/30" />
  )
}

/* ─── MetaTags ─── */
export function MetaTags({
  meta,
  variant = "default",
  max,
}: {
  meta: Record<string, string>
  variant?: "default" | "compact" | "primary" | "sidebar"
  max?: number
}) {
  const values = Object.values(meta)
  const display = max ? values.slice(0, max) : values
  const variants = {
    default: "rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground",
    compact:
      "rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground",
    primary:
      "rounded border border-primary/10 bg-primary/10 px-1.5 py-0 text-[8px] font-bold whitespace-nowrap text-primary",
    sidebar: `text-[9px] font-medium uppercase`,
  }
  return (
    <div className="flex flex-wrap gap-1">
      {display.map((v, i) => (
        <span key={i} className={variants[variant]}>
          {v}
        </span>
      ))}
    </div>
  )
}

/* ─── ImageWithSkeleton ─── */
export function ImageWithSkeleton({
  src,
  alt = "",
  className = "",
  aspectRatio = "",
  objectFit = "object-cover",
  showBlurredBg = objectFit === "object-contain",
}: {
  src: string
  alt?: string
  className?: string
  aspectRatio?: string
  objectFit?: string
  showBlurredBg?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  return (
    <div
      className={`relative overflow-hidden bg-muted ${aspectRatio} ${className}`}
    >
      {loading && <Skeleton className="absolute inset-0 h-full w-full" />}
      {error ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/40">
          <ImageIcon className="h-1/3 w-1/3" />
          <span className="text-[8px] font-bold">LOAD ERROR</span>
        </div>
      ) : (
        <>
          {showBlurredBg && !loading && (
            <img
              src={src}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-md select-none"
            />
          )}
          <img
            src={src}
            alt={alt}
            className={`h-full w-full ${objectFit} transition-opacity duration-300 ${loading ? "opacity-0" : "opacity-100"} ${showBlurredBg ? "relative z-10" : ""}`}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setError(true)
            }}
            loading="lazy"
          />
        </>
      )}
    </div>
  )
}

/* ─── useSetToggle ─── */
// eslint-disable-next-line react-refresh/only-export-components
export function useSetToggle<T>(
  setValue: Dispatch<SetStateAction<Set<T>>>,
  onEmpty?: () => void
) {
  return useCallback(
    (value: T) => {
      setValue((prev) => {
        const next = new Set(prev)
        if (next.has(value)) {
          next.delete(value)
          if (next.size === 0 && onEmpty) onEmpty()
        } else {
          next.add(value)
        }
        return next
      })
    },
    [setValue, onEmpty]
  )
}
