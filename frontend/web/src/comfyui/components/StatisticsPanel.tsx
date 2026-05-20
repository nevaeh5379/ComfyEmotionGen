import { useMemo, useState } from "react"

import { format } from "date-fns"
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { cn } from "@/lib/utils"

import type { JobView, WorkerView, JobStatus } from "../types/Message"

// ---------------------------------------------------------------------------
// Status color tokens (matches existing conventions)
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<JobStatus, string> = {
  pending: "#3b82f6",
  queued: "#60a5fa",
  running: "#06b6d4",
  done: "#10b981",
  error: "#ef4444",
  cancelled: "#9ca3af",
}

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "대기",
  queued: "큐잉",
  running: "실행중",
  done: "완료",
  error: "실패",
  cancelled: "취소",
}

// ---------------------------------------------------------------------------
// Stat card data type
// ---------------------------------------------------------------------------
interface StatItem {
  label: string
  value: string
  color?: string
  icon?: React.ElementType
  trend?: "up" | "down"
  delta?: string
  faded?: boolean
}

function SvgIcon({
  Icon,
  className,
}: {
  Icon: React.ElementType
  className?: string
}) {
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} />
}

// ---------------------------------------------------------------------------
// Stat card (inline — mirrors StatCard but with Tailwind-based theming)
// ---------------------------------------------------------------------------
function MetricCard({
  label,
  value,
  color = "text-ink",
  icon: Icon,
  delta,
  trend,
  faded = false,
}: {
  label: string
  value: string
  color?: string
  icon?: React.ElementType
  delta?: string
  trend?: "up" | "down"
  faded?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-1 border-r border-line px-3 py-3 transition-all duration-200 last:border-r-0 md:px-5",
        faded && "opacity-30"
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest text-muted-foreground uppercase opacity-75 md:gap-2 md:text-[10px]">
        {Icon && <SvgIcon Icon={Icon} className="h-3.5 w-3.5" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1 md:mt-1 md:gap-2">
        <div
          className={cn(
            "mono text-xl leading-none font-black tracking-tighter tabular-nums transition-transform duration-300 md:text-3xl",
            color,
            faded ? "" : "group-hover/stat:scale-105"
          )}
        >
          {value}
        </div>
        {delta != null && (
          <div className="mono text-[11px] text-muted-foreground">
            {trend === "up" ? "▲" : trend === "down" ? "▼" : ""} {delta}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utility: format ms to human-readable
// ---------------------------------------------------------------------------
function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "0s"
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainSec = seconds % 60
  if (minutes === 0) return `${remainSec}s`
  return `${minutes}m ${remainSec}s`
}

// ---------------------------------------------------------------------------
// Tooltip formatter for bar chart
// ---------------------------------------------------------------------------
const BarTooltip = ({ active, payload }: any) => {
  if (!active || !payload) return null
  const data = payload[0]?.payload
  if (!data) return null

  const lines: string[] = []
  for (const key of Object.keys(STATUS_COLORS)) {
    const p = payload.find((p: any) => p.dataKey === key)
    if (p && p.value > 0) {
      lines.push(`${STATUS_LABELS[key as JobStatus]}: ${p.value}`)
    }
  }

  return (
    <div className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-[11px] font-bold shadow-sm">
      <div className="mb-0.5 text-foreground">{data.label}</div>
      {lines.map((l) => (
        <div key={l} className="text-muted-foreground">
          {l}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tooltip formatter for pie chart
// ---------------------------------------------------------------------------
const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-[11px] font-bold shadow-sm">
      <div className="text-foreground">{d.name}</div>
      <div className="text-muted-foreground">{d.value}개</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatisticsPanel
// ---------------------------------------------------------------------------
interface StatisticsPanelProps {
  jobs: JobView[]
  workers: WorkerView[]
}

export function StatisticsPanel({ jobs, workers }: StatisticsPanelProps) {
  const total = jobs.length

  // ── Empty state ────────────────────────────────────────────────────
  if (total === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[13px] font-bold text-muted-foreground/60">
          작업 데이터가 없습니다.
        </p>
      </div>
    )
  }

  // ── Metric card data ───────────────────────────────────────────────
  const doneCount = jobs.filter((j) => j.status === "done").length
  const errorCount = jobs.filter(
    (j) => j.status === "error" || j.status === "cancelled"
  ).length
  const retryJobs = jobs.filter((j) => j.retryCount > 0).length
  const doneDurations = jobs
    .filter((j) => j.status === "done" && j.executionDurationMs != null)
    .map((j) => j.executionDurationMs!)
  const avgDuration = doneDurations.length
    ? Math.round(doneDurations.reduce((a, b) => a + b, 0) / doneDurations.length)
    : null

  const stats: StatItem[] = [
    {
      label: "총 작업 수",
      value: String(total),
      icon: ClipboardList,
    },
    {
      label: "성공률",
      value: `${Math.round((doneCount / total) * 100)}%`,
      color: "text-ok",
      icon: CheckCircle2,
      faded: doneCount === 0,
    },
    {
      label: "실패률",
      value: `${Math.round((errorCount / total) * 100)}%`,
      color: "text-bad",
      icon: AlertCircle,
      faded: errorCount === 0,
    },
    {
      label: "평균 실행 시간",
      value: avgDuration ? formatDuration(avgDuration) : "N/A",
      color: "text-info",
      icon: Activity,
      faded: avgDuration == null,
    },
    {
      label: "재시도율",
      value: `${Math.round((retryJobs / total) * 100)}%`,
      color: "text-warn",
      icon: RotateCcw,
      faded: retryJobs === 0,
    },
  ]

  // ── Bar chart data (hourly / daily buckets) ────────────────────────
  const [chartRange, setChartRange] = useState<"today" | "week" | "all">(
    "today"
  )

  const barChartData = useMemo(() => {
    const now = new Date()
    let cutoff: Date

    if (chartRange === "today") {
      cutoff = new Date(now)
      cutoff.setHours(0, 0, 0, 0)
    } else if (chartRange === "week") {
      cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - 7)
    } else {
      cutoff = new Date(0) // epoch
    }

    const filterPredicate = (j: JobView) => {
      const ts = j.createdAt * 1000
      return ts >= cutoff.getTime() && (j.status === "done" || j.status === "error" || j.status === "cancelled")
    }

    const filtered = jobs.filter(filterPredicate)

    // Build buckets
    const buckets = new Map<string, Record<JobStatus, number>>()

    if (chartRange === "today") {
      // Hourly buckets
      for (let h = 0; h < 24; h++) {
        const key = `${h}`
        buckets.set(key, {
          pending: 0, queued: 0, running: 0, done: 0, error: 0, cancelled: 0,
        })
      }
      for (const j of filtered) {
        const hour = new Date(j.createdAt * 1000).getHours()
        const key = String(hour)
        const bucket = buckets.get(key)!
        if (bucket[j.status] != null) bucket[j.status]++
      }
      return Array.from(buckets.entries()).map(([label, s]) => ({
        label: `${String(label).padStart(2, "0")}:00`,
        ...s,
      }))
    }

    // Daily buckets (week or all)
    const dailyMap = new Map<string, Record<JobStatus, number>>()
    for (const j of filtered) {
      const label = format(new Date(j.createdAt * 1000), "MM/dd")
      if (!dailyMap.has(label)) {
        dailyMap.set(label, {
          pending: 0, queued: 0, running: 0, done: 0, error: 0, cancelled: 0,
        })
      }
      const bucket = dailyMap.get(label)!
      if (bucket[j.status] != null) bucket[j.status]++
    }
    return Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, s]) => ({ label, ...s }))
  }, [jobs, chartRange])

  // ── Pie chart data ─────────────────────────────────────────────────
  const pieData = useMemo(() => {
    const counts: Record<JobStatus, number> = {
      pending: 0, queued: 0, running: 0, done: 0, error: 0, cancelled: 0,
    }
    for (const j of jobs) {
      counts[j.status]++
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([status, value]) => ({
        name: STATUS_LABELS[status as JobStatus],
        value,
        color: STATUS_COLORS[status as JobStatus],
      }))
  }, [jobs])

  // ── Worker performance data ────────────────────────────────────────
  const workerStats = useMemo(() => {
    const groups = new Map<string, JobView[]>()
    for (const j of jobs) {
      const key = j.workerId ?? "unassigned"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(j)
    }

    return Array.from(groups.entries())
      .map(([workerId, groupJobs]) => {
        const total = groupJobs.length
        const done = groupJobs.filter((j) => j.status === "done").length
        const durations = groupJobs
          .filter((j) => j.status === "done" && j.executionDurationMs != null)
          .map((j) => j.executionDurationMs!)
        const avgD = durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null
        const successRate = done > 0 ? Math.round((done / total) * 100) : null

        // Get worker alive/busy status from workers list
        const workerInfo = workers.find((w) => w.id === workerId)
        const label =
          workerId === "unassigned"
            ? "미할당"
            : workerInfo
              ? workerId.slice(0, 8)
              : workerId.slice(0, 8)

        return {
          id: workerId,
          label,
          total,
          done,
          avgDuration: avgD ? formatDuration(avgD) : "N/A",
          successRate,
          alive: workerInfo?.alive ?? false,
          busy: workerInfo?.busy ?? false,
        }
      })
      .sort((a, b) => b.done - a.done)
  }, [jobs, workers])

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Title */}
      <div>
        <h2 className="text-lg font-black tracking-tight md:text-xl">
          생성 통계
        </h2>
        <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
          전체 작업의 현황을 시각화한 대시보드입니다.
        </p>
      </div>

      {/* Metric cards */}
      <div className="flex overflow-hidden rounded-lg border border-line bg-panel shadow-sm group/stat">
        {stats.map((s) => (
          <MetricCard key={s.label} {...s} />
        ))}
      </div>

      {/* Charts row: bar chart + donut */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Bar chart (2/3 width on desktop) */}
        <div className="md:col-span-2">
          <div className="rounded-lg border border-line bg-panel p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                완료/실패 작업 수 (시간별 / 일별)
              </h3>
              <div className="flex rounded-md bg-muted/50 p-0.5">
                {([
                  { id: "today" as const, label: "오늘" },
                  { id: "week" as const, label: "7일" },
                  { id: "all" as const, label: "전체" },
                ] as const).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setChartRange(r.id)}
                    className={cn(
                      "rounded-md px-2.5 py-0.5 text-[10px] font-black transition-all",
                      chartRange === r.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barChartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "currentColor", fontFamily: "Inter, sans-serif" }}
                  stroke="var(--line)"
                  height={24}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "currentColor", fontFamily: "Inter, sans-serif" }}
                  stroke="var(--line)"
                  allowDecimals={false}
                  width={24}
                />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="done" stackId="stack" fill={STATUS_COLORS.done} radius={[0, 0, 0, 0]} name="완료" />
                <Bar dataKey="error" stackId="stack" fill={STATUS_COLORS.error} name="실패" />
                <Bar dataKey="cancelled" stackId="stack" fill={STATUS_COLORS.cancelled} name="취소" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut chart (1/3 width on desktop) */}
        <div>
          <div className="rounded-lg border border-line bg-panel p-4 shadow-sm">
            <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              상태 분포
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Worker performance table */}
      <div className="rounded-lg border border-line bg-panel shadow-sm">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            워커별 성능
          </h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>워커</TableHead>
              <TableHead className="text-center">상태</TableHead>
              <TableHead className="text-center">총 작업 수</TableHead>
              <TableHead className="text-center">완료</TableHead>
              <TableHead className="text-center">평균 시간</TableHead>
              <TableHead className="text-center">성공률</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workerStats.map((ws) => (
              <TableRow key={ws.id}>
                <TableCell className="font-bold">
                  <span className="inline-flex items-center gap-1.5">
                    {ws.label}
                    {ws.alive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                    )}
                    {ws.busy && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-center text-[10px]">
                  {!ws.alive ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-black text-muted-foreground">offline</span>
                  ) : ws.busy ? (
                    <span className="rounded bg-info-bg/30 px-1.5 py-0.5 text-[9px] font-black text-info">busy</span>
                  ) : (
                    <span className="rounded bg-ok-bg/30 px-1.5 py-0.5 text-[9px] font-black text-ok">idle</span>
                  )}
                </TableCell>
                <TableCell className="text-center mono text-xs font-bold tabular-nums">{ws.total}</TableCell>
                <TableCell className="text-center mono text-xs font-bold tabular-nums text-ok">{ws.done}</TableCell>
                <TableCell className="text-center mono text-xs font-bold tabular-nums">{ws.avgDuration}</TableCell>
                <TableCell className="text-center">
                  {ws.successRate != null ? (
                    <span
                      className={cn(
                        "mono text-[11px] font-black tabular-nums",
                        ws.successRate >= 80
                          ? "text-ok"
                          : ws.successRate >= 50
                            ? "text-warn"
                            : "text-bad"
                      )}
                    >
                      {ws.successRate}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">N/A</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons (imported inline to avoid barrel import issues)
// ---------------------------------------------------------------------------
import {
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Activity,
  RotateCcw,
} from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
