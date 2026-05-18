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
        "group/stat min-w-0 flex-1 border-r border-line px-3 py-3 transition-all duration-200 last:border-r-0 hover:bg-muted/50 md:px-5 md:py-4",
        faded && "opacity-30",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-extrabold tracking-widest text-muted-foreground uppercase opacity-80 transition-opacity group-hover/stat:opacity-100 md:gap-2.5 md:text-[10px]">
        {Icon && (
          <Icon className="inline-block h-3 w-3 shrink-0 text-muted-foreground/80 md:h-4 md:w-4" />
        )}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1 md:mt-2 md:gap-2">
        <div
          className={cn(
            "mono text-xl leading-none font-black tracking-tighter tabular-nums md:text-3xl",
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
