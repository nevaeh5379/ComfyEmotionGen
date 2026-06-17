import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Item, ItemContent, ItemTitle } from "@/components/ui/item"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { getOverallProgress } from "../utils/timeEstimation"
import type { WorkerView, JobView } from "../types/Message"

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------
interface StatusHoverCardProps {
  dotColor: string
  title: React.ReactNode
  hoverAlign?: "start" | "center" | "end"
  hoverWidth?: string
  children: React.ReactNode
}

const StatusHoverCard = ({
  dotColor,
  title,
  hoverAlign = "start",
  hoverWidth = "w-56",
  children,
}: StatusHoverCardProps) => (
  <HoverCard openDelay={200} closeDelay={100}>
    <HoverCardTrigger asChild>
      <div className="w-fit cursor-help">
        <Item className="flex items-center gap-1.5 border-none bg-transparent p-1">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`}
            />
          </span>
          <ItemContent>
            <ItemTitle className="text-xs font-medium">{title}</ItemTitle>
          </ItemContent>
        </Item>
      </div>
    </HoverCardTrigger>
    <HoverCardContent
      side="bottom"
      align={hoverAlign}
      sideOffset={10}
      className={hoverWidth}
    >
      {children}
    </HoverCardContent>
  </HoverCard>
)

// ---------------------------------------------------------------------------
// ServerStatus
// ---------------------------------------------------------------------------
interface ServerStatusProps {
  name: string
  isConnected: boolean
  okHint: string
  failHint: string
}

export const ServerStatus = ({
  name,
  isConnected,
  okHint,
  failHint,
}: ServerStatusProps) => {
  const color = isConnected ? "bg-green-500" : "bg-red-500"

  return (
    <StatusHoverCard dotColor={color} title={name}>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold">
          {isConnected ? "✅ 연결 성공" : "❌ 연결 안됨"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isConnected ? okHint : failHint}
        </p>
      </div>
    </StatusHoverCard>
  )
}

// ---------------------------------------------------------------------------
// WorkerStatus
// ---------------------------------------------------------------------------
interface WorkerStatusProps {
  workers: WorkerView[]
  backendAlive: boolean
  jobs: JobView[]
}

export const WorkerStatus = ({ workers, backendAlive, jobs }: WorkerStatusProps) => {
  const aliveCount = workers.filter((w) => w.alive).length
  const total = workers.length
  const allAlive = backendAlive && total > 0 && aliveCount === total
  const someAlive = backendAlive && aliveCount > 0
  const dot = allAlive
    ? "bg-green-500"
    : someAlive
      ? "bg-yellow-500"
      : "bg-red-500"
  const workerTypes = [...new Set(workers.map((w) => w.workerType ?? "comfyui"))]
  const typeLabel = workerTypes.length === 1
    ? workerTypes[0] === "comfyui" ? "ComfyUI 워커" : workerTypes[0]
    : "워커"
  return (
    <StatusHoverCard
      dotColor={dot}
      title={
        backendAlive ? (
          <div className="flex items-center gap-1.5">
            <span className="hidden md:inline">{typeLabel}</span>
            <span className="mono">
              {aliveCount}/{total}
            </span>
          </div>
        ) : (
          "—"
        )
      }
      hoverAlign="end"
      hoverWidth="w-72"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold">
          {allAlive
            ? "모든 워커 연결됨"
            : someAlive
              ? "일부 워커만 연결됨"
              : backendAlive
                ? "워커 연결 안 됨"
                : "백엔드 연결 안 됨"}
        </p>
        {workers.length === 0 && backendAlive && (
          <p className="text-xs text-muted-foreground">
            등록된 워커가 없습니다. '서버 설정' &gt; '워커'에서
            추가하세요.
          </p>
        )}
        {workers.map((w) => {
          const runningJob = jobs.find(
            (j) => j.workerId === w.id && (j.status === "running" || j.status === "queued")
          ) || (w.currentJobId ? jobs.find((j) => j.id === w.currentJobId) : undefined)
          const overallProgress = runningJob ? getOverallProgress(runningJob) : 0

          return (
            <div
              key={w.id}
              className="flex flex-col gap-1.5 border-b border-line/45 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-1 text-xs">
                <span className="font-mono font-bold shrink-0">{w.id}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground shrink-0">
                  {w.workerType ?? "comfyui"}
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-muted-foreground/80 pl-1">
                  {w.url}
                </span>
                <span
                  className={cn(
                    "font-bold text-[11px] shrink-0",
                    w.alive
                      ? w.busy
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {w.alive ? (w.busy ? "busy" : "idle") : "down"}
                </span>
              </div>

              {w.alive && w.busy && (
                <div className="space-y-1.5 pl-2">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold">
                    <span className="truncate max-w-[190px] font-mono text-[10px] text-foreground/80">
                      📄 {runningJob ? runningJob.filename : "작업 요청 처리 중..."}
                    </span>
                    <span className="mono font-bold tabular-nums">
                      {Math.round(overallProgress)}%
                    </span>
                  </div>
                  <Progress
                    value={overallProgress}
                    className="h-1 w-full bg-muted/60 [&>[data-slot=progress-indicator]]:bg-info"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </StatusHoverCard>
  )
}
