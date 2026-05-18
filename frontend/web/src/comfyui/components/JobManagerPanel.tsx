import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
  X,
  MoreVertical,
  RefreshCcw,
  Clock,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  Ban,
  ClipboardList,
} from "lucide-react"

import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EmptyMedia,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"

import type { JobStatus, JobView } from "../types/Message"
import { useRenderLog } from "@/lib/renderLogger"
import { StatusPill } from "@/components/ceg/StatusPill"
import { StatCard } from "@/components/ceg/StatCard"
import { cn } from "@/lib/utils"
import { useConfirm } from "../contexts/ConfirmContext"

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return "#" + "00000".substring(0, 6 - c.length) + c
}

// ── session storage ───────────────────────────────────────────────────────────

interface SessionMarker {
  id: string
  startAt: number // ms epoch; 0 = beginning of time (catches all prior jobs)
  label: string
}

interface ActiveState {
  activeSessionId: string
  activatedAt: number // ms epoch; jobs created on/after this time go to activeSessionId
}

const SESSIONS_KEY = "ceg_sessions"
const ACTIVE_STATE_KEY = "ceg_active_state"
const PAGE_SIZE = 50

function loadMarkers(): SessionMarker[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]")
  } catch {
    return []
  }
}

function saveMarkers(ms: SessionMarker[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(ms))
}

function loadActiveState(): ActiveState | null {
  try {
    const raw = localStorage.getItem(ACTIVE_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ActiveState
  } catch {
    return null
  }
}

function saveActiveState(state: ActiveState): void {
  localStorage.setItem(ACTIVE_STATE_KEY, JSON.stringify(state))
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function initMarkers(): SessionMarker[] {
  const stored = loadMarkers()
  if (stored.length > 0) return stored
  const init: SessionMarker = { id: genId(), startAt: 0, label: "세션 1" }
  saveMarkers([init])
  return [init]
}

function initActiveState(markers: SessionMarker[]): ActiveState {
  const stored = loadActiveState()
  if (stored) return stored
  // Default: newest marker is active, activated at its startAt
  const sorted = [...markers].sort((a, b) => b.startAt - a.startAt)
  const newest = sorted[0]!
  return { activeSessionId: newest.id, activatedAt: newest.startAt }
}

// A job belongs to the active session if createdAt >= activatedAt.
// Otherwise, it belongs to the newest marker whose startAt <= job.createdAt * 1000.
// sortedDesc must be sorted newest-first (largest startAt first).
function jobSessionId(
  createdAtSec: number,
  sortedDesc: SessionMarker[],
  activeState: ActiveState | null
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

// ── other types & constants ───────────────────────────────────────────────────

interface JobEvent {
  id: number
  jobId: string
  eventType: string
  timestamp: number
  workerId: string | null
  details: Record<string, unknown>
}

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

// ── pure helpers ──────────────────────────────────────────────────────────────

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

function jobDuration(job: JobView): number | null {
  if (job.executionDurationMs != null) return job.executionDurationMs
  if (job.startedAt != null && job.finishedAt != null)
    return (job.finishedAt - job.startedAt) * 1000
  return null
}

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

// ── sub-components ────────────────────────────────────────────────────────────

interface SortableHeadProps {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onSort: (k: SortKey) => void
}
function SortableHead({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: SortableHeadProps) {
  const active = current === sortKey
  return (
    <TableHead className="px-2">
      <button
        className="flex items-center gap-1 font-bold whitespace-nowrap transition-colors hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-20" />
        )}
      </button>
    </TableHead>
  )
}

function TimingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

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

// ── main component ────────────────────────────────────────────────────────────

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

  // ── session state ───────────────────────────────────────────────────────────
  const [markers, setMarkersRaw] = useState<SessionMarker[]>(initMarkers)

  const persistMarkers = (ms: SessionMarker[]) => {
    saveMarkers(ms)
    setMarkersRaw(ms)
  }

  const [activeState, setActiveStateRaw] = useState<ActiveState>(() =>
    initActiveState(initMarkers())
  )

  const persistActiveState = (as: ActiveState) => {
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

  // ── filter / sort / date-range state ───────────────────────────────────────
  const [filterTab, setFilterTabState] = useState<FilterTab>("all")
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dateFrom, setDateFromState] = useState("")
  const [dateTo, setDateToState] = useState("")

  // ── pagination state ────────────────────────────────────────────────────────
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

  // ── delete selection state ───────────────────────────────────────────────────
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(
    new Set()
  )

  // ── detail sheet ────────────────────────────────────────────────────────────
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [_jobEvents, setJobEvents] = useState<JobEvent[] | null>(null)
  const [_isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [fetchedImages, setFetchedImages] = useState<Map<string, string[]>>(
    new Map()
  )
  const [, setTick] = useState(0)

  // ── lightbox state ──────────────────────────────────────────────────────────
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // ── session computations ────────────────────────────────────────────────────

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

  // ── status counts ───────────────────────────────────────────────────────────

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

  // ── filter pipeline ─────────────────────────────────────────────────────────

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

  // ── pagination computed ─────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / PAGE_SIZE))
  const page = Math.min(desiredPage, totalPages)
  const pagedJobs = useMemo(
    () => sortedJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedJobs, page]
  )

  // ── misc computed ───────────────────────────────────────────────────────────

  const selectedJob = selectedJobId
    ? (jobs.find((j) => j.id === selectedJobId) ?? null)
    : null
  const hasDateFilter = dateFrom !== "" || dateTo !== ""

  const sessionButtonLabel = (() => {
    const m = markers.find((mm) => mm.id === selectedId)
    const count = sessionJobCounts.get(selectedId) ?? 0
    return m ? `${m.label} (${count})` : `(${count})`
  })()

  // ── effects ─────────────────────────────────────────────────────────────────

  // Tick every second while any job in the session is running (for ETA updates)
  const hasRunning = useMemo(
    () => sessionJobs.some((j) => j.status === "running"),
    [sessionJobs]
  )

  useEffect(() => {
    if (!hasRunning) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [hasRunning])

  // ── session actions ─────────────────────────────────────────────────────────

  const createNewSession = () => {
    const nonEmpty = markers.filter(
      (m) => (sessionJobCounts.get(m.id) ?? 0) > 0
    )
    if (nonEmpty.length < markers.length) {
      persistMarkers(nonEmpty)
    }
    const newMarker: SessionMarker = {
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

  // ── api ─────────────────────────────────────────────────────────────────────

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

  const openDetail = async (jobId: string) => {
    setSelectedJobId(jobId)
    setJobEvents(null)
    setIsLoadingEvents(true)
    fetchJobImages(jobId)
    try {
      const res = await fetch(`${backendUrl}/jobs/${jobId}/events`)
      if (res.ok) setJobEvents((await res.json()).events)
    } finally {
      setIsLoadingEvents(false)
    }
  }

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      {/* 1. Global Controls (Always visible) */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-panel px-3 py-1.5">
        <div className="relative">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-[11px] font-bold"
            onClick={() => setSessionPickerOpen((o) => !o)}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            <span className="max-w-40 truncate">{sessionButtonLabel}</span>
            {sessionPickerOpen ? (
              <ChevronUp className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            )}
          </Button>

          {sessionPickerOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setSessionPickerOpen(false)}
              />
              <div className="absolute top-full left-0 z-20 mt-1 w-72 rounded-lg border bg-popover p-1 shadow-xl">
                <div className="mb-1 flex items-center justify-between border-b px-3 py-2">
                  <span className="text-[10px] font-black text-muted-foreground uppercase">
                    세션 선택
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-black text-blue-600"
                    onClick={createNewSession}
                  >
                    + 새 세션
                  </Button>
                </div>
                <ScrollArea className="max-h-80">
                  <div className="p-1">
                    {sortedMarkers.map((m) => {
                      const count = sessionJobCounts.get(m.id) ?? 0
                      const isSelected = m.id === selectedId
                      const isActive = m.id === activeState.activeSessionId
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "p-1",
                            isSelected && "rounded-md bg-muted"
                          )}
                        >
                          <Button
                            variant="ghost"
                            className="h-9 w-full justify-start gap-2 px-2 text-sm"
                            onClick={() => {
                              setSelectedId(m.id)
                              setSessionPickerOpen(false)
                            }}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isActive ? "bg-ok" : "bg-muted-foreground/30"
                              )}
                            />
                            <span className="flex-1 truncate text-left font-medium">
                              {m.label}
                            </span>
                            <span className="mono text-[10px] opacity-40">
                              {count}
                            </span>
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-black uppercase">
                <span className="text-muted-foreground">세션 전체 진행률</span>
                <span className="mono tabular-nums">
                  {counts.done}/{sessionJobs.length} (
                  {sessionJobs.length > 0
                    ? Math.round((counts.done / sessionJobs.length) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <Progress
                value={
                  sessionJobs.length > 0
                    ? (counts.done / sessionJobs.length) * 100
                    : 0
                }
                className="h-2 w-full shadow-inner"
              />
            </div>

            {sessionJobs
              .filter((j) => j.status === "running")
              .map((j) => (
                <div
                  key={j.id}
                  className="shrink-0 space-y-2 rounded-xl border border-info/20 bg-info/5 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[13px] font-black text-info">
                      {j.filename}
                    </span>
                    {(() => {
                      const rem = j.startedAt
                        ? estimateRemaining(j.startedAt, j.progressPercent)
                        : null
                      return (
                        rem != null && (
                          <span className="shrink-0 text-[11px] font-black text-info/70 tabular-nums">
                            예상 {formatETA(rem)}
                          </span>
                        )
                      )
                    })()}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground/80">
                    <span className="truncate">
                      {j.currentNodeName || "노드 처리 중..."}
                    </span>
                    <span className="mono">
                      {Math.round(j.progressPercent)}%
                    </span>
                  </div>
                  <Progress
                    value={j.progressPercent}
                    className="h-1.5 w-full"
                  />
                </div>
              ))}
            {sessionJobs.filter((j) => j.status === "running").length === 0 && (
              <div className="py-10 text-center text-sm font-bold text-balance text-muted-foreground/40">
                현재 실행 중인 작업이 없습니다.
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* 3. List Content (Mobile list tab OR Desktop always) */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          mobileTab === "list" ? "flex flex-1" : "hidden md:flex"
        )}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/10 px-3 py-2 md:flex-row md:items-center md:justify-between md:gap-3 md:px-4">
          <Tabs
            value={filterTab}
            onValueChange={(v) => setFilterTab(v as FilterTab)}
            className="w-full md:w-auto"
          >
            <TabsList className="no-scrollbar h-9 w-full justify-start gap-1 overflow-x-auto bg-muted/50 p-1 md:h-8 md:w-auto">
              <TabsTrigger
                value="all"
                className="h-7 flex-1 px-3 text-[11px] font-bold data-[state=active]:bg-background md:flex-none"
              >
                전체{" "}
                <span className="mono ml-1 opacity-50">
                  {sessionJobs.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="active"
                className="h-7 flex-1 px-3 text-[11px] font-bold text-info data-[state=active]:bg-background md:flex-none"
              >
                활성{" "}
                <span className="mono ml-1 opacity-50">{counts.active}</span>
              </TabsTrigger>
              <TabsTrigger
                value="done"
                className="h-7 flex-1 px-3 text-[11px] font-bold text-ok data-[state=active]:bg-background md:flex-none"
              >
                완료 <span className="mono ml-1 opacity-50">{counts.done}</span>
              </TabsTrigger>
              <TabsTrigger
                value="failed"
                className="h-7 flex-1 px-3 text-[11px] font-bold text-bad data-[state=active]:bg-background md:flex-none"
              >
                실패{" "}
                <span className="mono ml-1 opacity-50">
                  {counts.error + counts.cancelled}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            {filterTab === "failed" && (
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
            )}
            <div className="flex items-center gap-1">
              <DatePicker
                value={dateFrom ? new Date(dateFrom + "T12:00:00") : undefined}
                onChange={(d) => setDateFrom(d ? format(d, "yyyy-MM-dd") : "")}
                placeholder="시작"
                className="h-8 w-24 border-line/50 text-[11px] shadow-none"
              />
              <span className="text-[10px] text-muted-foreground opacity-30">
                ~
              </span>
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
                  onClick={() => {
                    setDateFrom("")
                    setDateTo("")
                  }}
                >
                  <X className="h-4 w-4" />
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
        </div>

        <ScrollArea className="mx-2 mb-2 flex-1 rounded-lg border bg-panel shadow-inner">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-panel/95 shadow-sm backdrop-blur">
              <TableRow className="hover:bg-transparent">
                {filterTab === "failed" && <TableHead className="w-8 px-2" />}
                <SortableHead
                  label="상태"
                  sortKey="status"
                  current={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="파일명"
                  sortKey="filename"
                  current={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="생성"
                  sortKey="createdAt"
                  current={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="소요"
                  sortKey="duration"
                  current={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <TableHead className="w-12 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedJobs.map((j) => {
                const isActive =
                  j.status === "pending" ||
                  j.status === "queued" ||
                  j.status === "running"
                const isFailed =
                  j.status === "error" || j.status === "cancelled"
                const dur = jobDuration(j)
                // preview hashes available via fetchedImages.get(j.id)
                const row = (
                  <TableRow
                    key={j.id}
                    className="group/row cursor-pointer"
                    onClick={() => openDetail(j.id)}
                  >
                    {filterTab === "failed" && (
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="px-2 py-4"
                      >
                        <Checkbox
                          checked={selectedForDelete.has(j.id)}
                          onCheckedChange={() => toggleSelectForDelete(j.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="px-2 py-4 text-center">
                      <StatusPill status={j.status} />
                    </TableCell>
                    <TableCell className="px-2 py-4">
                      <div className="xs:max-w-40 flex max-w-[120px] items-center gap-2 truncate md:max-w-52">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: stringToColor(j.filename) }}
                        />
                        <span className="truncate text-[13px] font-bold text-foreground md:text-[11px]">
                          {j.filename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground tabular-nums">
                      {timeAgo(j.createdAt)}
                    </TableCell>
                    <TableCell className="w-16 text-[10px] text-muted-foreground tabular-nums">
                      {dur != null ? formatDuration(dur) : "—"}
                    </TableCell>
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="px-2"
                    >
                      <div className="flex justify-end gap-1">
                        {isActive ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleCancel(e, j.id)}
                          >
                            <X className="h-5 w-5" />
                          </Button>
                        ) : isFailed ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className="h-9 w-9"
                              >
                                <MoreVertical className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-40 p-1"
                            >
                              <DropdownMenuItem
                                onClick={(e) => handleRetry(e, j.id)}
                                className="py-3 font-bold"
                              >
                                <RefreshCcw className="mr-2 h-4 w-4" /> 재시도
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => handleDeleteOne(e, j.id)}
                                className="py-3 font-bold text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> 삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
                if (j.status === "done") {
                  return (
                    <HoverCard
                      key={j.id}
                      openDelay={400}
                      closeDelay={100}
                      onOpenChange={(open) => {
                        if (open) fetchJobImages(j.id)
                      }}
                    >
                      <HoverCardTrigger asChild>{row}</HoverCardTrigger>
                      <HoverCardContent
                        side="left"
                        align="start"
                        className="hidden w-auto p-2 md:block"
                      >
                        {fetchedImages.get(j.id) &&
                        fetchedImages.get(j.id)!.length > 0 ? (
                          <div className="flex gap-1">
                            {fetchedImages
                              .get(j.id)!
                              .slice(0, 6)
                              .map((h, i) => (
                                <img
                                  key={h}
                                  src={`${backendUrl}/saved-images/${h}`}
                                  alt={`Preview ${i + 1}`}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-16 w-16 rounded border object-cover"
                                />
                              ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            로드 중…
                          </p>
                        )}
                      </HoverCardContent>
                    </HoverCard>
                  )
                }
                return row
              })}
              {pagedJobs.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-80 p-0">
                    <Empty className="border-0 bg-transparent shadow-none">
                      <EmptyMedia variant="icon">
                        <ClipboardList className="size-10 opacity-20" />
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

        {sortedJobs.length > PAGE_SIZE && (
          <div className="flex shrink-0 flex-col items-center gap-2 pb-4">
            <Pagination className="text-xs">
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => page > 1 && setPage(page - 1)}
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
                    onClick={() => page < totalPages && setPage(page + 1)}
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

      <Sheet
        open={selectedJob !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedJobId(null)
        }}
      >
        <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:min-w-105">
          <SheetHeader>
            <SheetTitle>작업 상세</SheetTitle>
          </SheetHeader>
          {selectedJob && (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <StatusPill status={selectedJob.status} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {selectedJob.id.slice(0, 8)}…
                  </span>
                </div>
                <p className="font-mono text-sm font-semibold">
                  {selectedJob.filename}
                </p>
                <div className="relative">
                  <p className="line-clamp-6 pr-8 font-mono text-[13px] leading-relaxed text-muted-foreground">
                    {selectedJob.prompt}
                  </p>
                  {selectedJob.prompt && (
                    <ClipButton text={selectedJob.prompt} />
                  )}
                </div>
                {selectedJob.error && (
                  <div className="relative">
                    <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 pr-8 text-sm font-bold text-destructive">
                      {selectedJob.error}
                    </p>
                    <ClipButton text={selectedJob.error} />
                  </div>
                )}
              </div>
              <div className="space-y-1.5 rounded-xl border bg-muted/10 p-4 text-[13px]">
                <TimingRow
                  label="생성"
                  value={new Date(
                    selectedJob.createdAt * 1000
                  ).toLocaleString()}
                />
                {selectedJob.startedAt && (
                  <TimingRow
                    label="시작"
                    value={new Date(
                      selectedJob.startedAt * 1000
                    ).toLocaleString()}
                  />
                )}
                {selectedJob.finishedAt && (
                  <TimingRow
                    label="완료"
                    value={new Date(
                      selectedJob.finishedAt * 1000
                    ).toLocaleString()}
                  />
                )}
                {jobDuration(selectedJob) != null && (
                  <TimingRow
                    label="소요"
                    value={formatDuration(jobDuration(selectedJob)!)}
                  />
                )}
              </div>
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
        </SheetContent>
      </Sheet>

      {lightboxUrls && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrls(null)}
        >
          <button
            className="absolute top-6 right-6 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
            onClick={() => setLightboxUrls(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {lightboxUrls.length > 1 && (
            <>
              <button
                className="absolute top-1/2 left-6 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((i) => Math.max(0, i - 1))
                }}
                disabled={lightboxIndex === 0}
              >
                <ChevronDown className="h-6 w-6 rotate-90" />
              </button>
              <button
                className="absolute top-1/2 right-6 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((i) =>
                    Math.min(lightboxUrls.length - 1, i + 1)
                  )
                }}
                disabled={lightboxIndex === lightboxUrls.length - 1}
              >
                <ChevronDown className="h-6 w-6 -rotate-90" />
              </button>
            </>
          )}
          <img
            src={lightboxUrls[lightboxIndex]!}
            alt="Full view"
            className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxUrls.length > 1 && (
            <p className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-5 py-1.5 text-sm font-black text-white">
              {lightboxIndex + 1} / {lightboxUrls.length}
            </p>
          )}
        </div>
      )}
    </div>
  )
})
