import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { format } from "date-fns"
import {
  X,
  Calendar,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Filter,
  List,
  Activity,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { ScrollArea } from "@/components/ui/scroll-area"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { JobStatus, JobView, WorkerView } from "../types/Message"
import { useRenderLog } from "@/lib/renderLogger"
import { cn } from "@/lib/utils"
import { useConfirm } from "@/comfyui/hooks/useConfirm"
import { API, HEADERS } from "@/lib/api"
import {
  JOB_PAGE_SIZE,
  TICK_INTERVAL_MS,
  MS_PER_SECOND,
  SECONDS_PER_HOUR,
} from "@/lib/constants"
import { toast } from "sonner"

// Extracted components
import {
  JobStatBar,
  RunningJobsBanner,
  JobTableSection,
} from "./JobManagerSections"
import { JobDetailSheet } from "./JobDetailSheet"
import { TagInputSearch } from "./TagInputSearch"
import { useSettings } from "../hooks/useSettings"

// Session utilities
import type { SessionMarkerRaw, ActiveStateRaw } from "../utils/sessionUtils"

const PAGE_SIZE = JOB_PAGE_SIZE

type SortKey = "filename" | "status" | "createdAt" | "duration"
type SortDir = "asc" | "desc"
type FilterTab = "all" | "active" | "done" | "failed"

// ── pure helpers ──────────────────────────────────────────────────────

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

interface Props {
  jobs: JobView[]
  paused: boolean
  backendUrl: string
  isAliveBackend: boolean
  mobileTab?: "status" | "list"
  workers: WorkerView[]

  // Lifted session state & handler props
  selectedId: string
  setSelectedId: (id: string) => void
  markers: SessionMarkerRaw[]
  setMarkersRaw: (ms: SessionMarkerRaw[]) => void
  activeState: ActiveStateRaw | null
  setActiveStateRaw: (as: ActiveStateRaw) => void
  sessionPickerOpen: boolean
  setSessionPickerOpen: (open: boolean) => void
  createNewSession: () => void
  sessionJobCounts: Map<string, number>
  sortedMarkers: SessionMarkerRaw[]
  counts: Record<JobStatus | "active", number>
  sessionJobs: JobView[] // 하위호환 유지용
  handleTogglePause: () => void
  handleCancelAll: () => void
  handleRetryAllFailed: () => void
  handleDeleteAllFailed: () => void
  refetchStats?: (() => void) | undefined

  // Floating Window controls
  isFloating?: boolean
  onFloatToggle?: () => void
  onHeaderDragStart?: (e: React.MouseEvent) => void
}

export const JobManagerPanel = memo(function JobManagerPanel({
  jobs, // 웹소켓 활성 잡 목록
  backendUrl,
  mobileTab = "list",
  counts,
  isFloating,
  onFloatToggle,
  onHeaderDragStart,
  workers,
  selectedId,
  activeState,
  sessionJobCounts,
  sortedMarkers,
  refetchStats,
}: Props) {
  useRenderLog("JobManagerPanel")
  const confirm = useConfirm()
  const { settings } = useSettings()

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest("button, input, select, [role='tab'], a, textarea")) {
        return
      }
      onHeaderDragStart?.(e)
    },
    [onHeaderDragStart]
  )

  // ── filter / sort / date-range state ────────────────────────────────
  const [filterTab, setFilterTabState] = useState<FilterTab>("all")
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dateFrom, setDateFromState] = useState("")
  const [dateTo, setDateToState] = useState("")
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  // ── pagination state ────────────────────────────────────────────────
  const [desiredPage, setPage] = useState(1)

  // ── Async Paginated Jobs State ──────────────────────────────────────
  const [pageJobs, setPageJobs] = useState<JobView[]>([])
  const [totalJobsCount, setTotalJobsCount] = useState(0)
  const [, setIsLoading] = useState(false)
  const [refetchTick, setRefetchTick] = useState(0)

  const triggerRefetchJobs = useCallback(() => setRefetchTick((t) => t + 1), [])

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

  // ── 세션 시간 범위 계산 ───────────────────────────────────────────
  const sessionRange = useMemo(() => {
    if (sortedMarkers.length === 0 || !selectedId) return { from: null, to: null }
    const targetIdx = sortedMarkers.findIndex((m) => m.id === selectedId)
    if (targetIdx === -1) return { from: null, to: null }

    const target = sortedMarkers[targetIdx]
    if (!target) return { from: null, to: null }

    const isCurrentActive = activeState && selectedId === activeState.activeSessionId

    if (isCurrentActive) {
      return {
        from: activeState.activatedAt / 1000,
        to: null,
      }
    }

    const from = target.startAt / 1000
    let to: number | null = null

    if (targetIdx > 0) {
      const prevMarker = sortedMarkers[targetIdx - 1]
      if (prevMarker) {
        to = prevMarker.startAt / 1000
      }
    } else if (activeState && selectedId !== activeState.activeSessionId) {
      to = activeState.activatedAt / 1000
    }

    return { from, to }
  }, [sortedMarkers, selectedId, activeState])

  // ── 비동기 작업 목록 로딩 ──
  useEffect(() => {
    let aborted = false
    setIsLoading(true)

    const limit = PAGE_SIZE
    const offset = (desiredPage - 1) * PAGE_SIZE

    const params = new URLSearchParams()
    params.append("limit", String(limit))
    params.append("offset", String(offset))

    if (filterTab === "active") {
      params.append("status", "pending")
      params.append("status", "queued")
      params.append("status", "running")
    } else if (filterTab === "done") {
      params.append("status", "done")
    } else if (filterTab === "failed") {
      params.append("status", "error")
      params.append("status", "cancelled")
    }

    searchTags.forEach((tag) => {
      params.append("search", tag)
    })

    let fromVal = sessionRange.from
    if (dateFrom) {
      const dfEpoch = dateToEpochStart(dateFrom)
      fromVal = fromVal !== null ? Math.max(fromVal, dfEpoch) : dfEpoch
    }
    if (fromVal !== null) {
      params.append("created_at_from", String(fromVal))
    }

    let toVal = sessionRange.to
    if (dateTo) {
      const dtEpoch = dateToEpochEnd(dateTo)
      toVal = toVal !== null ? Math.min(toVal, dtEpoch) : dtEpoch
    }
    if (toVal !== null) {
      params.append("created_at_to", String(toVal))
    }

    params.append("sort_by", sortKey)
    params.append("sort_order", sortDir)

    fetch(`${backendUrl}/jobs?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("jobs fetch failed")
        return res.json()
      })
      .then((data) => {
        if (aborted) return
        setPageJobs(data.items || [])
        setTotalJobsCount(data.total || 0)
        setIsLoading(false)
      })
      .catch((err) => {
        console.warn("작업 목록 조회 실패:", err)
        if (aborted) return
        setIsLoading(false)
      })

    return () => {
      aborted = true
    }
  }, [
    desiredPage,
    filterTab,
    searchTags,
    sessionRange,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
    backendUrl,
    refetchTick,
  ])

  // 실시간 잡 갱신 감지 및 목록 리프레시 트리거
  const prevActiveJobCountRef = useRef(jobs.length)
  const prevActiveJobStatusesRef = useRef(jobs.map((j) => `${j.id}:${j.status}`).join(","))

  useEffect(() => {
    const currentStatuses = jobs.map((j) => `${j.id}:${j.status}`).join(",")
    if (
      jobs.length !== prevActiveJobCountRef.current ||
      currentStatuses !== prevActiveJobStatusesRef.current
    ) {
      prevActiveJobCountRef.current = jobs.length
      prevActiveJobStatusesRef.current = currentStatuses
      triggerRefetchJobs()
    }
  }, [jobs, triggerRefetchJobs])

  // 실시간 활성 잡 정보 병합
  const mergedJobs = useMemo(() => {
    return pageJobs.map((pj) => {
      const active = jobs.find((aj) => aj.id === pj.id)
      return active ? active : pj
    })
  }, [pageJobs, jobs])

  // ── token caching for autocomplete ──
  const cachedTokens = useMemo(() => {
    const filenames = new Set<string>()
    const prompts = new Set<string>()
    const errors = new Set<string>()

    const tokenize = (str: string) => {
      if (!str) return []
      return str
        .split(/[\s_\-.,()]+/g)
        .map((t) =>
          t
            .trim()
            .toLowerCase()
            .replace(/^[^\w가-힣]+|[^\w가-힣]+$/g, "")
        )
        .filter((t) => t.length >= 2)
    }

    pageJobs.forEach((j) => {
      tokenize(j.filename).forEach((t) => filenames.add(t))
      if (j.prompt) {
        tokenize(j.prompt).forEach((t) => prompts.add(t))
      }
      if (j.error) {
        tokenize(j.error).forEach((t) => errors.add(t))
      }
    })

    return { filenames, prompts, errors }
  }, [pageJobs])

  const autocompleteCandidates = useMemo(() => {
    const trimmed = tagInput.trim()
    if (trimmed.length < 1) return []

    let query = trimmed.toLowerCase()
    let filterType: "filename" | "prompt" | "error" | "all" = "all"

    if (query.startsWith("@")) {
      filterType = "filename"
      query = query.slice(1)
    } else if (query.startsWith("#")) {
      filterType = "prompt"
      query = query.slice(1)
    } else if (query.startsWith("$")) {
      filterType = "error"
      query = query.slice(1)
    }

    const matchedFilenames =
      filterType === "all" || filterType === "filename"
        ? [...cachedTokens.filenames]
            .filter((t) =>
              query === ""
                ? !searchTags.includes(`@${t}`)
                : t.includes(query) &&
                  t !== query &&
                  !searchTags.includes(`@${t}`) &&
                  !searchTags.includes(t)
            )
            .slice(0, 5)
            .map((t) => ({ value: t, type: "filename" as const }))
        : []

    const matchedPrompts =
      filterType === "all" || filterType === "prompt"
        ? [...cachedTokens.prompts]
            .filter((t) =>
              query === ""
                ? !searchTags.includes(`#${t}`)
                : t.includes(query) &&
                  t !== query &&
                  !searchTags.includes(`#${t}`) &&
                  !searchTags.includes(t) &&
                  !matchedFilenames.some((f) => f.value === t)
            )
            .slice(0, 5)
            .map((t) => ({ value: t, type: "prompt" as const }))
        : []

    const matchedErrors =
      filterType === "all" || filterType === "error"
        ? [...cachedTokens.errors]
            .filter((t) =>
              query === ""
                ? !searchTags.includes(`$${t}`)
                : t.includes(query) &&
                  t !== query &&
                  !searchTags.includes(`$${t}`) &&
                  !searchTags.includes(t) &&
                  !matchedFilenames.some((f) => f.value === t) &&
                  !matchedPrompts.some((p) => p.value === t)
            )
            .slice(0, 3)
            .map((t) => ({ value: t, type: "error" as const }))
        : []

    return [...matchedFilenames, ...matchedPrompts, ...matchedErrors].slice(
      0,
      6
    )
  }, [tagInput, cachedTokens, searchTags])

  // ── pagination computed ─────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(totalJobsCount / PAGE_SIZE))
  const page = desiredPage
  const pagedJobs = mergedJobs

  // ── misc computed ───────────────────────────────────────────────────

  const selectedJob = selectedJobId
    ? (jobs.find((j) => j.id === selectedJobId) ??
       pageJobs.find((j) => j.id === selectedJobId) ??
       null)
    : null
  const hasDateFilter = dateFrom !== "" || dateTo !== ""
  const hasAnyFilter = searchTags.length > 0 || dateFrom !== "" || dateTo !== ""

  const runningJobs = useMemo(
    () => jobs.filter((j) => j.status === "running" || j.status === "queued"),
    [jobs]
  )

  // ── effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!runningJobs.length) return
    const id = setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [runningJobs])

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
      const res = await fetch(`${backendUrl}${API.jobs.detail(jobId)}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      triggerRefetchJobs()
      refetchStats?.()
    } catch {
      toast.error("작업 취소 요청에 실패했습니다.")
    }
  }

  const handleRetry = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    try {
      const res = await fetch(`${backendUrl}${API.jobs.retry(jobId)}`, { method: "POST" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      triggerRefetchJobs()
      refetchStats?.()
    } catch {
      toast.error("작업 재시도 요청에 실패했습니다.")
    }
  }

  const handleMoveJob = async (jobId: string, targetWorkerId: string) => {
    try {
      const res = await fetch(`${backendUrl}${API.jobs.move(jobId)}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ targetWorkerId: targetWorkerId || undefined }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("작업이 이동되었습니다.")
      triggerRefetchJobs()
      refetchStats?.()
    } catch {
      toast.error("작업 이동 요청에 실패했습니다.")
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
      const res = await fetch(`${backendUrl}${API.jobs.delete}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ job_ids: [jobId] }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      triggerRefetchJobs()
      refetchStats?.()
    } catch {
      toast.error("작업 삭제 요청에 실패했습니다.")
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
      const res = await fetch(`${backendUrl}${API.jobs.delete}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ job_ids: Array.from(selectedForDelete) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSelectedForDelete(new Set())
      triggerRefetchJobs()
      refetchStats?.()
    } catch {
      toast.error("작업 삭제 요청에 실패했습니다.")
    }
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
      pageJobs
        .filter((j) => j.status === "error" || j.status === "cancelled")
        .map((j) => j.id)
    )
    setSelectedForDelete(failedIds)
  }

  const deselectAll = () => setSelectedForDelete(new Set())

  const addSearchTag = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed) return
    setSearchTags((prev) => {
      if (prev.includes(trimmed)) return prev
      return [...prev, trimmed]
    })
    setPage(1)
    setSelectedForDelete(new Set())
    setTagInput("")
  }

  const clearAllFilters = () => {
    setSearchTags([])
    setTagInput("")
    setDateFromState("")
    setDateToState("")
    setPage(1)
    setSelectedForDelete(new Set())
  }

  // ── extracted tag input with autocomplete ────────────────────────────

  const fetchingRef = useRef<Set<string>>(new Set())

  const fetchJobImages = useCallback(
    async (jobId: string) => {
      if (fetchedImages.has(jobId) || fetchingRef.current.has(jobId)) return
      fetchingRef.current.add(jobId)
      try {
        const res = await fetch(`${backendUrl}${API.jobs.savedImages(jobId)}`)
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
        const d = new Date(now.getTime() - SECONDS_PER_HOUR * MS_PER_SECOND)
        setDateFrom(d.toISOString().slice(0, 10))
        break
      }
      case "today": {
        setDateFrom(toStr)
        break
      }
      case "24h": {
        const d = new Date(
          now.getTime() - 24 * SECONDS_PER_HOUR * MS_PER_SECOND
        )
        setDateFrom(d.toISOString().slice(0, 10))
        break
      }
    }
  }

  const currentSessionJobCount = sessionJobCounts.get(selectedId) ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      {/* 2. Status Content (Mobile status tab OR Desktop always) */}
      <ScrollArea
        className={cn(
          "shrink-0 border-b border-line bg-panel",
          mobileTab === "status"
            ? "h-full max-h-none flex-1"
            : "hidden max-h-[85dvh] md:block"
        )}
      >
        <div className={cn(mobileTab === "status" ? "space-y-5 p-3" : "")}>
          <JobStatBar
            counts={counts}
            sessionJobs={jobs} // 실시간 웹소켓 잡들 전달
            progressCalculation={settings.progressCalculation}
          />
          {mobileTab === "status" && (
            <div className="mt-4 space-y-3 px-1">
              <h3 className="border-b pb-1.5 text-xs font-black tracking-widest text-muted-foreground uppercase">
                실행 중인 작업
              </h3>
              <RunningJobsBanner jobs={runningJobs} allJobs={pageJobs} workers={workers} />
            </div>
          )}
          {mobileTab !== "status" && (
            <RunningJobsBanner jobs={runningJobs} allJobs={pageJobs} workers={workers} />
          )}
        </div>
      </ScrollArea>

      {/* 3. List Content */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          mobileTab === "list" ? "flex flex-1" : "hidden md:flex"
        )}
      >
        {/* Unified 1-Line Toolbar (Mobile viewport) */}
        <div className="flex shrink-0 items-center justify-between gap-1 border-b bg-muted/10 px-2.5 py-1.5 md:hidden">
          {/* 1. Status Filter Select */}
          <Select
            value={filterTab}
            onValueChange={(v) => setFilterTab(v as FilterTab)}
          >
            <SelectTrigger className="h-8 w-[92px] border-line bg-background px-1.5 text-[11px] font-black shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="max-h-60 w-[110px] overflow-y-auto"
              align="start"
              sideOffset={4}
            >
              <SelectItem value="all" className="text-[11px] font-bold">
                <span className="flex items-center gap-1.5">
                  <List className="h-3.5 w-3.5" />
                  전체 ({currentSessionJobCount})
                </span>
              </SelectItem>
              <SelectItem
                value="active"
                className="text-[11px] font-bold text-info"
              >
                <span className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  활성 ({counts.active})
                </span>
              </SelectItem>
              <SelectItem
                value="done"
                className="text-[11px] font-bold text-ok"
              >
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  완료 ({counts.done})
                </span>
              </SelectItem>
              <SelectItem
                value="failed"
                className="text-[11px] font-bold text-bad"
              >
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  실패 ({counts.error + counts.cancelled})
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* 2. Date Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "flex h-8 w-[82px] items-center justify-between gap-1 border-line bg-background px-1.5 text-[11px] font-black shadow-none",
                  hasDateFilter && "border-ok/30 bg-ok/5 text-ok"
                )}
              >
                <div className="flex min-w-0 items-center gap-1">
                  <Calendar
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground",
                      hasDateFilter && "text-ok"
                    )}
                  />
                  <span className="truncate">기간</span>
                </div>
                {hasDateFilter ? (
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-ok" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 rounded-xl border border-line bg-popover/90 p-3 shadow-2xl backdrop-blur-md"
              align="center"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                    기간 필터
                  </span>
                  {hasDateFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 rounded px-1.5 text-[10px] font-bold text-bad hover:bg-bad/10"
                      onClick={() => {
                        setDateFrom("")
                        setDateTo("")
                      }}
                    >
                      필터 초기화
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <DatePicker
                    value={
                      dateFrom ? new Date(dateFrom + "T12:00:00") : undefined
                    }
                    onChange={(d) =>
                      setDateFrom(d ? format(d, "yyyy-MM-dd") : "")
                    }
                    placeholder="시작일"
                    className="h-8 flex-1 border-line/50 bg-background text-[11px] shadow-none"
                  />
                  <span className="text-[10px] text-muted-foreground opacity-30">
                    ~
                  </span>
                  <DatePicker
                    value={dateTo ? new Date(dateTo + "T12:00:00") : undefined}
                    onChange={(d) =>
                      setDateTo(d ? format(d, "yyyy-MM-dd") : "")
                    }
                    placeholder="종료일"
                    className="h-8 flex-1 border-line/50 bg-background text-[11px] shadow-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-1 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 border-line/50 bg-background text-[10px] font-bold text-muted-foreground hover:bg-muted"
                    onClick={() => setQuickDate("1h")}
                  >
                    1h
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 border-line/50 bg-background text-[10px] font-bold text-muted-foreground hover:bg-muted"
                    onClick={() => setQuickDate("today")}
                  >
                    오늘
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 border-line/50 bg-background text-[10px] font-bold text-muted-foreground hover:bg-muted"
                    onClick={() => setQuickDate("24h")}
                  >
                    24h
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* 3. Sort Key Select */}
          <Select
            value={sortKey}
            onValueChange={(k) => toggleSort(k as SortKey)}
          >
            <SelectTrigger className="h-8 w-[96px] border-line bg-background px-1.5 text-[11px] font-black shadow-none focus:ring-0">
              <SelectValue placeholder="정렬" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="max-h-60 w-[120px] overflow-y-auto"
              align="end"
              sideOffset={4}
            >
              <SelectItem value="createdAt" className="text-[11px] font-bold">
                최근 생성순
              </SelectItem>
              <SelectItem value="filename" className="text-[11px] font-bold">
                파일명순
              </SelectItem>
              <SelectItem value="status" className="text-[11px] font-bold">
                상태순
              </SelectItem>
              <SelectItem value="duration" className="text-[11px] font-bold">
                소요시간순
              </SelectItem>
            </SelectContent>
          </Select>

          {/* 4. Sort Direction Toggle */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggleSort(sortKey)}
            className="h-8 w-8 shrink-0 border-line bg-background p-0 shadow-none hover:bg-muted"
          >
            {sortDir === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5 text-foreground" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 text-foreground" />
            )}
          </Button>

          {/* 5. Filter Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="relative h-8 w-8 shrink-0 border-line bg-background p-0 shadow-none"
              >
                <Filter className="h-3.5 w-3.5" />
                {hasAnyFilter && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 rounded-xl border border-line bg-popover/90 p-3 shadow-2xl backdrop-blur-md"
              align="end"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                    고급 필터
                  </span>
                  {hasAnyFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 rounded px-1.5 text-[10px] font-bold text-bad hover:bg-bad/10"
                      onClick={clearAllFilters}
                    >
                      필터 초기화
                    </Button>
                  )}
                </div>

                <TagInputSearch
                  value={tagInput}
                  tags={searchTags}
                  candidates={autocompleteCandidates}
                  placeholder="검색어 입력 후 엔터"
                  size="sm"
                  onValueChange={setTagInput}
                  onAddTag={addSearchTag}
                  onRemoveTag={(tag) =>
                    setSearchTags((prev) => prev.filter((t) => t !== tag))
                  }
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Unified 1-Line Toolbar (Desktop viewport) */}
        <div
          onMouseDown={handleMouseDown}
          className="hidden shrink-0 cursor-grab items-center justify-between gap-3 border-b bg-muted/10 px-4 py-2 select-none md:flex"
        >
          <Tabs
            value={filterTab}
            onValueChange={(v) => setFilterTab(v as FilterTab)}
            className="shrink-0"
          >
            <TabsList className="h-8 gap-1 bg-muted/50 p-1">
              <TabsTrigger
                value="all"
                className="h-6 px-3 text-[11px] font-bold"
              >
                <List className="mr-1 h-3.5 w-3.5" />
                전체{" "}
                <span className="mono ml-1 opacity-50">
                  {currentSessionJobCount}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="active"
                className="h-6 px-3 text-[11px] font-bold text-info"
              >
                <Activity className="mr-1 h-3.5 w-3.5" />
                활성{" "}
                <span className="mono ml-1 opacity-50">{counts.active}</span>
              </TabsTrigger>
              <TabsTrigger
                value="done"
                className="h-6 px-3 text-[11px] font-bold text-ok"
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                완료 <span className="mono ml-1 opacity-50">{counts.done}</span>
              </TabsTrigger>
              <TabsTrigger
                value="failed"
                className="h-6 px-3 text-[11px] font-bold text-bad"
              >
                <AlertCircle className="mr-1 h-3.5 w-3.5" />
                실패{" "}
                <span className="mono ml-1 opacity-50">
                  {counts.error + counts.cancelled}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <DatePicker
                value={dateFrom ? new Date(dateFrom + "T12:00:00") : undefined}
                onChange={(d) => setDateFrom(d ? format(d, "yyyy-MM-dd") : "")}
                placeholder="시작"
                className="h-8 w-24 border-line/50 bg-background text-[11px] shadow-none"
              />
              <span className="text-[10px] text-muted-foreground opacity-30">
                ~
              </span>
              <DatePicker
                value={dateTo ? new Date(dateTo + "T12:00:00") : undefined}
                onChange={(d) => setDateTo(d ? format(d, "yyyy-MM-dd") : "")}
                placeholder="종료"
                className="h-8 w-24 border-line/50 bg-background text-[11px] shadow-none"
              />
              {hasDateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    setDateFrom("")
                    setDateTo("")
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-line/50 bg-background px-2 text-[10px] font-bold text-muted-foreground hover:bg-muted"
                onClick={() => setQuickDate("1h")}
              >
                1h
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-line/50 bg-background px-2 text-[10px] font-bold text-muted-foreground hover:bg-muted"
                onClick={() => setQuickDate("today")}
              >
                오늘
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-line/50 bg-background px-2 text-[10px] font-bold text-muted-foreground hover:bg-muted"
                onClick={() => setQuickDate("24h")}
              >
                24h
              </Button>
            </div>

            <Button
              size="sm"
              variant={showFilters ? "secondary" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className="relative hidden h-8 w-8 shrink-0 border-line bg-background p-0 shadow-none md:inline-flex"
            >
              <Filter className="h-3.5 w-3.5" />
              {hasAnyFilter && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
              )}
            </Button>

            {onFloatToggle && (
              <>
                <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden h-8 w-8 shrink-0 border-line bg-background p-0 shadow-none md:inline-flex"
                      onClick={onFloatToggle}
                    >
                      {isFloating ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="border border-line bg-popover text-xs font-bold text-popover-foreground">
                    {isFloating
                      ? "원래대로 결합 (Dock)"
                      : "창으로 분리 (Pop out)"}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* Desktop filter panel */}
        {showFilters && (
          <div className="hidden shrink-0 animate-in items-start gap-3 border-b bg-muted/10 px-4 py-2 duration-200 fade-in slide-in-from-top-1 md:flex">
            <TagInputSearch
              value={tagInput}
              tags={searchTags}
              candidates={autocompleteCandidates}
              placeholder="파일명, 프롬프트, 에러 검색..."
              size="md"
              onValueChange={setTagInput}
              onAddTag={addSearchTag}
              onRemoveTag={(tag) =>
                setSearchTags((prev) => prev.filter((t) => t !== tag))
              }
            />
            {hasAnyFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs font-bold text-muted-foreground hover:bg-muted"
                onClick={clearAllFilters}
              >
                <X className="mr-1 h-3 w-3" />
                필터 초기화
              </Button>
            )}
          </div>
        )}

        {/* Failed tab: delete selection controls */}
        {filterTab === "failed" && (
          <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/5 px-3 py-2 md:gap-3 md:px-4">
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={selectAllFailed}
                className="h-8 px-2 text-[11px] font-bold"
              >
                전체 선택
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={deselectAll}
                className="h-8 px-2 text-[11px] font-bold"
              >
                선택 해제
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
          onPageChange={(p) => {
            setPage(p)
            setSelectedForDelete(new Set())
          }}
          selectedForDelete={selectedForDelete}
          onToggleSelect={toggleSelectForDelete}
          backendUrl={backendUrl}
          showPagination={totalJobsCount > PAGE_SIZE}
          fetchedImages={fetchedImages}
          fetchJobImages={(id) => openDetail(id)}
          workers={workers}
          onMoveJob={handleMoveJob}
        />
      </div>
      <JobDetailSheet
        job={selectedJob}
        backendUrl={backendUrl}
        fetchedImages={fetchedImages}
        onClose={() => setSelectedJobId(null)}
        onCancel={handleCancel}
        onRetry={handleRetry}
        onDelete={handleDeleteOne}
      />
    </div>
  )
})
