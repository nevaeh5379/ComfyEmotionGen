import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { Minimize2, Play, Pause, Trash2, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import type { JobView } from "../types/Message"
import { useConfirm } from "@/comfyui/hooks/useConfirm"
import { estimateRemaining, formatETA } from "../utils/timeEstimation"

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

interface Props {
  jobs: JobView[]
  paused: boolean
  backendUrl: string
  isAliveBackend: boolean
  onNavigateToJobs?: () => void
}

export const JobStatusPopup = memo(function JobStatusPopup({
  jobs,
  paused,
  backendUrl,
  isAliveBackend,
  onNavigateToJobs,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [, setTick] = useState(0)
  const confirm = useConfirm()

  // ── active jobs ────────────────────────────────────────────────────────

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.status === "running" ||
          j.status === "queued" ||
          j.status === "pending"
      ),
    [jobs]
  )

  const runningJobs = useMemo(
    () => jobs.filter((j) => j.status === "running"),
    [jobs]
  )

  const queuedJobs = useMemo(
    () => jobs.filter((j) => j.status === "queued" || j.status === "pending"),
    [jobs]
  )

  // 전체 세션 작업 (완료된 것도 포함)
  const allSessionCount = jobs.length
  const doneCount = jobs.filter((j) => j.status === "done").length
  const overallPercent =
    allSessionCount > 0 ? Math.round((doneCount / allSessionCount) * 100) : 0

  // ── tick for ETA when running ──────────────────────────────────────────

  useEffect(() => {
    if (runningJobs.length === 0) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [runningJobs])

  // ── actions ────────────────────────────────────────────────────────────

  const handleTogglePause = useCallback(async () => {
    try {
      await fetch(`${backendUrl}/jobs/${paused ? "resume" : "pause"}`, {
        method: "POST",
      })
    } catch {
      toast.error("일시중지/재개 요청에 실패했습니다.")
    }
  }, [backendUrl, paused])

  const handleCancelAll = useCallback(async () => {
    if (
      !(await confirm({
        title: "작업 취소",
        description: "진행 중인 모든 작업을 취소하시겠습니까?",
        variant: "destructive",
        confirmText: "모두 취소",
      }))
    )
      return
    try {
      await fetch(`${backendUrl}/jobs/cancel-all`, { method: "POST" })
    } catch {
      toast.error("전체 취소 요청에 실패했습니다.")
    }
  }, [backendUrl, confirm])

  // ── no active jobs → don't render ──────────────────────────────────────

  if (activeJobs.length === 0) return null

  // ── minimized badge ────────────────────────────────────────────────────

  if (!expanded) {
    const mainJob = runningJobs[0]
    const progressStr = mainJob ? `${Math.round(mainJob.progressPercent)}%` : ""
    const etaRemaining =
      mainJob && mainJob.startedAt
        ? estimateRemaining(mainJob.startedAt, mainJob.progressPercent, jobs)
        : null

    return (
      <div
        className="fixed right-4 bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lg transition-opacity hover:opacity-90 sm:right-4 sm:left-auto sm:w-auto"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded(true)
        }}
      >
        {/* colored dot */}
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${paused ? "animate-pulse bg-yellow-400" : runningJobs.length > 0 ? "animate-pulse bg-green-500" : "bg-blue-400"}`}
        />
        <span className="text-xs font-medium tabular-nums">
          {activeJobs.length}개{" "}
          {runningJobs.length > 0 && !paused
            ? `${progressStr}`
            : paused
              ? "중지"
              : "대기"}
        </span>
        {etaRemaining != null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatETA(etaRemaining)}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground sm:ml-0">
          {doneCount}/{allSessionCount} ({overallPercent}%)
        </span>
        <Minimize2 className="h-3 w-3 shrink-0 text-muted-foreground" />
      </div>
    )
  }

  // ── expanded panel ─────────────────────────────────────────────────────

  return (
    <div className="fixed right-4 bottom-4 left-4 z-50 rounded-lg border bg-card shadow-xl sm:right-4 sm:left-auto sm:w-80">
      {/* ── header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${paused ? "animate-pulse bg-yellow-400" : runningJobs.length > 0 ? "animate-pulse bg-green-500" : "bg-blue-400"}`}
          />
          <span className="text-sm font-semibold">작업 진행상황</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
            {activeJobs.length}개
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setExpanded(false)}
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>최소화</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => {
                  setExpanded(false)
                  onNavigateToJobs?.()
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>작업 탭으로 이동</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── overall progress ───────────────────────────────────────── */}
      <div className="border-b px-3 py-2">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            완료: {doneCount} / {allSessionCount}
          </span>
          <span className="tabular-nums">{overallPercent}%</span>
        </div>
        <Progress value={overallPercent} className="h-2 w-full" />
      </div>

      {/* ── running jobs ───────────────────────────────────────────── */}
      {runningJobs.length > 0 && (
        <div className="space-y-2 border-b px-3 py-2">
          <span className="text-[10px] font-semibold tracking-wide text-green-600 uppercase dark:text-green-400">
            진행 중 ({runningJobs.length})
          </span>
          {runningJobs.slice(0, 5).map((j) => {
            const remaining = j.startedAt
              ? estimateRemaining(j.startedAt, j.progressPercent, jobs)
              : null
            return (
              <div key={j.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help truncate font-mono">
                        {j.filename}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{j.filename}</TooltipContent>
                  </Tooltip>
                  {remaining != null && (
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      ETA {formatETA(remaining)}
                    </span>
                  )}
                </div>
                {j.currentNodeName && (
                  <div className="truncate text-[10px] text-muted-foreground">
                    노드: {j.currentNodeName}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Progress
                    value={j.progressPercent}
                    className="h-1.5 flex-1"
                  />
                  <span className="w-8 shrink-0 text-right text-[10px] tabular-nums">
                    {Math.round(j.progressPercent)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── queued jobs ────────────────────────────────────────────── */}
      {queuedJobs.length > 0 && (
        <div className="space-y-1 border-b px-3 py-2">
          <span className="text-[10px] font-semibold tracking-wide text-blue-600 uppercase dark:text-blue-400">
            대기 중 ({queuedJobs.length})
          </span>
          {queuedJobs.slice(0, 5).map((j) => (
            <div
              key={j.id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
              <span className="truncate font-mono">{j.filename}</span>
            </div>
          ))}
          {queuedJobs.length > 5 && (
            <div className="text-[10px] text-muted-foreground">
              외 {queuedJobs.length - 5}개 더…
            </div>
          )}
        </div>
      )}

      {/* ── controls ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleTogglePause}
          disabled={!isAliveBackend}
        >
          {paused ? (
            <>
              <Play className="mr-1 h-3 w-3" /> 재개
            </>
          ) : (
            <>
              <Pause className="mr-1 h-3 w-3" /> 일시정지
            </>
          )}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs"
          onClick={handleCancelAll}
          disabled={!isAliveBackend || activeJobs.length === 0}
        >
          <Trash2 className="mr-1 h-3 w-3" /> 전부 취소
        </Button>
      </div>
    </div>
  )
})
