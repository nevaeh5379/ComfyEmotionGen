import * as React from "react"
import { cn } from "@/lib/utils"

/* ── InputGroup (outer wrapper) ─────────────────────────────── */

const inputGroupVariants = cn(
  "group/input-group flex w-full flex-col overflow-hidden rounded-md border bg-muted/50",
  "focus-within:border-ring focus-within:shadow-[0_0_0_2px_hsl(var(--ring)/.3)]"
)

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(inputGroupVariants, className)}
      {...props}
    />
  )
}

/* ── InputGroupAddon (top / bottom bar) ─────────────────────── */

function InputGroupAddon({
  align = "block-start",
  className,
  ...props
}: React.ComponentProps<"div"> & { align?: "block-start" | "block-end" }) {
  const borderClass = align === "block-start" ? "border-b" : "border-t"

  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex items-center gap-1.5 border bg-muted/40 px-2.5 py-1.5 text-sm",
        borderClass,
        className
      )}
      {...props}
    />
  )
}

/* ── InputGroupText (label / info inside addon) ─────────────── */

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={cn(
        "flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

/* ── InputGroupButton (small button inside addon) ───────────── */

function InputGroupButton({
  className,
  size = "icon-sm",
  ...props
}: Omit<React.ComponentProps<"button">, "size"> & {
  size?: "icon-xs" | "icon-sm" | "sm" | "default"
}) {
  const sizeMap: Record<string, string> = {
    "icon-xs": "size-6 shrink-0",
    "icon-sm": "size-7 shrink-0",
    sm: "h-7 px-2.5 text-xs shrink-0",
    default: "h-8 px-3 shrink-0",
  }

  return (
    <button
      data-slot="input-group-button"
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-sm font-medium transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        sizeMap[size] ?? sizeMap.default,
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupText, InputGroupButton }
