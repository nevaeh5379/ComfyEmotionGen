import { cn } from "@/lib/utils"
import { type ReactNode } from "react"

interface SectionLabelProps {
  children: ReactNode
  right?: ReactNode
  className?: string
}

export function SectionLabel({
  children,
  right,
  className,
}: SectionLabelProps) {
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
