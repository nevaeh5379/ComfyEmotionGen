import { MoreVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  SessionPopover,
  type ActiveStateInfo,
  type SessionMarker,
} from "../JobManagerSections"

const noop = (): void => undefined
const EMPTY_SESSION_COUNTS = new Map<string, number>()
const EMPTY_SESSION_MARKERS: SessionMarker[] = []

export interface JobSessionControlsProps {
  markers: SessionMarker[]
  sessionJobCounts?: Map<string, number> | undefined
  sortedMarkers?: SessionMarker[] | undefined
  selectedSessionId?: string | undefined
  activeSessionState?: ActiveStateInfo | null | undefined
  sessionPickerOpen?: boolean | undefined
  onSessionPickerOpenChange?: ((open: boolean) => void) | undefined
  onSelectSession?: ((id: string) => void) | undefined
  onCreateNewSession?: (() => void) | undefined
  paused?: boolean | undefined
  onTogglePause?: (() => void) | undefined
  onCancelAll?: (() => void) | undefined
  onRetryAllFailed?: (() => void) | undefined
  onDeleteAllFailed?: (() => void) | undefined
  activeJobsCount?: number | undefined
  isAliveBackend: boolean
  compact?: boolean
}

interface JobActionsMenuProps {
  isAliveBackend: boolean
  activeJobsCount: number
  onCancelAll?: (() => void) | undefined
  onRetryAllFailed?: (() => void) | undefined
  onDeleteAllFailed?: (() => void) | undefined
  showTooltip: boolean
}

interface NormalizedJobSessionControls {
  markers: SessionMarker[]
  sessionJobCounts: Map<string, number>
  sortedMarkers: SessionMarker[]
  selectedSessionId: string
  activeSessionState: ActiveStateInfo | null
  sessionPickerOpen: boolean
  onSessionPickerOpenChange: (open: boolean) => void
  onSelectSession: (id: string) => void
  onCreateNewSession: () => void
  paused: boolean
  onTogglePause?: (() => void) | undefined
  onCancelAll?: (() => void) | undefined
  onRetryAllFailed?: (() => void) | undefined
  onDeleteAllFailed?: (() => void) | undefined
  activeJobsCount: number
  isAliveBackend: boolean
  compact: boolean
}

function normalizeControls(
  props: JobSessionControlsProps
): NormalizedJobSessionControls {
  return {
    ...props,
    sessionJobCounts: props.sessionJobCounts ?? EMPTY_SESSION_COUNTS,
    sortedMarkers: props.sortedMarkers ?? EMPTY_SESSION_MARKERS,
    selectedSessionId: props.selectedSessionId ?? "",
    activeSessionState: props.activeSessionState ?? null,
    sessionPickerOpen: props.sessionPickerOpen ?? false,
    onSessionPickerOpenChange: props.onSessionPickerOpenChange ?? noop,
    onSelectSession: props.onSelectSession ?? noop,
    onCreateNewSession: props.onCreateNewSession ?? noop,
    paused: props.paused ?? false,
    activeJobsCount: props.activeJobsCount ?? 0,
    compact: props.compact ?? false,
  }
}

function JobActionsMenu({
  isAliveBackend,
  activeJobsCount,
  onCancelAll,
  onRetryAllFailed,
  onDeleteAllFailed,
  showTooltip,
}: JobActionsMenuProps): React.JSX.Element {
  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button size="sm" variant="outline" className="h-8 w-8 p-0">
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>추가 작업</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="end" className="w-56 p-2">
        <DropdownMenuItem
          onClick={onCancelAll}
          disabled={!isAliveBackend || activeJobsCount === 0}
          className="py-3 font-bold text-destructive"
        >
          진행 중인 모든 작업 취소
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRetryAllFailed} className="py-3 font-bold">
          실패/취소된 모든 작업 재시도
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDeleteAllFailed}
          className="py-3 font-bold text-destructive"
        >
          실패/취소된 모든 작업 삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 작업 세션 선택, 일시정지, 일괄 명령을 하나의 제어 단위로 묶는다.
 *
 * 모바일과 데스크톱은 배치와 글자 크기만 다르다. 명령의 활성화 조건과
 * 누락된 선택 콜백의 기본 동작은 이곳에서 동일하게 유지한다.
 */
export function JobSessionControls(
  props: JobSessionControlsProps
): React.JSX.Element {
  const {
    markers,
    sessionJobCounts,
    sortedMarkers,
    selectedSessionId,
    activeSessionState,
    sessionPickerOpen,
    onSessionPickerOpenChange,
    onSelectSession,
    onCreateNewSession,
    paused,
    onTogglePause,
    onCancelAll,
    onRetryAllFailed,
    onDeleteAllFailed,
    activeJobsCount,
    isAliveBackend,
    compact,
  } = normalizeControls(props)
  return (
    <div
      className={
        compact
          ? "flex flex-1 items-center justify-end gap-1.5 md:hidden"
          : "mr-1 hidden items-center gap-1.5 border-r border-line/65 pr-3 md:flex"
      }
    >
      <div className="relative">
        <SessionPopover
          markers={markers}
          sessionJobCounts={sessionJobCounts}
          sortedMarkers={sortedMarkers}
          selectedId={selectedSessionId}
          activeState={activeSessionState}
          isOpen={sessionPickerOpen}
          onOpenChange={onSessionPickerOpenChange}
          onSelectSession={onSelectSession}
          onCreateNew={onCreateNewSession}
        />
      </div>
      <Button
        size="sm"
        variant={paused ? "default" : "outline"}
        className={
          compact
            ? "h-8 px-2 text-[10px] font-bold"
            : "h-8 px-3 text-[11px] font-bold"
        }
        onClick={onTogglePause}
        disabled={!isAliveBackend}
      >
        {paused ? "재개" : "일시중지"}
      </Button>
      <JobActionsMenu
        isAliveBackend={isAliveBackend}
        activeJobsCount={activeJobsCount}
        onCancelAll={onCancelAll}
        onRetryAllFailed={onRetryAllFailed}
        onDeleteAllFailed={onDeleteAllFailed}
        showTooltip={!compact}
      />
    </div>
  )
}
