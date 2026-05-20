import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { format } from "date-fns"
import { X, Calendar, ArrowUp, ArrowDown, ChevronDown, Filter, Search, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"

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

import type { JobStatus, JobView } from "../types/Message"
import { useRenderLog } from "@/lib/renderLogger"
import { cn } from "@/lib/utils"
import { useConfirm } from "../contexts/ConfirmContext"
import { API, HEADERS } from "@/lib/api"
import { JOB_PAGE_SIZE, TICK_INTERVAL_MS, MS_PER_SECOND, SECONDS_PER_HOUR } from "@/lib/constants"
import { toast } from "sonner"

// Extracted components
import {
  JobStatBar,
  RunningJobsBanner,
  JobTableSection,
} from "./JobManagerSections"
import { JobDetailSheet } from "./JobDetailSheet"

// Session utilities (extracted to sessionUtils.ts)
export type {
  SessionMarkerRaw,
  ActiveStateRaw,
} from "../utils/sessionUtils"
export {
  loadMarkers,
  saveMarkers,
  loadActiveState,
  saveActiveState,
  genId,
  initMarkers,
  initActiveState,
  jobSessionId,
  makeSessionLabel,
} from "../utils/sessionUtils"
import type { SessionMarkerRaw, ActiveStateRaw } from "../utils/sessionUtils"

const PAGE_SIZE = JOB_PAGE_SIZE

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

function jobDuration(job: JobView): number | null {
  if (job.executionDurationMs != null) return job.executionDurationMs
  if (job.startedAt != null && job.finishedAt != null)
    return (job.finishedAt - job.startedAt) * MS_PER_SECOND
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

// ── tag input with autocomplete ──────────────────────────────────────

interface TagInputSearchProps {
  value: string
  tags: string[]
  candidates: { value: string; type: "filename" | "prompt" | "error" }[]
  ref?: React.RefObject<HTMLInputElement>
  placeholder: string
  onValueChange: (v: string) => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  size?: "sm" | "md"
}

export const TagInputSearch = memo(function TagInputSearch({
  value,
  tags,
  candidates,
  ref: refProp,
  placeholder,
  onValueChange,
  onAddTag,
  onRemoveTag,
  size = "sm",
}: TagInputSearchProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset active index when candidates list changes
  useEffect(() => {
    setActiveIndex(0)
  }, [candidates])

  // Open dropdown when value exists and candidates exist
  useEffect(() => {
    if (value && candidates.length > 0) {
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }, [value, candidates])

  // Handle click outside to close the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        if (isOpen && candidates.length > 0 && activeIndex >= 0 && activeIndex < candidates.length) {
          const cand = candidates[activeIndex]!
          const prefix = cand.type === "filename" ? "@" : cand.type === "prompt" ? "#" : "$"
          onAddTag(prefix + cand.value)
          setIsOpen(false)
        } else {
          const trimmed = value.trim()
          if (trimmed) {
            onAddTag(trimmed)
            setIsOpen(false)
          }
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setActiveIndex((prev) => (candidates.length > 0 ? (prev + 1) % candidates.length : 0))
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setActiveIndex((prev) => (candidates.length > 0 ? (prev - 1 + candidates.length) % candidates.length : 0))
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        setIsOpen(false)
      } else if (e.key === "Backspace" && !value && tags.length > 0) {
        onRemoveTag(tags[tags.length - 1]!)
      }
    },
    [candidates, tags, value, activeIndex, isOpen, onAddTag, onRemoveTag]
  )

  // Highlight matching characters by making them bold
  const renderHighlight = (text: string, query: string) => {
    const cleanQuery = query.replace(/^[@#$]/, "").toLowerCase()
    if (!cleanQuery) return <span>{text}</span>
    const index = text.toLowerCase().indexOf(cleanQuery)
    if (index === -1) return <span>{text}</span>

    const before = text.substring(0, index)
    const match = text.substring(index, index + cleanQuery.length)
    const after = text.substring(index + cleanQuery.length)

    return (
      <span>
        {before}
        <strong className="font-semibold text-primary">{match}</strong>
        {after}
      </span>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-wrap items-center gap-1.5 p-1.5 border border-line rounded-md bg-background min-h-[34px] transition-all",
        size === "sm" ? "px-2 py-1" : "px-3 py-1.5"
      )}
    >
      {/* Icon Prefix */}
      <Search className="h-3.5 w-3.5 text-muted-foreground/45 shrink-0" />

      {/* Render Tags */}
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-primary/5 text-primary border border-primary/10 px-1.5 py-0.5 text-[10px] font-medium transition-all hover:bg-primary/10"
        >
          {tag}
          <button
            type="button"
            onClick={() => onRemoveTag(tag)}
            className="inline-flex items-center justify-center rounded p-0.5 hover:bg-primary/20 text-primary/70 hover:text-primary transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}

      {/* Text Input */}
      <input
        ref={refProp}
        type="text"
        value={value}
        onFocus={() => {
          if (value && candidates.length > 0) setIsOpen(true)
        }}
        onChange={(e) => {
          onValueChange(e.target.value)
        }}
        onKeyDown={onKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className={cn(
          "flex-1 min-w-[80px] bg-transparent outline-none border-none p-0 focus:ring-0 placeholder:text-muted-foreground/40",
          size === "sm" ? "text-[11px] h-6" : "text-xs h-7"
        )}
      />

      {/* Candidates Dropdown */}
      {isOpen && candidates.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-line bg-popover shadow-md py-1 animate-in fade-in slide-in-from-top-1 duration-100">
          {candidates.map((cand, idx) => (
            <button
              key={cand.value}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                const prefix = cand.type === "filename" ? "@" : cand.type === "prompt" ? "#" : "$"
                onAddTag(prefix + cand.value)
                setIsOpen(false)
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-1.5 text-[11px] text-left transition-colors",
                idx === activeIndex ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Tag className="h-3 w-3 text-muted-foreground/35 shrink-0" />
                <span className="truncate">{renderHighlight(cand.value, value)}</span>
              </div>
              <span
                className={cn(
                  "px-1 py-0.5 rounded text-[8px] font-medium tracking-wide shrink-0 border",
                  cand.type === "filename" && "bg-info/5 border-info/20 text-info",
                  cand.type === "prompt" && "bg-ok/5 border-ok/20 text-ok",
                  cand.type === "error" && "bg-bad/5 border-bad/20 text-bad"
                )}
              >
                {cand.type === "filename" ? "파일명" : cand.type === "prompt" ? "프롬프트" : "에러"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

// ── main component ────────────────────────────────────────────────────

interface Props {
  jobs: JobView[]
  paused: boolean
  backendUrl: string
  isAliveBackend: boolean
  mobileTab?: "status" | "list"

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
  sessionJobs: JobView[]
  handleTogglePause: () => void
  handleCancelAll: () => void
  handleRetryAllFailed: () => void
  handleDeleteAllFailed: () => void
}

export const JobManagerPanel = memo(function JobManagerPanel({
  jobs,
  backendUrl,
  mobileTab = "list",
  counts,
  sessionJobs,
}: Props) {
  useRenderLog("JobManagerPanel")
  const confirm = useConfirm()

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

  // Cached token sets from all session jobs categorized by source (only recomputes when job list changes)
  const cachedTokens = useMemo(() => {
    const filenames = new Set<string>()
    const prompts = new Set<string>()
    const errors = new Set<string>()

    const tokenize = (str: string) => {
      if (!str) return []
      return str
        .split(/[\s_\-.,()]+/g)
        .map((t) => t.trim().toLowerCase().replace(/^[^\w가-힣]+|[^\w가-힣]+$/g, ""))
        .filter((t) => t.length >= 2)
    }

    sessionJobs.forEach((j) => {
      tokenize(j.filename).forEach((t) => filenames.add(t))
      if (j.prompt) {
        tokenize(j.prompt).forEach((t) => prompts.add(t))
      }
      if (j.error) {
        tokenize(j.error).forEach((t) => errors.add(t))
      }
    })

    return { filenames, prompts, errors }
  }, [sessionJobs])

  const searchFiltered = useMemo(() => {
    if (searchTags.length === 0) return dateFiltered
    return dateFiltered.filter((j) => {
      return searchTags.some((tag) => {
        const lowerTag = tag.toLowerCase()
        if (lowerTag.startsWith("@")) {
          // File name targeting search
          const query = lowerTag.slice(1)
          return j.filename.toLowerCase().includes(query)
        } else if (lowerTag.startsWith("#")) {
          // Prompt targeting search
          const query = lowerTag.slice(1)
          return (j.prompt ?? "").toLowerCase().includes(query)
        } else if (lowerTag.startsWith("$")) {
          // Error targeting search
          const query = lowerTag.slice(1)
          return (j.error ?? "").toLowerCase().includes(query)
        } else {
          // Full fields integration search
          const filename = j.filename.toLowerCase()
          const prompt = (j.prompt ?? "").toLowerCase()
          const error = (j.error ?? "").toLowerCase()
          const meta = j.meta ? Object.values(j.meta).join(" ").toLowerCase() : ""
          return filename.includes(lowerTag) || prompt.includes(lowerTag) || error.includes(lowerTag) || meta.includes(lowerTag)
        }
      })
    })
  }, [dateFiltered, searchTags])

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

    // 1. Filenames matching query
    const matchedFilenames = (filterType === "all" || filterType === "filename")
      ? [...cachedTokens.filenames]
          .filter((t) => query === "" ? !searchTags.includes(`@${t}`) : (t.includes(query) && t !== query && !searchTags.includes(`@${t}`) && !searchTags.includes(t)))
          .slice(0, 5)
          .map((t) => ({ value: t, type: "filename" as const }))
      : []

    // 2. Prompts matching query (and not already in filenames)
    const matchedPrompts = (filterType === "all" || filterType === "prompt")
      ? [...cachedTokens.prompts]
          .filter((t) => query === "" ? !searchTags.includes(`#${t}`) : (t.includes(query) && t !== query && !searchTags.includes(`#${t}`) && !searchTags.includes(t) && !matchedFilenames.some((f) => f.value === t)))
          .slice(0, 5)
          .map((t) => ({ value: t, type: "prompt" as const }))
      : []

    // 3. Errors matching query
    const matchedErrors = (filterType === "all" || filterType === "error")
      ? [...cachedTokens.errors]
          .filter((t) => query === "" ? !searchTags.includes(`$${t}`) : (t.includes(query) && t !== query && !searchTags.includes(`$${t}`) && !searchTags.includes(t) && !matchedFilenames.some((f) => f.value === t) && !matchedPrompts.some((p) => p.value === t)))
          .slice(0, 3)
          .map((t) => ({ value: t, type: "error" as const }))
      : []

    return [...matchedFilenames, ...matchedPrompts, ...matchedErrors].slice(0, 6)
  }, [tagInput, cachedTokens, searchTags])

  const sortedJobs = useMemo(() => {
    const arr = [...searchFiltered]
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
  }, [searchFiltered, sortKey, sortDir])

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
  const hasAnyFilter = searchTags.length > 0 || dateFrom !== "" || dateTo !== ""

  const runningJobs = useMemo(
    () => sessionJobs.filter((j) => j.status === "running"),
    [sessionJobs]
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
      await fetch(`${backendUrl}${API.jobs.detail(jobId)}`, { method: "DELETE" })
    } catch {
      toast.error("작업 취소 요청에 실패했습니다.")
    }
  }



  const handleRetry = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    try {
      await fetch(`${backendUrl}${API.jobs.retry(jobId)}`, { method: "POST" })
    } catch {
      toast.error("작업 재시도 요청에 실패했습니다.")
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
      await fetch(`${backendUrl}${API.jobs.delete}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ job_ids: [jobId] }),
      })
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
      await fetch(`${backendUrl}${API.jobs.delete}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ job_ids: [...selectedForDelete] }),
      })
    } catch {
      toast.error("선택 삭제 요청에 실패했습니다.")
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
        const d = new Date(now.getTime() - 24 * SECONDS_PER_HOUR * MS_PER_SECOND)
        setDateFrom(d.toISOString().slice(0, 10))
        break
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">

      {/* 2. Status Content (Mobile status tab OR Desktop always) */}
      <ScrollArea
        className={cn(
          "shrink-0 border-b border-line bg-panel",
          mobileTab === "status"
            ? "flex-1 max-h-none h-full"
            : "max-h-[85dvh] hidden md:block"
        )}
      >
        <div className={cn(mobileTab === "status" ? "p-3 space-y-5" : "")}>
          <JobStatBar counts={counts} sessionJobs={sessionJobs} />
          {mobileTab === "status" && (
            <div className="mt-4 px-1 space-y-3">
              <h3 className="text-xs font-black tracking-widest text-muted-foreground uppercase pb-1.5 border-b">
                실행 중인 작업
              </h3>
              <RunningJobsBanner jobs={runningJobs} />
            </div>
          )}
          {mobileTab !== "status" && <RunningJobsBanner jobs={runningJobs} />}
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
        <div className="flex md:hidden shrink-0 items-center justify-between border-b bg-muted/10 px-2.5 py-1.5 gap-1">
          {/* 1. Status Filter Select */}
          <Select value={filterTab} onValueChange={(v) => setFilterTab(v as FilterTab)}>
            <SelectTrigger className="h-8 w-[92px] border-line bg-background text-[11px] font-black px-1.5 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[11px] font-bold">
                전체 ({sessionJobs.length})
              </SelectItem>
              <SelectItem value="active" className="text-[11px] font-bold text-info">
                활성 ({counts.active})
              </SelectItem>
              <SelectItem value="done" className="text-[11px] font-bold text-ok">
                완료 ({counts.done})
              </SelectItem>
              <SelectItem value="failed" className="text-[11px] font-bold text-bad">
                실패 ({counts.error + counts.cancelled})
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
                  "h-8 w-[82px] px-1.5 text-[11px] font-black border-line bg-background shadow-none flex items-center justify-between gap-1",
                  hasDateFilter && "border-ok/30 text-ok bg-ok/5"
                )}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <Calendar className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", hasDateFilter && "text-ok")} />
                  <span className="truncate">기간</span>
                </div>
                {hasDateFilter ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok animate-pulse" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 border border-line bg-popover/90 backdrop-blur-md rounded-xl shadow-2xl" align="center">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                    기간 필터
                  </span>
                  {hasDateFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] font-bold text-bad hover:bg-bad/10 rounded"
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
                    value={dateFrom ? new Date(dateFrom + "T12:00:00") : undefined}
                    onChange={(d) => setDateFrom(d ? format(d, "yyyy-MM-dd") : "")}
                    placeholder="시작일"
                    className="h-8 flex-1 border-line/50 text-[11px] shadow-none bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground opacity-30">~</span>
                  <DatePicker
                    value={dateTo ? new Date(dateTo + "T12:00:00") : undefined}
                    onChange={(d) => setDateTo(d ? format(d, "yyyy-MM-dd") : "")}
                    placeholder="종료일"
                    className="h-8 flex-1 border-line/50 text-[11px] shadow-none bg-background"
                  />
                </div>
                <div className="flex items-center gap-1 justify-end pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 text-[10px] font-bold text-muted-foreground border-line/50 bg-background hover:bg-muted"
                    onClick={() => setQuickDate("1h")}
                  >
                    1h
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 text-[10px] font-bold text-muted-foreground border-line/50 bg-background hover:bg-muted"
                    onClick={() => setQuickDate("today")}
                  >
                    오늘
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 text-[10px] font-bold text-muted-foreground border-line/50 bg-background hover:bg-muted"
                    onClick={() => setQuickDate("24h")}
                  >
                    24h
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* 3. Sort Key Select */}
          <Select value={sortKey} onValueChange={(k) => toggleSort(k as SortKey)}>
            <SelectTrigger className="h-8 w-[96px] border-line bg-background text-[11px] font-black px-1.5 shadow-none focus:ring-0">
              <SelectValue placeholder="정렬" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt" className="text-[11px] font-bold">최근 생성순</SelectItem>
              <SelectItem value="filename" className="text-[11px] font-bold">파일명순</SelectItem>
              <SelectItem value="status" className="text-[11px] font-bold">상태순</SelectItem>
              <SelectItem value="duration" className="text-[11px] font-bold">소요시간순</SelectItem>
            </SelectContent>
          </Select>

          {/* 4. Sort Direction Toggle */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggleSort(sortKey)}
            className="h-8 w-8 p-0 border-line bg-background shadow-none hover:bg-muted shrink-0"
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
                className="relative h-8 w-8 p-0 border-line bg-background shadow-none shrink-0"
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
            <PopoverContent className="w-72 p-3 border border-line bg-popover/90 backdrop-blur-md rounded-xl shadow-2xl" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                    고급 필터
                  </span>
                  {hasAnyFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] font-bold text-bad hover:bg-bad/10 rounded"
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
                  onRemoveTag={(tag) => setSearchTags((prev) => prev.filter((t) => t !== tag))}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Unified 1-Line Toolbar (Desktop viewport) */}
        <div className="hidden md:flex shrink-0 items-center justify-between border-b bg-muted/10 px-4 py-2 gap-3">
          <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as FilterTab)} className="shrink-0">
            <TabsList className="h-8 bg-muted/50 p-1 gap-1">
              <TabsTrigger value="all" className="h-6 px-3 text-[11px] font-bold">
                전체 <span className="mono ml-1 opacity-50">{sessionJobs.length}</span>
              </TabsTrigger>
              <TabsTrigger value="active" className="h-6 px-3 text-[11px] font-bold text-info">
                활성 <span className="mono ml-1 opacity-50">{counts.active}</span>
              </TabsTrigger>
              <TabsTrigger value="done" className="h-6 px-3 text-[11px] font-bold text-ok">
                완료 <span className="mono ml-1 opacity-50">{counts.done}</span>
              </TabsTrigger>
              <TabsTrigger value="failed" className="h-6 px-3 text-[11px] font-bold text-bad">
                실패 <span className="mono ml-1 opacity-50">{counts.error + counts.cancelled}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1.5">
              <DatePicker
                value={dateFrom ? new Date(dateFrom + "T12:00:00") : undefined}
                onChange={(d) => setDateFrom(d ? format(d, "yyyy-MM-dd") : "")}
                placeholder="시작"
                className="h-8 w-24 border-line/50 text-[11px] shadow-none bg-background"
              />
              <span className="text-[10px] text-muted-foreground opacity-30">~</span>
              <DatePicker
                value={dateTo ? new Date(dateTo + "T12:00:00") : undefined}
                onChange={(d) => setDateTo(d ? format(d, "yyyy-MM-dd") : "")}
                placeholder="종료"
                className="h-8 w-24 border-line/50 text-[11px] shadow-none bg-background"
              />
              {hasDateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted"
                  onClick={() => { setDateFrom(""); setDateTo("") }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] font-bold text-muted-foreground border-line/50 bg-background hover:bg-muted"
                onClick={() => setQuickDate("1h")}
              >
                1h
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] font-bold text-muted-foreground border-line/50 bg-background hover:bg-muted"
                onClick={() => setQuickDate("today")}
              >
                오늘
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] font-bold text-muted-foreground border-line/50 bg-background hover:bg-muted"
                onClick={() => setQuickDate("24h")}
              >
                24h
              </Button>
            </div>

            <Button
              size="sm"
              variant={showFilters ? "secondary" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className="relative hidden md:inline-flex h-8 w-8 p-0 border-line bg-background shadow-none shrink-0"
            >
              <Filter className="h-3.5 w-3.5" />
              {hasAnyFilter && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Desktop filter panel */}
        {showFilters && (
          <div className="hidden md:flex animate-in fade-in slide-in-from-top-1 duration-200 shrink-0 items-start gap-3 border-b bg-muted/10 px-4 py-2">
            <TagInputSearch
              value={tagInput}
              tags={searchTags}
              candidates={autocompleteCandidates}
              placeholder="파일명, 프롬프트, 에러 검색..."
              size="md"
              onValueChange={setTagInput}
              onAddTag={addSearchTag}
              onRemoveTag={(tag) => setSearchTags((prev) => prev.filter((t) => t !== tag))}
            />
            {hasAnyFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-bold text-muted-foreground hover:bg-muted shrink-0"
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
          onPageChange={(p) => { setPage(p); setSelectedForDelete(new Set()) }}
          selectedForDelete={selectedForDelete}
          onToggleSelect={toggleSelectForDelete}
          backendUrl={backendUrl}
          showPagination={sortedJobs.length > PAGE_SIZE}
          fetchedImages={fetchedImages}
          fetchJobImages={(id) => openDetail(id)}
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
