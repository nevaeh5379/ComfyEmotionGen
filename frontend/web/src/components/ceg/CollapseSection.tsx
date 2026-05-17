import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight } from "lucide-react"
import { type ReactNode } from "react"

interface CollapseSectionProps {
  open: boolean
  onToggle: () => void
  title: string
  meta?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function CollapseSection({
  open,
  onToggle,
  title,
  meta,
  icon,
  actions,
  children,
  className,
}: CollapseSectionProps) {
  return (
    <section className={cn("border-b border-line", className)}>
      <header
        onClick={onToggle}
        className="flex h-9 cursor-pointer items-center justify-between px-3.5 whitespace-nowrap"
      >
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {icon && <span className="shrink-0 text-ink-2">{icon}</span>}
          <span className="text-xs font-semibold whitespace-nowrap">
            {title}
          </span>
          {meta && (
            <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
              {meta}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center">{actions}</div>}
      </header>
      {open && children}
    </section>
  )
}
