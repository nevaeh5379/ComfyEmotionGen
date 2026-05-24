import {
  Maximize2Icon,
  ArrowLeftIcon,
  RefreshCwIcon,
  Settings2Icon,
  CheckIcon,
  XIcon,
  ColumnsIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  LayoutListIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  ContextMenuSeparator,
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
import { useEffect, useMemo, useState } from "react"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

interface DetailViewProps {
  selectedFilename: string
  visibleImages: SavedImage[]
  selectedApprovedHash: string | null
  compareImageKeys: Set<string>
  viewMode: ViewMode

  // Callbacks
  onBack: () => void
  onSetPreviewHash: (hash: string | null) => void
  onToggleCompareImage: (key: string, e: React.MouseEvent) => void
  onSelectImage: (filename: string, hash: string) => void
  onRegenerate: (filename: string) => void
  regenActionIsLoading: boolean
  onRejectAll: () => void
  onCancelAllRejects: () => void
  onCancelApproval: () => void
  onNavigate: (dir: "prev" | "next") => void
  onOpenList?: () => void
}

export function CombinationPickerDetailView({
  selectedFilename,
  visibleImages,
  selectedApprovedHash,
  compareImageKeys,
  viewMode,
  onBack,
  onSetPreviewHash,
  onToggleCompareImage,
  onSelectImage,
  onRegenerate,
  regenActionIsLoading,
  onRejectAll,
  onCancelAllRejects,
  onCancelApproval,
  onNavigate,
  onOpenList,
}: DetailViewProps) {
  const { backendUrl, enableHover, data, thumbnailSize, fluidGridLayout } = useCurationContext()
  const { setStatus, imagesByFilename, renderItems } = data

  const selectedItem = renderItems.find(
    (ri) => ri.filename === selectedFilename
  )
  const selectedImages = imagesByFilename.get(selectedFilename) ?? []

  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)

  const compareImages = useMemo(() => {
    const result: { filename: string; hash: string }[] = []
    for (const key of compareImageKeys) {
      const idx = key.lastIndexOf("::")
      if (idx === -1) continue
      const filename = key.slice(0, idx)
      const hash = key.slice(idx + 2)
      result.push({ filename, hash })
    }
    return result
  }, [compareImageKeys])

  useEffect(() => {
    if (viewMode !== "grid") return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return

      if (e.key === "ArrowRight" || e.key === "l") {
        setFocusedIdx((prev) =>
          prev === null ? 0 : Math.min(prev + 1, visibleImages.length - 1)
        )
      } else if (e.key === "ArrowLeft" || e.key === "h") {
        setFocusedIdx((prev) => (prev === null ? 0 : Math.max(prev - 1, 0)))
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
  return (
    <div
      className={`flex min-w-0 flex-col md:pb-0 ${
        viewMode === "tournament"
          ? "pb-2 flex-none border-b"
          : "pb-20 min-h-[700px] flex-1"
      }`}
    >
      {/* 상세 헤더 (모바일 2단 / 데스크탑 1단) */}
      <div className="flex-none border-b bg-muted/10 p-2 md:py-1.5">
        <div className="flex flex-col gap-2 md:flex-row md:flex-nowrap md:items-center md:gap-3">
          {/* 컨트롤 영역 (모바일: 첫 줄 / 데스크탑: 좌측) */}
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onBack}
                    className="h-9 w-9 shrink-0 md:h-7 md:w-7"
                  >
                    <ArrowLeftIcon className="h-5 w-5 md:h-3 md:w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-1.5 text-xs font-bold">
                  <span>목록으로 돌아가기</span>
                  <Kbd className="border-white/10 bg-white/20 text-white dark:border-line dark:bg-muted dark:text-muted-foreground">
                    Esc
                  </Kbd>
                </TooltipContent>
              </Tooltip>

              <div className="flex items-center rounded-lg border border-line bg-muted/60 p-0.5 shadow-inner">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-background/80 active:bg-background md:h-6 md:w-6"
                      onClick={() => onNavigate("prev")}
                    >
                      <ChevronUpIcon className="h-5 w-5 md:h-3.5 md:w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="flex items-center gap-1.5 text-xs font-bold">
                    <span>이전 조합</span>
                    <Kbd className="border-white/10 bg-white/20 text-white dark:border-line dark:bg-muted dark:text-muted-foreground">
                      K
                    </Kbd>
                  </TooltipContent>
                </Tooltip>

                {onOpenList && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-none border-x border-line/50 p-0 hover:bg-background/80 active:bg-background md:hidden"
                        onClick={onOpenList}
                      >
                        <LayoutListIcon className="h-4.5 w-4.5 text-primary" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>조합 목록 보기</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-background/80 active:bg-background md:h-6 md:w-6"
                      onClick={() => onNavigate("next")}
                    >
                      <ChevronDownIcon className="h-5 w-5 md:h-3.5 md:w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="flex items-center gap-1.5 text-xs font-bold">
                    <span>다음 조합</span>
                    <Kbd className="border-white/10 bg-white/20 text-white dark:border-line dark:bg-muted dark:text-muted-foreground">
                      J
                    </Kbd>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* 작업 버튼들 (모바일: 첫 줄 우측 / 데스크탑: 우측 끝으로 이동됨) */}
            <div className="flex items-center gap-1.5 md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 w-9">
                    <Settings2Icon className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={onRejectAll}
                    disabled={
                      !selectedImages.some(
                        (img) =>
                          img.status !== "approved" && img.status !== "rejected"
                      )
                    }
                    className="py-3"
                  >
                    <XIcon className="mr-2 h-4 w-4 text-red-500" />
                    모두 리젝
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onCancelAllRejects}
                    disabled={
                      !selectedImages.some((img) => img.status === "rejected")
                    }
                    className="py-3"
                  >
                    <RefreshCwIcon className="mr-2 h-4 w-4" />
                    리젝 취소
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onCancelApproval}
                    disabled={!hasApproved(selectedImages)}
                    className="py-3"
                  >
                    <XIcon className="mr-2 h-4 w-4 text-amber-600" />
                    선택 취소
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <LoadingButton
                size="sm"
                className="h-9 w-9"
                onClick={() =>
                  selectedFilename && onRegenerate(selectedFilename)
                }
                isLoading={regenActionIsLoading}
                icon={RefreshCwIcon}
              ></LoadingButton>
            </div>
          </div>

          {/* 정보 영역 (모바일: 둘째 줄 / 데스크탑: 중앙) */}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden md:gap-3">
            <span className="truncate font-mono text-[13px] font-black text-foreground md:text-[11px]">
              {selectedFilename}
            </span>
            <div className="no-scrollbar flex-1 overflow-x-auto">
              <MetaTags meta={selectedItem?.meta || {}} variant="compact" />
            </div>
          </div>

          {/* 데스크탑 전용 우측 버튼 영역 */}
          <div className="ml-auto hidden items-center gap-1.5 md:flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 px-4 md:h-6 md:w-6"
                >
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
              className="h-7 w-7 p-0 px-4 md:h-6 md:w-6"
              onClick={() => selectedFilename && onRegenerate(selectedFilename)}
              isLoading={regenActionIsLoading}
              icon={RefreshCwIcon}
            ></LoadingButton>
          </div>
        </div>
      </div>

      {/* 이미지 뷰어 */}
      <div className="relative flex-1 overflow-y-auto p-2 md:py-1">
        {visibleImages.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center space-y-4 text-muted-foreground">
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
          <div
            className="grid gap-3 sm:gap-4"
            style={{
              gridTemplateColumns: fluidGridLayout
                ? `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`
                : `repeat(auto-fill, ${thumbnailSize}px)`,
            }}
          >
            {visibleImages.map((img, idx) => {
              const isSelected = img.hash === selectedApprovedHash
              const isRejected = img.status === "rejected"
              const isPinned = compareImageKeys.has(
                `${selectedFilename}::${img.hash}`
              )
              const isFocused = focusedIdx === idx

              return (
                <ContextMenu key={img.hash}>
                  <ContextMenuTrigger className="block">
                    <HoverCard
                      openDelay={enableHover ? 400 : 99999}
                      closeDelay={100}
                    >
                      <HoverCardTrigger asChild>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (isSelected) {
                              onCancelApproval()
                            } else {
                              onSelectImage(selectedFilename, img.hash)
                            }
                          }}
                          onFocus={() => setFocusedIdx(idx)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              if (isSelected) {
                                onCancelApproval()
                              } else {
                                onSelectImage(selectedFilename, img.hash)
                              }
                            }
                          }}
                          className={`group relative cursor-pointer overflow-hidden rounded-xl transition-all ${
                            isSelected
                              ? "scale-[0.98] shadow-lg ring-4 ring-green-500"
                              : isRejected
                                ? "opacity-30 hover:opacity-100"
                                : "shadow-sm hover:ring-2 hover:ring-primary/40 md:hover:-translate-y-1"
                          } ${isFocused ? "ring-4 ring-blue-500 ring-offset-2" : ""}`}
                        >
                          <ImageWithSkeleton
                            src={`${backendUrl}/saved-images/${img.hash}`}
                            objectFit="object-contain"
                          />
                          <button
                            type="button"
                            onClick={(e) =>
                              onToggleCompareImage(
                                `${selectedFilename}::${img.hash}`,
                                e
                              )
                            }
                            className={`absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition-colors md:h-7 md:w-7 ${isPinned ? "bg-blue-500 text-white shadow-lg" : "bg-black/40 text-white/50 opacity-100 md:opacity-0 md:group-hover:opacity-100"}`}
                          >
                            <ColumnsIcon
                              className={`h-5 w-5 md:h-4 md:w-4 ${isPinned ? "" : "opacity-50"}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSetPreviewHash(img.hash)
                            }}
                            className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/60 md:hidden"
                          >
                            <Maximize2Icon className="h-5 w-5" />
                          </button>
                          {idx < 9 && (
                            <div className="absolute top-2 left-2 opacity-100 backdrop-blur-sm transition-opacity md:opacity-0 md:group-hover:opacity-100">
                              <Kbd className="flex h-6 w-6 items-center justify-center rounded border-white/20 bg-black/60 font-mono text-[11px] font-black text-white select-none">
                                {idx + 1}
                              </Kbd>
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-green-500/10">
                              <div className="rounded-full bg-green-500 p-2 text-white shadow-2xl">
                                <CheckIcon
                                  className="h-10 w-10 md:h-8 md:w-8"
                                  strokeWidth={4}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </HoverCardTrigger>
                      {enableHover && (
                        <HoverCardContent
                          className="hidden w-80 bg-card/95 p-4 font-mono text-[10px] break-all whitespace-pre-wrap backdrop-blur-md md:block"
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
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem onClick={() => onSetPreviewHash(img.hash)}>
                      <Maximize2Icon className="h-4 w-4" /> 이미지 보기
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {isSelected ? (
                      <ContextMenuItem onClick={onCancelApproval}>
                        <XIcon className="h-4 w-4" /> 선택 취소
                      </ContextMenuItem>
                    ) : isRejected ? (
                      <ContextMenuItem
                        onClick={() => setStatus(img.hash, "pending")}
                      >
                        <RefreshCwIcon className="h-4 w-4" /> 리젝 취소
                      </ContextMenuItem>
                    ) : (
                      <>
                        <ContextMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectImage(selectedFilename, img.hash)
                          }}
                        >
                          <CheckIcon className="h-4 w-4" /> 선택
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => setStatus(img.hash, "rejected")}
                        >
                          <XIcon className="h-4 w-4" /> 리젝
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </div>
        ) : viewMode === "compare" ? (
          compareImages.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center space-y-4 text-muted-foreground">
              <ColumnsIcon className="h-10 w-10 opacity-20" />
              <p className="text-sm font-bold">비교할 이미지를 선택해주세요</p>
              <p className="text-xs text-muted-foreground/60">
                그리드 뷰에서 이미지 위의 비교 버튼을 눌러 추가할 수 있습니다
              </p>
            </div>
          ) : (
            <div
              className={`grid gap-4 ${compareImages.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"}`}
            >
              {compareImages.map(({ filename, hash }) => (
                <div
                  key={hash}
                  className="relative flex min-h-[300px] overflow-hidden rounded-xl border bg-black/5 shadow-inner"
                >
                  <button
                    type="button"
                    onClick={(e) =>
                      onToggleCompareImage(`${filename}::${hash}`, e)
                    }
                    className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl"
                  >
                    <ColumnsIcon className="h-5 w-5" />
                  </button>
                  <Magnifier src={`${backendUrl}/saved-images/${hash}`} />
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
