import { CheckIcon, CheckSquareIcon, FolderIcon, Loader2Icon, RefreshCwIcon, SquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HoverCardContent } from "@/components/ui/hover-card"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import type { ComponentProps } from "react"
import type { SavedImage } from "./Message"

export interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
}

export interface CombinationViewProps {
  items: RenderItem[]
  imagesByFilename: Map<string, SavedImage[]>
  backendUrl: string
  onSelect: (filename: string) => void
  onOpen: (filename: string) => void
  selectionMode: boolean
  selectedFilenames: Set<string>
  onToggleSelect: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
  enableHover?: boolean
}

export function hasApproved(images: SavedImage[]): boolean {
  return images.some((img) => img.status === "approved")
}

export function findApproved(images: SavedImage[]): SavedImage | undefined {
  return images.find((img) => img.status === "approved")
}

export function ImagePreviewHoverCard({
  filename,
  images,
  backendUrl,
}: {
  filename: string
  images: SavedImage[]
  backendUrl: string
}) {
  return (
    <HoverCardContent className="w-72 p-3" side="right" align="start">
      <div className="mb-2 text-[10px] font-black text-primary uppercase tracking-widest border-b pb-1.5">
        {filename} ({images.length}장)
      </div>
      {images.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">이미지 없음</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
          {images.slice(0, 12).map((img) => (
            <div key={img.hash} className="relative aspect-square overflow-hidden rounded-md bg-muted">
              <img
                src={`${backendUrl}/saved-images/${img.hash}`}
                className="h-full w-full object-cover"
                alt=""
                loading="lazy"
              />
              {img.status === "approved" && (
                <div className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-green-500 text-white">
                  <CheckIcon className="h-3 w-3" strokeWidth={3} />
                </div>
              )}
              {img.status === "rejected" && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-white/80">REJ</span>
                </div>
              )}
            </div>
          ))}
          {images.length > 12 && (
            <div className="aspect-square flex items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
              +{images.length - 12}
            </div>
          )}
        </div>
      )}
    </HoverCardContent>
  )
}

export function CombinationContextMenu({
  filename,
  isSelected,
  selectionMode,
  onOpen,
  onToggleSelect,
  onLongPress,
  onRegenerate,
}: {
  filename: string
  isSelected: boolean
  selectionMode: boolean
  onOpen: (filename: string) => void
  onToggleSelect: (filename: string) => void
  onLongPress: (filename: string) => void
  onRegenerate?: (filename: string) => void
}) {
  return (
    <ContextMenuContent className="w-52">
      <ContextMenuLabel className="font-mono text-[10px] truncate">{filename}</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onOpen(filename)}>
        <FolderIcon className="h-4 w-4" /> 열기
      </ContextMenuItem>
      <ContextMenuItem onClick={() => selectionMode ? onToggleSelect(filename) : onLongPress(filename)}>
        {isSelected ? <CheckSquareIcon className="h-4 w-4" /> : <SquareIcon className="h-4 w-4" />}
        {isSelected ? "선택 해제" : "선택하기"}
      </ContextMenuItem>
      {onRegenerate && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onRegenerate(filename)}>
            <RefreshCwIcon className="h-4 w-4" /> 재생성
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )
}

export function RegenCountControl({
  value,
  onChange,
  buttonText,
  isLoading,
  isDisabled,
  onAction,
}: {
  value: number
  onChange: (value: number) => void
  buttonText: string
  isLoading: boolean
  isDisabled: boolean
  onAction: () => void
}) {
  return (
    <div className="flex items-center gap-2 bg-background p-1 rounded border shadow-sm">
      <div className="flex flex-col items-center px-2">
        <span className="text-[8px] font-bold text-muted-foreground uppercase leading-none mb-0.5">Regen Count</span>
        <Input
          type="number"
          min={1}
          max={20}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value)
            onChange(isNaN(n) ? 1 : Math.max(1, Math.min(20, n)))
          }}
          className="h-6 w-10 text-center text-[11px] font-bold border-none focus-visible:ring-0 p-0"
        />
      </div>
      <Button
        size="sm"
        className="h-8 gap-1.5 text-[10px] font-bold"
        onClick={onAction}
        disabled={isDisabled}
      >
        {isLoading ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="h-3.5 w-3.5" />
        )}
        {buttonText}
      </Button>
    </div>
  )
}

interface LoadingButtonProps extends ComponentProps<typeof Button> {
  isLoading: boolean
  icon: React.ComponentType<{ className?: string }>
}

export function LoadingButton({
  isLoading,
  icon: Icon,
  children,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <Button {...props} disabled={isLoading || disabled}>
      {isLoading ? <Loader2Icon className="animate-spin" /> : <Icon />}
      {children}
    </Button>
  )
}
