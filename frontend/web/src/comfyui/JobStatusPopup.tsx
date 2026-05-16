import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { Minimize2, Play, Pause, Trash2, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { JobView } from "./Message"

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function formatETA(totalSeconds: number): string {
  if (totalSeconds <= 0) return "곧 완료"
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}초`
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)}분`
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  return `${h}시간 ${m}분`
}

function estimateRemaining(
  startedAtSec: number,
  progressPercent: number
): number | null {
  if (progressPercent <= 0 || progressPercent >= 100) return null
  const elapsedSec = Date.now() / 1000 - startedAtSec
  if (elapsedSec <= 0) return null
  const totalEstimatedSec = (elapsedSec / progressPercent) * 100
  return totalEstimatedSec - elapsedSec
}

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

  // 전체 세션 잡 (완료된 것도 포함)
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
      // ignore
    }
  }, [backendUrl, paused])

  const handleCancelAll = useCallback(async () => {
    if (!window.confirm("진행 중인 모든 작업을 취소하시겠습니까?")) return
    try {
      await fetch(`${backendUrl}/jobs/cancel-all`, { method: "POST" })
    } catch {
      // ignore
    }
  }, [backendUrl])

  // ── no active jobs → don't render ──────────────────────────────────────

  if (activeJobs.length === 0) return null

  // ── minimized badge ────────────────────────────────────────────────────

  if (!expanded) {
    const mainJob = runningJobs[0]
    const progressStr = mainJob ? `${Math.round(mainJob.progressPercent)}%` : ""
    const etaRemaining =
      mainJob && mainJob.startedAt
        ? estimateRemaining(mainJob.startedAt, mainJob.progressPercent)
        : null

    return (
      <div
        className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lg transition-opacity hover:opacity-90"
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
            ? `진행 중 · ${progressStr}`
            : paused
              ? "일시중지"
              : "대기 중"}
        </span>
        {etaRemaining != null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            ETA {formatETA(etaRemaining)}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          완료 {doneCount}/{allSessionCount} ({overallPercent}%)
        </span>
        <Minimize2 className="h-3 w-3 shrink-0 text-muted-foreground" />
      </div>
    )
  }

  // ── expanded panel ─────────────────────────────────────────────────────

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 rounded-lg border bg-card shadow-xl">
      {/* ── header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${paused ? "animate-pulse bg-yellow-400" : runningJobs.length > 0 ? "animate-pulse bg-green-500" : "bg-blue-400"}`}
          />
          <span className="text-sm font-semibold">잡 진행상황</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
            {activeJobs.length}개
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setExpanded(false)}
            title="최소화"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              setExpanded(false)
              onNavigateToJobs?.()
            }}
            title="잡 탭으로 이동"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
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
              ? estimateRemaining(j.startedAt, j.progressPercent)
              : null
            return (
              <div key={j.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono" title={j.filename}>
                    {j.filename}
                  </span>
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
