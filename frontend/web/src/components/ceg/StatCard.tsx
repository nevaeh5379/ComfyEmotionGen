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
  // Determine dynamic highlight colors based on theme color tokens
  const themeStyles = (() => {
    if (faded) return { bg: "", border: "", glow: "", iconColor: "text-muted-foreground/60" }
    
    switch (color) {
      case "text-ok":
        return {
          bg: "hover:bg-ok-bg/30 dark:hover:bg-ok-bg/40",
          border: "hover:border-ok/30",
          glow: "hover:shadow-[0_0_20px_-3px_var(--ok)]/10 hover:shadow-ok/15",
          iconColor: "text-ok",
        }
      case "text-info":
        return {
          bg: "hover:bg-info-bg/30 dark:hover:bg-info-bg/40",
          border: "hover:border-info/30",
          glow: "hover:shadow-[0_0_20px_-3px_var(--info)]/10 hover:shadow-info/15",
          iconColor: "text-info",
        }
      case "text-warn":
        return {
          bg: "hover:bg-warn-bg/30 dark:hover:bg-warn-bg/40",
          border: "hover:border-warn/30",
          glow: "hover:shadow-[0_0_20px_-3px_var(--warn)]/10 hover:shadow-warn/15",
          iconColor: "text-warn",
        }
      case "text-bad":
        return {
          bg: "hover:bg-bad-bg/30 dark:hover:bg-bad-bg/40",
          border: "hover:border-bad/30",
          glow: "hover:shadow-[0_0_20px_-3px_var(--bad)]/10 hover:shadow-bad/15",
          iconColor: "text-bad",
        }
      case "text-ink-2":
        return {
          bg: "hover:bg-muted/30 dark:hover:bg-muted/20",
          border: "hover:border-line-strong",
          glow: "hover:shadow-sm",
          iconColor: "text-ink-2",
        }
      default:
        return {
          bg: "hover:bg-muted/20",
          border: "hover:border-line-strong",
          glow: "hover:shadow-sm",
          iconColor: "text-muted-foreground",
        }
    }
  })()

  // Dynamic animation for specific running/active icons
  const iconClass = cn(
    "inline-block h-3.5 w-3.5 shrink-0 transition-transform duration-300 md:h-4.5 md:w-4.5",
    themeStyles.iconColor,
    color === "text-info" && !faded && "animate-pulse"
  )

  return (
    <div
      className={cn(
        "group/stat min-w-0 flex-1 border-r border-line px-3 py-3 transition-all duration-300 ease-out last:border-r-0 md:px-5 md:py-4",
        "relative overflow-hidden hover:-translate-y-0.5 hover:scale-101",
        themeStyles.bg,
        themeStyles.border,
        themeStyles.glow,
        faded && "opacity-25 hover:opacity-40",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest text-muted-foreground uppercase opacity-75 transition-opacity group-hover/stat:opacity-100 md:gap-2 md:text-[10px]">
        {Icon && <Icon className={iconClass} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1 md:mt-2 md:gap-2">
        <div
          className={cn(
            "mono text-xl leading-none font-black tracking-tighter tabular-nums transition-transform duration-300 group-hover/stat:scale-105 md:text-3xl",
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

