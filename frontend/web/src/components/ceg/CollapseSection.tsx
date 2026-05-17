import { Accordion as AccordionPrimitive } from "radix-ui"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
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

const ITEM_VALUE = "item"

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
    <AccordionPrimitive.Root
      type="single"
      collapsible
      value={open ? ITEM_VALUE : ""}
      onValueChange={(v) => {
        if ((v === ITEM_VALUE) !== open) onToggle()
      }}
      className={cn("border-b border-line", className)}
    >
      <AccordionPrimitive.Item value={ITEM_VALUE} className="border-0">
        <AccordionPrimitive.Header className="flex h-9 items-center justify-between px-3.5 whitespace-nowrap">
          <AccordionPrimitive.Trigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden outline-none">
            <ChevronDown
              className={cn(
                "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
                open ? "" : "-rotate-90"
              )}
            />
            {icon && <span className="shrink-0 text-ink-2">{icon}</span>}
            <span className="text-xs font-semibold whitespace-nowrap">
              {title}
            </span>
            {meta && (
              <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
                {meta}
              </span>
            )}
          </AccordionPrimitive.Trigger>
          {actions && (
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content className="overflow-hidden data-open:animate-accordion-down data-closed:animate-accordion-up">
          {children}
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  )
}
