import { memo } from "react"
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
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import type { JobStatus, JobView } from "../types/Message"
import { StatusPill } from "@/components/ceg/StatusPill"
import { StatCard } from "@/components/ceg/StatCard"

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
}

export interface JobStatBarProps {
  counts: Record<JobStatus | "active", number>
  sessionJobs: JobView[]
}

export interface JobListToolbarProps {
  filterTab: string
  onFilterTabChange: (v: string) => void
  sessionJobCount: number
  activeCount: number
  doneCount: number
  failedCount: number
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
  // Hover/fetch
  fetchedImages: Map<string, string[]>
  fetchJobImages: (jobId: string) => void
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

// ── pure helpers (moved from JobManagerPanel) ──────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

function timeAgo(epochSec: number): string {
  const diff = Date.now() - epochSec * 1000
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return `${Math.floor(diff / 86_400_000)}일 전`
}

function estimateRemaining(startedAtSec: number, progressPercent: number): number | null {
  if (progressPercent <= 0 || progressPercent >= 100) return null
  const elapsedSec = Date.now() / 1000 - startedAtSec
  if (elapsedSec <= 0) return null
  const totalEstimatedSec = (elapsedSec / progressPercent) * 100
  return totalEstimatedSec - elapsedSec
}

function formatETA(totalSeconds: number): string {
  if (totalSeconds <= 0) return "곧 완료"
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}초`
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)}분`
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  return `${h}시간 ${m}분`
}

function jobDuration(job: JobView): number | null {
  if (job.executionDurationMs != null) return job.executionDurationMs
  if (job.startedAt != null && job.finishedAt != null)
    return (job.finishedAt - job.startedAt) * 1000
  return null
}

// ── sub-components ──────────────────────────────────────────────────────

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
  if (markers.length === 0) return null

  const sessionButtonLabel = (() => {
    const m = markers.find((mm) => mm.id === selectedId)
    const count = sessionJobCounts.get(selectedId) ?? 0
    return m ? `${m.label} (${count})` : `(${count})`
  })()

  const isActive = activeState?.activeSessionId

  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition-all active:scale-95 h-8 hover:bg-muted/70",
          isOpen ? "bg-muted/65" : ""
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-ok"></span>
        </span>
        <span className="max-w-40 truncate tracking-wide">{sessionButtonLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-muted-foreground", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-76 rounded-xl border border-line-strong/60 bg-popover/85 p-1 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-200">
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
                            ? "bg-ok shadow-[0_0_8px_rgba(var(--ok),0.5)] animate-pulse"
                            : "bg-muted-foreground/30 group-hover/session-item:bg-muted-foreground/50"
                        )}
                      />
                      <span className={cn(
                        "flex-1 truncate text-left font-semibold tracking-tight transition-colors",
                        isSelected ? "text-foreground font-bold" : "text-muted-foreground group-hover/session-item:text-foreground"
                      )}>
                        {m.label}
                      </span>
                      <span className={cn(
                        "mono text-[10px] font-black rounded px-1.5 py-0.5 bg-muted/60 transition-colors",
                        isSelected ? "bg-background text-foreground" : "text-muted-foreground group-hover/session-item:bg-muted/80"
                      )}>
                        {count}
                      </span>
                    </Button>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
})

export const JobStatBar = memo(function JobStatBar({
  counts,
  sessionJobs,
}: JobStatBarProps) {
  return (
    <div className="flex flex-col">
      <div className="grid shrink-0 grid-cols-3 divide-x divide-y border-b md:flex md:items-stretch md:divide-y-0">
        <StatCard
          label="대기" value={counts.pending} color="text-ink-2" faded={counts.pending === 0}
          icon={Clock}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="큐" value={counts.queued} color="text-warn" faded={counts.queued === 0}
          icon={Layers}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="진행" value={counts.running} color="text-info" faded={counts.running === 0}
          icon={Activity}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="완료" value={counts.done} color="text-ok" faded={counts.done === 0}
          icon={CheckCircle2}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="실패" value={counts.error} color="text-bad" faded={counts.error === 0}
          icon={AlertCircle}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
        <StatCard
          label="취소" value={counts.cancelled} faded={counts.cancelled === 0}
          icon={Ban}
          className="flex-col items-center px-1 py-3 text-center md:flex-row md:px-5 md:py-4 md:text-left"
        />
      </div>

      <div className="space-y-4 p-4 md:space-y-2 md:p-3">
        <div className="flex items-center justify-between text-[11px] font-black uppercase">
          <span className="text-muted-foreground">세션 전체 진행률</span>
          <span className="mono tabular-nums">
            {counts.done}/{sessionJobs.length} (
            {sessionJobs.length > 0
              ? Math.round((counts.done / sessionJobs.length) * 100)
              : 0}%
            )
          </span>
        </div>
        <Progress
          value={sessionJobs.length > 0 ? (counts.done / sessionJobs.length) * 100 : 0}
          className="h-2 w-full shadow-inner [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-ok [&>[data-slot=progress-indicator]]:via-ok/60 [&>[data-slot=progress-indicator]]:to-ok [&>[data-slot=progress-indicator]]:bg-[length:200%_auto] [&>[data-slot=progress-indicator]]:animate-shimmer"
        />
      </div>
    </div>
  )
})

export const RunningJobsBanner = memo(function RunningJobsBanner({
  jobs,
}: RunningJobsBannerProps) {
  if (jobs.length === 0) {
    return (
      <div className="py-10 text-center text-sm font-bold text-balance text-muted-foreground/40">
        현재 실행 중인 작업이 없습니다.
      </div>
    )
  }

  return (
    <>
      {jobs.map((j) => {
        const rem = j.startedAt ? estimateRemaining(j.startedAt, j.progressPercent) : null
        return (
          <div key={j.id} className="shrink-0 space-y-2 rounded-xl border border-info/20 bg-info/5 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[13px] font-black text-info">
                {j.filename}
              </span>
              {rem != null && (
                <span className="shrink-0 text-[11px] font-black text-info/70 tabular-nums">
                  예상 {formatETA(rem)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground/80">
              <span className="truncate">{j.currentNodeName || "노드 처리 중..."}</span>
              <span className="mono">{Math.round(j.progressPercent)}%</span>
            </div>
            <Progress
              value={j.progressPercent}
              className="h-1.5 w-full [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-info [&>[data-slot=progress-indicator]]:via-primary [&>[data-slot=progress-indicator]]:to-info [&>[data-slot=progress-indicator]]:bg-[length:200%_auto] [&>[data-slot=progress-indicator]]:animate-shimmer"
            />
          </div>
        )
      })}
    </>
  )
})

export const JobListToolbar = memo(function JobListToolbar({
  filterTab,
  onFilterTabChange,
  sessionJobCount,
  activeCount,
  doneCount,
  failedCount,
}: JobListToolbarProps) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/10 px-3 py-2 md:flex-row md:items-center md:justify-between md:gap-3 md:px-4">
      <Tabs value={filterTab} onValueChange={onFilterTabChange} className="w-full md:w-auto">
        <TabsList className="no-scrollbar h-9 w-full justify-start gap-1 overflow-x-auto bg-muted/50 p-1 md:h-8 md:w-auto">
          <TabsTrigger value="all" className="h-7 flex-1 px-3 text-[11px] font-bold data-[state=active]:bg-background md:flex-none">
            전체 <span className="mono ml-1 opacity-50">{sessionJobCount}</span>
          </TabsTrigger>
          <TabsTrigger value="active" className="h-7 flex-1 px-3 text-[11px] font-bold text-info data-[state=active]:bg-background md:flex-none">
            활성 <span className="mono ml-1 opacity-50">{activeCount}</span>
          </TabsTrigger>
          <TabsTrigger value="done" className="h-7 flex-1 px-3 text-[11px] font-bold text-ok data-[state=active]:bg-background md:flex-none">
            완료 <span className="mono ml-1 opacity-50">{doneCount}</span>
          </TabsTrigger>
          <TabsTrigger value="failed" className="h-7 flex-1 px-3 text-[11px] font-bold text-bad data-[state=active]:bg-background md:flex-none">
            실패 <span className="mono ml-1 opacity-50">{failedCount}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
})

export const JobRow = memo(function JobRow({
  job,
  selectedForDelete,
  onToggleSelect,
  backendUrl,
  fetchedImages,
  fetchJobImages,
}: {
  job: JobView
  selectedForDelete: Set<string>
  onToggleSelect: (jobId: string) => void
  backendUrl: string
  fetchedImages: Map<string, string[]>
  fetchJobImages: (jobId: string) => void
}) {
  const isActive = job.status === "pending" || job.status === "queued" || job.status === "running"
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

  const row = (
    <TableRow
      key={job.id}
      className="group/row relative cursor-pointer hover:bg-muted/30 transition-all duration-300 hover:shadow-sm"
      onClick={() => fetchJobImages(job.id)} // open detail via click (handled by parent's onClick)
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
        <div className={cn("absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-md transition-transform duration-300 origin-center scale-y-60 group-hover/row:scale-y-100", accentColor)} />
        <StatusPill status={job.status} />
      </TableCell>
      <TableCell className="px-2 py-4">
        <div className="xs:max-w-40 flex max-w-[120px] items-center gap-2 truncate md:max-w-52">
          <span className="h-2 w-2 shrink-0 rounded-full transition-transform duration-300 group-hover/row:scale-125" style={{ backgroundColor: dotColor }} />
          <span className="truncate text-[13px] font-bold text-foreground md:text-[11px] transition-colors group-hover/row:text-info">
            {job.filename}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-[10px] text-muted-foreground tabular-nums">{timeAgo(job.createdAt)}</TableCell>
      <TableCell className="w-16 text-[10px] text-muted-foreground tabular-nums">{dur != null ? formatDuration(dur) : "—"}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()} className="px-2">
        {isActive ? (
          <span className="text-[10px] text-muted-foreground">진행중</span>
        ) : isFailed ? (
          <span className="text-[10px] text-muted-foreground">실패</span>
        ) : null}
      </TableCell>
    </TableRow>
  )

  if (job.status === "done") {
    return (
      <HoverCard openDelay={400} closeDelay={100}>
        <HoverCardTrigger asChild>{row}</HoverCardTrigger>
        <HoverCardContent side="left" align="start" className="hidden w-auto rounded-xl border border-line-strong/60 bg-popover/90 p-2.5 shadow-2xl backdrop-blur-md animate-in fade-in-0 duration-200 md:block">
          {fetchedImages.get(job.id) && fetchedImages.get(job.id)!.length > 0 ? (
            <div className="flex gap-1.5">
              {fetchedImages.get(job.id)!.slice(0, 6).map((h, i) => (
                <img key={h} src={`${backendUrl}/saved-images/${h}`} alt={`Preview ${i + 1}`} loading="lazy" decoding="async" className="h-16 w-16 rounded-lg border border-line object-cover transition-transform duration-300 hover:scale-105 hover:shadow-md" />
              ))}
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Skeleton className="h-16 w-16 rounded-lg" />
              <Skeleton className="h-16 w-16 rounded-lg" />
              <Skeleton className="h-16 w-16 rounded-lg" />
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
    )
  }
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
}: JobTableProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea className="mx-2 mb-2 flex-1 rounded-lg border bg-panel shadow-inner">
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
                <button onClick={() => onSort("status")} className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground">
                  상태
                  {sortKey === "status" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />) : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-20" />}
                </button>
              </TableHead>
              <TableHead className="px-2">
                <button onClick={() => onSort("filename")} className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground">
                  파일명
                  {sortKey === "filename" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />) : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-20" />}
                </button>
              </TableHead>
              <TableHead className="px-2">
                <button onClick={() => onSort("createdAt")} className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground">
                  생성
                  {sortKey === "createdAt" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />) : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-20" />}
                </button>
              </TableHead>
              <TableHead className="px-2">
                <button onClick={() => onSort("duration")} className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground">
                  소요
                  {sortKey === "duration" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />) : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-20" />}
                </button>
              </TableHead>
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
                backendUrl={backendUrl}
                fetchedImages={fetchedImages}
                fetchJobImages={fetchJobImages}
              />
            ))}
            {pagedJobs.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-80 p-0">
                  <Empty className="border-0 bg-transparent shadow-none">
                    <EmptyMedia variant="icon">
                      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
                      <div className="size-10 opacity-20" />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle className="text-base font-black">표시할 작업이 없습니다</EmptyTitle>
                      <EmptyDescription className="text-[13px]">필터 조건을 변경하거나 새로운 작업을 시작해보세요.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {showPagination && (
        <div className="flex shrink-0 flex-col items-center gap-2 pb-4">
          <Pagination className="text-xs">
            <PaginationContent className="gap-1">
              <PaginationItem>
                <PaginationPrevious onClick={() => page > 1 && onPageChange(page - 1)} className={cn("h-9 w-9 rounded-lg p-0", page <= 1 && "pointer-events-none opacity-20")} />
              </PaginationItem>
              <div className="flex items-center px-4 text-sm font-black">
                {page} / {totalPages}
              </div>
              <PaginationItem>
                <PaginationNext onClick={() => page < totalPages && onPageChange(page + 1)} className={cn("h-9 w-9 rounded-lg p-0", page >= totalPages && "pointer-events-none opacity-20")} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
})
