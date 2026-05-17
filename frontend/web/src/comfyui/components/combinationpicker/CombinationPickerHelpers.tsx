import { useCallback, type Dispatch, type SetStateAction } from "react"
import { CheckCircle2Icon, CircleIcon } from "lucide-react"

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
