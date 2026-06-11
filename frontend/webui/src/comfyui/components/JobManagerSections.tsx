import { memo, useRef, useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Clock,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  Ban,
  ChevronRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

import { Progress } from "@/components/ui/progress"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

import { cn } from "@/lib/utils"

import type { JobStatus, JobView, WorkerView } from "../types/Message"
import { StatusPill } from "@/components/ceg/StatusPill"
import { StatCard } from "@/components/ceg/StatCard"
import {
  formatETA,
  formatDuration,
  timeAgo,
  jobDuration,
  getOverallProgress,
} from "../utils/timeEstimation"

// ── props interfaces (keep in sync with JobManagerPanel) ──────────────

export interface SessionPickerProps {
  markers: SessionMarker[]
  sessionJobCounts: Map<string, number>
  sortedMarkers: SessionMarker[]
  selectedId: string
  activeState: ActiveStateInfo | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelectSession: (id: string) => void
  onCreateNew: () => void
}

export interface SessionMarker {
  id: string
  startAt: number
  label: string
}

export interface ActiveStateInfo {
  activeSessionId: string
}

export interface RunningJobsBannerProps {
  jobs: JobView[]
  allJobs?: JobView[]
  workers: WorkerView[]
}

export interface JobStatBarProps {
  counts: Record<JobStatus | "active", number>
  sessionJobs: JobView[]
  progressCalculation:
    | "done"
    | "doneOrCancelled"
    | "doneOrFailed"
    | "excludeFromDenominator"
}

export interface JobTableProps {
  filterTab: string
  sortKey: string
  sortDir: "asc" | "desc"
  onSort: (key: string) => void
  pagedJobs: JobView[]
  totalPages: number
  page: number
  onPageChange: (p: number) => void
  selectedForDelete: Set<string>
  onToggleSelect: (jobId: string) => void
  backendUrl: string
  showPagination: boolean
  fetchedImages: Map<string, string[]>
  fetchJobImages: (jobId: string) => void
  workers: WorkerView[]
  onMoveJob: (jobId: string, targetWorkerId: string) => void
}
export interface JobDetailSheetProps {
  job: JobView | null
  backendUrl: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  fetchedImages: Map<string, string[]>
  // Actions
  onCancel: () => void
  onRetry: () => void
  onDelete: () => void
}
// ── sub-components ──────────────────────────────────────────────────────

const SortIcon = memo(function SortIcon({
  isActive,
  dir,
}: {
  isActive: boolean
  dir: "asc" | "desc"
}) {
  if (!isActive) return <ArrowUpDown className="h-3 w-3 shrink-0 opacity-20" />
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 shrink-0" />
  ) : (
    <ArrowDown className="h-3 w-3 shrink-0" />
  )
})

export const SessionPopover = memo(function SessionPopover({
  markers,
  sessionJobCounts,
  sortedMarkers,
  selectedId,
  activeState,
  isOpen,
  onOpenChange,
  onSelectSession,
  onCreateNew,
}: SessionPickerProps) {
  // Hooks must be called before any early returns
  const ref = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (isOpen && ref.current) {
      const el = ref.current
      const isVisible = el.offsetParent !== null || getComputedStyle(el).position === "fixed"
      if (isVisible) {
        setRect(el.getBoundingClientRect())
      } else {
        setRect(null)
      }
    } else {
      setRect(null)
    }
  }, [isOpen])

  if (markers.length === 0) return null

  const sessionButtonLabel = (() => {
    const m = markers.find((mm) => mm.id === selectedId)
    const count = sessionJobCounts.get(selectedId) ?? 0
    return m ? `${m.label} (${count})` : `(${count})`
  })()

  const isActive = activeState?.activeSessionId

  const dropdownStyle = rect
    ? (() => {
        const popupWidth = window.innerWidth < 768 ? window.innerWidth - 32 : 304
        let left = rect.left
        if (left + popupWidth > window.innerWidth - 16) {
          left = window.innerWidth - popupWidth - 16
        }
        if (left < 16) left = 16
        return {
          top: rect.bottom + 4,
          left,
          width: popupWidth,
        }
      })()
    : null

  const dropdownContent = isOpen && dropdownStyle && (
    <div
      className="fixed z-50 rounded-xl border border-line-strong/60 bg-popover/85 p-1 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-200"
      style={dropdownStyle}
    >
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
              세션 히스토리
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-md px-2 text-[10px] font-extrabold text-info hover:bg-info-bg/30"
              onClick={onCreateNew}
            >
              + 새 세션 생성
            </Button>
          </div>
          <ScrollArea className="max-h-80 pr-1.5">
            <div className="space-y-0.5 p-1">
              {sortedMarkers.map((m) => {
                const count = sessionJobCounts.get(m.id) ?? 0
                const isSelected = m.id === selectedId
                const mIsActive = m.id === isActive

                return (
                  <div
                    key={m.id}
                    className={cn(
                      "group/session-item rounded-lg p-0.5 transition-colors",
                      isSelected ? "bg-muted/65" : "hover:bg-muted/30"
                    )}
                  >
                    <Button
                      variant="ghost"
                      className="h-9 w-full justify-start gap-2.5 px-2.5 text-xs"
                      onClick={() => {
                        onSelectSession(m.id)
                        onOpenChange(false)
                      }}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full transition-all duration-300",
                          mIsActive
                            ? "animate-pulse bg-ok shadow-[0_0_8px_rgba(var(--ok),0.5)]"
                            : "bg-muted-foreground/30 group-hover/session-item:bg-muted-foreground/50"
                        )}
                      />
                      <span
                        className={cn(
                          "flex-1 truncate text-left font-semibold tracking-tight transition-colors",
                          isSelected
                            ? "font-bold text-foreground"
                            : "text-muted-foreground group-hover/session-item:text-foreground"
                        )}
                      >
                        {m.label}
                      </span>
                      <span
                        className={cn(
                          "mono rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-black transition-colors",
                          isSelected
                            ? "bg-background text-foreground"
                            : "text-muted-foreground group-hover/session-item:bg-muted/80"
                        )}
                      >
                        {count}
                      </span>
                    </Button>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
    </div>
  )

  return (
    <>
      <div ref={ref}>
        <button
          onClick={() => onOpenChange(!isOpen)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition-all hover:bg-muted/70 active:scale-95",
            isOpen ? "bg-muted/65" : ""
          )}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ok"></span>
          </span>
          <span className="max-w-40 truncate tracking-wide">
            {sessionButtonLabel}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </div>
      {dropdownContent && typeof document !== "undefined" && createPortal(dropdownContent, document.body)}
    </>
  )
})

export const JobStatBar = memo(function JobStatBar({
  counts,
  sessionJobs,
  progressCalculation,
}: JobStatBarProps) {
  const total =
    counts.pending +
    counts.queued +
    counts.running +
    counts.done +
    counts.error +
    counts.cancelled
  const done = counts.done
  const error = counts.error
  const cancelled = counts.cancelled

  const runningJobs = sessionJobs.filter((j) => j.status === "running")
  const runningProgressSum = runningJobs.reduce((sum, j) => sum + getOverallProgress(j), 0) / 100

  let numerator: number
  let denominator: number
  switch (progressCalculation) {
    case "doneOrCancelled":
      numerator = done + cancelled + runningProgressSum
      denominator = total
      break
    case "doneOrFailed":
      numerator = done + error + runningProgressSum
      denominator = total
      break
    case "excludeFromDenominator":
      numerator = done + runningProgressSum
      denominator = Math.max(0, total - error - cancelled)
      break
    default:
      numerator = done + runningProgressSum
      denominator = total
  }
  const progress = denominator > 0 ? Math.min(100, Math.max(0, (numerator / denominator) * 100)) : 0

  return (
    <div className="flex flex-col">
      <div className="grid shrink-0 grid-cols-3 divide-x divide-y border-b md:flex md:items-stretch md:divide-y-0">
        <StatCard
          label="대기"
          value={counts.pending}
          color="text-ink-2"
          faded={counts.pending === 0}
          icon={Clock}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="큐"
          value={counts.queued}
          color="text-warn"
          faded={counts.queued === 0}
          icon={Layers}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="진행"
          value={counts.running}
          color="text-info"
          faded={counts.running === 0}
          icon={Activity}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="완료"
          value={counts.done}
          color="text-ok"
          faded={counts.done === 0}
          icon={CheckCircle2}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="실패"
          value={counts.error}
          color="text-bad"
          faded={counts.error === 0}
          icon={AlertCircle}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="취소"
          value={counts.cancelled}
          faded={counts.cancelled === 0}
          icon={Ban}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
      </div>

      <div className="space-y-4 p-4 md:space-y-2 md:p-3">
        <div className="flex items-center justify-between text-[11px] font-black uppercase">
          <span className="text-muted-foreground">세션 전체 진행률</span>
          <span className="mono tabular-nums">
            {numerator % 1 === 0 ? numerator : numerator.toFixed(1)}/{denominator} ({Math.round(progress)}% )
          </span>
        </div>
        <Progress
          value={progress}
          className="h-2 w-full shadow-inner [&>[data-slot=progress-indicator]]:bg-ok"
        />
      </div>
    </div>
  )
})

export const RunningJobsBanner = memo(function RunningJobsBanner({
  jobs,
  allJobs,
  workers,
}: RunningJobsBannerProps) {
  if (workers.length === 0) {
    if (jobs.length === 0) {
      return (
        <div className="py-10 text-center text-sm font-bold text-balance text-muted-foreground/40">
          현재 실행 중인 작업이 없습니다.
        </div>
      )
    }
    // Fallback: render jobs directly
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {jobs.map((j) => {
          const overallPercent = getOverallProgress(j)
          const etaStr =
            j.startedAt && overallPercent > 0 && overallPercent < 100
              ? formatETA(j.startedAt, overallPercent, allJobs)
              : null
          return (
            <div
              key={j.id}
              className="shrink-0 space-y-2 rounded-xl border border-info/20 bg-info/5 p-4 shadow-sm animate-in fade-in-0 duration-300"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[13px] font-black text-info">
                  {j.filename}
                </span>
                {etaStr != null && (
                  <span className="shrink-0 text-[11px] font-black text-info/70 tabular-nums">
                    {etaStr}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground/80">
                <span className="truncate">
                  {j.currentNodeName
                    ? `노드 (${j.currentNodeName}) 처리 중...`
                    : "노드 처리 중..."}
                </span>
                <span className="mono">{Math.round(j.progressPercent)}%</span>
              </div>
              <Progress
                value={j.progressPercent}
                className="h-1.5 w-full [&>[data-slot=progress-indicator]]:bg-info"
              />
              {j.totalNodeCount > 0 && (
                <>
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground/80">
                    <span className="truncate">
                      전체 노드 {j.completedNodeCount}/{j.totalNodeCount}
                    </span>
                    <span className="mono">{Math.round(overallPercent)}%</span>
                  </div>
                  <Progress
                    value={overallPercent}
                    className="h-1.5 w-full [&>[data-slot=progress-indicator]]:bg-ok"
                  />
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Active workers view in grid
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {workers.map((w) => {
        const runningJob = jobs.find(
          (j) => j.workerId === w.id && (j.status === "running" || j.status === "queued")
        ) || (w.currentJobId ? jobs.find((j) => j.id === w.currentJobId) : undefined)

        if (!w.alive) {
          return (
            <div
              key={w.id}
              className="shrink-0 space-y-2.5 rounded-xl border border-destructive/20 bg-destructive/5 p-4 shadow-sm opacity-60 transition-all duration-300"
            >
              <div className="flex items-center justify-between gap-2 border-b border-destructive/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="font-mono text-[12px] font-bold text-destructive">
                    {w.id}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground/85 border">
                    {w.workerType ?? "comfyui"}
                  </span>
                </div>
                <span className="text-[10px] font-black text-destructive uppercase tracking-wider">
                  오프라인
                </span>
              </div>
              <div className="py-2.5 text-center text-xs font-bold text-muted-foreground/50">
                워커의 전원이 꺼져있거나 연결이 끊어졌습니다.
              </div>
            </div>
          )
        }

        if (w.busy) {
          const overallPercent = runningJob ? getOverallProgress(runningJob) : 0
          const etaStr =
            runningJob?.startedAt && overallPercent > 0 && overallPercent < 100
              ? formatETA(runningJob.startedAt, overallPercent, allJobs)
              : null

          return (
            <div
              key={w.id}
              className="shrink-0 space-y-2.5 rounded-xl border border-info/30 bg-info/5 p-4 shadow-sm transition-all duration-300"
            >
              <div className="flex items-center justify-between gap-2 border-b border-info/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(var(--warn),0.5)]" />
                  <span className="font-mono text-[12px] font-bold text-foreground">
                    {w.id}
                  </span>
                  <span className="rounded bg-info/10 border border-info/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-info">
                    {w.workerType ?? "comfyui"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {etaStr != null && (
                    <span className="shrink-0 text-[10px] font-black text-info/80 tabular-nums">
                      {etaStr}
                    </span>
                  )}
                  <span className="text-[10px] font-black text-info uppercase tracking-wider">
                    {runningJob?.status === "queued" ? "대기 중" : "작업 중"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[12px] font-black text-foreground/90">
                    📄 {runningJob ? runningJob.filename : "작업 요청 처리 중..."}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground/80">
                    <span className="truncate">
                      {runningJob?.currentNodeName
                        ? `노드 (${runningJob.currentNodeName})`
                        : runningJob?.status === "queued"
                        ? "작업 준비 중..."
                        : "노드 처리 중..."}
                    </span>
                    <span className="mono">{runningJob ? Math.round(runningJob.progressPercent) : 0}%</span>
                  </div>
                  <Progress
                    value={runningJob ? runningJob.progressPercent : 0}
                    className="h-1.5 w-full [&>[data-slot=progress-indicator]]:bg-info"
                  />
                </div>
                {runningJob && runningJob.totalNodeCount > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground/80">
                      <span className="truncate">
                        전체 노드 {runningJob.completedNodeCount}/{runningJob.totalNodeCount}
                      </span>
                      <span className="mono">{Math.round(overallPercent)}%</span>
                    </div>
                    <Progress
                      value={overallPercent}
                      className="h-1.5 w-full [&>[data-slot=progress-indicator]]:bg-ok"
                    />
                  </div>
                )}
              </div>
            </div>
          )
        }

        // Idle worker
        return (
          <div
            key={w.id}
            className="shrink-0 space-y-2.5 rounded-xl border border-line-strong/30 bg-muted/20 p-4 shadow-sm opacity-80 transition-all duration-300"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-mono text-[12px] font-bold text-muted-foreground">
                  {w.id}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground/85 border">
                  {w.workerType ?? "comfyui"}
                </span>
              </div>
              <span className="text-[10px] font-black text-green-600 dark:text-green-400 uppercase tracking-wider">
                유휴 상태
              </span>
            </div>
            <div className="py-2.5 text-center text-xs font-bold text-muted-foreground/60">
              새로운 작업을 수행할 준비가 되었습니다.
            </div>
          </div>
        )
      })}
    </div>
  )
})
export const JobRow = memo(function JobRow({
  job,
  selectedForDelete,
  onToggleSelect,
  fetchJobImages,
  workers,
  onMoveJob,
  onJobMouseEnter,
  onJobMouseLeave,
  onWorkerMouseEnter,
  onWorkerMouseLeave,
}: {
  job: JobView
  selectedForDelete: Set<string>
  onToggleSelect: (jobId: string) => void
  fetchJobImages: (jobId: string) => void
  workers: WorkerView[]
  onMoveJob: (jobId: string, targetWorkerId: string) => void
  onJobMouseEnter: (job: JobView, rect: DOMRect) => void
  onJobMouseLeave: () => void
  onWorkerMouseEnter: (job: JobView, workerId: string, rect: DOMRect) => void
  onWorkerMouseLeave: () => void
}) {
  const isActive =
    job.status === "pending" ||
    job.status === "queued" ||
    job.status === "running"
  const isFailed = job.status === "error" || job.status === "cancelled"
  const dur = jobDuration(job)

  const statusColorMap: Record<string, string> = {
    done: "bg-ok",
    error: "bg-bad",
    cancelled: "bg-muted-foreground/30",
    running: "bg-info shadow-[0_0_8px_rgba(var(--info),0.8)] animate-pulse",
    queued: "bg-warn",
    pending: "bg-ink-2",
  }
  const accentColor = statusColorMap[job.status] || "bg-muted-foreground/30"

  // String-to-color hash for filename dot indicator
  let hash = 0
  for (let i = 0; i < job.filename.length; i++) {
    hash = job.filename.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  const dotColor = "#" + "00000".substring(0, 6 - c.length) + c

  const workerLabel = job.workerId ? job.workerId.slice(0, 8) : "—"

  const workerCell = (
    <TableCell onClick={(e) => e.stopPropagation()} className="px-2 font-mono text-[11px] w-[80px]">
      {job.workerId ? (
        <span
          className="cursor-help rounded bg-muted/60 px-1.5 py-0.5 font-bold hover:bg-muted text-muted-foreground select-none"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            onWorkerMouseEnter(job, job.workerId!, rect)
          }}
          onMouseLeave={onWorkerMouseLeave}
        >
          {workerLabel}
        </span>
      ) : (
        <span className="text-muted-foreground/45">—</span>
      )}
    </TableCell>
  )

  const row = (
    <TableRow
      key={job.id}
      className="group/row relative cursor-pointer transition-all duration-300 hover:bg-muted/30 hover:shadow-sm"
      onClick={() => fetchJobImages(job.id)} // open detail via click (handled by parent's onClick)
      onMouseEnter={(e) => {
        if (job.status === "done") {
          const rect = e.currentTarget.getBoundingClientRect()
          onJobMouseEnter(job, rect)
        }
      }}
      onMouseLeave={onJobMouseLeave}
    >
      {selectedForDelete.size > 0 && (
        <TableCell className="px-2 py-4">
          <Checkbox
            checked={selectedForDelete.has(job.id)}
            onCheckedChange={() => onToggleSelect(job.id)}
          />
        </TableCell>
      )}
      <TableCell className="px-2 py-4 text-center">
        <div
          className={cn(
            "absolute top-1.5 bottom-1.5 left-0 w-[3px] origin-center scale-y-60 rounded-r-md transition-transform duration-300 group-hover/row:scale-y-100",
            accentColor
          )}
        />
        <StatusPill status={job.status} />
      </TableCell>
      <TableCell className="px-2 py-4">
        <div className="xs:max-w-40 flex max-w-[120px] items-center gap-2 truncate md:max-w-52">
          <span
            className="h-2 w-2 shrink-0 rounded-full transition-transform duration-300 group-hover/row:scale-125"
            style={{ backgroundColor: dotColor }}
          />
          <span className="truncate text-[13px] font-bold text-foreground transition-colors group-hover/row:text-info md:text-[11px]">
            {job.filename}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-[10px] text-muted-foreground tabular-nums">
        {timeAgo(job.createdAt)}
      </TableCell>
      <TableCell className="w-16 text-[10px] text-muted-foreground tabular-nums">
        {dur != null ? formatDuration(dur) : "—"}
      </TableCell>
      {workerCell}
      <TableCell onClick={(e) => e.stopPropagation()} className="px-2">
        {job.status === "pending" ? (
          <select
            value={job.targetWorkerId || "auto"}
            onChange={(e) => onMoveJob(job.id, e.target.value === "auto" ? "" : e.target.value)}
            className="h-6 w-24 rounded-md border border-input bg-background px-1.5 py-0.5 text-[10px] font-bold text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
          >
            <option value="auto">자동</option>
            {workers
              .filter((w) => (w.workerType === "comfyui" || !w.workerType) && w.alive)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.id.slice(0, 8)}
                </option>
              ))}
          </select>
        ) : isActive ? (
          <span className="text-[10px] text-muted-foreground">진행중</span>
        ) : isFailed ? (
          <span className="text-[10px] text-muted-foreground">실패</span>
        ) : null}
      </TableCell>
    </TableRow>
  )

  return row
})

export const JobTableSection = memo(function JobTableSection({
  filterTab,
  sortKey,
  sortDir,
  onSort,
  pagedJobs,
  totalPages,
  page,
  onPageChange,
  selectedForDelete,
  onToggleSelect,
  backendUrl,
  fetchedImages,
  fetchJobImages,
  showPagination,
  workers,
  onMoveJob,
}: JobTableProps) {
  const [hoveredJob, setHoveredJob] = useState<{
    job: JobView
    rect: DOMRect
  } | null>(null)

  const [hoveredWorker, setHoveredWorker] = useState<{
    job: JobView
    workerId: string
    rect: DOMRect
  } | null>(null)

  const jobTimeoutRef = useRef<number | null>(null)
  const workerTimeoutRef = useRef<number | null>(null)

  const handleJobMouseEnter = useCallback((job: JobView, rect: DOMRect) => {
    if (jobTimeoutRef.current) clearTimeout(jobTimeoutRef.current)
    jobTimeoutRef.current = window.setTimeout(() => {
      setHoveredJob({ job, rect })
    }, 400)
  }, [])

  const handleJobMouseLeave = useCallback(() => {
    if (jobTimeoutRef.current) clearTimeout(jobTimeoutRef.current)
    setHoveredJob(null)
  }, [])

  const handleWorkerMouseEnter = useCallback((job: JobView, workerId: string, rect: DOMRect) => {
    if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current)
    workerTimeoutRef.current = window.setTimeout(() => {
      setHoveredWorker({ job, workerId, rect })
    }, 200)
  }, [])

  const handleWorkerMouseLeave = useCallback(() => {
    if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current)
    setHoveredWorker(null)
  }, [])

  useEffect(() => {
    return () => {
      if (jobTimeoutRef.current) clearTimeout(jobTimeoutRef.current)
      if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current)
    }
  }, [])

  const jobStyle: React.CSSProperties | undefined = hoveredJob ? {
    left: `${hoveredJob.rect.left - 12}px`,
    top: `${hoveredJob.rect.top}px`,
    transform: "translateX(-100%)",
    pointerEvents: "none",
  } : undefined

  const workerStyle: React.CSSProperties | undefined = hoveredWorker ? {
    left: `${hoveredWorker.rect.left}px`,
    top: `${hoveredWorker.rect.top - 8}px`,
    transform: "translateY(-100%)",
    pointerEvents: "none",
  } : undefined

  const tooltips = createPortal(
    <>
      {hoveredJob && (
        <div
          className="fixed z-[100] rounded-xl border border-line-strong/60 bg-popover/90 p-2.5 shadow-2xl backdrop-blur-md animate-in fade-in-0 duration-200 pointer-events-none hidden md:block"
          style={jobStyle}
        >
          {fetchedImages.get(hoveredJob.job.id) &&
          fetchedImages.get(hoveredJob.job.id)!.length > 0 ? (
            <div className="flex gap-1.5">
              {fetchedImages
                .get(hoveredJob.job.id)!
                .slice(0, 6)
                .map((h, i) => (
                  <img
                    key={h}
                    src={`${backendUrl}/saved-images/${h}`}
                    alt={`Preview ${i + 1}`}
                    className="h-16 w-16 rounded-lg border border-line object-cover"
                  />
                ))}
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Skeleton className="h-16 w-16 rounded-lg bg-muted-foreground/10" />
              <Skeleton className="h-16 w-16 rounded-lg bg-muted-foreground/10" />
              <Skeleton className="h-16 w-16 rounded-lg bg-muted-foreground/10" />
            </div>
          )}
        </div>
      )}

      {hoveredWorker && (
        <div
          className="fixed z-[100] w-72 rounded-xl border border-line bg-popover/90 p-3 shadow-2xl backdrop-blur-md animate-in fade-in-0 duration-200 pointer-events-none"
          style={workerStyle}
        >
          {(() => {
            const { job, workerId } = hoveredWorker
            const workerInfo = workers.find((w) => w.id === workerId)
            const statusColor = workerInfo
              ? workerInfo.alive
                ? workerInfo.busy
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
              : "text-muted-foreground"
            
            const statusLabel = workerInfo
              ? workerInfo.alive
                ? workerInfo.busy
                  ? "busy"
                  : "idle"
                : "down"
              : "offline"

            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-1 text-xs">
                  <span className="font-mono font-bold text-foreground">
                    {workerId}
                  </span>
                  {workerInfo && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                      {workerInfo.workerType ?? "comfyui"}
                    </span>
                  )}
                  <span className={cn("font-bold text-[10px]", statusColor)}>
                    {statusLabel}
                  </span>
                </div>
                {workerInfo && (
                  <div className="font-mono text-[10px] text-muted-foreground/80 truncate">
                    {workerInfo.url}
                  </div>
                )}
                {(job.status === "running" || job.status === "queued") && (
                  <div className="mt-1 space-y-1 bg-muted/20 rounded p-1.5">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground font-semibold">
                      <span className="truncate max-w-[190px] text-foreground/80">
                        📄 {job.filename}
                      </span>
                      <span className="mono font-bold tabular-nums">
                        {Math.round(getOverallProgress(job))}%
                      </span>
                    </div>
                    <Progress
                      value={getOverallProgress(job)}
                      className="h-1 w-full bg-muted/60 [&>[data-slot=progress-indicator]]:bg-info"
                    />
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </>,
    document.body
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Desktop Table View */}
      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <ScrollArea className="mx-2 mb-2 flex-1 min-h-0 rounded-lg border bg-panel shadow-inner">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-panel/95 shadow-sm backdrop-blur">
              <TableRow className="hover:bg-transparent">
                {filterTab === "failed" && selectedForDelete.size > 0 ? (
                  <TableHead className="w-8 px-2">
                    <Checkbox
                      checked={selectedForDelete.size > 0}
                      onCheckedChange={(checked) => {
                        if (checked) return // handled by parent
                      }}
                    />
                  </TableHead>
                ) : null}
                <TableHead className="px-2">
                  <button
                    onClick={() => onSort("status")}
                    className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground"
                  >
                    상태
                    <SortIcon isActive={sortKey === "status"} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="px-2">
                  <button
                    onClick={() => onSort("filename")}
                    className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground"
                  >
                    파일명
                    <SortIcon isActive={sortKey === "filename"} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="px-2">
                  <button
                    onClick={() => onSort("createdAt")}
                    className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground"
                  >
                    생성
                    <SortIcon isActive={sortKey === "createdAt"} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="px-2">
                  <button
                    onClick={() => onSort("duration")}
                    className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground"
                  >
                    소요
                    <SortIcon isActive={sortKey === "duration"} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="px-2 font-bold whitespace-nowrap">워커</TableHead>
                <TableHead className="w-12 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedJobs.map((j) => (
                <JobRow
                  key={j.id}
                  job={j}
                  selectedForDelete={selectedForDelete}
                  onToggleSelect={onToggleSelect}
                  fetchJobImages={fetchJobImages}
                  workers={workers}
                  onMoveJob={onMoveJob}
                  onJobMouseEnter={handleJobMouseEnter}
                  onJobMouseLeave={handleJobMouseLeave}
                  onWorkerMouseEnter={handleWorkerMouseEnter}
                  onWorkerMouseLeave={handleWorkerMouseLeave}
                />
              ))}
              {pagedJobs.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-80 p-0">
                    <Empty className="border-0 bg-transparent shadow-none">
                      <EmptyMedia variant="icon">
                        <div className="size-10 opacity-20" />
                      </EmptyMedia>
                      <EmptyHeader>
                        <EmptyTitle className="text-base font-black">
                          표시할 작업이 없습니다
                        </EmptyTitle>
                        <EmptyDescription className="text-[13px]">
                          필터 조건을 변경하거나 새로운 작업을 시작해보세요.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Mobile Card List View */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {/* Mobile card list */}
        <ScrollArea className="mx-2 mb-2 flex-1 min-h-0 rounded-lg bg-panel">
          <div className="space-y-2 py-2">
            {pagedJobs.map((job) => {
              const dur = jobDuration(job)
              const statusColorMap: Record<string, string> = {
                done: "bg-ok",
                error: "bg-bad",
                cancelled: "bg-muted-foreground/30",
                running:
                  "bg-info shadow-[0_0_8px_rgba(var(--info),0.8)] animate-pulse",
                queued: "bg-warn",
                pending: "bg-ink-2",
              }
              const accentColor =
                statusColorMap[job.status] || "bg-muted-foreground/30"

              // String-to-color hash for filename dot indicator
              let hash = 0
              for (let i = 0; i < job.filename.length; i++) {
                hash = job.filename.charCodeAt(i) + ((hash << 5) - hash)
              }
              const c = (hash & 0x00ffffff).toString(16).toUpperCase()
              const dotColor = "#" + "00000".substring(0, 6 - c.length) + c

              return (
                <div
                  key={job.id}
                  onClick={() => fetchJobImages(job.id)}
                  className="relative flex cursor-pointer items-center justify-between rounded-xl border border-line bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/10 active:bg-muted/20"
                >
                  {/* Left accent color indicator */}
                  <div
                    className={cn(
                      "absolute top-2.5 bottom-2.5 left-0 w-[3.5px] rounded-r-md",
                      accentColor
                    )}
                  />

                  <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-1.5">
                    {selectedForDelete.size > 0 && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mr-1 flex items-center"
                      >
                        <Checkbox
                          checked={selectedForDelete.has(job.id)}
                          onCheckedChange={() => onToggleSelect(job.id)}
                        />
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      {/* Filename and dot */}
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="truncate text-xs font-black text-foreground">
                          {job.filename}
                        </span>
                      </div>

                      {/* Status, Date, Duration */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-black tracking-tight text-muted-foreground uppercase">
                        <StatusPill
                          status={job.status}
                          className="origin-left scale-85 animate-none"
                        />
                        <span className="opacity-40">•</span>
                        <span>{timeAgo(job.createdAt)}</span>
                        {dur != null && (
                          <>
                            <span className="opacity-40">•</span>
                            <span className="scale-95 rounded bg-muted/80 px-1 font-mono text-foreground/80">
                              {formatDuration(dur)}
                            </span>
                          </>
                        )}
                        {job.workerId && (
                          <>
                            <span className="opacity-40">•</span>
                            <span className="scale-95 rounded bg-muted/80 px-1 font-mono text-[9px] font-bold text-foreground/80">
                              {job.workerId.slice(0, 8)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side indicator */}
                  <div className="flex shrink-0 items-center gap-1 pl-2 text-muted-foreground/30">
                    {job.status === "pending" ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <select
                          value={job.targetWorkerId || "auto"}
                          onChange={(e) => onMoveJob(job.id, e.target.value === "auto" ? "" : e.target.value)}
                          className="h-6 w-20 rounded-md border border-input bg-background px-1 py-0 text-[10px] font-bold text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
                        >
                          <option value="auto">자동</option>
                          {workers
                            .filter((w) => (w.workerType === "comfyui" || !w.workerType) && w.alive)
                            .map((w) => (
                              <option key={w.id} value={w.id}>{w.id.slice(0, 8)}</option>
                            ))}
                        </select>
                      </div>
                    ) : job.status === "running" || job.status === "queued" ? (
                      <span className="mr-1 animate-pulse text-[9px] font-black tracking-wider text-info uppercase">
                        {job.status === "queued" ? "Queued" : "Running"}
                      </span>
                    ) : null}
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              )
            })}

            {pagedJobs.length === 0 && (
              <div className="py-24 text-center">
                <Empty className="border-0 bg-transparent shadow-none">
                  <EmptyHeader>
                    <EmptyTitle className="text-base font-black">
                      표시할 작업이 없습니다
                    </EmptyTitle>
                    <EmptyDescription className="text-[12px]">
                      필터 조건을 변경하거나 새로운 작업을 시작해보세요.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {tooltips}

      {showPagination && (
        <div className="flex shrink-0 flex-col items-center gap-2 pb-4">
          <Pagination className="text-xs">
            <PaginationContent className="gap-1">
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => page > 1 && onPageChange(page - 1)}
                  className={cn(
                    "h-9 w-9 rounded-lg p-0",
                    page <= 1 && "pointer-events-none opacity-20"
                  )}
                />
              </PaginationItem>
              <div className="flex items-center px-4 text-sm font-black">
                {page} / {totalPages}
              </div>
              <PaginationItem>
                <PaginationNext
                  onClick={() => page < totalPages && onPageChange(page + 1)}
                  className={cn(
                    "h-9 w-9 rounded-lg p-0",
                    page >= totalPages && "pointer-events-none opacity-20"
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
})
