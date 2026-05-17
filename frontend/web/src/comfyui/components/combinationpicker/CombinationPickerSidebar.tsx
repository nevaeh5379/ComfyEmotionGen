import type { SavedImage } from "../../types/Message"
import type { RenderItem } from "./CombinationPickerComponents"
import { StatusIcon } from "./CombinationPickerHelpers"
import { hasApproved } from "../../types/Message"

interface SidebarProps {
  renderItems: RenderItem[]
  imagesByFilename: Map<string, SavedImage[]>
  selectedFilename: string
  setSelectedFilename: (filename: string) => void
}

export function CombinationPickerSidebar({
  renderItems,
  imagesByFilename,
  selectedFilename,
  setSelectedFilename,
}: SidebarProps) {
  return (
    <div
      className="sticky flex w-64 flex-none flex-col self-start overflow-hidden rounded-lg border bg-card"
      style={
        {
          top: "calc(45px + var(--toolbar-height, 60px))",
          maxHeight: "calc(100vh - 45px - var(--toolbar-height, 60px) - 20px)",
        } as React.CSSProperties
      }
    >
      <div className="border-b bg-muted/30 p-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        Combinations
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-1">
        {renderItems.map((item) => {
          const imgs = imagesByFilename.get(item.filename) ?? []
          const isDone = hasApproved(imgs)
          const isActive = item.filename === selectedFilename
          return (
            <button
              key={item.filename}
              onClick={() => setSelectedFilename(item.filename)}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-accent/50"
              }`}
            >
              <span className="mt-0.5 flex-none">
                <StatusIcon done={isDone} active={isActive} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[10px] leading-tight font-bold">
                  {item.filename}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-1">
                  {Object.values(item.meta).map((v, i) => (
                    <span
                      key={i}
                      className={`text-[9px] font-medium uppercase ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[9px] font-bold opacity-50">
                {imgs.length}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
