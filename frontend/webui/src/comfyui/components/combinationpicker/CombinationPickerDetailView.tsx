import {
  Maximize2Icon,
  ArrowLeftIcon,
  RefreshCwIcon,
  EllipsisVerticalIcon,
  CheckIcon,
  XIcon,
  ColumnsIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  LayoutListIcon,
  InfoIcon,
  BrushIcon,
  Edit3 as Edit3Icon,
  Upload as UploadIcon,
  FileCode2Icon,
  RotateCcwIcon,
  CopyIcon,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Badge } from "@/components/ui/badge"
import CodeEditor from "@/components/CodeEditor"
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
import { API } from "@/lib/api"
import { copyImageUrlToClipboard } from "@/lib/clipboard"
import { toast } from "sonner"
import type { SavedImage } from "../../types/Message"
import { LoadingButton } from "./CombinationPickerComponents"
import { MetaTags, ImageWithSkeleton } from "./CombinationPickerHelpers"
import { Magnifier } from "./CombinationPickerViews"
import { hasApproved } from "../../types/Message"
import { useCurationContext } from "./CurationContext"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useBackend } from "../../hooks/useBackend"
import type { JobView } from "../../types/Message"
import { WorkerPreviewImage } from "../WorkerPreviewImage"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.closest(
      "input, textarea, select, [contenteditable='true'], .cm-editor, [role='textbox']"
    ) !== null
  )
}

function getJobPreviewUrl(job: JobView, backendUrl: string): string | null {
  const savedHash = job.savedImageHashes[0]
  if (savedHash !== undefined) return `${backendUrl}/saved-images/${savedHash}`

  const imageUrl = job.imageUrls[0]
  if (imageUrl !== undefined && imageUrl !== "") {
    if (/^https?:\/\//.test(imageUrl)) return imageUrl
    return `${backendUrl}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`
  }

  return null
}

function ActiveJobImageCard({
  job,
  backendUrl,
  previewToken,
  isCancelling,
  onCancel,
}: {
  job: JobView
  backendUrl: string
  previewToken: number | undefined
  isCancelling: boolean
  onCancel: (jobId: string) => void
}): React.JSX.Element {
  const previewUrl = getJobPreviewUrl(job, backendUrl)
  const canShowWorkerPreview =
    previewUrl === null &&
    job.workerId !== null &&
    previewToken !== undefined &&
    (job.status === "running" || job.status === "queued")
  const canCancel =
    job.status === "pending" ||
    job.status === "queued" ||
    job.status === "running"
  const statusLabel =
    job.status === "done"
      ? "완료"
      : job.status === "running"
        ? `생성 중 ${String(Math.round(job.progressPercent))}%`
        : job.status === "queued"
          ? "대기 중"
          : "준비 중"

  return (
    <div className="group relative overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.03] shadow-sm ring-1 ring-primary/10">
      {previewUrl !== null ? (
        <img
          src={previewUrl}
          alt={statusLabel}
          className="h-full min-h-40 w-full object-contain"
        />
      ) : canShowWorkerPreview ? (
        <WorkerPreviewImage
          backendUrl={backendUrl}
          workerId={job.workerId}
          previewToken={previewToken}
          alt={statusLabel}
          className="h-full min-h-40 w-full object-contain"
        />
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
          <RefreshCwIcon className="h-6 w-6 animate-spin opacity-50" />
          <span className="text-xs font-bold">{statusLabel}</span>
        </div>
      )}
      <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        {statusLabel}
      </div>
      {canCancel && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2 h-7 w-7 rounded-full p-0 shadow-lg"
              disabled={isCancelling}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCancel(job.id)
              }}
            >
              {isCancelling ? (
                <RefreshCwIcon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XIcon className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>이 생성 취소</TooltipContent>
        </Tooltip>
      )}
      {job.status === "running" && (
        <div className="absolute right-2 bottom-2 left-2 h-1 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full bg-primary transition-all"
            style={{
              width: `${String(Math.min(100, Math.max(0, job.progressPercent)))}%`,
            }}
          />
        </div>
      )}
    </div>
  )
}

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
  activeTemplate: string
  cegDraft: string
  onCegDraftChange: (value: string) => void
  onResetCegDraft: () => void
  onSaveCegDraft?: (value: string) => void
  onRejectAll: () => void
  onCancelAllRejects: () => void
  onCancelApproval: () => void
  onNavigate: (dir: "prev" | "next") => void
  onOpenList?: () => void
  onOpenDetail?: (img: SavedImage) => void
  onInpaint?: (img: SavedImage) => void
  onEdit?: (img: SavedImage) => void

  heldFilenames: string[]
  onToggleHold: () => void
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
  activeTemplate,
  cegDraft,
  onCegDraftChange,
  onResetCegDraft,
  onSaveCegDraft,
  onRejectAll,
  onCancelAllRejects,
  onCancelApproval,
  onNavigate,
  onOpenList,
  onOpenDetail,
  onInpaint,
  onEdit,
  heldFilenames,
  onToggleHold,
}: DetailViewProps): React.JSX.Element {
  const { backendUrl, enableHover, data, thumbnailSize, fluidGridLayout } =
    useCurationContext()
  const { jobs, workerPreviews } = useBackend()
  const { setStatus, imagesByFilename, renderItems, rawRenderItems, uploadUserImage } = data

  const selectedItem =
    renderItems.find((ri) => ri.filename === selectedFilename) ??
    rawRenderItems.find((ri) => ri.filename === selectedFilename)
  const selectedImages = imagesByFilename.get(selectedFilename) ?? []
  const activeJobsForSelection = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.filename === selectedFilename &&
          (job.status === "pending" ||
            job.status === "queued" ||
            job.status === "running" ||
            job.status === "done")
      ),
    [jobs, selectedFilename]
  )

  const handleUploadClick = (): void => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        await uploadUserImage(file, selectedItem?.meta)
      } catch (err) {
        // Handled in useCombinationData
      }
    }
    input.click()
  }

  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const [cegEditorOpen, setCegEditorOpen] = useState(false)
  const [cancellingJobIds, setCancellingJobIds] = useState<Set<string>>(
    () => new Set()
  )
  const cegDraftDirty = cegDraft !== activeTemplate
  const [draftPromptPreview, setDraftPromptPreview] = useState(
    selectedItem?.prompt ?? ""
  )
  const [draftPreviewState, setDraftPreviewState] = useState<
    "idle" | "loading" | "error"
  >("idle")
  const [draftPreviewError, setDraftPreviewError] = useState<string | null>(
    null
  )

  // ── Ctrl + S 단축키 저장 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        if (cegEditorOpen && cegDraftDirty && onSaveCegDraft !== undefined) {
          e.preventDefault()
          onSaveCegDraft(cegDraft)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [cegEditorOpen, cegDraftDirty, cegDraft, onSaveCegDraft])

  const selectedMetaKey = useMemo(
    () => JSON.stringify(selectedItem?.meta ?? {}),
    [selectedItem]
  )

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

  const handleCancelActiveJob = useCallback(
    (jobId: string): void => {
      setCancellingJobIds((prev) => new Set(prev).add(jobId))
      void (async (): Promise<void> => {
        try {
          const res = await fetch(`${backendUrl}${API.jobs.cancel(jobId)}`, {
            method: "DELETE",
          })
          if (!res.ok) {
            throw new Error(await res.text().catch(() => res.statusText))
          }
          toast.success("생성을 취소했습니다.")
          window.dispatchEvent(new CustomEvent("ceg-refetch-jobs"))
        } catch {
          toast.error("생성 취소 요청에 실패했습니다.")
        } finally {
          setCancellingJobIds((prev) => {
            const next = new Set(prev)
            next.delete(jobId)
            return next
          })
        }
      })()
    },
    [backendUrl]
  )

  useEffect(() => {
    if (viewMode !== "grid") return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isEditableEventTarget(e.target)) return

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
    return (): void => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [viewMode, visibleImages, focusedIdx, onSelectImage, selectedFilename])

  useEffect(() => {
    if (!cegEditorOpen) {
      setDraftPromptPreview(selectedItem?.prompt ?? "")
      setDraftPreviewState("idle")
      setDraftPreviewError(null)
      return
    }
    if (cegDraft.trim() === "") {
      setDraftPromptPreview("")
      setDraftPreviewState("idle")
      setDraftPreviewError(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setDraftPreviewState("loading")
      setDraftPreviewError(null)
      void (async (): Promise<void> => {
        try {
          const res = await fetch(`${backendUrl}/render`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: cegDraft }),
            signal: controller.signal,
          })
          if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
          const data = (await res.json()) as {
            items: { filename: string; prompt: string; meta: Record<string, string> }[]
          }
          const selectedMeta = JSON.parse(selectedMetaKey) as Record<
            string,
            string
          >
          const sameMeta = (meta: Record<string, string>): boolean =>
            Object.entries(selectedMeta).every(([key, value]) => meta[key] === value)
          const matched =
            data.items.find((item) => item.filename === selectedFilename) ??
            data.items.find((item) => sameMeta(item.meta)) ??
            null
          setDraftPromptPreview(matched?.prompt ?? "")
          setDraftPreviewState("idle")
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return
          setDraftPreviewState("error")
          setDraftPreviewError(err instanceof Error ? err.message : String(err))
        }
      })()
    }, 350)

    return (): void => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    backendUrl,
    cegDraft,
    cegEditorOpen,
    selectedFilename,
    selectedItem,
    selectedMetaKey,
  ])

  return (
    <div
      className={`flex min-w-0 flex-col md:pb-0 ${
        viewMode === "tournament"
          ? "flex-none border-b pb-2"
          : "min-h-[700px] flex-1 pb-20"
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
                      onClick={() => {
                        onNavigate("prev")
                      }}
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
                      onClick={() => {
                        onNavigate("next")
                      }}
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
                    <EllipsisVerticalIcon className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={onToggleHold}
                    className="py-3"
                  >
                    <Clock className="mr-2 h-4 w-4 text-yellow-500" />
                    {heldFilenames.includes(selectedFilename) ? "보류 해제" : "이 조합 보류"}
                  </DropdownMenuItem>
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
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={handleUploadClick}
              >
                <UploadIcon className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* 정보 영역 (모바일: 둘째 줄 / 데스크탑: 중앙) */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden md:flex-row md:items-center md:gap-3">
            <span className="truncate font-mono text-[13px] font-black text-foreground md:text-[11px]">
              {selectedFilename}
            </span>
            {heldFilenames.includes(selectedFilename) && (
              <Badge variant="outline" className="h-5 border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0 text-[9px] font-bold text-yellow-600 dark:text-yellow-500 shrink-0">
                보류됨
              </Badge>
            )}
            {/* <div className="no-scrollbar overflow-x-auto">
              <MetaTags meta={selectedItem?.meta ?? {}} variant="compact" />
            </div> */}
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
                  <EllipsisVerticalIcon className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={onToggleHold}
                >
                  <Clock className="mr-2 h-3.5 w-3.5 text-yellow-500" />
                  {heldFilenames.includes(selectedFilename) ? "보류 해제" : "이 조합 보류"}
                </DropdownMenuItem>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 md:h-6 md:w-6"
                  onClick={handleUploadClick}
                >
                  <UploadIcon className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>외부 이미지 직접 업로드</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b bg-muted/10 px-2 py-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] font-bold"
            onClick={() => {
              setCegEditorOpen((open) => !open)
            }}
          >
            <FileCode2Icon className="h-3.5 w-3.5 text-primary" />
            CEG 수정
          </Button>
          {cegDraftDirty && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              이 조합 수정됨
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            {cegDraftDirty && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                onClick={onResetCegDraft}
              >
                <RotateCcwIcon className="h-3 w-3" />
                되돌리기
              </Button>
            )}
            {onSaveCegDraft !== undefined && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                disabled={!cegDraftDirty}
                onClick={() => {
                  onSaveCegDraft(cegDraft)
                }}
              >
                저장
              </Button>
            )}
            <LoadingButton
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => {
                onRegenerate(selectedFilename)
              }}
              isLoading={regenActionIsLoading}
              icon={RefreshCwIcon}
            >
              재생성
            </LoadingButton>
          </div>
        </div>
        {cegEditorOpen && (
          <div className="mt-2 grid min-h-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(220px,34%)]">
            <div className="h-64 overflow-hidden rounded-md border bg-background">
              <CodeEditor
                language="ceg"
                value={cegDraft}
                onChange={onCegDraftChange}
                minHeight="100%"
                bareWrapper
                className="h-full w-full"
              />
            </div>
            <div className="rounded-md border bg-background/80 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                <span>드래프트 프롬프트</span>
                {draftPreviewState === "loading" && (
                  <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                    갱신 중
                  </Badge>
                )}
                {draftPreviewState === "error" && (
                  <Badge variant="outline" className="px-1 py-0 text-[9px]">
                    오류
                  </Badge>
                )}
              </div>
              <div className="max-h-56 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {draftPreviewState === "error"
                  ? (draftPreviewError ?? "프롬프트를 갱신할 수 없습니다.")
                  : draftPromptPreview || "일치하는 조합을 찾지 못했습니다."}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 이미지 뷰어 */}
      <div className="relative flex-1 overflow-y-auto p-2 md:py-1">
        {visibleImages.length === 0 && activeJobsForSelection.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center space-y-4 text-muted-foreground">
            <Maximize2Icon className="h-10 w-10 opacity-20" />
            <p className="text-sm font-bold">생성된 이미지가 없습니다</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedFilename) onRegenerate(selectedFilename)
              }}
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
                ? `repeat(auto-fill, minmax(${String(thumbnailSize)}px, 1fr))`
              : `repeat(auto-fill, ${String(thumbnailSize)}px)`,
            }}
          >
            {activeJobsForSelection.map((job) => (
              <ActiveJobImageCard
                key={job.id}
                job={job}
                backendUrl={backendUrl}
                previewToken={
                  job.workerId !== null
                    ? workerPreviews[job.workerId]
                    : undefined
                }
                isCancelling={cancellingJobIds.has(job.id)}
                onCancel={handleCancelActiveJob}
              />
            ))}
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
                          onFocus={() => {
                            setFocusedIdx(idx)
                          }}
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
                            onClick={(e) => {
                              onToggleCompareImage(
                                `${selectedFilename}::${img.hash}`,
                                e
                              )
                            }}
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
                            className="absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/60 md:hidden"
                          >
                            <Maximize2Icon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenDetail?.(img)
                            }}
                            className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white opacity-100 shadow-lg backdrop-blur-sm transition-colors hover:bg-black/60 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <InfoIcon className="h-5 w-5 md:h-4 md:w-4" />
                          </button>
                          {idx < 9 && (
                            <div className="absolute top-2 left-2 hidden backdrop-blur-sm md:block md:opacity-0 md:group-hover:opacity-100">
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
                    <ContextMenuItem
                      onClick={() => {
                        onSetPreviewHash(img.hash)
                      }}
                    >
                      <Maximize2Icon className="h-4 w-4" /> 이미지 보기
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onOpenDetail?.(img)}>
                      <InfoIcon className="h-4 w-4" /> 상세 정보
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onInpaint?.(img)}>
                      <BrushIcon className="h-4 w-4" /> 인페인팅 편집
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onEdit?.(img)}>
                      <Edit3Icon className="h-4 w-4" /> 이미지 편집
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => {
                        if (img.cegTemplate?.trim()) {
                          void navigator.clipboard
                            .writeText(img.cegTemplate)
                            .then(() => {
                              toast.success(
                                "CEG 문법이 클립보드에 복사되었습니다."
                              )
                            })
                            .catch(() => {
                              toast.error("CEG 문법 복사에 실패했습니다.")
                            })
                        }
                      }}
                      disabled={!img.cegTemplate?.trim()}
                    >
                      <FileCode2Icon className="h-4 w-4" /> CEG 문법 복사
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => {
                        void copyImageUrlToClipboard(
                          `${backendUrl}/saved-images/${img.hash}`
                        )
                          .then(() => {
                            toast.success("이미지가 클립보드에 복사되었습니다.")
                          })
                          .catch(() => {
                            toast.error("이미지 복사에 실패했습니다.")
                          })
                      }}
                    >
                      <CopyIcon className="h-4 w-4" /> 이미지 복사
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {isSelected ? (
                      <ContextMenuItem onClick={onCancelApproval}>
                        <XIcon className="h-4 w-4" /> 선택 취소
                      </ContextMenuItem>
                    ) : isRejected ? (
                      <ContextMenuItem
                        onClick={() => {
                          void setStatus(img.hash, "pending")
                        }}
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
                          onClick={() => {
                            void setStatus(img.hash, "rejected")
                          }}
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
                    onClick={(e) => {
                      onToggleCompareImage(`${filename}::${hash}`, e)
                    }}
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
