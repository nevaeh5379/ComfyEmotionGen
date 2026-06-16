import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SectionLabelProps {
  children: ReactNode
  right?: ReactNode
  className?: string
}

export function SectionLabel({
  children,
  right,
  className,
}: SectionLabelProps): React.ReactNode {
  return (
    <div
      className={cn(
        "flex h-7 items-center justify-between px-3.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase",
        className
      )}
    >
      <span>{children}</span>
      {right}
    </div>
  )
}
