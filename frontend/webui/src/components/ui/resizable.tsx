import { useCallback, useMemo } from "react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  autoSaveId,
  defaultLayout: defaultLayoutProp,
  onLayoutChanged: onLayoutChangedProp,
  ...props
}: ResizablePrimitive.GroupProps & { autoSaveId?: string }) {
  const defaultLayout = useMemo(() => {
    if (!autoSaveId) return defaultLayoutProp
    try {
      const saved = localStorage.getItem(`resizable-layout:${autoSaveId}`)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error("Failed to load resizable layout:", e)
    }
    return defaultLayoutProp
  }, [autoSaveId, defaultLayoutProp])

  const handleLayoutChanged = useCallback(
    (layout: ResizablePrimitive.Layout) => {
      if (autoSaveId) {
        try {
          localStorage.setItem(
            `resizable-layout:${autoSaveId}`,
            JSON.stringify(layout)
          )
        } catch (e) {
          console.error("Failed to save resizable layout:", e)
        }
      }
      if (onLayoutChangedProp) {
        onLayoutChangedProp(layout)
      }
    },
    [autoSaveId, onLayoutChangedProp]
  )

  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      defaultLayout={defaultLayout}
      onLayoutChanged={handleLayoutChanged}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
