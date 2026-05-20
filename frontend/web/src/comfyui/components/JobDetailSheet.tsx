import { useState } from "react"
import { Check, Copy, ChevronDown, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusPill } from "@/components/ceg/StatusPill"
import { ImageViewer } from "./ImageViewer"
import { cn } from "@/lib/utils"
import { MS_PER_SECOND, COPIED_RESET_DELAY_MS } from "@/lib/constants"
import type { JobView } from "../types/Message"

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

function jobDuration(job: JobView): number | null {
  if (job.executionDurationMs != null) return job.executionDurationMs
  if (job.startedAt != null && job.finishedAt != null)
    return (job.finishedAt - job.startedAt) * MS_PER_SECOND
  return null
}

function ClipButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_RESET_DELAY_MS)
    })
  }
  return (
    <button
      className="absolute top-2 right-2 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
      onClick={handleCopy}
      title="복사"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

interface JobDetailSheetProps {
  job: JobView | null
  backendUrl: string
  fetchedImages: Map<string, string[]>
  onClose: () => void
  onCancel: (e: React.MouseEvent, jobId: string) => void
  onRetry: (e: React.MouseEvent, jobId: string) => void
  onDelete: (e: React.MouseEvent, jobId: string) => void
}

export function JobDetailSheet({
  job,
  backendUrl,
  fetchedImages,
  onClose,
  onCancel,
  onRetry,
  onDelete,
}: JobDetailSheetProps) {
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  return (
    <Sheet
      open={job !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        className="flex w-full flex-col gap-4 overflow-y-auto sm:min-w-105"
        onPointerDownOutside={(e) => {
          if (lightboxUrls !== null) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (lightboxUrls !== null) e.preventDefault()
        }}
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-black tracking-tight">작업 상세</SheetTitle>
        </SheetHeader>
        {job && (
          <div className="flex flex-col gap-5 mt-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusPill status={job.status} />
                <span className="mono rounded bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                  ID: {job.id.slice(0, 8)}…
                </span>
              </div>
              <p className="font-mono text-sm font-black text-foreground">
                📄 {job.filename}
              </p>

              {job.prompt && (
                <div className="relative rounded-lg border bg-muted/40 p-3 group/prompt">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-wider text-muted-foreground uppercase">
                      프롬프트
                    </span>
                  </div>
                  <ScrollArea className="h-32">
                    <p className="pr-6 font-mono text-xs leading-relaxed text-foreground select-all whitespace-pre-wrap break-all">
                      {job.prompt}
                    </p>
                  </ScrollArea>
                  <ClipButton text={job.prompt} />
                </div>
              )}

              {job.error && (
                <div className="relative rounded-lg border border-destructive/20 bg-destructive/10 p-3 shadow-inner">
                  <div className="flex items-center gap-1.5 text-destructive mb-1 text-[11px] font-black tracking-widest uppercase">
                    <AlertCircle className="h-4 w-4" /> 에러 로그
                  </div>
                  <p className="font-mono text-xs text-destructive/90 pr-8 leading-relaxed whitespace-pre-wrap break-all">
                    {job.error}
                  </p>
                  <ClipButton text={job.error} />
                </div>
              )}
            </div>

            {/* Visual Timeline */}
            <div className="space-y-3 rounded-2xl border bg-muted/10 p-4">
              <h4 className="text-[10px] font-black tracking-widest text-muted-foreground uppercase pb-1.5 border-b">
                진행 타임라인
              </h4>
              <div className="flex flex-col gap-4 mt-2">
                <div className="relative flex gap-3 pl-6">
                  <div className={cn("absolute left-2.25 top-2.5 bottom-[-16px] w-0.5 bg-line-strong/60", job.startedAt && "bg-info/60")} />
                  <div className="absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full bg-ink-2 ring-4 ring-ink-2/15" />
                  <div className="flex-1 flex justify-between items-baseline gap-2">
                    <span className="text-xs font-bold text-foreground">작업 생성됨</span>
                    <span className="mono text-[10px] text-muted-foreground tabular-nums">
                      {new Date(job.createdAt * MS_PER_SECOND).toLocaleString()}
                    </span>
                  </div>
                </div>

                {job.startedAt ? (
                  <div className="relative flex gap-3 pl-6">
                    <div className={cn("absolute left-2.25 top-2.5 bottom-[-16px] w-0.5 bg-line-strong/60", job.finishedAt && "bg-ok/60")} />
                    <div className="absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full bg-info ring-4 ring-info/15 animate-pulse" />
                    <div className="flex-1 flex justify-between items-baseline gap-2">
                      <span className="text-xs font-bold text-foreground">렌더링 시작</span>
                      <span className="mono text-[10px] text-muted-foreground tabular-nums">
                        {new Date(job.startedAt * MS_PER_SECOND).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="relative flex gap-3 pl-6 opacity-35">
                    <div className="absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full bg-muted-foreground/30 ring-4 ring-muted/15" />
                    <div className="flex-1 flex justify-between items-baseline gap-2">
                      <span className="text-xs font-bold text-muted-foreground">렌더링 대기 중</span>
                      <span className="mono text-[10px] text-muted-foreground/80">—</span>
                    </div>
                  </div>
                )}

                {job.finishedAt ? (
                  <div className="relative flex gap-3 pl-6">
                    <div className={cn(
                      "absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full ring-4",
                      job.status === "error" || job.status === "cancelled"
                        ? "bg-bad ring-bad/15"
                        : "bg-ok ring-ok/15"
                    )} />
                    <div className="flex-1 flex justify-between items-baseline gap-2">
                      <span className="text-xs font-bold text-foreground">
                        {job.status === "error" ? "렌더링 실패" : job.status === "cancelled" ? "렌더링 취소" : "렌더링 완료"}
                      </span>
                      <span className="mono text-[10px] text-muted-foreground tabular-nums">
                        {new Date(job.finishedAt * MS_PER_SECOND).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="relative flex gap-3 pl-6 opacity-35">
                    <div className="absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full bg-muted-foreground/30 ring-4 ring-muted/15" />
                    <div className="flex-1 flex justify-between items-baseline gap-2">
                      <span className="text-xs font-bold text-muted-foreground">렌더링 완료 대기</span>
                      <span className="mono text-[10px] text-muted-foreground/80">—</span>
                    </div>
                  </div>
                )}
              </div>

              {jobDuration(job) != null && (
                <div className="mt-3.5 pt-3.5 border-t border-line/60 flex justify-between items-center text-xs">
                  <span className="font-extrabold text-muted-foreground">총 소요 시간</span>
                  <span className="mono font-black text-foreground bg-muted rounded px-2 py-0.5 tabular-nums">
                    {formatDuration(jobDuration(job)!)}
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {(job.status === "pending" ||
                job.status === "queued" ||
                job.status === "running") && (
                  <Button
                    size="lg"
                    variant="destructive"
                    className="h-12 flex-1 rounded-xl font-bold"
                    onClick={(e) => {
                      onCancel(e, job.id)
                      onClose()
                    }}
                  >
                    취소
                  </Button>
                )}
              {(job.status === "error" || job.status === "cancelled") && (
                <>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 flex-1 rounded-xl font-bold"
                    onClick={(e) => {
                      onRetry(e, job.id)
                      onClose()
                    }}
                  >
                    재시도
                  </Button>
                  <Button
                    size="lg"
                    variant="destructive"
                    className="h-12 flex-1 rounded-xl font-bold"
                    onClick={(e) => {
                      onDelete(e, job.id)
                      onClose()
                    }}
                  >
                    삭제
                  </Button>
                </>
              )}
            </div>

            {/* Generated images */}
            {fetchedImages.get(job.id) &&
              fetchedImages.get(job.id)!.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-black tracking-widest text-muted-foreground uppercase">
                    생성 이미지 ({fetchedImages.get(job.id)!.length})
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {fetchedImages.get(job.id)!.map((h, i) => {
                      const url = `${backendUrl}/saved-images/${h}`
                      return (
                        <button
                          key={h}
                          onClick={() => {
                            setLightboxUrls(
                              fetchedImages.get(job.id)!.map(
                                (hh) => `${backendUrl}/saved-images/${hh}`
                              )
                            )
                            setLightboxIndex(i)
                          }}
                          className="block w-full overflow-hidden rounded-lg border shadow-sm"
                        >
                          <img
                            src={url}
                            alt={`Generated ${i}`}
                            loading="lazy"
                            className="h-auto w-full object-cover transition-opacity hover:opacity-80"
                          />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
          </div>
        )}

        {lightboxUrls && (
          <ImageViewer
            src={lightboxUrls[lightboxIndex]!}
            isOpen={lightboxUrls !== null}
            onClose={() => setLightboxUrls(null)}
          >
            {lightboxUrls.length > 1 && (
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 rounded-full border-white/10 bg-white/5 p-0 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={() => setLightboxIndex((i) => Math.max(0, i - 1))}
                    disabled={lightboxIndex === 0}
                  >
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </Button>
                  <span className="font-mono text-[11px] font-bold text-white/60">
                    {lightboxIndex + 1} / {lightboxUrls.length}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 rounded-full border-white/10 bg-white/5 p-0 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={() =>
                      setLightboxIndex((i) =>
                        Math.min(lightboxUrls.length - 1, i + 1)
                      )
                    }
                    disabled={lightboxIndex === lightboxUrls.length - 1}
                  >
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </Button>
                </div>

                <div className="flex gap-2 p-1.5 rounded-xl border border-white/5 bg-white/5 backdrop-blur-md overflow-x-auto max-w-[90vw] no-scrollbar">
                  {lightboxUrls.map((url, i) => {
                    const isSelected = i === lightboxIndex
                    return (
                      <button
                        key={url}
                        className={cn(
                          "h-12 w-12 rounded-lg overflow-hidden border-2 transition-all duration-300 relative scale-95 cursor-pointer",
                          isSelected
                            ? "border-info ring-2 ring-info/30 scale-100 shadow-md"
                            : "border-transparent opacity-50 hover:opacity-100 hover:scale-98"
                        )}
                        onClick={() => setLightboxIndex(i)}
                      >
                        <img src={url} alt={`Thumbnail ${i}`} className="h-full w-full object-cover" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </ImageViewer>
        )}
      </SheetContent>
    </Sheet>
  )
}
