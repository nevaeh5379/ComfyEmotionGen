import { cn } from "@/lib/utils"

const STATUS_MAP: Record<string, { label: string; fg: string; bg: string }> = {
  done: { label: "완료", fg: "text-ok", bg: "bg-ok-bg" },
  completed: { label: "완료", fg: "text-ok", bg: "bg-ok-bg" },
  failed: { label: "실패", fg: "text-bad", bg: "bg-bad-bg" },
  error: { label: "실패", fg: "text-bad", bg: "bg-bad-bg" },
  canceled: { label: "취소", fg: "text-muted-foreground", bg: "bg-muted" },
  cancelled: { label: "취소", fg: "text-muted-foreground", bg: "bg-muted" },
  active: { label: "진행", fg: "text-info", bg: "bg-info-bg" },
  running: { label: "진행", fg: "text-info", bg: "bg-info-bg" },
  queued: { label: "큐", fg: "text-warn", bg: "bg-warn-bg" },
  pending: { label: "대기", fg: "text-ink-2", bg: "bg-muted" },
  waiting: { label: "대기", fg: "text-ink-2", bg: "bg-muted" },
  info: { label: "정보", fg: "text-info", bg: "bg-info-bg" },
}

interface StatusPillProps {
  status: string
  className?: string
}

export function StatusPill({ status, className }: StatusPillProps) {
  const s = (STATUS_MAP[status] ?? STATUS_MAP.done)!
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-[7px] py-[1px] text-[11px] leading-4 font-medium",
        s.fg,
        s.bg,
        className
      )}
    >
      <span
        className={cn(
          "h-[5px] w-[5px] rounded-full",
          s.fg.replace("text-", "bg-")
        )}
      />
      {s.label}
    </span>
  )
}
