import {
  Maximize2Icon,
  ArrowLeftIcon,
  RefreshCwIcon,
  Settings2Icon,
  CheckIcon,
  XIcon,
  PinIcon,
  PinOffIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import type { SavedImage } from "../../types/Message"
import { LoadingButton } from "./CombinationPickerComponents"
import { MetaTags, ImageWithSkeleton } from "./CombinationPickerHelpers"
import { Magnifier } from "./CombinationPickerViews"
import { hasApproved } from "../../types/Message"
import { useCurationContext } from "./CurationContext"
import { useEffect, useState } from "react"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

interface DetailViewProps {
  selectedFilename: string
  visibleImages: SavedImage[]
  selectedApprovedHash: string | null
  pinnedHashes: string[]
  viewMode: ViewMode

  // Callbacks
  onBack: () => void
  onSetPreviewHash: (hash: string | null) => void
  onTogglePin: (hash: string, e: React.MouseEvent) => void
  onSelectImage: (filename: string, hash: string) => void
  onRegenerate: (filename: string) => void
  regenActionIsLoading: boolean
  onRejectAll: () => void
  onCancelAllRejects: () => void
  onCancelApproval: () => void
}

export function CombinationPickerDetailView({
  selectedFilename,
  visibleImages,
  selectedApprovedHash,
  pinnedHashes,
  viewMode,
  onBack,
  onSetPreviewHash,
  onTogglePin,
  onSelectImage,
  onRegenerate,
  regenActionIsLoading,
  onRejectAll,
  onCancelAllRejects,
  onCancelApproval,
}: DetailViewProps) {
  const { backendUrl, enableHover, data } = useCurationContext()
  const { setStatus, imagesByFilename, renderItems } = data
  
  const selectedItem = renderItems.find(ri => ri.filename === selectedFilename)
  const selectedImages = imagesByFilename.get(selectedFilename) ?? []

  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)

  useEffect(() => {
    if (viewMode !== "grid") return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === "ArrowRight" || e.key === "l") {
        setFocusedIdx(prev => prev === null ? 0 : Math.min(prev + 1, visibleImages.length - 1))
      } else if (e.key === "ArrowLeft" || e.key === "h") {
        setFocusedIdx(prev => prev === null ? 0 : Math.max(prev - 1, 0))
      } else if (e.key === "Enter" || e.key === " ") {
        if (focusedIdx !== null && visibleImages[focusedIdx]) {
            e.preventDefault()
            onSelectImage(selectedFilename, visibleImages[focusedIdx].hash)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [viewMode, visibleImages, focusedIdx, onSelectImage, selectedFilename])

  const colClass =
    visibleImages.length <= 2
      ? "grid-cols-2"
      : visibleImages.length <= 6
        ? "grid-cols-3"
        : "grid-cols-4"

  return (
    <div className="flex min-h-[700px] min-w-0 flex-1 flex-col">
      {/* 상세 헤더 (1 줄 통합) */}
      <div className="flex-none border-b bg-muted/10 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-6 w-6 shrink-0 p-0 px-4"
          >
            <ArrowLeftIcon className="h-2.5 w-2.5" />
          </Button>
          <span className="truncate font-mono text-[11px] font-bold">
            {selectedFilename}
          </span>
          <MetaTags meta={selectedItem?.meta || {}} variant="default"  />
          <div className="ml-auto flex items-center gap-1.5">
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 w-6 p-0 px-4">
                  <Settings2Icon className="h-2.5 w-2.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={onRejectAll}
                  disabled={
                    !selectedImages.some(
                      (img) =>
                        img.status !== "approved" && img.status !== "rejected"
                    )
                  }
                >
                  <XIcon className="mr-2 h-3.5 w-3.5 text-red-500" />
                  모두 리젝
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onCancelAllRejects}
                  disabled={
                    !selectedImages.some((img) => img.status === "rejected")
                  }
                >
                  <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
                  리젝 취소
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onCancelApproval}
                  disabled={!hasApproved(selectedImages)}
                >
                  <XIcon className="mr-2 h-3.5 w-3.5 text-amber-600" />
                  선택 취소
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <LoadingButton
              size="sm"
              className="h-6 w-6 p-0 px-4"
              onClick={() => selectedFilename && onRegenerate(selectedFilename)}
              isLoading={regenActionIsLoading}
              icon={RefreshCwIcon}
            ></LoadingButton>
          </div>
        </div>
      </div>

      {/* 이미지 뷰어 */}
      <div className="relative py-1">
        {visibleImages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-4 text-muted-foreground">
            <Maximize2Icon className="h-10 w-10 opacity-20" />
            <p className="text-sm font-bold">생성된 이미지가 없습니다</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedFilename && onRegenerate(selectedFilename)}
              className="font-bold"
            >
              이미지 생성 시작
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          <div className={`grid gap-4 ${colClass}`}>
            {visibleImages.map((img, idx) => {
              const isSelected = img.hash === selectedApprovedHash
              const isRejected = img.status === "rejected"
              const isPinned = pinnedHashes.includes(img.hash)
              const isFocused = focusedIdx === idx

              return (
                <ContextMenu key={img.hash}>
                  <div className="flex flex-col gap-1.5">
                    <ContextMenuTrigger asChild>
                      <HoverCard
                        openDelay={enableHover ? 400 : 99999}
                        closeDelay={100}
                      >
                        <HoverCardTrigger asChild>
                          <button
                            onClick={() => onSetPreviewHash(img.hash)}
                            onFocus={() => setFocusedIdx(idx)}
                            className={`group relative overflow-hidden rounded-lg transition-all ${
                              isSelected
                                ? "scale-[0.98] shadow-lg ring-4 ring-green-500"
                                : isRejected
                                  ? "opacity-30 hover:opacity-100"
                                  : "shadow-sm hover:-translate-y-1 hover:ring-2 hover:ring-primary/40"
                            } ${isFocused ? "ring-4 ring-blue-500 ring-offset-2" : ""}`}
                          >
                            <ImageWithSkeleton
                              src={`${backendUrl}/saved-images/${img.hash}`}
                            />
                            <button
                              type="button"
                              onClick={(e) => onTogglePin(img.hash, e)}
                              className={`absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${isPinned ? "bg-blue-500 text-white shadow-lg" : "bg-black/40 text-white/50 opacity-0 group-hover:opacity-100"}`}
                            >
                              {isPinned ? (
                                <PinIcon className="h-4 w-4" />
                              ) : (
                                <PinOffIcon className="h-4 w-4" />
                              )}
                            </button>
                            {idx < 9 && (
                              <span className="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded bg-black/40 text-[10px] font-bold text-white opacity-0 backdrop-blur-sm group-hover:opacity-100">
                                {idx + 1}
                              </span>
                            )}
                            {isSelected && (
                              <div className="absolute inset-0 flex items-center justify-center bg-green-500/10">
                                <div className="rounded-full bg-green-500 p-2 text-white shadow-2xl">
                                  <CheckIcon
                                    className="h-8 w-8"
                                    strokeWidth={4}
                                  />
                                </div>
                              </div>
                            )}
                          </button>
                        </HoverCardTrigger>
                        {enableHover && (
                          <HoverCardContent
                            className="w-80 bg-card/95 p-4 font-mono text-[10px] break-all whitespace-pre-wrap backdrop-blur-md"
                            side="right"
                          >
                            <div className="mb-2 border-b pb-2 font-black tracking-widest text-primary uppercase">
                              Metadata
                            </div>
                            {img.prompt}
                          </HoverCardContent>
                        )}
                      </HoverCard>
                    </ContextMenuTrigger>

                    {/* 선택하기 버튼 */}
                    {!isSelected && !isRejected && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 w-full gap-1 border-green-300 text-[10px] font-bold text-green-600 hover:bg-green-50 hover:text-green-700 ${isFocused ? "bg-green-50 ring-2 ring-green-500" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectImage(selectedFilename, img.hash)
                        }}
                      >
                        <CheckIcon className="h-3 w-3" />
                        선택
                      </Button>
                    )}
                    {isSelected && (
                      <div className="flex h-7 items-center justify-center rounded bg-green-100 text-[10px] font-bold text-green-700">
                        <CheckIcon className="mr-1 h-3 w-3" />
                        선택됨
                      </div>
                    )}
                    {isRejected && (
                      <div className="flex h-7 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                        <XIcon className="mr-1 h-3 w-3" />
                        리젝됨
                      </div>
                    )}
                  </div>
                  <ContextMenuContent className="w-40">
                    {isSelected ? (
                      <ContextMenuItem onClick={onCancelApproval}>
                        <XIcon className="h-3.5 w-3.5" /> 선택 취소
                      </ContextMenuItem>
                    ) : isRejected ? (
                      <ContextMenuItem
                        onClick={() => setStatus(img.hash, "pending")}
                      >
                        <RefreshCwIcon className="h-3.5 w-3.5" /> 리젝 취소
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem
                        onClick={() => setStatus(img.hash, "rejected")}
                      >
                        <XIcon className="h-3.5 w-3.5" /> 리젝
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </div>
        ) : viewMode === "compare" ? (
          <div
            className={`grid h-full gap-3 ${pinnedHashes.length === 1 ? "grid-cols-1" : pinnedHashes.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
          >
            {pinnedHashes.map((hash) => (
              <div
                key={hash}
                className="relative flex h-full overflow-hidden rounded-lg border bg-black/5 shadow-inner"
              >
                <button
                  type="button"
                  onClick={(e) => onTogglePin(hash, e)}
                  className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl"
                >
                  <PinIcon className="h-5 w-5" />
                </button>
                <Magnifier src={`${backendUrl}/saved-images/${hash}`} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
