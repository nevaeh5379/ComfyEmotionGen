import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Trash2,
  X,
  MoreVertical,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
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

import type { JobStatus, JobView } from "./Message"
import { useRenderLog } from "@/lib/renderLogger"

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

const STATUS_STYLE: Record<JobStatus, { label: string; badge: string }> = {
  pending: { label: "대기 중", badge: "bg-muted text-muted-foreground" },
  queued: {
    label: "큐 대기 중",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  running: {
    label: "진행 중",
    badge:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  done: {
    label: "완료",
    badge: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  error: {
    label: "실패",
    badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  cancelled: { label: "취소됨", badge: "bg-muted text-muted-foreground" },
}

const STAT_LABELS: Record<JobStatus, string> = {
  pending: "대기",
  queued: "큐",
  running: "진행",
  done: "완료",
  error: "실패",
  cancelled: "취소",
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

/** 1..totalPages를 ellipsis와 함께 압축 */
function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 1) return [1]
  const pages = new Set<number>([1, totalPages, current])
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i)
  }
  const sorted = Array.from(pages).sort((a, b) => a - b)
  const out: (number | "…")[] = []
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]!)
    if (i < sorted.length - 1 && sorted[i + 1]! - sorted[i]! > 1) out.push("…")
  }
  return out
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
    <TableHead>
      <button
        className="flex items-center gap-1 font-medium transition-colors hover:text-foreground"
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
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
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
}

export const JobManagerPanel = memo(function JobManagerPanel({
  jobs,
  paused,
  backendUrl,
  isAliveBackend,
}: Props) {
  useRenderLog("JobManagerPanel")
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

  // ── session rename state ────────────────────────────────────────────────────
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState("")

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
  const [jobEvents, setJobEvents] = useState<JobEvent[] | null>(null)
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
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
  const pageList = useMemo(
    () => buildPageList(page, totalPages),
    [page, totalPages]
  )

  const pagedJobs = useMemo(
    () => sortedJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedJobs, page]
  )

  // ── misc computed ───────────────────────────────────────────────────────────

  const activeJobs = useMemo(
    () =>
      sessionJobs.filter(
        (j) =>
          j.status === "running" ||
          j.status === "queued" ||
          j.status === "pending"
      ),
    [sessionJobs]
  )

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

  useEffect(() => {
    if (!selectedJob || selectedJob.status !== "running") return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [selectedJob])

  // ── session actions ─────────────────────────────────────────────────────────

  const createNewSession = () => {
    // Prevent empty sessions: delete existing empty markers before creating new one
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
    // Make the new session active
    persistActiveState({
      activeSessionId: newMarker.id,
      activatedAt: Date.now(),
    })
    setSelectedId(newMarker.id)
    setSessionPickerOpen(false)
  }

  const startRename = (m: SessionMarker) => {
    setEditingMarkerId(m.id)
    setEditingLabel(m.label)
  }

  const saveRename = () => {
    if (editingMarkerId && editingLabel.trim()) {
      persistMarkers(
        markers.map((m) =>
          m.id === editingMarkerId ? { ...m, label: editingLabel.trim() } : m
        )
      )
    }
    setEditingMarkerId(null)
  }

  const deleteSession = (markerId: string) => {
    if (
      !confirm(
        "이 세션을 삭제하시겠습니까? 세션의 마커만 제거되며 잡 데이터는 삭제되지 않습니다."
      )
    )
      return
    const next = markers.filter((m) => m.id !== markerId)
    if (next.length === 0) {
      // Ensure at least one marker exists
      const init: SessionMarker = { id: genId(), startAt: 0, label: "세션 1" }
      persistMarkers([init])
      setSelectedId(init.id)
    } else {
      persistMarkers(next)
      if (selectedId === markerId)
        setSelectedId(next.sort((a, b) => b.startAt - a.startAt)[0]!.id)
    }
  }

  const activateSession = (markerId: string) => {
    // eslint-disable-next-line react-hooks/purity
    persistActiveState({ activeSessionId: markerId, activatedAt: Date.now() })
    setSelectedId(markerId)
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
      // 네트워크 오류 무시 — 백엔드가 재시도 처리
    }
  }

  const handleCancelAll = async () => {
    if (!window.confirm("진행 중인 모든 작업을 취소하시겠습니까?")) return
    try {
      await fetch(`${backendUrl}/jobs/cancel-all`, { method: "POST" })
    } catch {
      // 네트워크 오류 무시
    }
  }

  const handleTogglePause = async () => {
    try {
      await fetch(`${backendUrl}/jobs/${paused ? "resume" : "pause"}`, {
        method: "POST",
      })
    } catch {
      // 네트워크 오류 무시
    }
  }

  const handleRetry = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    try {
      await fetch(`${backendUrl}/jobs/${jobId}/retry`, { method: "POST" })
    } catch {
      // 네트워크 오류 무시
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
        // 네트워크 오류 무시 — 다음 잡 계속 처리
      }
    }
  }

  const handleDeleteOne = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    if (!window.confirm("이 잡을 영구 삭제하시겠습니까?")) return
    try {
      await fetch(`${backendUrl}/jobs/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: [jobId] }),
      })
    } catch {
      // 네트워크 오류 무시
    }
  }

  const handleDeleteAllFailed = async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    if (failed.length === 0) return
    if (
      !window.confirm(
        `실패/취소된 잡 ${failed.length}개를 모두 영구 삭제하시겠습니까?`
      )
    )
      return
    try {
      await fetch(`${backendUrl}/jobs/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: failed.map((j) => j.id) }),
      })
    } catch {
      // 네트워크 오류 무시
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedForDelete.size === 0) return
    if (
      !window.confirm(
        `선택한 ${selectedForDelete.size}개 잡을 영구 삭제하시겠습니까?`
      )
    )
      return
    try {
      await fetch(`${backendUrl}/jobs/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: [...selectedForDelete] }),
      })
    } catch {
      // 네트워크 오류 무시
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
        // 이미지 로드 실패 무시
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

  // ── quick date filters ──────────────────────────────────────────────────────

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

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* 1. Global Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Session selector dropdown */}
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setSessionPickerOpen((o) => !o)}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-green-500"
              title="현재 활성 세션"
            />
            <span className="max-w-40 truncate text-xs">
              {sessionButtonLabel}
            </span>
            {sessionPickerOpen ? (
              <ChevronUp className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            )}
          </Button>

          {sessionPickerOpen && (
            <>
              {/* Backdrop to close on outside click */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setSessionPickerOpen(false)}
              />
              <div className="absolute top-full left-0 z-20 mt-1 w-72 rounded-md border bg-popover shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    세션 관리
                  </span>
                  <button
                    className="rounded px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                    onClick={createNewSession}
                  >
                    + 새 세션
                  </button>
                </div>

                {/* Session list */}
                <div className="max-h-64 overflow-y-auto px-1 py-1">
                  {sortedMarkers.map((m) => {
                    const count = sessionJobCounts.get(m.id) ?? 0
                    const isSelected = m.id === selectedId
                    const isActive = m.id === activeState.activeSessionId
                    const isEmpty = count === 0
                    const isEditing = editingMarkerId === m.id
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-muted/60 ${isSelected ? "bg-muted" : ""}`}
                      >
                        {/* Select/view button */}
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => {
                            setSelectedId(m.id)
                            setSessionPickerOpen(false)
                          }}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-green-500" : isSelected ? "bg-foreground" : "border border-muted-foreground/40"}`}
                            title={
                              isActive
                                ? "현재 새 잡이 이 세션에 할당됩니다"
                                : isSelected
                                  ? "현재 보고 있는 세션"
                                  : ""
                            }
                          />
                          {isEditing ? (
                            <input
                              className="min-w-0 flex-1 rounded border bg-background px-1 py-0 text-sm"
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename()
                                if (e.key === "Escape") setEditingMarkerId(null)
                              }}
                              onBlur={saveRename}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${isEmpty ? "text-muted-foreground" : ""}`}
                            >
                              {m.label}
                            </span>
                          )}
                          {isActive && (
                            <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                              활성
                            </span>
                          )}
                        </button>

                        {/* Activate button (only show for non-active) */}
                        {!isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 shrink-0 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              activateSession(m.id)
                            }}
                            title="이 세션을 활성 세션으로 지정하여 새 잡이 여기에 할당되도록 합니다"
                          >
                            활성화
                          </Button>
                        )}

                        {/* Edit */}
                        <button
                          className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground"
                          onClick={() => startRename(m)}
                          title="이름 변경"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>

                        {/* Delete */}
                        <button
                          className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-destructive/20 hover:text-destructive"
                          onClick={() => deleteSession(m.id)}
                          title="세션 삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>

                        {/* Count */}
                        <span
                          className={`w-10 shrink-0 text-right text-xs tabular-nums ${isEmpty ? "text-muted-foreground/50" : "font-medium"}`}
                        >
                          {count}개
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Footer tip */}
                <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-green-500" />
                    활성 세션 — 새로 제출하는 잡이 이 세션에 저장됩니다
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2">
          {paused && (
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              새 잡이 워커로 전송되지 않습니다.
            </span>
          )}
          <Button
            size="sm"
            variant={paused ? "default" : "outline"}
            onClick={handleTogglePause}
            disabled={!isAliveBackend}
          >
            {paused ? "재개" : "일시중지"}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="px-2">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleCancelAll}
                disabled={!isAliveBackend || counts.active === 0}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
              >
                전부 취소
              </DropdownMenuItem>
              {counts.error + counts.cancelled > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleRetryAllFailed}
                    disabled={!isAliveBackend}
                    className="cursor-pointer"
                  >
                    실패/취소 모두 재시도 ({counts.error + counts.cancelled})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDeleteAllFailed}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                  >
                    실패/취소 모두 삭제 ({counts.error + counts.cancelled})
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 2. Overview (Stats & Progress) */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
        <div className="grid grid-cols-6 gap-2">
          {(
            [
              "pending",
              "queued",
              "running",
              "done",
              "error",
              "cancelled",
            ] as JobStatus[]
          ).map((s) => (
            <div key={s} className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
              <div
                className={`text-lg leading-none font-bold tabular-nums ${STATUS_STYLE[s].badge.split(" ").find((c) => c.startsWith("text-")) ?? "text-foreground"}`}
              >
                {counts[s]}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {STAT_LABELS[s]}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="truncate text-muted-foreground">
              {activeJobs.length > 0
                ? `진행 중: ${activeJobs.length}개 (완료: ${counts.done} / 전체: ${sessionJobs.length})`
                : paused
                  ? "일시중지됨"
                  : "대기 중"}
            </span>
            <span className="tabular-nums">
              {sessionJobs.length > 0
                ? Math.round((counts.done / sessionJobs.length) * 100)
                : 0}
              %
            </span>
          </div>
          <Progress
            value={
              sessionJobs.length > 0
                ? (counts.done / sessionJobs.length) * 100
                : 0
            }
            className="h-2 w-full"
          />
        </div>
      </div>

      {/* 3. Table Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Filter tabs */}
        <Tabs
          value={filterTab}
          onValueChange={(v) => setFilterTab(v as FilterTab)}
          className="w-auto"
        >
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">전체 ({sessionJobs.length})</TabsTrigger>
            <TabsTrigger value="active" className="text-xs">활성 ({counts.active})</TabsTrigger>
            <TabsTrigger value="done" className="text-xs">완료 ({counts.done})</TabsTrigger>
            <TabsTrigger value="failed" className="text-xs">
              실패/취소 ({counts.error + counts.cancelled})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Right side controls (Selection & Date) */}
        <div className="flex flex-wrap items-center gap-3">
          {filterTab === "failed" && (
            <div className="flex items-center gap-1.5 border-r pr-3">
              <Button size="sm" variant="ghost" onClick={selectAllFailed} className="h-8 text-xs">
                전체 선택
              </Button>
              <Button size="sm" variant="ghost" onClick={deselectAll} className="h-8 text-xs">
                선택 해제
              </Button>
              {selectedForDelete.size > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteSelected}
                  className="h-8 text-xs"
                >
                  선택 삭제 ({selectedForDelete.size})
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 w-32 text-xs"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 w-32 text-xs"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setQuickDate("1h")}
              >
                1h
              </button>
              <button
                className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setQuickDate("today")}
              >
                오늘
              </button>
              <button
                className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setQuickDate("24h")}
              >
                24h
              </button>
            </div>
            {hasDateFilter && (
              <>
                <div className="h-4 w-px bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    setDateFrom("")
                    setDateTo("")
                  }}
                >
                  <X className="mr-1 h-3 w-3" />
                  초기화
                </Button>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  ({sortedJobs.length}/{tabFiltered.length})
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Job table */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {filterTab === "failed" && <TableHead className="w-8" />}
              <SortableHead
                label="파일명"
                sortKey="filename"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <SortableHead
                label="상태"
                sortKey="status"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <TableHead>워커</TableHead>
              <SortableHead
                label="생성"
                sortKey="createdAt"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <SortableHead
                label="소요시간"
                sortKey="duration"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedJobs.map((j) => {
              const isActive =
                j.status === "pending" ||
                j.status === "queued" ||
                j.status === "running"
              const isFailed = j.status === "error" || j.status === "cancelled"
              const dur = jobDuration(j)
              const statusLabel =
                j.status === "pending" && j.retryCount > 0
                  ? `대기 중 (재시도 ${j.retryCount})`
                  : STATUS_STYLE[j.status].label
              const previewHashes = fetchedImages.get(j.id) ?? []
              const row = (
                <TableRow
                  key={j.id}
                  className="cursor-pointer"
                  onClick={() => openDetail(j.id)}
                >
                  {filterTab === "failed" && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedForDelete.has(j.id)}
                        onCheckedChange={() => toggleSelectForDelete(j.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="max-w-35 truncate font-mono text-xs">
                    {j.filename}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[j.status].badge}`}
                      >
                        {statusLabel}
                      </span>
                      {j.status === "error" && j.error && (
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 cursor-help text-destructive/70" />
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="top"
                            align="start"
                            className="max-w-[320px]"
                          >
                            <p className="text-xs font-semibold text-destructive">
                              오류 내용
                            </p>
                            <p className="mt-1 max-h-30 overflow-y-auto text-xs break-all whitespace-pre-wrap">
                              {j.error}
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {j.workerId ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {timeAgo(j.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {dur != null ? formatDuration(dur) : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {isActive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => handleCancel(e, j.id)}
                        >
                          취소
                        </Button>
                      )}
                      {isFailed && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => handleRetry(e, j.id)}
                        >
                          재시도
                        </Button>
                      )}
                      {isFailed && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteOne(e, j.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
              if (j.status === "done") {
                const displayHashes = previewHashes.slice(0, 6)
                const totalCount = previewHashes.length
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
                      className="w-auto p-2"
                    >
                      {displayHashes.length > 0 ? (
                        <div className="flex gap-1">
                          {displayHashes.map((h, i) => (
                            <img
                              key={h}
                              src={`${backendUrl}/saved-images/${h}`}
                              alt={`Preview ${i + 1}`}
                              loading="lazy"
                              decoding="async"
                              className="h-16 w-16 rounded border object-cover"
                            />
                          ))}
                          {totalCount > 6 && (
                            <div className="flex h-16 w-16 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                              +{totalCount - 6}
                            </div>
                          )}
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
              <TableRow>
                <TableCell
                  colSpan={filterTab === "failed" ? 7 : 6}
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  {hasDateFilter
                    ? "선택한 날짜 범위에 맞는 잡이 없습니다."
                    : "해당 필터에 맞는 잡이 없습니다."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {sortedJobs.length > PAGE_SIZE && (
        <div className="flex flex-col items-center gap-2">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => page > 1 && setPage(page - 1)}
                  aria-disabled={page <= 1}
                  className={
                    page <= 1 ? "pointer-events-none opacity-50" : undefined
                  }
                />
              </PaginationItem>
              {pageList.map((p, i) =>
                p === "…" ? (
                  <PaginationItem key={`e-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === page}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  onClick={() => page < totalPages && setPage(page + 1)}
                  aria-disabled={page >= totalPages}
                  className={
                    page >= totalPages
                      ? "pointer-events-none opacity-50"
                      : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          <p className="text-xs text-muted-foreground">
            총 {sortedJobs.length}개 · {page}/{totalPages} 페이지
          </p>
        </div>
      )}

      {/* Job detail sheet */}
      <Sheet
        open={selectedJob !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedJobId(null)
        }}
      >
        <SheetContent className="flex min-w-105 flex-col gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>잡 상세</SheetTitle>
          </SheetHeader>
          {selectedJob && (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[selectedJob.status].badge}`}
                  >
                    {STATUS_STYLE[selectedJob.status].label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {selectedJob.id.slice(0, 8)}…
                  </span>
                </div>
                <p className="font-mono text-sm font-semibold">
                  {selectedJob.filename}
                </p>
                <div className="relative">
                  <p className="line-clamp-4 pr-8 text-sm text-muted-foreground">
                    {selectedJob.prompt}
                  </p>
                  {selectedJob.prompt && (
                    <ClipButton text={selectedJob.prompt} />
                  )}
                </div>
                {selectedJob.error && (
                  <div className="relative">
                    <p className="rounded-md bg-destructive/10 px-2 py-1 pr-8 text-sm text-destructive">
                      {selectedJob.error}
                    </p>
                    <ClipButton text={selectedJob.error} />
                  </div>
                )}
              </div>

              <div className="space-y-1 rounded-md border px-3 py-2 text-xs">
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
                {(() => {
                  const d = jobDuration(selectedJob)
                  return d != null ? (
                    <TimingRow label="소요" value={formatDuration(d)} />
                  ) : null
                })()}
                {selectedJob.retryCount > 0 && (
                  <TimingRow
                    label="재시도"
                    value={`${selectedJob.retryCount}회`}
                  />
                )}
              </div>

              <div className="flex gap-2">
                {(selectedJob.status === "pending" ||
                  selectedJob.status === "queued" ||
                  selectedJob.status === "running") && (
                  <Button
                    size="sm"
                    variant="destructive"
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
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        handleRetry(e, selectedJob.id)
                        setSelectedJobId(null)
                      }}
                    >
                      재시도
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
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

              {(() => {
                const hashes = fetchedImages.get(selectedJob.id) ?? []
                if (hashes.length === 0) return null
                return (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">
                      생성된 이미지 ({hashes.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {hashes.map((h, i) => {
                        const url = `${backendUrl}/saved-images/${h}`
                        const allUrls = hashes.map(
                          (hh) => `${backendUrl}/saved-images/${hh}`
                        )
                        return (
                          <button
                            key={h}
                            onClick={() => {
                              setLightboxUrls(allUrls)
                              setLightboxIndex(i)
                            }}
                            className="block w-full"
                          >
                            <img
                              src={url}
                              alt={`Generated ${i}`}
                              loading="lazy"
                              decoding="async"
                              className="h-auto w-full rounded-md border transition-opacity hover:opacity-80"
                            />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">이벤트 로그</h4>
                {isLoadingEvents ? (
                  <p className="text-xs text-muted-foreground">로드 중…</p>
                ) : jobEvents && jobEvents.length > 0 ? (
                  <div className="space-y-1">
                    {jobEvents.map((ev) => {
                      const cls =
                        STATUS_STYLE[ev.eventType as JobStatus]?.badge ??
                        "bg-muted text-muted-foreground"
                      return (
                        <div
                          key={ev.id}
                          className="flex flex-wrap items-baseline gap-2 text-xs"
                        >
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {new Date(ev.timestamp * 1000).toLocaleTimeString()}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 ${cls}`}
                          >
                            {ev.eventType}
                          </span>
                          {ev.workerId && (
                            <span className="shrink-0 font-mono text-muted-foreground">
                              {ev.workerId}
                            </span>
                          )}
                          {ev.details && Object.keys(ev.details).length > 0 && (
                            <span className="text-muted-foreground">
                              {JSON.stringify(ev.details)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">이벤트 없음</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Image lightbox */}
      {lightboxUrls && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrls(null)}
        >
          <button
            className="absolute top-4 right-4 rounded-full bg-background/20 p-2 text-white hover:bg-background/40"
            onClick={() => setLightboxUrls(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {lightboxUrls.length > 1 && (
            <>
              <button
                className="absolute top-1/2 left-4 -translate-y-1/2 rounded-full bg-background/20 p-2 text-white hover:bg-background/40"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((i) => Math.max(0, i - 1))
                }}
                disabled={lightboxIndex === 0}
              >
                <ChevronDown className="h-5 w-5 rotate-90" />
              </button>
              <button
                className="absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-background/20 p-2 text-white hover:bg-background/40"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((i) =>
                    Math.min(lightboxUrls.length - 1, i + 1)
                  )
                }}
                disabled={lightboxIndex === lightboxUrls.length - 1}
              >
                <ChevronDown className="h-5 w-5 -rotate-90" />
              </button>
            </>
          )}
          <img
            src={lightboxUrls[lightboxIndex]!}
            alt="확대 이미지"
            className="max-h-[90vh] max-w-[90vw] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxUrls.length > 1 && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-background/20 px-3 py-1 text-sm text-white">
              {lightboxIndex + 1} / {lightboxUrls.length}
            </p>
          )}
        </div>
      )}
    </div>
  )
})
