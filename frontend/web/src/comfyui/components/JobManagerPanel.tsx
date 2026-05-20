import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { format } from "date-fns"
import {
  Check,
  ChevronDown,
  Copy,
  MoreVertical,
  X,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"

import type { JobStatus, JobView } from "../types/Message"
import { useRenderLog } from "@/lib/renderLogger"
import { StatusPill } from "@/components/ceg/StatusPill"
import { cn } from "@/lib/utils"
import { useConfirm } from "../contexts/ConfirmContext"
import { ImageViewer } from "./ImageViewer"

// Extracted components
import {
  SessionPopover,
  JobStatBar,
  RunningJobsBanner,
  JobListToolbar,
  JobTableSection,
  type SessionMarker,
  type ActiveStateInfo,
} from "./JobManagerSections"

// ── session storage ───────────────────────────────────────────────────

interface SessionMarkerRaw {
  id: string
  startAt: number // ms epoch; 0 = beginning of time (catches all prior jobs)
  label: string
}

interface ActiveStateRaw {
  activeSessionId: string
  activatedAt: number // ms epoch; jobs created on/after this time go to activeSessionId
}

const SESSIONS_KEY = "ceg_sessions"
const ACTIVE_STATE_KEY = "ceg_active_state"
const PAGE_SIZE = 50

function loadMarkers(): SessionMarkerRaw[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]")
  } catch {
    return []
  }
}

function saveMarkers(ms: SessionMarkerRaw[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(ms))
}

function loadActiveState(): ActiveStateRaw | null {
  try {
    const raw = localStorage.getItem(ACTIVE_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ActiveStateRaw
  } catch {
    return null
  }
}

function saveActiveState(state: ActiveStateRaw): void {
  localStorage.setItem(ACTIVE_STATE_KEY, JSON.stringify(state))
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function initMarkers(): SessionMarkerRaw[] {
  const stored = loadMarkers()
  if (stored.length > 0) return stored
  const init: SessionMarkerRaw = { id: genId(), startAt: 0, label: "세션 1" }
  saveMarkers([init])
  return [init]
}

function initActiveState(markers: SessionMarkerRaw[]): ActiveStateRaw {
  const stored = loadActiveState()
  if (stored) return stored
  // Default: newest marker is active, activated at its startAt
  const sorted = [...markers].sort((a, b) => b.startAt - a.startAt)
  const newest = sorted[0]!
  return { activeSessionId: newest.id, activatedAt: newest.startAt }
}

// A job belongs to the active session if createdAt >= activatedAt.
// Otherwise, it belongs to the newest marker whose startAt <= job.createdAt * 1000.
function jobSessionId(
  createdAtSec: number,
  sortedDesc: SessionMarkerRaw[],
  activeState: ActiveStateRaw | null
): string {
  const t = createdAtSec * 1000
  if (activeState && t >= activeState.activatedAt) {
    return activeState.activeSessionId
  }
  for (const m of sortedDesc) {
    if (t >= m.startAt) return m.id
  }
  return sortedDesc[sortedDesc.length - 1]?.id ?? ""
}

function makeSessionLabel(count: number): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `세션 ${count} · ${mm}/${dd} ${hh}:${mi}`
}

// ── other types & constants ───────────────────────────────────────────

const STATUS_ORDER: Record<JobStatus, number> = {
  running: 0,
  queued: 1,
  pending: 2,
  done: 3,
  error: 4,
  cancelled: 5,
}

type SortKey = "filename" | "status" | "createdAt" | "duration"
type SortDir = "asc" | "desc"
type FilterTab = "all" | "active" | "done" | "failed"

// ── pure helpers ──────────────────────────────────────────────────────

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
    return (job.finishedAt - job.startedAt) * 1000
  return null
}

function dateToEpochStart(s: string): number {
  const d = new Date(s)
  d.setHours(0, 0, 0, 0)
  return d.getTime() / 1000
}
function dateToEpochEnd(s: string): number {
  const d = new Date(s)
  d.setHours(23, 59, 59, 999)
  return d.getTime() / 1000
}

// ── sub-components (local) ────────────────────────────────────────────

function ClipButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
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

// ── main component ────────────────────────────────────────────────────

interface Props {
  jobs: JobView[]
  paused: boolean
  backendUrl: string
  isAliveBackend: boolean
  mobileTab?: "status" | "list"
}

export const JobManagerPanel = memo(function JobManagerPanel({
  jobs,
  paused,
  backendUrl,
  isAliveBackend,
  mobileTab = "list",
}: Props) {
  useRenderLog("JobManagerPanel")
  const confirm = useConfirm()

  // ── session state ───────────────────────────────────────────────────
  const [markers, setMarkersRaw] = useState<SessionMarkerRaw[]>(initMarkers)

  const persistMarkers = (ms: SessionMarkerRaw[]) => {
    saveMarkers(ms)
    setMarkersRaw(ms)
  }

  const [activeState, setActiveStateRaw] = useState<ActiveStateRaw>(() =>
    initActiveState(initMarkers())
  )

  const persistActiveState = (as: ActiveStateRaw) => {
    saveActiveState(as)
    setActiveStateRaw(as)
  }

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => b.startAt - a.startAt),
    [markers]
  )

  // Default: newest marker
  const [selectedId, setSelectedId] = useState<string>(
    () =>
      activeState?.activeSessionId ??
      initMarkers().sort((a, b) => b.startAt - a.startAt)[0]!.id
  )

  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)

  // ── filter / sort / date-range state ────────────────────────────────
  const [filterTab, setFilterTabState] = useState<FilterTab>("all")
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dateFrom, setDateFromState] = useState("")
  const [dateTo, setDateToState] = useState("")

  // ── pagination state ────────────────────────────────────────────────
  const [desiredPage, setPage] = useState(1)

  // 필터 변경 시 page를 1로 함께 초기화하는 래퍼
  const setFilterTab = (v: FilterTab) => {
    setFilterTabState(v)
    setPage(1)
    setSelectedForDelete(new Set())
  }
  const setDateFrom = (v: string) => {
    setDateFromState(v)
    setPage(1)
    setSelectedForDelete(new Set())
  }
  const setDateTo = (v: string) => {
    setDateToState(v)
    setPage(1)
    setSelectedForDelete(new Set())
  }

  // ── delete selection state ──────────────────────────────────────────
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(
    new Set()
  )

  // ── detail sheet ────────────────────────────────────────────────────
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [fetchedImages, setFetchedImages] = useState<Map<string, string[]>>(
    new Map()
  )
  const [, setTick] = useState(0)

  // ── lightbox state ──────────────────────────────────────────────────
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // ── session computations ────────────────────────────────────────────

  const sessionJobCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of jobs) {
      const sid = jobSessionId(j.createdAt, sortedMarkers, activeState)
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [jobs, sortedMarkers, activeState])

  const sessionJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          jobSessionId(j.createdAt, sortedMarkers, activeState) === selectedId
      ),
    [jobs, sortedMarkers, activeState, selectedId]
  )

  // ── status counts ───────────────────────────────────────────────────

  const counts = useMemo(() => {
    const c: Record<JobStatus | "active", number> = {
      pending: 0,
      queued: 0,
      running: 0,
      done: 0,
      error: 0,
      cancelled: 0,
      active: 0,
    }
    for (const j of sessionJobs) {
      c[j.status]++
      if (
        j.status === "pending" ||
        j.status === "queued" ||
        j.status === "running"
      )
        c.active++
    }
    return c
  }, [sessionJobs])

  // ── filter pipeline ─────────────────────────────────────────────────

  const tabFiltered = useMemo(() => {
    switch (filterTab) {
      case "active":
        return sessionJobs.filter(
          (j) =>
            j.status === "pending" ||
            j.status === "queued" ||
            j.status === "running"
        )
      case "done":
        return sessionJobs.filter((j) => j.status === "done")
      case "failed":
        return sessionJobs.filter(
          (j) => j.status === "error" || j.status === "cancelled"
        )
      default:
        return sessionJobs
    }
  }, [sessionJobs, filterTab])

  const dateFiltered = useMemo(() => {
    const from = dateFrom ? dateToEpochStart(dateFrom) : null
    const to = dateTo ? dateToEpochEnd(dateTo) : null
    if (from === null && to === null) return tabFiltered
    return tabFiltered.filter((j) => {
      if (from !== null && j.createdAt < from) return false
      if (to !== null && j.createdAt > to) return false
      return true
    })
  }, [tabFiltered, dateFrom, dateTo])

  const sortedJobs = useMemo(() => {
    const arr = [...dateFiltered]
    const dir = sortDir === "asc" ? 1 : -1
    arr.sort((a, b) => {
      switch (sortKey) {
        case "filename":
          return dir * a.filename.localeCompare(b.filename)
        case "status":
          return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
        case "createdAt":
          return dir * (a.createdAt - b.createdAt)
        case "duration": {
          const da =
            jobDuration(a) ?? (sortDir === "asc" ? Infinity : -Infinity)
          const db =
            jobDuration(b) ?? (sortDir === "asc" ? Infinity : -Infinity)
          return dir * (da - db)
        }
      }
    })
    return arr
  }, [dateFiltered, sortKey, sortDir])

  // ── pagination computed ─────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / PAGE_SIZE))
  const page = Math.min(desiredPage, totalPages)
  const pagedJobs = useMemo(
    () => sortedJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedJobs, page]
  )

  // ── misc computed ───────────────────────────────────────────────────

  const selectedJob = selectedJobId
    ? (jobs.find((j) => j.id === selectedJobId) ?? null)
    : null
  const hasDateFilter = dateFrom !== "" || dateTo !== ""

  const runningJobs = useMemo(
    () => sessionJobs.filter((j) => j.status === "running"),
    [sessionJobs]
  )

  // ── effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!runningJobs.length) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [runningJobs])

  // ── session actions ─────────────────────────────────────────────────

  const createNewSession = () => {
    const nonEmpty = markers.filter(
      (m) => (sessionJobCounts.get(m.id) ?? 0) > 0
    )
    if (nonEmpty.length < markers.length) {
      persistMarkers(nonEmpty)
    }
    const newMarker: SessionMarkerRaw = {
      id: genId(),
      startAt: Date.now(),
      label: makeSessionLabel(nonEmpty.length + 1),
    }
    persistMarkers([...nonEmpty, newMarker])
    persistActiveState({
      activeSessionId: newMarker.id,
      activatedAt: Date.now(),
    })
    setSelectedId(newMarker.id)
    setSessionPickerOpen(false)
  }

  // ── api ─────────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const handleCancel = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    try {
      await fetch(`${backendUrl}/jobs/${jobId}`, { method: "DELETE" })
    } catch {
      /* ignore */
    }
  }

  const handleCancelAll = async () => {
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
      /* ignore */
    }
  }

  const handleTogglePause = async () => {
    try {
      await fetch(`${backendUrl}/jobs/${paused ? "resume" : "pause"}`, {
        method: "POST",
      })
    } catch {
      /* ignore */
    }
  }

  const handleRetry = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    try {
      await fetch(`${backendUrl}/jobs/${jobId}/retry`, { method: "POST" })
    } catch {
      /* ignore */
    }
  }

  const handleRetryAllFailed = async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    for (const j of failed) {
      try {
        await fetch(`${backendUrl}/jobs/${j.id}/retry`, { method: "POST" })
      } catch {
        /* ignore */
      }
    }
  }

  const handleDeleteOne = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    if (
      !(await confirm({
        title: "작업 삭제",
        description: "이 작업을 영구 삭제하시겠습니까?",
        variant: "destructive",
        confirmText: "삭제",
      }))
    )
      return
    try {
      await fetch(`${backendUrl}/jobs/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: [jobId] }),
      })
    } catch {
      /* ignore */
    }
  }

  const handleDeleteAllFailed = async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    if (failed.length === 0) return
    if (
      !(await confirm({
        title: "실패 작업 삭제",
        description: `실패/취소된 작업 ${failed.length}개를 모두 영구 삭제하시겠습니까?`,
        variant: "destructive",
        confirmText: "모두 삭제",
      }))
    )
      return
    try {
      await fetch(`${backendUrl}/jobs/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: failed.map((j) => j.id) }),
      })
    } catch {
      /* ignore */
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedForDelete.size === 0) return
    if (
      !(await confirm({
        title: "선택 삭제",
        description: `선택한 ${selectedForDelete.size}개 작업을 영구 삭제하시겠습니까?`,
        variant: "destructive",
        confirmText: "삭제",
      }))
    )
      return
    try {
      await fetch(`${backendUrl}/jobs/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: [...selectedForDelete] }),
      })
    } catch {
      /* ignore */
    }
    setSelectedForDelete(new Set())
  }

  const toggleSelectForDelete = (jobId: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const selectAllFailed = () => {
    const failedIds = new Set(
      dateFiltered
        .filter((j) => j.status === "error" || j.status === "cancelled")
        .map((j) => j.id)
    )
    setSelectedForDelete(failedIds)
  }

  const deselectAll = () => setSelectedForDelete(new Set())

  // ── image fetch ─────────────────────────────────────────────────────

  const fetchingRef = useRef<Set<string>>(new Set())

  const fetchJobImages = useCallback(
    async (jobId: string) => {
      if (fetchedImages.has(jobId) || fetchingRef.current.has(jobId)) return
      fetchingRef.current.add(jobId)
      try {
        const res = await fetch(`${backendUrl}/jobs/${jobId}/saved-images`)
        if (res.ok) {
          const data = await res.json()
          const hashes: string[] = (data.items ?? []).map(
            (img: { hash: string }) => img.hash
          )
          setFetchedImages((prev) => {
            const next = new Map(prev)
            next.set(jobId, hashes)
            return next
          })
        }
      } catch {
        /* ignore */
      } finally {
        fetchingRef.current.delete(jobId)
      }
    },
    [backendUrl, fetchedImages]
  )

  const openDetail = useCallback(
    (jobId: string) => {
      setSelectedJobId(jobId)
      fetchJobImages(jobId)
    },
    [fetchJobImages]
  )

  // ── helpers ─────────────────────────────────────────────────────────

  const setQuickDate = (label: string) => {
    const now = new Date()
    const toStr = now.toISOString().slice(0, 10)
    setDateTo(toStr)
    switch (label) {
      case "1h": {
        const d = new Date(now.getTime() - 3600_000)
        setDateFrom(d.toISOString().slice(0, 10))
        break
      }
      case "today": {
        setDateFrom(toStr)
        break
      }
      case "24h": {
        const d = new Date(now.getTime() - 86_400_000)
        setDateFrom(d.toISOString().slice(0, 10))
        break
      }
    }
  }

  // Convert internal types to extracted component types
  const sessionMarkers: SessionMarker[] = markers
  const activeStateInfo: ActiveStateInfo | null = activeState
    ? { activeSessionId: activeState.activeSessionId }
    : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      {/* 1. Global Controls */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-panel/60 backdrop-blur-md px-4 py-2">
        <div className="relative">
          <SessionPopover
            markers={sessionMarkers}
            sessionJobCounts={sessionJobCounts}
            sortedMarkers={sortedMarkers}
            selectedId={selectedId}
            activeState={activeStateInfo}
            isOpen={sessionPickerOpen}
            onOpenChange={setSessionPickerOpen}
            onSelectSession={setSelectedId}
            onCreateNew={createNewSession}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={paused ? "default" : "outline"}
            className="h-8 px-3 text-[11px] font-bold"
            onClick={handleTogglePause}
            disabled={!isAliveBackend}
          >
            {paused ? "재개" : "일시중지"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
              <DropdownMenuItem
                onClick={handleCancelAll}
                disabled={!isAliveBackend || counts.active === 0}
                className="py-3 font-bold text-destructive"
              >
                진행 중인 모든 작업 취소
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleRetryAllFailed}
                className="py-3 font-bold"
              >
                실패/취소된 모든 작업 재시도
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDeleteAllFailed}
                className="py-3 font-bold text-destructive"
              >
                실패/취소된 모든 작업 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 2. Status Content (Mobile status tab OR Desktop always) */}
      <ScrollArea
        className={cn(
          "max-h-[85dvh] shrink-0 border-b border-line bg-panel",
          mobileTab === "status" ? "flex-1" : "hidden md:block"
        )}
      >
        <JobStatBar counts={counts} sessionJobs={sessionJobs} />
        <RunningJobsBanner jobs={runningJobs} />
      </ScrollArea>

      {/* 3. List Content */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          mobileTab === "list" ? "flex flex-1" : "hidden md:flex"
        )}
      >
        {/* Filter tabs */}
        <JobListToolbar
          filterTab={filterTab}
          onFilterTabChange={(v) => setFilterTab(v as FilterTab)}
          sessionJobCount={sessionJobs.length}
          activeCount={counts.active}
          doneCount={counts.done}
          failedCount={counts.error + counts.cancelled}
        />

        {/* Always-visible date filter */}
        <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/5 px-3 py-2 md:gap-3 md:px-4">
          <DatePicker
            value={dateFrom ? new Date(dateFrom + "T12:00:00") : undefined}
            onChange={(d) => setDateFrom(d ? format(d, "yyyy-MM-dd") : "")}
            placeholder="시작"
            className="h-8 w-24 border-line/50 text-[11px] shadow-none"
          />
          <span className="text-[10px] text-muted-foreground opacity-30">~</span>
          <DatePicker
            value={dateTo ? new Date(dateTo + "T12:00:00") : undefined}
            onChange={(d) => setDateTo(d ? format(d, "yyyy-MM-dd") : "")}
            placeholder="종료"
            className="h-8 w-24 border-line/50 text-[11px] shadow-none"
          />
          {hasDateFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => { setDateFrom(""); setDateTo("") }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Failed tab: delete selection controls */}
        {filterTab === "failed" && (
          <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/5 px-3 py-2 md:gap-3 md:px-4">
            <div className="flex shrink-0 items-center gap-1.5 border-r border-line pr-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={selectAllFailed}
                className="h-8 px-2 text-[11px] font-bold"
              >
                전체
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={deselectAll}
                className="h-8 px-2 text-[11px] font-bold"
              >
                해제
              </Button>
              {selectedForDelete.size > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteSelected}
                  className="h-8 px-2 text-[11px] font-bold shadow-md"
                >
                  삭제({selectedForDelete.size})
                </Button>
              )}
            </div>
            <div className="xs:flex hidden items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[11px] font-bold text-muted-foreground"
                onClick={() => setQuickDate("1h")}
              >
                1h
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[11px] font-bold text-muted-foreground"
                onClick={() => setQuickDate("today")}
              >
                오늘
              </Button>
            </div>
          </div>
        )}

        {/* Table + Pagination */}
        <JobTableSection
          filterTab={filterTab}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(k) => toggleSort(k as SortKey)}
          pagedJobs={pagedJobs}
          totalPages={totalPages}
          page={page}
          onPageChange={(p) => { setPage(p); setSelectedForDelete(new Set()) }}
          selectedForDelete={selectedForDelete}
          onToggleSelect={toggleSelectForDelete}
          backendUrl={backendUrl}
          showPagination={sortedJobs.length > PAGE_SIZE}
          fetchedImages={fetchedImages}
          fetchJobImages={(id) => openDetail(id)}
        />
      </div>

      {/* Detail Sheet */}
      <Sheet
        open={selectedJob !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedJobId(null)
        }}
      >
        <SheetContent
          className="flex w-full flex-col gap-4 overflow-y-auto sm:min-w-105"
          onPointerDownOutside={(e) => {
            if (lightboxUrls !== null) {
              e.preventDefault()
            }
          }}
          onInteractOutside={(e) => {
            if (lightboxUrls !== null) {
              e.preventDefault()
            }
          }}
        >
          <SheetHeader>
            <SheetTitle className="text-lg font-black tracking-tight">작업 상세</SheetTitle>
          </SheetHeader>
          {selectedJob && (
            <div className="flex flex-col gap-5 mt-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusPill status={selectedJob.status} />
                  <span className="mono rounded bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                    ID: {selectedJob.id.slice(0, 8)}…
                  </span>
                </div>
                <p className="font-mono text-sm font-black text-foreground">
                  📄 {selectedJob.filename}
                </p>

                {/* Prompt box */}
                {selectedJob.prompt && (
                  <div className="relative rounded-lg border bg-muted/40 p-3 group/prompt">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-black tracking-wider text-muted-foreground uppercase">
                        프롬프트
                      </span>
                    </div>
                    <ScrollArea className="h-32">
                      <p className="pr-6 font-mono text-xs leading-relaxed text-foreground select-all whitespace-pre-wrap break-all">
                        {selectedJob.prompt}
                      </p>
                    </ScrollArea>
                    <ClipButton text={selectedJob.prompt} />
                  </div>
                )}

                {selectedJob.error && (
                  <div className="relative rounded-lg border border-destructive/20 bg-destructive/10 p-3 shadow-inner">
                    <div className="flex items-center gap-1.5 text-destructive mb-1 text-[11px] font-black tracking-widest uppercase">
                      <AlertCircle className="h-4 w-4" /> 에러 로그
                    </div>
                    <p className="font-mono text-xs text-destructive/90 pr-8 leading-relaxed whitespace-pre-wrap break-all">
                      {selectedJob.error}
                    </p>
                    <ClipButton text={selectedJob.error} />
                  </div>
                )}
              </div>

              {/* Visual Timeline */}
              <div className="space-y-3 rounded-2xl border bg-muted/10 p-4">
                <h4 className="text-[10px] font-black tracking-widest text-muted-foreground uppercase pb-1.5 border-b">
                  진행 타임라인
                </h4>
                <div className="flex flex-col gap-4 mt-2">
                  {/* 1. 생성 */}
                  <div className="relative flex gap-3 pl-6">
                    <div className={cn("absolute left-2.25 top-2.5 bottom-[-16px] w-0.5 bg-line-strong/60", selectedJob.startedAt && "bg-info/60")} />
                    <div className="absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full bg-ink-2 ring-4 ring-ink-2/15" />
                    <div className="flex-1 flex justify-between items-baseline gap-2">
                      <span className="text-xs font-bold text-foreground">작업 생성됨</span>
                      <span className="mono text-[10px] text-muted-foreground tabular-nums">
                        {new Date(selectedJob.createdAt * 1000).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 2. 시작 */}
                  {selectedJob.startedAt ? (
                    <div className="relative flex gap-3 pl-6">
                      <div className={cn("absolute left-2.25 top-2.5 bottom-[-16px] w-0.5 bg-line-strong/60", selectedJob.finishedAt && "bg-ok/60")} />
                      <div className="absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full bg-info ring-4 ring-info/15 animate-pulse" />
                      <div className="flex-1 flex justify-between items-baseline gap-2">
                        <span className="text-xs font-bold text-foreground">렌더링 시작</span>
                        <span className="mono text-[10px] text-muted-foreground tabular-nums">
                          {new Date(selectedJob.startedAt * 1000).toLocaleString()}
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

                  {/* 3. 완료 / 실패 */}
                  {selectedJob.finishedAt ? (
                    <div className="relative flex gap-3 pl-6">
                      <div className={cn(
                        "absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full ring-4",
                        selectedJob.status === "error" || selectedJob.status === "cancelled"
                          ? "bg-bad ring-bad/15"
                          : "bg-ok ring-ok/15"
                      )} />
                      <div className="flex-1 flex justify-between items-baseline gap-2">
                        <span className="text-xs font-bold text-foreground">
                          {selectedJob.status === "error" ? "렌더링 실패" : selectedJob.status === "cancelled" ? "렌더링 취소" : "렌더링 완료"}
                        </span>
                        <span className="mono text-[10px] text-muted-foreground tabular-nums">
                          {new Date(selectedJob.finishedAt * 1000).toLocaleString()}
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

                {jobDuration(selectedJob) != null && (
                  <div className="mt-3.5 pt-3.5 border-t border-line/60 flex justify-between items-center text-xs">
                    <span className="font-extrabold text-muted-foreground">총 소요 시간</span>
                    <span className="mono font-black text-foreground bg-muted rounded px-2 py-0.5 tabular-nums">
                      {formatDuration(jobDuration(selectedJob)!)}
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {(selectedJob.status === "pending" ||
                  selectedJob.status === "queued" ||
                  selectedJob.status === "running") && (
                  <Button
                    size="lg"
                    variant="destructive"
                    className="h-12 flex-1 rounded-xl font-bold"
                    onClick={(e) => {
                      handleCancel(e, selectedJob.id)
                      setSelectedJobId(null)
                    }}
                  >
                    취소
                  </Button>
                )}
                {(selectedJob.status === "error" ||
                  selectedJob.status === "cancelled") && (
                  <>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 flex-1 rounded-xl font-bold"
                      onClick={(e) => {
                        handleRetry(e, selectedJob.id)
                        setSelectedJobId(null)
                      }}
                    >
                      재시도
                    </Button>
                    <Button
                      size="lg"
                      variant="destructive"
                      className="h-12 flex-1 rounded-xl font-bold"
                      onClick={(e) => {
                        handleDeleteOne(e, selectedJob.id)
                        setSelectedJobId(null)
                      }}
                    >
                      삭제
                    </Button>
                  </>
                )}
              </div>

              {/* Generated images */}
              {fetchedImages.get(selectedJob.id) &&
                fetchedImages.get(selectedJob.id)!.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-black tracking-widest text-muted-foreground uppercase">
                      생성 이미지 ({fetchedImages.get(selectedJob.id)!.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {fetchedImages.get(selectedJob.id)!.map((h, i) => {
                        const url = `${backendUrl}/saved-images/${h}`
                        return (
                          <button
                            key={h}
                            onClick={() => {
                              setLightboxUrls(
                                fetchedImages
                                  .get(selectedJob.id)!
                                  .map(
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

          {/* Lightbox */}
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
    </div>
  )
})
