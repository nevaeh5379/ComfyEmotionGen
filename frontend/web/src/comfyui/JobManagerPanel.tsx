import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
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

// ── session storage ───────────────────────────────────────────────────────────

interface SessionMarker {
  id: string
  startAt: number  // ms epoch; 0 = beginning of time (catches all prior jobs)
  label: string
}

const SESSIONS_KEY = "ceg_sessions"

function loadMarkers(): SessionMarker[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") } catch { return [] }
}

function saveMarkers(ms: SessionMarker[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(ms))
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

// A job belongs to the newest marker whose startAt <= job.createdAt * 1000.
// sortedDesc must be sorted newest-first (largest startAt first).
function jobSessionId(createdAtSec: number, sortedDesc: SessionMarker[]): string {
  const t = createdAtSec * 1000
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
  pending:   { label: "대기 중",    badge: "bg-muted text-muted-foreground" },
  queued:    { label: "큐 대기 중", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  running:   { label: "진행 중",    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" },
  done:      { label: "완료",       badge: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  error:     { label: "실패",       badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  cancelled: { label: "취소됨",     badge: "bg-muted text-muted-foreground" },
}

const STAT_LABELS: Record<JobStatus, string> = {
  pending: "대기", queued: "큐", running: "진행",
  done: "완료", error: "실패", cancelled: "취소",
}

const STATUS_ORDER: Record<JobStatus, number> = {
  running: 0, queued: 1, pending: 2, done: 3, error: 4, cancelled: 5,
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

function dateToEpochStart(s: string): number { const d = new Date(s); d.setHours(0, 0, 0, 0); return d.getTime() / 1000 }
function dateToEpochEnd(s: string):   number { const d = new Date(s); d.setHours(23, 59, 59, 999); return d.getTime() / 1000 }

// ── sub-components ────────────────────────────────────────────────────────────

interface SortableHeadProps {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir
  onSort: (k: SortKey) => void
}
function SortableHead({ label, sortKey, current, dir, onSort }: SortableHeadProps) {
  const active = current === sortKey
  return (
    <TableHead>
      <button className="flex items-center gap-1 font-medium transition-colors hover:text-foreground" onClick={() => onSort(sortKey)}>
        {label}
        {active
          ? dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
          : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />}
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

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  jobs: JobView[]
  paused: boolean
  backendUrl: string
  isAliveBackend: boolean
}

export function JobManagerPanel({ jobs, paused, backendUrl, isAliveBackend }: Props) {
  // ── session state ───────────────────────────────────────────────────────────
  const [markers, setMarkersRaw] = useState<SessionMarker[]>(initMarkers)

  const persistMarkers = (ms: SessionMarker[]) => {
    saveMarkers(ms)
    setMarkersRaw(ms)
  }

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => b.startAt - a.startAt),
    [markers],
  )

  // Default: newest marker
  const [selectedId, setSelectedId] = useState<string>(
    () => initMarkers().sort((a, b) => b.startAt - a.startAt)[0]!.id,
  )

  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)

  // ── filter / sort / date-range state ───────────────────────────────────────
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [sortKey, setSortKey]     = useState<SortKey>("createdAt")
  const [sortDir, setSortDir]     = useState<SortDir>("desc")
  const [dateFrom, setDateFrom]   = useState("")
  const [dateTo,   setDateTo]     = useState("")

  // ── detail sheet ────────────────────────────────────────────────────────────
  const [selectedJobId,   setSelectedJobId]   = useState<string | null>(null)
  const [jobEvents,       setJobEvents]       = useState<JobEvent[] | null>(null)
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [dismissedUrl,    setDismissedUrl]    = useState("")
  const [, setTick] = useState(0)

  // ── session computations ────────────────────────────────────────────────────

  const sessionJobCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of jobs) {
      const sid = jobSessionId(j.createdAt, sortedMarkers)
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [jobs, sortedMarkers])

  const sessionJobs = useMemo(
    () => jobs.filter(j => jobSessionId(j.createdAt, sortedMarkers) === selectedId),
    [jobs, sortedMarkers, selectedId],
  )

  // ── status counts ───────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const c: Record<JobStatus | "active", number> = {
      pending: 0, queued: 0, running: 0, done: 0, error: 0, cancelled: 0, active: 0,
    }
    for (const j of sessionJobs) {
      c[j.status]++
      if (j.status === "pending" || j.status === "queued" || j.status === "running") c.active++
    }
    return c
  }, [sessionJobs])

  // ── filter pipeline ─────────────────────────────────────────────────────────

  const tabFiltered = useMemo(() => {
    switch (filterTab) {
      case "active":  return sessionJobs.filter(j => j.status === "pending" || j.status === "queued" || j.status === "running")
      case "done":    return sessionJobs.filter(j => j.status === "done")
      case "failed":  return sessionJobs.filter(j => j.status === "error" || j.status === "cancelled")
      default:        return sessionJobs
    }
  }, [sessionJobs, filterTab])

  const dateFiltered = useMemo(() => {
    const from = dateFrom ? dateToEpochStart(dateFrom) : null
    const to   = dateTo   ? dateToEpochEnd(dateTo)     : null
    if (from === null && to === null) return tabFiltered
    return tabFiltered.filter(j => {
      if (from !== null && j.createdAt < from) return false
      if (to   !== null && j.createdAt > to)   return false
      return true
    })
  }, [tabFiltered, dateFrom, dateTo])

  const sortedJobs = useMemo(() => {
    const arr = [...dateFiltered]
    const dir = sortDir === "asc" ? 1 : -1
    arr.sort((a, b) => {
      switch (sortKey) {
        case "filename":  return dir * a.filename.localeCompare(b.filename)
        case "status":    return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
        case "createdAt": return dir * (a.createdAt - b.createdAt)
        case "duration": {
          const da = jobDuration(a) ?? (sortDir === "asc" ? Infinity : -Infinity)
          const db = jobDuration(b) ?? (sortDir === "asc" ? Infinity : -Infinity)
          return dir * (da - db)
        }
      }
    })
    return arr
  }, [dateFiltered, sortKey, sortDir])

  // ── misc computed ───────────────────────────────────────────────────────────

  const activeJob = useMemo(
    () => [...sessionJobs].reverse().find(j => j.status === "running" || j.status === "queued"),
    [sessionJobs],
  )

  const lastImages = useMemo(() => {
    const last = [...sessionJobs].reverse().find(j => j.status === "done" && j.imageUrls.length > 0)
    if (!last) return []
    return last.imageUrls.slice(0, 4).map(u => u.startsWith("http") ? u : `${backendUrl}${u}`)
  }, [sessionJobs, backendUrl])

  const previewVisible = lastImages.length > 0 && lastImages[0] !== dismissedUrl
  const selectedJob    = selectedJobId ? jobs.find(j => j.id === selectedJobId) ?? null : null
  const hasDateFilter  = dateFrom !== "" || dateTo !== ""

  const sessionButtonLabel = (() => {
    const m = markers.find(mm => mm.id === selectedId)
    const count = sessionJobCounts.get(selectedId) ?? 0
    return m ? `${m.label} (${count})` : `(${count})`
  })()

  // ── effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedJob || selectedJob.status !== "running") return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [selectedJob])

  // ── session actions ─────────────────────────────────────────────────────────

  const createNewSession = () => {
    const newMarker: SessionMarker = { id: genId(), startAt: Date.now(), label: makeSessionLabel(markers.length + 1) }
    persistMarkers([...markers, newMarker])
    setSelectedId(newMarker.id)
    setSessionPickerOpen(false)
  }

  const goToCurrentSession = () => {
    const newest = sortedMarkers[0]
    if (newest) { setSelectedId(newest.id); setSessionPickerOpen(false) }
  }

  // ── api ─────────────────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  const handleCancel = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    try { await fetch(`${backendUrl}/jobs/${jobId}`, { method: "DELETE" }) } catch {}
  }

  const handleCancelAll = async () => {
    try { await fetch(`${backendUrl}/jobs/cancel-all`, { method: "POST" }) } catch {}
  }

  const handleTogglePause = async () => {
    try { await fetch(`${backendUrl}/jobs/${paused ? "resume" : "pause"}`, { method: "POST" }) } catch {}
  }

  const handleRetry = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    try { await fetch(`${backendUrl}/jobs/${jobId}/retry`, { method: "POST" }) } catch {}
  }

  const openDetail = async (jobId: string) => {
    setSelectedJobId(jobId)
    setJobEvents(null)
    setIsLoadingEvents(true)
    try {
      const res = await fetch(`${backendUrl}/jobs/${jobId}/events`)
      if (res.ok) setJobEvents((await res.json()).events)
    } finally { setIsLoadingEvents(false) }
  }

  // ── empty state ─────────────────────────────────────────────────────────────

  if (sessionJobs.length === 0) {
    const currentMarker  = sortedMarkers[0]
    const currentIsEmpty = !currentMarker || (sessionJobCounts.get(currentMarker.id) ?? 0) === 0
    const viewingCurrent = currentMarker && selectedId === currentMarker.id
    const otherSessions  = sortedMarkers.filter(m => m.id !== selectedId && (sessionJobCounts.get(m.id) ?? 0) > 0)

    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            {viewingCurrent && currentIsEmpty ? "새 세션이 시작되었어요" : "선택한 세션에 작업이 없어요"}
          </EmptyTitle>
          <EmptyDescription>
            {viewingCurrent && currentIsEmpty
              ? "잡을 제출하면 여기에 표시됩니다."
              : "다른 세션을 선택하면 이전 잡을 볼 수 있어요."}
          </EmptyDescription>
        </EmptyHeader>
        <div className="mt-4 flex flex-wrap gap-2">
          {otherSessions.map(m => (
            <Button key={m.id} size="sm" variant="outline" onClick={() => setSelectedId(m.id)}>
              {m.label} ({sessionJobCounts.get(m.id)})
            </Button>
          ))}
        </div>
      </Empty>
    )
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* Stats bar */}
      <div className="grid grid-cols-6 gap-1.5">
        {(["pending", "queued", "running", "done", "error", "cancelled"] as JobStatus[]).map(s => (
          <div key={s} className="rounded-md border px-2 py-1.5 text-center">
            <div className={`text-lg font-bold tabular-nums leading-none ${STATUS_STYLE[s].badge.split(" ").find(c => c.startsWith("text-")) ?? "text-foreground"}`}>
              {counts[s]}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{STAT_LABELS[s]}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={paused ? "default" : "outline"} onClick={handleTogglePause} disabled={!isAliveBackend}>
          {paused ? "재개" : "일시중지"}
        </Button>
        <Button size="sm" variant="destructive" onClick={handleCancelAll} disabled={!isAliveBackend || counts.active === 0}>
          전부 취소
        </Button>
        {paused && <span className="text-xs text-muted-foreground">새 잡이 워커로 전송되지 않습니다.</span>}

        {/* Session picker button */}
        <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setSessionPickerOpen(o => !o)}>
          <span className="text-xs">{sessionButtonLabel}</span>
          {sessionPickerOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {/* Session picker panel */}
      {sessionPickerOpen && (
        <div className="rounded-md border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">세션 선택</span>
            <div className="flex items-center gap-1">
              <button
                className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={goToCurrentSession}
              >
                현재 세션
              </button>
              <span className="text-muted-foreground/40">|</span>
              <button
                className="rounded px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                onClick={createNewSession}
              >
                + 새 세션 시작
              </button>
            </div>
          </div>

          <div className="space-y-0.5">
            {sortedMarkers.map((m, i) => {
              const count    = sessionJobCounts.get(m.id) ?? 0
              const isActive = m.id === selectedId
              const isNewest = i === 0
              const isEmpty  = count === 0
              return (
                <button
                  key={m.id}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/60 ${isActive ? "bg-muted" : ""}`}
                  onClick={() => { setSelectedId(m.id); setSessionPickerOpen(false) }}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-foreground" : "border border-muted-foreground/40"}`} />
                  <span className={`flex-1 text-sm ${isEmpty ? "text-muted-foreground" : ""}`}>{m.label}</span>
                  {isNewest && (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      현재
                    </span>
                  )}
                  <span className={`w-12 text-right text-xs tabular-nums ${isEmpty ? "text-muted-foreground/50" : "font-medium"}`}>
                    {count}개
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <Field>
        <FieldLabel>
          <span className="truncate">
            {activeJob
              ? `${activeJob.filename} · ${activeJob.currentNodeName || "—"}`
              : paused ? "일시중지됨" : "대기 중"}
          </span>
          <span className="ml-auto tabular-nums">{Math.round(activeJob?.progressPercent ?? 0)}%</span>
        </FieldLabel>
        <Progress value={activeJob?.progressPercent ?? 0} className="w-full" />
      </Field>

      {/* Preview images */}
      {previewVisible && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">미리보기</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setDismissedUrl(lastImages[0]!)}>
              닫기
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {lastImages.map((url, i) => (
              <img key={url} src={url} alt={`Generated ${i}`} className="h-auto w-full rounded-md border" />
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <Tabs value={filterTab} onValueChange={v => setFilterTab(v as FilterTab)}>
        <TabsList>
          <TabsTrigger value="all">전체 ({sessionJobs.length})</TabsTrigger>
          <TabsTrigger value="active">활성 ({counts.active})</TabsTrigger>
          <TabsTrigger value="done">완료 ({counts.done})</TabsTrigger>
          <TabsTrigger value="failed">실패/취소 ({counts.error + counts.cancelled})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">생성일</span>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-7 w-36 text-xs" />
        <span className="text-xs text-muted-foreground">—</span>
        <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-7 w-36 text-xs" />
        {hasDateFilter && (
          <>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo("") }}>
              <X className="mr-1 h-3 w-3" />초기화
            </Button>
            <span className="text-xs text-muted-foreground">({sortedJobs.length} / {tabFiltered.length})</span>
          </>
        )}
      </div>

      {/* Job table */}
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="파일명"   sortKey="filename"  current={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableHead label="상태"     sortKey="status"    current={sortKey} dir={sortDir} onSort={toggleSort} />
            <TableHead>워커</TableHead>
            <SortableHead label="생성"     sortKey="createdAt" current={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableHead label="소요시간" sortKey="duration"  current={sortKey} dir={sortDir} onSort={toggleSort} />
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedJobs.map(j => {
            const isActive = j.status === "pending" || j.status === "queued" || j.status === "running"
            const isFailed = j.status === "error" || j.status === "cancelled"
            const dur = jobDuration(j)
            const statusLabel = j.status === "pending" && j.retryCount > 0
              ? `대기 중 (재시도 ${j.retryCount})`
              : STATUS_STYLE[j.status].label
            return (
              <TableRow key={j.id} className="cursor-pointer" onClick={() => openDetail(j.id)}>
                <TableCell className="max-w-[140px] truncate font-mono text-xs">{j.filename}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[j.status].badge}`}>
                    {statusLabel}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">{j.workerId ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{timeAgo(j.createdAt)}</TableCell>
                <TableCell className="text-xs tabular-nums">{dur != null ? formatDuration(dur) : "—"}</TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    {isActive && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={e => handleCancel(e, j.id)}>취소</Button>}
                    {isFailed && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={e => handleRetry(e, j.id)}>재시도</Button>}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {sortedJobs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                {hasDateFilter ? "선택한 날짜 범위에 맞는 잡이 없습니다." : "해당 필터에 맞는 잡이 없습니다."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Job detail sheet */}
      <Sheet open={selectedJobId !== null} onOpenChange={open => { if (!open) setSelectedJobId(null) }}>
        <SheetContent className="flex min-w-[420px] flex-col gap-4 overflow-y-auto">
          <SheetHeader><SheetTitle>잡 상세</SheetTitle></SheetHeader>
          {selectedJob && (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[selectedJob.status].badge}`}>
                    {STATUS_STYLE[selectedJob.status].label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{selectedJob.id.slice(0, 8)}…</span>
                </div>
                <p className="font-mono text-sm font-semibold">{selectedJob.filename}</p>
                <p className="line-clamp-4 text-sm text-muted-foreground">{selectedJob.prompt}</p>
                {selectedJob.error && (
                  <p className="rounded-md bg-destructive/10 px-2 py-1 text-sm text-destructive">{selectedJob.error}</p>
                )}
              </div>

              <div className="rounded-md border px-3 py-2 text-xs space-y-1">
                <TimingRow label="생성" value={new Date(selectedJob.createdAt * 1000).toLocaleString()} />
                {selectedJob.startedAt  && <TimingRow label="시작" value={new Date(selectedJob.startedAt * 1000).toLocaleString()} />}
                {selectedJob.finishedAt && <TimingRow label="완료" value={new Date(selectedJob.finishedAt * 1000).toLocaleString()} />}
                {(() => { const d = jobDuration(selectedJob); return d != null ? <TimingRow label="소요" value={formatDuration(d)} /> : null })()}
                {selectedJob.retryCount > 0 && <TimingRow label="재시도" value={`${selectedJob.retryCount}회`} />}
              </div>

              <div className="flex gap-2">
                {(selectedJob.status === "pending" || selectedJob.status === "queued" || selectedJob.status === "running") && (
                  <Button size="sm" variant="destructive" onClick={e => { handleCancel(e, selectedJob.id); setSelectedJobId(null) }}>취소</Button>
                )}
                {(selectedJob.status === "error" || selectedJob.status === "cancelled") && (
                  <Button size="sm" variant="outline" onClick={e => { handleRetry(e, selectedJob.id); setSelectedJobId(null) }}>재시도</Button>
                )}
              </div>

              {selectedJob.imageUrls.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">생성된 이미지 ({selectedJob.imageUrls.length})</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedJob.imageUrls.map((url, i) => {
                      const full = url.startsWith("http") ? url : `${backendUrl}${url}`
                      return (
                        <a key={url} href={full} target="_blank" rel="noreferrer">
                          <img src={full} alt={`Generated ${i}`} className="h-auto w-full rounded-md border transition-opacity hover:opacity-80" />
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">이벤트 로그</h4>
                {isLoadingEvents ? (
                  <p className="text-xs text-muted-foreground">로드 중…</p>
                ) : jobEvents && jobEvents.length > 0 ? (
                  <div className="space-y-1">
                    {jobEvents.map(ev => {
                      const cls = STATUS_STYLE[ev.eventType as JobStatus]?.badge ?? "bg-muted text-muted-foreground"
                      return (
                        <div key={ev.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                          <span className="shrink-0 tabular-nums text-muted-foreground">{new Date(ev.timestamp * 1000).toLocaleTimeString()}</span>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 ${cls}`}>{ev.eventType}</span>
                          {ev.workerId && <span className="shrink-0 font-mono text-muted-foreground">{ev.workerId}</span>}
                          {ev.details && Object.keys(ev.details).length > 0 && (
                            <span className="text-muted-foreground">{JSON.stringify(ev.details)}</span>
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
    </div>
  )
}
