import { Tabs } from "@/components/ui/tabs"
import type { WorkerView } from "../../types/Message"
import { CompositionTabsList } from "../CompositionTabsList"
import { WorkCompositionToolbar } from "../WorkCompositionToolbar"
import {
  JobSessionControls,
  type JobSessionControlsProps,
} from "./JobSessionControls"

type MobileJobTab = "editor" | "status" | "list"

interface MobileJobHeaderControlsProps extends Omit<
  JobSessionControlsProps,
  "markers" | "compact"
> {
  active: boolean
  mobileJobTab: MobileJobTab
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (tab: "ceg" | "workflow") => void
  repeatCount: number
  setRepeatCount: (value: number | ((current: number) => number)) => void
  handleRun: () => void
  handleRandomRun: (count: number) => void
  handleRunUnapproved: () => void
  randomRunCount: number
  setRandomRunCount: (value: number | ((current: number) => number)) => void
  canRun: boolean
  estimatedRunCount: number | null
  workers: WorkerView[]
  targetWorkerId: string | null
  setTargetWorkerId: (value: string | null) => void
  setIsSelectionOpen: (open: boolean) => void
  hasActiveFilter: boolean
  setIsAxisFilterOpen: (open: boolean) => void
  sessionMarkers?: JobSessionControlsProps["markers"] | undefined
}

/**
 * 모바일 작업 탭에서 편집 도구와 세션 도구 중 하나만 표시한다.
 *
 * 어떤 도구를 보여 줄지는 `mobileJobTab`이 결정하고, 각 도구의 내부 동작은
 * 기존 재사용 컴포넌트에 위임한다.
 */
export function MobileJobHeaderControls(
  props: MobileJobHeaderControlsProps
): React.JSX.Element | null {
  if (!props.active) return null
  if (props.mobileJobTab === "editor") {
    return (
      <div className="no-scrollbar flex flex-1 items-center justify-between gap-2 overflow-x-auto md:hidden">
        <Tabs
          value={props.compositionTab}
          onValueChange={(value) => {
            props.setCompositionTab(value as "ceg" | "workflow")
          }}
        >
          <CompositionTabsList />
        </Tabs>
        <WorkCompositionToolbar
          repeatCount={props.repeatCount}
          setRepeatCount={props.setRepeatCount}
          handleRun={props.handleRun}
          handleRandomRun={props.handleRandomRun}
          handleRunUnapproved={props.handleRunUnapproved}
          randomRunCount={props.randomRunCount}
          setRandomRunCount={props.setRandomRunCount}
          canRun={props.canRun}
          estimatedRunCount={props.estimatedRunCount}
          workers={props.workers}
          targetWorkerId={props.targetWorkerId}
          setTargetWorkerId={props.setTargetWorkerId}
          onSelectionOpen={() => {
            props.setIsSelectionOpen(true)
          }}
          hasActiveFilter={props.hasActiveFilter}
          onAxisFilterOpen={() => {
            props.setIsAxisFilterOpen(true)
          }}
        />
      </div>
    )
  }

  if (props.sessionMarkers === undefined) return null
  return (
    <JobSessionControls
      markers={props.sessionMarkers}
      sessionJobCounts={props.sessionJobCounts}
      sortedMarkers={props.sortedMarkers}
      selectedSessionId={props.selectedSessionId}
      activeSessionState={props.activeSessionState}
      sessionPickerOpen={props.sessionPickerOpen}
      onSessionPickerOpenChange={props.onSessionPickerOpenChange}
      onSelectSession={props.onSelectSession}
      onCreateNewSession={props.onCreateNewSession}
      paused={props.paused}
      onTogglePause={props.onTogglePause}
      onCancelAll={props.onCancelAll}
      onRetryAllFailed={props.onRetryAllFailed}
      onDeleteAllFailed={props.onDeleteAllFailed}
      activeJobsCount={props.activeJobsCount}
      isAliveBackend={props.isAliveBackend}
      compact
    />
  )
}
