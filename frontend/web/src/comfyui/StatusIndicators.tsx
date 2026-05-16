import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Item, ItemContent, ItemTitle } from "@/components/ui/item"
import type { WorkerView } from "./Message"

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------
interface StatusHoverCardProps {
  dotColor: string
  pingColor: string
  title: string
  hoverAlign?: "start" | "center" | "end"
  hoverWidth?: string
  children: React.ReactNode
}

const StatusHoverCard = ({
  dotColor,
  pingColor,
  title,
  hoverAlign = "start",
  hoverWidth = "w-56",
  children,
}: StatusHoverCardProps) => (
  <HoverCard openDelay={200} closeDelay={100}>
    <HoverCardTrigger asChild>
      <div className="w-fit cursor-help">
        <Item className="flex items-center gap-2 border-none bg-transparent p-2">
          <span className="relative flex h-3 w-3">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`}
            />
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${pingColor}`}
            />
          </span>
          <ItemContent>
            <ItemTitle className="text-sm font-semibold">{title}</ItemTitle>
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
  const ping = isConnected ? "bg-green-400" : "bg-red-400"

  return (
    <StatusHoverCard dotColor={color} pingColor={ping} title={name}>
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
}

export const WorkerStatus = ({ workers, backendAlive }: WorkerStatusProps) => {
  const aliveCount = workers.filter((w) => w.alive).length
  const total = workers.length
  const allAlive = backendAlive && total > 0 && aliveCount === total
  const someAlive = backendAlive && aliveCount > 0
  const dot = allAlive
    ? "bg-green-500"
    : someAlive
      ? "bg-yellow-500"
      : "bg-red-500"
  const ping = allAlive
    ? "bg-green-400"
    : someAlive
      ? "bg-yellow-400"
      : "bg-red-400"

  return (
    <StatusHoverCard
      dotColor={dot}
      pingColor={ping}
      title={`ComfyUI 워커 ${backendAlive ? `${aliveCount}/${total}` : "—"}`}
      hoverAlign="end"
      hoverWidth="w-72"
    >
      <div className="flex flex-col gap-2">
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
            등록된 워커가 없습니다. '서버 설정' &gt; 'ComfyUI 워커'에서
            추가하세요.
          </p>
        )}
        {workers.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="font-mono">{w.id}</span>
            <span className="truncate text-muted-foreground">{w.url}</span>
            <span
              className={
                w.alive
                  ? w.busy
                    ? "text-yellow-600"
                    : "text-green-600"
                  : "text-red-600"
              }
            >
              {w.alive ? (w.busy ? "busy" : "idle") : "down"}
            </span>
          </div>
        ))}
      </div>
    </StatusHoverCard>
  )
}
