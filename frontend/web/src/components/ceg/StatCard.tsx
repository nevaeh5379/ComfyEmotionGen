import { cn } from "@/lib/utils"
import { type LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string | number
  color?: string
  icon?: LucideIcon
  delta?: string | number
  trend?: "up" | "down"
  faded?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  color = "text-ink",
  icon: Icon,
  delta,
  trend,
  faded,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 border-r border-line px-2 py-1.5 last:border-r-0",
        faded && "opacity-50",
        className
      )}
    >
      <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <div
          className={cn(
            "mono text-xl leading-none font-semibold tabular-nums",
            color
          )}
        >
          {value}
        </div>
        {delta != null && (
          <div className="mono text-[11px] text-muted-foreground">
            {trend === "up" && "▲"} {trend === "down" && "▼"} {delta}
          </div>
        )}
      </div>
    </div>
  )
}
