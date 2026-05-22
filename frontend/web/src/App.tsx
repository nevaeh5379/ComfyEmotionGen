import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  RefreshCw as RefreshCwIcon,
  Download as DownloadIcon,
  Trash2 as Trash2Icon,
  Filter as FilterIcon,
  LayoutGrid,
  Workflow,
  RotateCcw,
  X as XIcon,
  ExternalLink,
} from "lucide-react"

import { useBackend } from "./comfyui/hooks/useBackend"
import { SavedImagesGallery } from "./comfyui/components/SavedImagesGallery"
import { curationApi } from "./comfyui/hooks/useSavedImages"
import { useGlobalShortcuts } from "./comfyui/hooks/useGlobalShortcuts"
import { CombinationPicker } from "./comfyui/components/combinationpicker/CombinationPicker"
import { DEFAULT_AXIS } from "./comfyui/components/combinationpicker/freeCurationGroupers"
import { WorkflowGraphViewer } from "./comfyui/components/WorkflowGraphViewer"
import { JobManagerPanel } from "./comfyui/components/JobManagerPanel"
import { JobStatusPopup } from "./comfyui/components/JobStatusPopup"
import { SettingsPanel } from "./comfyui/components/SettingsPanel"
import { StatisticsPanel } from "./comfyui/components/StatisticsPanel"
import { useSettings } from "./comfyui/hooks/useSettings"
import { useLocalStorage } from "./comfyui/hooks/useLocalStorage"
import { useSyncedStorage } from "./comfyui/hooks/useSyncedStorage"
import { useOfflineSync } from "./comfyui/hooks/useOfflineSync"
import { useJobRunner } from "./comfyui/hooks/useJobRunner"

import { ParserPreviewDialog } from "./comfyui/components/ParserPreviewDialog"
import { AxisFilterSheet } from "./comfyui/components/AxisFilterSheet"
import { SelectionSheet } from "./comfyui/components/SelectionSheet"
import { NameConflictDialog } from "./comfyui/components/NameConflictDialog"
import { PresetSelectionDialog } from "./comfyui/components/PresetSelectionDialog"
import { VersionDiffDialog } from "./comfyui/components/VersionDiffDialog"
import { WorkCompositionPanel } from "./comfyui/components/WorkCompositionPanel"
import { KeyboardShortcutsDialog } from "./comfyui/components/KeyboardShortcutsDialog"
import { useTemplateContext } from "./comfyui/contexts/TemplateContext"
import { useWorkflowContext } from "./comfyui/contexts/WorkflowContext"
import { useNodeMappingContext } from "./comfyui/contexts/NodeMappingContext"
import { TemplateProvider } from "./comfyui/contexts/TemplateContext"
import { WorkflowProvider } from "./comfyui/contexts/WorkflowContext"
import { NodeMappingProvider } from "./comfyui/contexts/NodeMappingContext"
import type { SavedWorkflow } from "./comfyui/hooks/useSavedWorkflows"
import type { NodeMapping } from "./lib/workflow"
import {
  DEFAULT_BACKEND_URL,
  IS_PACKAGE_MODE,
  PACKAGE_BACKEND_URL,
} from "./lib/runtime"
import { API, HEADERS } from "./lib/api"
import { STORAGE_KEYS } from "./lib/storageKeys"
import {
  HEALTH_CHECK_INTERVAL_MS,
  NAME_CONFLICT_START_NUMBER,
} from "./lib/constants"
import { useRenderLog, useWatchValues } from "./lib/renderLogger"
import { Header } from "./comfyui/components/layout/Header"
import { FloatingWindow } from "./comfyui/components/layout/FloatingWindow"
import type { TabId } from "./comfyui/components/layout/nav-tabs"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { TagInputSearch } from "./comfyui/components/TagInputSearch"
import { cn } from "@/lib/utils"
import { useConfirm } from "@/comfyui/hooks/useConfirm"
import type { JobStatus } from "./comfyui/types/Message"
import { toast } from "sonner"
import {
  type SessionMarkerRaw,
  type ActiveStateRaw,
  initMarkers,
  initActiveState,
  saveMarkers,
  saveActiveState,
  genId,
  jobSessionId,
  makeSessionLabel,
  loadMarkersFromServer,
  loadActiveStateFromServer,
} from "./comfyui/utils/sessionUtils"

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export function App() {
  useRenderLog("App")
  useOfflineSync()

  const [pendingSave, setPendingSave] = useState<{
    name: string
    type: "template" | "workflow" | "nodeMapping"
  } | null>(null)

  const handlePendingSave = (
    name: string,
    type: "template" | "workflow" | "nodeMapping"
  ) => {
    setPendingSave({ name, type })
  }

  const [pendingDiff, setPendingDiff] = useState<{
    name: string
    type: "template" | "workflow"
    oldContent: string
    newContent: string
  } | null>(null)

  const handlePendingUpdate = (
    name: string,
    type: "template" | "workflow",
    oldContent: string,
    newContent: string
  ) => {
    // If content is identical, no diff needed
    if (oldContent === newContent) return null
    setPendingDiff({ name, type, oldContent, newContent })
    return true // Show diff
  }

  // Backend URL (remains at App level — used by many components)
  const [storedBackendUrl, setStoredBackendUrl] = useLocalStorage(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  const backendUrl = IS_PACKAGE_MODE
    ? (PACKAGE_BACKEND_URL as string)
    : storedBackendUrl
  const setBackendUrl = IS_PACKAGE_MODE
    ? (_: string) => {}
    : setStoredBackendUrl

  const { isConnected: backendAlive, jobs, workers, paused } = useBackend()
  const { settings, updateSetting } = useSettings()

  // UI state
  const [activeTab, setActiveTab] = useState<TabId>("jobs")
  const [compositionTab, setCompositionTab] = useState<"ceg" | "workflow">(
    "ceg"
  )
  const [isGalleryFloating, setIsGalleryFloating] = useLocalStorage<boolean>(
    "ceg_isGalleryFloating",
    false
  )
  const [galleryFloatingPos, setGalleryFloatingPos] = useLocalStorage<{ x: number; y: number }>(
    "ceg_galleryFloatingPos",
    { x: 100, y: 100 }
  )
  const [galleryFloatingSize, setGalleryFloatingSize] = useLocalStorage<{ w: number; h: number }>(
    "ceg_galleryFloatingSize",
    { w: 600, h: 500 }
  )

  const [isCompositionFloating, setIsCompositionFloating] = useLocalStorage<boolean>(
    "ceg_isCompositionFloating",
    false
  )
  const [compositionFloatingPos, setCompositionFloatingPos] = useLocalStorage<{ x: number; y: number }>(
    "ceg_compositionFloatingPos",
    { x: 50, y: 150 }
  )
  const [compositionFloatingSize, setCompositionFloatingSize] = useLocalStorage<{ w: number; h: number }>(
    "ceg_compositionFloatingSize",
    { w: 420, h: 650 }
  )

  const [isJobManagerFloating, setIsJobManagerFloating] = useLocalStorage<boolean>(
    "ceg_isJobManagerFloating",
    false
  )
  const [jobManagerFloatingPos, setJobManagerFloatingPos] = useLocalStorage<{ x: number; y: number }>(
    "ceg_jobManagerFloatingPos",
    { x: 500, y: 150 }
  )
  const [jobManagerFloatingSize, setJobManagerFloatingSize] = useLocalStorage<{ w: number; h: number }>(
    "ceg_jobManagerFloatingSize",
    { w: 750, h: 650 }
  )

  const [isStatsFloating, setIsStatsFloating] = useLocalStorage<boolean>(
    "ceg_isStatsFloating",
    false
  )
  const [statsFloatingPos, setStatsFloatingPos] = useLocalStorage<{ x: number; y: number }>(
    "ceg_statsFloatingPos",
    { x: 200, y: 100 }
  )
  const [statsFloatingSize, setStatsFloatingSize] = useLocalStorage<{ w: number; h: number }>(
    "ceg_statsFloatingSize",
    { w: 700, h: 500 }
  )

  const [isCurationFloating, setIsCurationFloating] = useLocalStorage<boolean>(
    "ceg_isCurationFloating",
    false
  )
  const [curationFloatingPos, setCurationFloatingPos] = useLocalStorage<{ x: number; y: number }>(
    "ceg_curationFloatingPos",
    { x: 300, y: 100 }
  )
  const [curationFloatingSize, setCurationFloatingSize] = useLocalStorage<{ w: number; h: number }>(
    "ceg_curationFloatingSize",
    { w: 800, h: 600 }
  )

  const [isStatsDocked, setIsStatsDocked] = useLocalStorage<boolean>("ceg_isStatsDocked", false)
  const [isGalleryDocked, setIsGalleryDocked] = useLocalStorage<boolean>("ceg_isGalleryDocked", false)
  const [isCurationDocked, setIsCurationDocked] = useLocalStorage<boolean>("ceg_isCurationDocked", false)

  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isAxisFilterOpen, setIsAxisFilterOpen] = useState(false)
  const [isSelectionOpen, setIsSelectionOpen] = useState(false)
  const [isAliveBackend, setIsAliveBackend] = useState(false)
  const [previewFilter, setPreviewFilter] = useState("")
  const [pendingPresetSelection, setPendingPresetSelection] =
    useState<SavedWorkflow | null>(null)

  // ── Wrap everything in context providers ──
  return (
    <TemplateProvider
      onPendingSave={handlePendingSave}
      onPendingUpdate={handlePendingUpdate}
    >
      <WorkflowProvider
        onPendingSave={handlePendingSave}
        onPendingUpdate={handlePendingUpdate}
        onPendingPresetSelection={setPendingPresetSelection}
      >
        <NodeMappingProvider backendUrl={backendUrl}>
          <AppContent
            pendingSave={pendingSave}
            setPendingSave={setPendingSave}
            pendingDiff={pendingDiff}
            setPendingDiff={setPendingDiff}
            pendingPresetSelection={pendingPresetSelection}
            setPendingPresetSelection={setPendingPresetSelection}
            backendUrl={backendUrl}
            setBackendUrl={setBackendUrl}
            backendAlive={backendAlive}
            isAliveBackend={isAliveBackend}
            setIsAliveBackend={setIsAliveBackend}
            jobs={jobs}
            workers={workers}
            paused={paused}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            compositionTab={compositionTab}
            setCompositionTab={setCompositionTab}
            isSheetOpen={isSheetOpen}
            setIsSheetOpen={setIsSheetOpen}
            isGraphOpen={isGraphOpen}
            setIsGraphOpen={setIsGraphOpen}
            isAxisFilterOpen={isAxisFilterOpen}
            setIsAxisFilterOpen={setIsAxisFilterOpen}
            isSelectionOpen={isSelectionOpen}
            setIsSelectionOpen={setIsSelectionOpen}
            previewFilter={previewFilter}
            setPreviewFilter={setPreviewFilter}
            settings={settings}
            updateSetting={updateSetting}
            isGalleryFloating={isGalleryFloating}
            setIsGalleryFloating={setIsGalleryFloating}
            galleryFloatingPos={galleryFloatingPos}
            setGalleryFloatingPos={setGalleryFloatingPos}
            galleryFloatingSize={galleryFloatingSize}
            setGalleryFloatingSize={setGalleryFloatingSize}
            isCompositionFloating={isCompositionFloating}
            setIsCompositionFloating={setIsCompositionFloating}
            compositionFloatingPos={compositionFloatingPos}
            setCompositionFloatingPos={setCompositionFloatingPos}
            compositionFloatingSize={compositionFloatingSize}
            setCompositionFloatingSize={setCompositionFloatingSize}
            isJobManagerFloating={isJobManagerFloating}
            setIsJobManagerFloating={setIsJobManagerFloating}
            jobManagerFloatingPos={jobManagerFloatingPos}
            setJobManagerFloatingPos={setJobManagerFloatingPos}
            jobManagerFloatingSize={jobManagerFloatingSize}
            setJobManagerFloatingSize={setJobManagerFloatingSize}
            isStatsFloating={isStatsFloating}
            setIsStatsFloating={setIsStatsFloating}
            statsFloatingPos={statsFloatingPos}
            setStatsFloatingPos={setStatsFloatingPos}
            statsFloatingSize={statsFloatingSize}
            setStatsFloatingSize={setStatsFloatingSize}
            isCurationFloating={isCurationFloating}
            setIsCurationFloating={setIsCurationFloating}
            curationFloatingPos={curationFloatingPos}
            setCurationFloatingPos={setCurationFloatingPos}
            curationFloatingSize={curationFloatingSize}
            setCurationFloatingSize={setCurationFloatingSize}
            isStatsDocked={isStatsDocked}
            setIsStatsDocked={setIsStatsDocked}
            isGalleryDocked={isGalleryDocked}
            setIsGalleryDocked={setIsGalleryDocked}
            isCurationDocked={isCurationDocked}
            setIsCurationDocked={setIsCurationDocked}
          />
        </NodeMappingProvider>
      </WorkflowProvider>
    </TemplateProvider>
  )
}

// ---------------------------------------------------------------------------
// AppContent — inside all 3 contexts
// ---------------------------------------------------------------------------
interface AppContentProps {
  pendingSave: {
    name: string
    type: "template" | "workflow" | "nodeMapping"
  } | null
  setPendingSave: (
    v: { name: string; type: "template" | "workflow" | "nodeMapping" } | null
  ) => void
  pendingDiff: {
    name: string
    type: "template" | "workflow"
    oldContent: string
    newContent: string
  } | null
  setPendingDiff: (
    v: {
      name: string
      type: "template" | "workflow"
      oldContent: string
      newContent: string
    } | null
  ) => void
  pendingPresetSelection: SavedWorkflow | null
  setPendingPresetSelection: (w: SavedWorkflow | null) => void
  backendUrl: string
  setBackendUrl: (url: string) => void
  backendAlive: boolean
  isAliveBackend: boolean
  setIsAliveBackend: (v: boolean) => void
  jobs: ReturnType<typeof useBackend>["jobs"]
  workers: ReturnType<typeof useBackend>["workers"]
  paused: boolean
  activeTab: TabId
  setActiveTab: (t: TabId) => void
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (t: "ceg" | "workflow") => void
  isSheetOpen: boolean
  setIsSheetOpen: (v: boolean) => void
  isGraphOpen: boolean
  setIsGraphOpen: (v: boolean) => void
  isAxisFilterOpen: boolean
  setIsAxisFilterOpen: (v: boolean) => void
  isSelectionOpen: boolean
  setIsSelectionOpen: (v: boolean) => void
  previewFilter: string
  setPreviewFilter: (v: string) => void
  settings: ReturnType<typeof useSettings>["settings"]
  updateSetting: ReturnType<typeof useSettings>["updateSetting"]
  isGalleryFloating: boolean
  setIsGalleryFloating: (v: boolean) => void
  galleryFloatingPos: { x: number; y: number }
  setGalleryFloatingPos: (pos: { x: number; y: number }) => void
  galleryFloatingSize: { w: number; h: number }
  setGalleryFloatingSize: (size: { w: number; h: number }) => void

  isCompositionFloating: boolean
  setIsCompositionFloating: (v: boolean) => void
  compositionFloatingPos: { x: number; y: number }
  setCompositionFloatingPos: (pos: { x: number; y: number }) => void
  compositionFloatingSize: { w: number; h: number }
  setCompositionFloatingSize: (size: { w: number; h: number }) => void

  isJobManagerFloating: boolean
  setIsJobManagerFloating: (v: boolean) => void
  jobManagerFloatingPos: { x: number; y: number }
  setJobManagerFloatingPos: (pos: { x: number; y: number }) => void
  jobManagerFloatingSize: { w: number; h: number }
  setJobManagerFloatingSize: (size: { w: number; h: number }) => void

  isStatsFloating: boolean
  setIsStatsFloating: (v: boolean) => void
  statsFloatingPos: { x: number; y: number }
  setStatsFloatingPos: (pos: { x: number; y: number }) => void
  statsFloatingSize: { w: number; h: number }
  setStatsFloatingSize: (size: { w: number; h: number }) => void

  isCurationFloating: boolean
  setIsCurationFloating: (v: boolean) => void
  curationFloatingPos: { x: number; y: number }
  setCurationFloatingPos: (pos: { x: number; y: number }) => void
  curationFloatingSize: { w: number; h: number }
  setCurationFloatingSize: (size: { w: number; h: number }) => void

  isStatsDocked: boolean
  setIsStatsDocked: (v: boolean) => void
  isGalleryDocked: boolean
  setIsGalleryDocked: (v: boolean) => void
  isCurationDocked: boolean
  setIsCurationDocked: (v: boolean) => void
}

function AppContent(props: AppContentProps) {
  useRenderLog("AppContent")
  const {
    setIsCompositionFloating,
    setIsJobManagerFloating,
    setIsGalleryFloating,
    setIsStatsFloating,
    setIsCurationFloating,
    setIsStatsDocked,
    setIsGalleryDocked,
    setIsCurationDocked,
    setActiveTab,
  } = props

  const dragSessionRef = useRef<{
    windowType: "composition" | "jobManager" | "stats" | "curation" | "gallery"
    startX: number
    startY: number
    isPopoutTriggered: boolean
    size: { w: number; h: number }
  } | null>(null)

  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const [jobsLayoutOrientation, setJobsLayoutOrientation] = useLocalStorage<"horizontal" | "vertical">(
    "ceg_jobsLayoutOrientation",
    "horizontal"
  )

  const [jobsPanelOrder, setJobsPanelOrder] = useLocalStorage<"composition-first" | "manager-first">(
    "ceg_jobsPanelOrder",
    "composition-first"
  )

  const [snapDockZone, setSnapDockZone] = useState<{
    zone: "left" | "right" | "top" | "bottom"
    windowType: "composition" | "jobManager" | "gallery" | "stats" | "curation"
  } | null>(null)

  const handleDragProgress = useCallback(
    (
      clientX: number,
      clientY: number,
      screenW: number,
      screenH: number,
      isEnding: boolean,
      windowType: "composition" | "jobManager" | "gallery" | "stats" | "curation"
    ) => {
      const SNAP_THRESHOLD = 50
      const distLeft = clientX
      const distRight = screenW - clientX
      const distTop = clientY
      const distBottom = screenH - clientY

      const minDist = Math.min(distLeft, distRight, distTop, distBottom)
      let activeZone: "left" | "right" | "top" | "bottom" | null = null

      if (minDist < SNAP_THRESHOLD) {
        if (minDist === distLeft) activeZone = "left"
        else if (minDist === distRight) activeZone = "right"
        else if (minDist === distTop) activeZone = "top"
        else activeZone = "bottom"
      }

      if (isEnding) {
        setSnapDockZone(null)
        if (activeZone) {
          if (windowType === "composition") {
            setIsCompositionFloating(false)
            if (activeZone === "left" || activeZone === "right") {
              setJobsLayoutOrientation("horizontal")
            } else {
              setJobsLayoutOrientation("vertical")
            }
            if (activeZone === "left" || activeZone === "top") {
              setJobsPanelOrder("composition-first")
            } else {
              setJobsPanelOrder("manager-first")
            }
            toast.success("작업 구성 패널이 스냅 결합되었습니다.")
          } else if (windowType === "jobManager") {
            setIsJobManagerFloating(false)
            if (activeZone === "left" || activeZone === "right") {
              setJobsLayoutOrientation("horizontal")
            } else {
              setJobsLayoutOrientation("vertical")
            }
            if (activeZone === "left" || activeZone === "top") {
              setJobsPanelOrder("manager-first")
            } else {
              setJobsPanelOrder("composition-first")
            }
            toast.success("작업 큐 매니저가 스냅 결합되었습니다.")
          } else if (windowType === "gallery") {
            setIsGalleryFloating(false)
            setIsGalleryDocked(true)
            if (activeZone === "left" || activeZone === "right") {
              setJobsLayoutOrientation("horizontal")
            } else {
              setJobsLayoutOrientation("vertical")
            }
            setActiveTab("jobs")
            toast.success("갤러리가 메인 패널에 결합되었습니다.")
          } else if (windowType === "stats") {
            setIsStatsFloating(false)
            setIsStatsDocked(true)
            if (activeZone === "left" || activeZone === "right") {
              setJobsLayoutOrientation("horizontal")
            } else {
              setJobsLayoutOrientation("vertical")
            }
            setActiveTab("jobs")
            toast.success("통계 패널이 메인 패널에 결합되었습니다.")
          } else if (windowType === "curation") {
            setIsCurationFloating(false)
            setIsCurationDocked(true)
            if (activeZone === "left" || activeZone === "right") {
              setJobsLayoutOrientation("horizontal")
            } else {
              setJobsLayoutOrientation("vertical")
            }
            setActiveTab("jobs")
            toast.success("큐레이션 패널이 메인 패널에 결합되었습니다.")
          }
        }
      } else {
        if (activeZone) {
          setSnapDockZone({ zone: activeZone, windowType })
        } else {
          setSnapDockZone(null)
        }
      }
    },
    [
      setIsCompositionFloating,
      setIsJobManagerFloating,
      setIsGalleryFloating,
      setIsStatsFloating,
      setIsCurationFloating,
      setIsStatsDocked,
      setIsGalleryDocked,
      setIsCurationDocked,
      setActiveTab,
      setJobsLayoutOrientation,
      setJobsPanelOrder,
    ]
  )

  const handleHeaderDragStart = useCallback(
    (e: React.MouseEvent, windowType: "composition" | "jobManager") => {
      e.preventDefault()

      const size =
        windowType === "composition"
          ? props.compositionFloatingSize
          : props.jobManagerFloatingSize

      dragSessionRef.current = {
        windowType,
        startX: e.clientX,
        startY: e.clientY,
        isPopoutTriggered: false,
        size,
      }

      const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
        const session = dragSessionRef.current
        if (!session) return

        if (!session.isPopoutTriggered) {
          const dx = moveEvent.clientX - session.startX
          const dy = moveEvent.clientY - session.startY
          const distance = Math.sqrt(dx * dx + dy * dy)

          // 8px 이상 드래그 되었을 때 분리(Popout) 트리거
          if (distance > 8) {
            session.isPopoutTriggered = true

            // 초기 마우스 위치 기준으로 창의 타이틀바 중앙에 마우스가 오도록 계산
            const w = session.size.w
            const initX = moveEvent.clientX - w / 2
            const initY = moveEvent.clientY - 20

            if (session.windowType === "composition") {
              props.setCompositionFloatingPos({ x: initX, y: initY })
              props.setIsCompositionFloating(true)
            } else {
              props.setJobManagerFloatingPos({ x: initX, y: initY })
              props.setIsJobManagerFloating(true)
            }

            toast.info(
              `${
                session.windowType === "composition"
                  ? "작업 구성 패널"
                  : "작업 큐 매니저"
              }이(가) 창 모드로 분리되었습니다.`,
              { id: "popout-toast" }
            )
          }
        } else {
          // 이미 팝아웃된 상태: 60fps 무지연 DOM 바이패스 다이렉트 드래그
          const domId =
            session.windowType === "composition"
              ? "floating-window-composition"
              : "floating-window-jobManager"
          const el = document.getElementById(domId)

          const w = session.size.w
          let nextLeft = moveEvent.clientX - w / 2
          let nextTop = moveEvent.clientY - 20

          // 화면 뷰포트 가두리 적용
          nextLeft = Math.max(0, Math.min(nextLeft, window.innerWidth - w))
          nextTop = Math.max(0, Math.min(nextTop, window.innerHeight - 40))

          if (el) {
            el.style.left = `${nextLeft}px`
            el.style.top = `${nextTop}px`
          }

          // 실시간 엣지 스냅 검출 가이드 프리뷰 호출
          handleDragProgress(
            moveEvent.clientX,
            moveEvent.clientY,
            window.innerWidth,
            window.innerHeight,
            false,
            session.windowType
          )
        }
      }

      const handleGlobalMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener("mousemove", handleGlobalMouseMove)
        document.removeEventListener("mouseup", handleGlobalMouseUp)

        const session = dragSessionRef.current
        if (!session) return

        if (session.isPopoutTriggered) {
          // 스냅 결합 검증 및 완료 처리
          handleDragProgress(
            upEvent.clientX,
            upEvent.clientY,
            window.innerWidth,
            window.innerHeight,
            true,
            session.windowType
          )

          // 엣지에 스냅 도킹되지 않고 여전히 플로팅 상태로 유지되는 경우 최종 포지션을 확정 및 반영
          setTimeout(() => {
            const domId =
              session.windowType === "composition"
                ? "floating-window-composition"
                : "floating-window-jobManager"
            const el = document.getElementById(domId)
            if (el) {
              const finalX = parseInt(el.style.left || "0", 10)
              const finalY = parseInt(el.style.top || "0", 10)
              const finalPos = { x: finalX, y: finalY }
              if (session.windowType === "composition") {
                props.setCompositionFloatingPos(finalPos)
              } else {
                props.setJobManagerFloatingPos(finalPos)
              }
            }
          }, 50)
        }

        dragSessionRef.current = null
      }

      document.addEventListener("mousemove", handleGlobalMouseMove)
      document.addEventListener("mouseup", handleGlobalMouseUp)
    },
    [props, handleDragProgress]
  )

  const handleNavTabDragStart = useCallback(
    (tabId: "stats" | "curation" | "gallery", clientX: number, clientY: number) => {
      const size =
        tabId === "stats"
          ? props.statsFloatingSize
          : tabId === "gallery"
            ? props.galleryFloatingSize
            : props.curationFloatingSize

      dragSessionRef.current = {
        windowType: tabId,
        startX: clientX,
        startY: clientY,
        isPopoutTriggered: false,
        size,
      }

      const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
        const session = dragSessionRef.current
        if (!session) return

        if (!session.isPopoutTriggered) {
          const dx = moveEvent.clientX - session.startX
          const dy = moveEvent.clientY - session.startY
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance > 8) {
            session.isPopoutTriggered = true

            const w = session.size.w
            const initX = moveEvent.clientX - w / 2
            const initY = moveEvent.clientY - 20

            if (session.windowType === "stats") {
              props.setStatsFloatingPos({ x: initX, y: initY })
              props.setIsStatsFloating(true)
              if (props.activeTab === "stats") props.setActiveTab("jobs")
            } else if (session.windowType === "gallery") {
              props.setGalleryFloatingPos({ x: initX, y: initY })
              props.setIsGalleryFloating(true)
              if (props.activeTab === "gallery") props.setActiveTab("jobs")
            } else {
              props.setCurationFloatingPos({ x: initX, y: initY })
              props.setIsCurationFloating(true)
              if (props.activeTab === "curation") props.setActiveTab("jobs")
            }

            const label =
              session.windowType === "stats"
                ? "통계"
                : session.windowType === "gallery"
                  ? "갤러리"
                  : "큐레이션"
            toast.info(`${label} 패널이 창 모드로 분리되었습니다.`, {
              id: "popout-toast",
            })
          }
        } else {
          const domId = `floating-window-${session.windowType}`
          const el = document.getElementById(domId)

          const w = session.size.w
          let nextLeft = moveEvent.clientX - w / 2
          let nextTop = moveEvent.clientY - 20

          nextLeft = Math.max(0, Math.min(nextLeft, window.innerWidth - w))
          nextTop = Math.max(0, Math.min(nextTop, window.innerHeight - 40))

          if (el) {
            el.style.left = `${nextLeft}px`
            el.style.top = `${nextTop}px`
          }

          handleDragProgress(
            moveEvent.clientX,
            moveEvent.clientY,
            window.innerWidth,
            window.innerHeight,
            false,
            session.windowType as "stats" | "curation" | "gallery"
          )
        }
      }

      const handleGlobalMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener("mousemove", handleGlobalMouseMove)
        document.removeEventListener("mouseup", handleGlobalMouseUp)

        const session = dragSessionRef.current
        if (!session) return

        if (session.isPopoutTriggered) {
          handleDragProgress(
            upEvent.clientX,
            upEvent.clientY,
            window.innerWidth,
            window.innerHeight,
            true,
            session.windowType as "stats" | "curation" | "gallery"
          )

          setTimeout(() => {
            const domId = `floating-window-${session.windowType}`
            const el = document.getElementById(domId)
            if (el) {
              const finalX = parseInt(el.style.left || "0", 10)
              const finalY = parseInt(el.style.top || "0", 10)
              const finalPos = { x: finalX, y: finalY }
              if (session.windowType === "stats") {
                props.setStatsFloatingPos(finalPos)
              } else if (session.windowType === "gallery") {
                props.setGalleryFloatingPos(finalPos)
              } else {
                props.setCurationFloatingPos(finalPos)
              }
            }
          }, 50)
        }

        dragSessionRef.current = null
      }

      document.addEventListener("mousemove", handleGlobalMouseMove)
      document.addEventListener("mouseup", handleGlobalMouseUp)
    },
    [props, handleDragProgress]
  )

  // ── Contexts ──
  const template = useTemplateContext()
  const workflow = useWorkflowContext()
  const nodeMapping = useNodeMappingContext()

  const confirm = useConfirm()

  // ── session state (lifted) ──────────────────────────────────────────
  const initialMarkers = useMemo(() => initMarkers(), [])
  const [markers, setMarkersRaw] = useState<SessionMarkerRaw[]>(() =>
    initialMarkers
  )

  const persistMarkers = (ms: SessionMarkerRaw[]) => {
    saveMarkers(ms)
    setMarkersRaw(ms)
  }

  const [activeState, setActiveStateRaw] = useState<ActiveStateRaw>(() =>
    initActiveState(initialMarkers)
  )

  const persistActiveState = (as: ActiveStateRaw) => {
    saveActiveState(as)
    setActiveStateRaw(as)
  }

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => b.startAt - a.startAt),
    [markers]
  )

  // Default: newest marker
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    () =>
      activeState?.activeSessionId ??
      initialMarkers.sort((a, b) => b.startAt - a.startAt)[0]!.id
  )

  // 서버에서 세션 데이터 로드 (마운트 시)
  useEffect(() => {
    let aborted = false
    Promise.all([loadMarkersFromServer(), loadActiveStateFromServer()]).then(
      ([serverMarkers, serverActiveState]) => {
        if (aborted) return
        if (serverMarkers.length > 0) {
          setMarkersRaw(serverMarkers)
        }
        if (serverActiveState) {
          setActiveStateRaw(serverActiveState)
          setSelectedSessionId(serverActiveState.activeSessionId)
        }
      }
    )
    return () => {
      aborted = true
    }
  }, [])

  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)

  const sessionJobCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of props.jobs) {
      const sid = jobSessionId(j.createdAt, sortedMarkers, activeState)
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [props.jobs, sortedMarkers, activeState])

  const sessionJobs = useMemo(
    () =>
      props.jobs.filter(
        (j) =>
          jobSessionId(j.createdAt, sortedMarkers, activeState) ===
          selectedSessionId
      ),
    [props.jobs, sortedMarkers, activeState, selectedSessionId]
  )

  const sessionCounts = useMemo(() => {
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

  // ── Job completion notification ──
  const prevActiveCount = useRef<number | null>(null)
  useEffect(() => {
    const current = sessionCounts.active
    if (
      prevActiveCount.current !== null &&
      prevActiveCount.current > 0 &&
      current === 0
    ) {
      const totalJobs = sessionJobs.length
      if (totalJobs > 0) {
        const doneCount = sessionCounts.done
        const errorCount = sessionCounts.error + sessionCounts.cancelled
        if (errorCount > 0) {
          toast.info(`배치 완료! (${doneCount} 완료, ${errorCount} 실패/취소)`)
        } else {
          toast.success(`모든 작업이 완료되었습니다! (${doneCount}개)`)
        }
        // Send batch complete webhook notification
        fetch(`${props.backendUrl}${API.webhooks.batchComplete}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            done: doneCount,
            error: errorCount,
            total: totalJobs,
          }),
        }).catch(() => {})
      }
    }
    prevActiveCount.current = current
  }, [
    sessionCounts.active,
    sessionCounts.done,
    sessionCounts.error,
    sessionCounts.cancelled,
    sessionJobs.length,
    props.backendUrl,
  ])

  const createNewSession = () => {
    const nonEmpty = markers.filter(
      (m) => (sessionJobCounts.get(m.id) ?? 0) > 0
    )
    if (nonEmpty.length < markers.length) {
      persistMarkers(nonEmpty)
    }
    const newMarker: SessionMarkerRaw = {
      id: genId(),
      startAt: Date.now(),
      label: makeSessionLabel(nonEmpty.length + 1),
    }
    persistMarkers([...nonEmpty, newMarker])
    persistActiveState({
      activeSessionId: newMarker.id,
      activatedAt: Date.now(),
    })
    setSelectedSessionId(newMarker.id)
    setSessionPickerOpen(false)
  }

  const handleTogglePause = async () => {
    try {
      await fetch(
        `${props.backendUrl}${props.paused ? API.jobs.resume : API.jobs.pause}`,
        {
          method: "POST",
        }
      )
    } catch {
      toast.error("일시중지/재개 요청에 실패했습니다.")
    }
  }

  const handleCancelAll = async () => {
    if (
      !(await confirm({
        title: "작업 취소",
        description: "진행 중인 모든 작업을 취소하시겠습니까?",
        variant: "destructive",
        confirmText: "모두 취소",
      }))
    )
      return
    try {
      await fetch(`${props.backendUrl}${API.jobs.cancelAll}`, {
        method: "POST",
      })
    } catch {
      toast.error("전체 취소 요청에 실패했습니다.")
    }
  }

  const handleRetryAllFailed = async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    for (const j of failed) {
      try {
        await fetch(`${props.backendUrl}${API.jobs.retry(j.id)}`, {
          method: "POST",
        })
      } catch {
        toast.error(`작업 재시도에 실패했습니다: ${j.id.slice(0, 8)}`)
      }
    }
  }

  const handleDeleteAllFailed = async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    if (failed.length === 0) return
    if (
      !(await confirm({
        title: "실패 작업 삭제",
        description: `실패/취소된 작업 ${failed.length}개를 모두 영구 삭제하시겠습니까?`,
        variant: "destructive",
        confirmText: "모두 삭제",
      }))
    )
      return
    try {
      await fetch(`${props.backendUrl}${API.jobs.delete}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ job_ids: failed.map((j) => j.id) }),
      })
    } catch {
      toast.error("실패 작업 삭제 요청에 실패했습니다.")
    }
  }

  const [mobileJobTab, setMobileJobTab] = useState<
    "editor" | "status" | "list"
  >("editor")

  // ── Gallery toolbar state (lifted for nav bar rendering) ──
  const [galleryStatusFilter, setGalleryStatusFilter] = useState<
    "pending" | "approved" | "rejected" | "trashed" | "all"
  >("pending")
  const [galleryViewMode, setGalleryViewMode] = useState<"grid" | "compare">(
    "grid"
  )
  const [galleryGroupMode, setGalleryGroupMode] = useState(false)
  const [galleryShowFilters, setGalleryShowFilters] = useState(false)
  const [galleryHideRejected, setGalleryHideRejected] = useState(false)
  const [gallerySearchTags, setGallerySearchTags] = useState<string[]>([])
  const [gallerySearchInput, setGallerySearchInput] = useState("")
  const [galleryCandidates, setGalleryCandidates] = useState<
    { value: string; type: "filename" | "tag" | "metadata" }[]
  >([])
  const [_galleryDuplicateStrategy, setGalleryDuplicateStrategy] = useState<
    "hash" | "number"
  >("hash")
  const [gallerySortKey, setGallerySortKey] = useState<
    "createdAt" | "filename" | "sizeBytes"
  >("createdAt")
  const [gallerySortDir, setGallerySortDir] = useState<"asc" | "desc">("desc")

  const [galleryThumbnailSize, setGalleryThumbnailSize] = useSyncedStorage<number>(
    STORAGE_KEYS.galleryThumbnailSize,
    180
  )


  const galleryFilenameFilter = useMemo(() => {
    return gallerySearchTags
      .filter((t) => t.startsWith("@"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [gallerySearchTags])

  const galleryTagFilter = useMemo(() => {
    return gallerySearchTags
      .filter((t) => t.startsWith("#"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [gallerySearchTags])

  const galleryMetadataFilter = useMemo(() => {
    return gallerySearchTags
      .filter((t) => t.startsWith("$"))
      .map((t) => t.slice(1))
      .join(" ")
  }, [gallerySearchTags])

  const galleryGeneralFilters = useMemo(() => {
    return gallerySearchTags.filter(
      (t) => !t.startsWith("@") && !t.startsWith("#") && !t.startsWith("$")
    )
  }, [gallerySearchTags])

  const galleryHasAnyFilter = !!(
    gallerySearchTags.length > 0 || galleryHideRejected
  )

  // ── Gallery action handlers (for Header dropdown + keyboard shortcuts) ──
  const galleryReloadRef = useRef<(() => void) | null>(null)

  const handleGalleryExport = useCallback(async () => {
    try {
      await curationApi.exportDataset(props.backendUrl, {
        ...(props.settings.galleryExportScope === "approved"
          ? { status: "approved" }
          : {}),
        duplicateStrategy: props.settings.galleryExportStrategy,
      })
      toast.success("내보내기가 완료되었습니다.")
    } catch {
      toast.error("내보내기 요청에 실패했습니다.")
    }
  }, [
    props.backendUrl,
    props.settings.galleryExportScope,
    props.settings.galleryExportStrategy,
  ])

  const handleGalleryEmptyTrash = useCallback(async () => {
    if (
      !(await confirm({
        title: "휴지통 비우기",
        description: "휴지통의 이미지를 영구 삭제합니다. 계속하시겠습니까?",
        variant: "destructive",
        confirmText: "영구 삭제",
      }))
    )
      return
    try {
      const n = await curationApi.emptyTrash(props.backendUrl)
      toast.success(`${n}개 영구 삭제됨`)
      galleryReloadRef.current?.()
    } catch {
      toast.error("휴지통 비우기에 실패했습니다.")
    }
  }, [props.backendUrl, confirm])

  const handleGalleryRefresh = useCallback(() => {
    galleryReloadRef.current?.()
  }, [])

  // ── Quick save handler (Ctrl+S shortcut) ──
  const handleQuickSave = useCallback(() => {
    if (props.compositionTab === "ceg") {
      // Save template
      if (template.activeTemplateId) {
        const active = template.savedTemplates.find(
          (t) => t.id === template.activeTemplateId
        )
        if (active) {
          template.saveTemplate(active.name, template.cegTemplate)
          template.setTemplateResetKey((k) => k + 1)
        }
      }
    } else {
      // Save workflow
      if (workflow.activeWorkflow) {
        workflow.saveWorkflow(
          workflow.activeWorkflow.name,
          workflow.workflowJson
        )
        workflow.setWorkflowResetKey((k) => k + 1)
      }
    }
  }, [props.compositionTab, template, workflow])

  // ── Curation toolbar state (lifted for nav bar rendering) ──
  const [curationSelectedAxis, setCurationSelectedAxis] = useSyncedStorage(
    STORAGE_KEYS.curationSelectedAxis,
    DEFAULT_AXIS
  )

  // ── Job Runner (consumes context values) ──
  const {
    fakeJobQueue,
    parserError,
    axisValueFilter,
    setAxisValueFilter,
    collapsedAxes,
    uncheckedItems,
    repeatCount,
    setRepeatCount,
    handleRun,
    handleRunSelected,
    handleRandomRun,
    randomRunCount,
    setRandomRunCount,
    toggleItemCheck,
    checkAllItems,
    uncheckAllItems,
    toggleAxisCollapse,
    estimatedRunCount,
    axisFilteredItems,
    axisExcludedItems,
    filteredByAxisSet,
    hasActiveFilter,
    selectedCount,
  } = useJobRunner({
    cegTemplate: template.cegTemplate,
    workflowJson: workflow.workflowJson,
    nodeMappings: nodeMapping.nodeMappings,
    backendUrl: props.backendUrl,
    isAliveBackend: props.isAliveBackend,
  })

  const filteredPreview = useMemo(() => {
    const needle = props.previewFilter.trim().toLowerCase()
    if (!needle) return fakeJobQueue
    return fakeJobQueue.filter(
      (it) =>
        it.filename.toLowerCase().includes(needle) ||
        it.prompt.toLowerCase().includes(needle)
    )
  }, [fakeJobQueue, props.previewFilter])

  useWatchValues("AppContent", {
    backendAlive: props.backendAlive,
    jobs: props.jobs,
    workers: props.workers,
    paused: props.paused,
    activeTab: props.activeTab,
    fakeJobQueue,
    isSheetOpen: props.isSheetOpen,
    isGraphOpen: props.isGraphOpen,
    isAxisFilterOpen: props.isAxisFilterOpen,
    isSelectionOpen: props.isSelectionOpen,
    isAliveBackend: props.isAliveBackend,
    previewFilter: props.previewFilter,
    parserError,
    axisValueFilter,
    pendingSave: props.pendingSave,
    cegTemplate: template.cegTemplate,
    workflowJson: workflow.workflowJson,
    nodeMappings: nodeMapping.nodeMappings,
  })

  // ── Backend health check ──
  useEffect(() => {
    let cancelled = false
    const checkHealth = async () => {
      try {
        const response = await fetch(`${props.backendUrl}${API.health}`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        return data["backend"] === "ok"
      } catch (error) {
        console.error("Error occurred during backend health check:", error)
        return false
      }
    }
    const tick = async () => {
      const ok = await checkHealth()
      if (!cancelled) props.setIsAliveBackend(ok)
    }
    tick()
    const timer = setInterval(tick, HEALTH_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.backendUrl])

  // ── Object info fetch ──
  useEffect(() => {
    if (!props.isAliveBackend) return
    fetch(`${props.backendUrl}${API.objectInfo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) nodeMapping.setObjectInfo(data)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.backendUrl, props.isAliveBackend])

  const canRun =
    Boolean(workflow.workflowJson) && props.isAliveBackend && props.backendAlive

  // ── Global keyboard shortcuts ──
  useGlobalShortcuts({
    activeTab: props.activeTab,
    mobileJobTab,
    canRun,
    handleRun,
    handleSave: handleQuickSave,
    handleGalleryRefresh,
    setActiveTab: props.setActiveTab,
    toggleShortcuts: () => setShortcutsOpen((prev) => !prev),
  })

  // ── Name conflict helpers ──
  const nextFreeName = (name: string, items: { name: string }[]): string => {
    if (!items.some((x) => x.name === name)) return name
    let n = NAME_CONFLICT_START_NUMBER
    while (items.some((x) => x.name === `${name} (${n})`)) n++
    return `${name} (${n})`
  }

  const pendingSaveItems =
    props.pendingSave?.type === "template"
      ? template.savedTemplates
      : props.pendingSave?.type === "workflow"
        ? workflow.savedWorkflows
        : nodeMapping.savedNodeMappings

  const handleNameConflictSaveNew = () => {
    if (!props.pendingSave) return
    const newName = nextFreeName(props.pendingSave.name, pendingSaveItems)
    if (props.pendingSave.type === "template") {
      template.saveTemplate(newName, template.cegTemplate)
      template.setTemplateResetKey((k) => k + 1)
    } else if (props.pendingSave.type === "workflow") {
      const w = workflow.saveWorkflow(newName, workflow.workflowJson)
      workflow.setActiveWorkflowId(w.id)
      workflow.setWorkflowResetKey((k) => k + 1)
    } else {
      if (workflow.activeWorkflowId) {
        nodeMapping.saveMappingPreset(
          workflow.activeWorkflowId,
          newName,
          nodeMapping.nodeMappings
        )
        nodeMapping.setNodeMappingResetKey((k) => k + 1)
      }
    }
    props.setPendingSave(null)
  }

  const handleNameConflictOverwrite = () => {
    if (!props.pendingSave) return
    if (props.pendingSave.type === "template") {
      template.saveTemplate(props.pendingSave.name, template.cegTemplate)
      template.setTemplateResetKey((k) => k + 1)
    } else if (props.pendingSave.type === "workflow") {
      const w = workflow.saveWorkflow(
        props.pendingSave.name,
        workflow.workflowJson
      )
      workflow.setActiveWorkflowId(w.id)
      workflow.setWorkflowResetKey((k) => k + 1)
    } else {
      if (workflow.activeWorkflowId) {
        nodeMapping.saveMappingPreset(
          workflow.activeWorkflowId,
          props.pendingSave.name,
          nodeMapping.nodeMappings
        )
        nodeMapping.setNodeMappingResetKey((k) => k + 1)
      }
    }
    props.setPendingSave(null)
  }

  return (
    <div
      className={`flex flex-col bg-background ${
        props.activeTab === "jobs"
          ? "h-[100dvh] overflow-hidden"
          : "min-h-[100dvh]"
      }`}
    >
      <Header
        activeTab={props.activeTab}
        setActiveTab={props.setActiveTab}
        isGalleryFloating={props.isGalleryFloating}
        setIsGalleryFloating={props.setIsGalleryFloating}
        isAliveBackend={props.isAliveBackend}
        backendAlive={props.backendAlive}
        workers={props.workers}
        jobsCount={props.jobs.length}
        mobileJobTab={mobileJobTab}
        setMobileJobTab={setMobileJobTab}
        compositionTab={props.compositionTab}
        setCompositionTab={props.setCompositionTab}
        repeatCount={repeatCount}
        setRepeatCount={setRepeatCount}
        handleRun={handleRun}
        handleRandomRun={handleRandomRun}
        randomRunCount={randomRunCount}
        setRandomRunCount={setRandomRunCount}
        canRun={canRun}
        estimatedRunCount={estimatedRunCount}
        setIsSelectionOpen={props.setIsSelectionOpen}
        hasActiveFilter={hasActiveFilter}
        setIsAxisFilterOpen={props.setIsAxisFilterOpen}
        setIsGraphOpen={props.setIsGraphOpen}
        galleryStatusFilter={galleryStatusFilter}
        setGalleryStatusFilter={setGalleryStatusFilter}
        galleryViewMode={galleryViewMode}
        setGalleryViewMode={setGalleryViewMode}
        galleryGroupMode={galleryGroupMode}
        setGalleryGroupMode={setGalleryGroupMode}
        galleryShowFilters={galleryShowFilters}
        setGalleryShowFilters={setGalleryShowFilters}
        galleryHasAnyFilter={galleryHasAnyFilter}
        gallerySearchTags={gallerySearchTags}
        setGallerySearchTags={setGallerySearchTags}
        gallerySearchInput={gallerySearchInput}
        setGallerySearchInput={setGallerySearchInput}
        galleryCandidates={galleryCandidates}
        galleryHideRejected={galleryHideRejected}
        setGalleryHideRejected={setGalleryHideRejected}
        setGalleryDuplicateStrategy={setGalleryDuplicateStrategy}
        gallerySortKey={gallerySortKey}
        setGallerySortKey={setGallerySortKey}
        gallerySortDir={gallerySortDir}
        setGallerySortDir={setGallerySortDir}
        galleryThumbnailSize={galleryThumbnailSize}
        setGalleryThumbnailSize={setGalleryThumbnailSize}
        curationSelectedAxis={curationSelectedAxis}

        setCurationSelectedAxis={setCurationSelectedAxis}
        savedTemplates={template.savedTemplates}
        onGalleryExport={handleGalleryExport}
        onGalleryRefresh={handleGalleryRefresh}
        onGalleryEmptyTrash={handleGalleryEmptyTrash}
        onStatsDragStart={(cx, cy) => handleNavTabDragStart("stats", cx, cy)}
        onCurationDragStart={(cx, cy) => handleNavTabDragStart("curation", cx, cy)}
        onGalleryDragStart={(cx, cy) => handleNavTabDragStart("gallery", cx, cy)}
        isStatsFloating={props.isStatsFloating}
        isStatsDocked={props.isStatsDocked}
        isCurationFloating={props.isCurationFloating}
        isCurationDocked={props.isCurationDocked}
        isGalleryDocked={props.isGalleryDocked}
        // Session / Job controls props (lifted)
        sessionMarkers={markers}
        sessionJobCounts={sessionJobCounts}
        sortedMarkers={sortedMarkers}
        selectedSessionId={selectedSessionId}
        activeSessionState={
          activeState ? { activeSessionId: activeState.activeSessionId } : null
        }
        sessionPickerOpen={sessionPickerOpen}
        onSessionPickerOpenChange={setSessionPickerOpen}
        onSelectSession={setSelectedSessionId}
        onCreateNewSession={createNewSession}
        paused={props.paused}
        onTogglePause={handleTogglePause}
        onCancelAll={handleCancelAll}
        onRetryAllFailed={handleRetryAllFailed}
        onDeleteAllFailed={handleDeleteAllFailed}
        activeJobsCount={sessionCounts.active}
      />

      <main
        className={`flex w-full flex-1 flex-col ${
          props.activeTab === "jobs" ? "overflow-hidden" : ""
        }`}
      >
        {props.activeTab === "stats" && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
            <StatisticsPanel jobs={props.jobs} workers={props.workers} />
          </div>
        )}
        {props.activeTab === "gallery" && (
          <div className="flex flex-1 flex-col bg-background">
            <SavedImagesGallery
              backendUrl={props.backendUrl}
              enableHover={props.settings.enableHover}
              imagePageSize={props.settings.imagePageSize}
              imageLazyLoad={props.settings.imageLazyLoad}
              singleDownloadMode={props.settings.singleDownloadMode}
              filenameFilter={galleryFilenameFilter}
              tagFilter={galleryTagFilter}
              metadataFilter={galleryMetadataFilter}
              generalFilters={galleryGeneralFilters}
              onTokensExtracted={setGalleryCandidates}
              onReloadReady={(reload) => {
                galleryReloadRef.current = reload
              }}
              toolbarState={{
                statusFilter: galleryStatusFilter,
                setStatusFilter: setGalleryStatusFilter,
                galleryViewMode: galleryViewMode,
                setGalleryViewMode: setGalleryViewMode,
                groupMode: galleryGroupMode,
                setGroupMode: setGalleryGroupMode,
                showFilters: galleryShowFilters,
                setShowFilters: setGalleryShowFilters,
                hasAnyFilter: galleryHasAnyFilter,
                hideRejected: galleryHideRejected,
                setHideRejected: setGalleryHideRejected,
                sortKey: gallerySortKey,
                setSortKey: setGallerySortKey,
                sortDir: gallerySortDir,
                setSortDir: setGallerySortDir,
                thumbnailSize: galleryThumbnailSize,
                setThumbnailSize: setGalleryThumbnailSize,
                clearAllFilters: () => {
                  setGallerySearchTags([])
                  setGallerySearchInput("")
                  setGalleryHideRejected(false)
                },
                reload: handleGalleryRefresh,
                handleExport: handleGalleryExport,
                handleEmptyTrash: handleGalleryEmptyTrash,
              }}
            />
          </div>
        )}
        {props.activeTab === "curation" && (
          <div className="flex flex-col bg-background">
            <CombinationPicker
              backendUrl={props.backendUrl}
              cegTemplate={template.cegTemplate}
              savedTemplates={template.savedTemplates}
              enableHover={props.settings.enableHover}
              autoApplyReject={props.settings.autoApplyReject}
              savedWorkflows={workflow.savedWorkflows}
              toolbarState={{
                selectedAxis: curationSelectedAxis,
                setSelectedAxis: setCurationSelectedAxis,
                viewMode: "gallery" as const,
                setViewMode: () => {},
                hideTopSection: true,
                exportIsLoading: false,
                setExportIsLoading: () => {},
                exportMessage: null,
                setExportMessage: () => {},
                regenMessage: null,
                setRegenMessage: () => {},
                onExport: () => {},
                onRegenerate: () => {},
              }}
            />
          </div>
        )}
        {props.activeTab === "settings" && (
          <div className="flex-1 overflow-y-auto">
            <SettingsPanel
              settings={props.settings}
              updateSetting={props.updateSetting}
              backendUrl={props.backendUrl}
              onBackendUrlChange={props.setBackendUrl}
              workers={props.workers}
            />
          </div>
        )}
        {props.activeTab === "jobs" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Desktop: Resizable, Mobile: Single Panel */}
            <div className="hidden md:contents">
              {(() => {
                // ── 패널 콘텐츠 ──────────────────────────────────────────
                const compositionEl = !props.isCompositionFloating ? (
                  <WorkCompositionPanel
                    repeatCount={repeatCount}
                    setRepeatCount={setRepeatCount}
                    handleRun={handleRun}
                    handleRandomRun={handleRandomRun}
                    randomRunCount={randomRunCount}
                    setRandomRunCount={setRandomRunCount}
                    estimatedRunCount={estimatedRunCount}
                    canRun={canRun}
                    previewCount={fakeJobQueue.length}
                    compositionTab={props.compositionTab}
                    setCompositionTab={props.setCompositionTab}
                    onPreviewOpen={() => props.setIsSheetOpen(true)}
                    onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
                    onSelectionOpen={() => props.setIsSelectionOpen(true)}
                    hasActiveFilter={hasActiveFilter}
                    onGraphOpen={() => props.setIsGraphOpen(true)}
                    isFloating={false}
                    onFloatToggle={() => props.setIsCompositionFloating(true)}
                    onHeaderDragStart={(e) => handleHeaderDragStart(e, "composition")}
                    jobsLayoutOrientation={jobsLayoutOrientation}
                    onToggleJobsLayoutOrientation={() => setJobsLayoutOrientation(jobsLayoutOrientation === "horizontal" ? "vertical" : "horizontal")}
                  />
                ) : null

                const jobManagerEl = !props.isJobManagerFloating ? (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <JobManagerPanel
                      jobs={props.jobs}
                      paused={props.paused}
                      backendUrl={props.backendUrl}
                      isAliveBackend={props.isAliveBackend}
                      selectedId={selectedSessionId}
                      setSelectedId={setSelectedSessionId}
                      markers={markers}
                      setMarkersRaw={setMarkersRaw}
                      activeState={activeState}
                      setActiveStateRaw={setActiveStateRaw}
                      sessionPickerOpen={sessionPickerOpen}
                      setSessionPickerOpen={setSessionPickerOpen}
                      createNewSession={createNewSession}
                      sessionJobCounts={sessionJobCounts}
                      sortedMarkers={sortedMarkers}
                      counts={sessionCounts}
                      sessionJobs={sessionJobs}
                      handleTogglePause={handleTogglePause}
                      handleCancelAll={handleCancelAll}
                      handleRetryAllFailed={handleRetryAllFailed}
                      handleDeleteAllFailed={handleDeleteAllFailed}
                      isFloating={false}
                      onFloatToggle={() => props.setIsJobManagerFloating(true)}
                      onHeaderDragStart={(e) => handleHeaderDragStart(e, "jobManager")}
                    />
                  </div>
                ) : null

                // 도킹 패널 공통 헤더 버튼
                const panelBtn = (icon: React.ReactNode, onClick: () => void, title: string) => (
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    onClick={onClick}
                    title={title}
                  >
                    {icon}
                  </button>
                )

                // ── 패널 리스트 구성 ────────────────────────────────────
                const panels: { id: string; el: React.ReactNode; minSize?: number }[] = []

                const comp = compositionEl ? { id: "composition", el: compositionEl, minSize: 20 } : null
                const mgr = jobManagerEl ? { id: "jobManager", el: jobManagerEl } : null
                if (jobsPanelOrder === "composition-first") {
                  if (comp) panels.push(comp)
                  if (mgr) panels.push(mgr)
                } else {
                  if (mgr) panels.push(mgr)
                  if (comp) panels.push(comp)
                }

                if (props.isStatsDocked) panels.push({
                  id: "stats",
                  el: (
                    <div className="flex h-full w-full flex-col">
                      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                        <span className="text-[13px] font-bold">통계</span>
                        <div className="flex items-center gap-0.5">
                          {panelBtn(<ExternalLink className="h-3.5 w-3.5" />, () => { props.setIsStatsDocked(false); props.setIsStatsFloating(true) }, "창으로 분리")}
                          {panelBtn(<XIcon className="h-3.5 w-3.5" />, () => props.setIsStatsDocked(false), "패널 닫기")}
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                        <StatisticsPanel jobs={props.jobs} workers={props.workers} />
                      </div>
                    </div>
                  ),
                })

                if (props.isGalleryDocked) panels.push({
                  id: "gallery",
                  el: (
                    <div className="flex h-full w-full flex-col">
                      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                        <span className="text-[13px] font-bold">갤러리</span>
                        <div className="flex items-center gap-0.5">
                          {panelBtn(<ExternalLink className="h-3.5 w-3.5" />, () => { props.setIsGalleryDocked(false); props.setIsGalleryFloating(true) }, "창으로 분리")}
                          {panelBtn(<XIcon className="h-3.5 w-3.5" />, () => props.setIsGalleryDocked(false), "패널 닫기")}
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <SavedImagesGallery
                          backendUrl={props.backendUrl}
                          enableHover={props.settings.enableHover}
                          imagePageSize={props.settings.imagePageSize}
                          imageLazyLoad={props.settings.imageLazyLoad}
                          singleDownloadMode={props.settings.singleDownloadMode}
                          filenameFilter={galleryFilenameFilter}
                          tagFilter={galleryTagFilter}
                          metadataFilter={galleryMetadataFilter}
                          generalFilters={galleryGeneralFilters}
                          onTokensExtracted={setGalleryCandidates}
                          onReloadReady={(reload) => { galleryReloadRef.current = reload }}
                          toolbarState={{
                            statusFilter: galleryStatusFilter,
                            setStatusFilter: setGalleryStatusFilter,
                            galleryViewMode,
                            setGalleryViewMode,
                            groupMode: galleryGroupMode,
                            setGroupMode: setGalleryGroupMode,
                            showFilters: galleryShowFilters,
                            setShowFilters: setGalleryShowFilters,
                            hasAnyFilter: galleryHasAnyFilter,
                            hideRejected: galleryHideRejected,
                            setHideRejected: setGalleryHideRejected,
                            sortKey: gallerySortKey,
                            setSortKey: setGallerySortKey,
                            sortDir: gallerySortDir,
                            setSortDir: setGallerySortDir,
                            thumbnailSize: galleryThumbnailSize,
                            setThumbnailSize: setGalleryThumbnailSize,
                            clearAllFilters: () => { setGallerySearchTags([]); setGallerySearchInput(""); setGalleryHideRejected(false) },
                            reload: handleGalleryRefresh,
                            handleExport: handleGalleryExport,
                            handleEmptyTrash: handleGalleryEmptyTrash,
                          }}
                        />
                      </div>
                    </div>
                  ),
                })

                if (props.isCurationDocked) panels.push({
                  id: "curation",
                  el: (
                    <div className="flex h-full w-full flex-col">
                      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                        <span className="text-[13px] font-bold">큐레이션</span>
                        <div className="flex items-center gap-0.5">
                          {panelBtn(<ExternalLink className="h-3.5 w-3.5" />, () => { props.setIsCurationDocked(false); props.setIsCurationFloating(true) }, "창으로 분리")}
                          {panelBtn(<XIcon className="h-3.5 w-3.5" />, () => props.setIsCurationDocked(false), "패널 닫기")}
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <CombinationPicker
                          backendUrl={props.backendUrl}
                          cegTemplate={template.cegTemplate}
                          savedTemplates={template.savedTemplates}
                          enableHover={props.settings.enableHover}
                          autoApplyReject={props.settings.autoApplyReject}
                          savedWorkflows={workflow.savedWorkflows}
                          toolbarState={{
                            selectedAxis: curationSelectedAxis,
                            setSelectedAxis: setCurationSelectedAxis,
                            viewMode: "gallery" as const,
                            setViewMode: () => {},
                            hideTopSection: true,
                            exportIsLoading: false,
                            setExportIsLoading: () => {},
                            exportMessage: null,
                            setExportMessage: () => {},
                            regenMessage: null,
                            setRegenMessage: () => {},
                            onExport: () => {},
                            onRegenerate: () => {},
                          }}
                        />
                      </div>
                    </div>
                  ),
                })

                // ── 렌더링 ──────────────────────────────────────────────
                if (panels.length === 0) {
                  return (
                    <div className="flex flex-1 flex-col items-center justify-center bg-background p-8 select-none text-center animate-in fade-in duration-300">
                      <div className="relative flex flex-col items-center justify-center p-8 max-w-md rounded-2xl border border-line/45 bg-panel/40 backdrop-blur-xl shadow-xl space-y-6 overflow-hidden before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-tr before:from-primary/5 before:via-transparent before:to-primary/10 before:-z-10 animate-in zoom-in-95 duration-300">
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Workflow className="h-8 w-8 animate-pulse" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-lg font-bold text-foreground tracking-tight">모든 작업 패널이 창 모드로 분리되었습니다</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed px-4">작업 구성 패널과 작업 큐 매니저가 개별 플로팅 창으로 활성화되었습니다.</p>
                        </div>
                        <Button
                          onClick={() => { props.setIsCompositionFloating(false); props.setIsJobManagerFloating(false) }}
                          className="px-6 py-2 h-10 font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2 group transition-all duration-200"
                        >
                          <RotateCcw className="h-4 w-4 transition-transform group-hover:rotate-180 duration-500" />
                          모두 원래대로 결합
                        </Button>
                      </div>
                    </div>
                  )
                }

                if (panels.length === 1) {
                  return (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
                      {panels[0]!.el}
                    </div>
                  )
                }

                const defaultSize = Math.floor(100 / panels.length)
                return (
                  <ResizablePanelGroup
                    key={panels.map(p => p.id).join(",")}
                    orientation={jobsLayoutOrientation}
                    className="min-h-0 flex-1 overflow-hidden"
                  >
                    {panels.flatMap((panel, i) => {
                      const items = []
                      if (i > 0) items.push(<ResizableHandle key={`h-${panel.id}`} />)
                      items.push(
                        <ResizablePanel
                          key={panel.id}
                          defaultSize={defaultSize}
                          minSize={panel.minSize ?? 15}
                          className={cn(
                            "flex min-h-0 flex-col overflow-hidden bg-panel",
                            i < panels.length - 1 && (jobsLayoutOrientation === "horizontal" ? "border-r border-line" : "border-b border-line")
                          )}
                        >
                          {panel.el}
                        </ResizablePanel>
                      )
                      return items
                    })}
                  </ResizablePanelGroup>
                )
              })()}
            </div>

            <div className="flex flex-1 flex-col overflow-hidden md:hidden">
              {mobileJobTab === "editor" && (
                <div className="flex flex-1 flex-col overflow-hidden bg-panel">
                  <WorkCompositionPanel
                    repeatCount={repeatCount}
                    setRepeatCount={setRepeatCount}
                    handleRun={handleRun}
                    handleRandomRun={handleRandomRun}
                    randomRunCount={randomRunCount}
                    setRandomRunCount={setRandomRunCount}
                    estimatedRunCount={estimatedRunCount}
                    canRun={canRun}
                    previewCount={fakeJobQueue.length}
                    compositionTab={props.compositionTab}
                    setCompositionTab={props.setCompositionTab}
                    onPreviewOpen={() => props.setIsSheetOpen(true)}
                    onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
                    onSelectionOpen={() => props.setIsSelectionOpen(true)}
                    hasActiveFilter={hasActiveFilter}
                    onGraphOpen={() => props.setIsGraphOpen(true)}
                  />
                </div>
              )}
              {(mobileJobTab === "status" || mobileJobTab === "list") && (
                <div className="flex min-h-0 flex-1 flex-col bg-panel">
                  <JobManagerPanel
                    jobs={props.jobs}
                    paused={props.paused}
                    backendUrl={props.backendUrl}
                    isAliveBackend={props.isAliveBackend}
                    mobileTab={mobileJobTab}
                    selectedId={selectedSessionId}
                    setSelectedId={setSelectedSessionId}
                    markers={markers}
                    setMarkersRaw={setMarkersRaw}
                    activeState={activeState}
                    setActiveStateRaw={setActiveStateRaw}
                    sessionPickerOpen={sessionPickerOpen}
                    setSessionPickerOpen={setSessionPickerOpen}
                    createNewSession={createNewSession}
                    sessionJobCounts={sessionJobCounts}
                    sortedMarkers={sortedMarkers}
                    counts={sessionCounts}
                    sessionJobs={sessionJobs}
                    handleTogglePause={handleTogglePause}
                    handleCancelAll={handleCancelAll}
                    handleRetryAllFailed={handleRetryAllFailed}
                    handleDeleteAllFailed={handleDeleteAllFailed}
                  />
                </div>
              )}

              {/* Premium Segmented Bottom bar for Mobile Tab Switcher */}
              <div className="shrink-0 border-t border-line/60 bg-panel/85 px-3 py-2 backdrop-blur-md">
                <div className="flex rounded-xl bg-muted/60 p-0.5">
                  {[
                    { id: "editor" as const, label: "에디터" },
                    { id: "status" as const, label: "현황" },
                    {
                      id: "list" as const,
                      label: `기록 (${props.jobs.length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setMobileJobTab(tab.id)}
                      className={cn(
                        "flex-1 cursor-pointer rounded-lg py-1.5 text-center text-xs font-black transition-all duration-200",
                        mobileJobTab === tab.id
                          ? "scale-100 bg-background text-foreground shadow-xs"
                          : "scale-98 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <ParserPreviewDialog
        open={props.isSheetOpen}
        onOpenChange={props.setIsSheetOpen}
        fakeJobQueue={fakeJobQueue}
        previewFilter={props.previewFilter}
        onPreviewFilterChange={props.setPreviewFilter}
        filteredPreview={filteredPreview}
        filteredByAxisSet={filteredByAxisSet}
      />

      <AxisFilterSheet
        open={props.isAxisFilterOpen}
        onOpenChange={props.setIsAxisFilterOpen}
        axisValueFilter={axisValueFilter}
        setAxisValueFilter={setAxisValueFilter}
        collapsedAxes={collapsedAxes}
        toggleAxisCollapse={toggleAxisCollapse}
        estimatedRunCount={estimatedRunCount}
        fakeJobQueue={fakeJobQueue}
        axisFilteredItems={axisFilteredItems}
        axisExcludedItems={axisExcludedItems}
        uncheckedItems={uncheckedItems}
        toggleItemCheck={toggleItemCheck}
      />

      <SelectionSheet
        open={props.isSelectionOpen}
        onOpenChange={props.setIsSelectionOpen}
        fakeJobQueue={fakeJobQueue}
        filteredPreview={filteredPreview}
        previewFilter={props.previewFilter}
        onPreviewFilterChange={props.setPreviewFilter}
        uncheckedItems={uncheckedItems}
        selectedCount={selectedCount}
        canRun={canRun}
        checkAllItems={checkAllItems}
        uncheckAllItems={uncheckAllItems}
        toggleItemCheck={toggleItemCheck}
        onRunSelected={async () => {
          const ok = await handleRunSelected()
          if (ok) props.setIsSelectionOpen(false)
        }}
      />

      {workflow.parsedWorkflow?.success && (
        <WorkflowGraphViewer
          workflow={workflow.parsedWorkflow.data}
          isOpen={props.isGraphOpen}
          onClose={() => props.setIsGraphOpen(false)}
          backendUrl={props.backendUrl}
        />
      )}

      <NameConflictDialog
        pendingSave={props.pendingSave}
        onClose={() => props.setPendingSave(null)}
        newName={nextFreeName(props.pendingSave?.name ?? "", pendingSaveItems)}
        onSaveNew={handleNameConflictSaveNew}
        onOverwrite={handleNameConflictOverwrite}
      />

      {props.activeTab !== "jobs" && (
        <JobStatusPopup
          jobs={props.jobs}
          paused={props.paused}
          backendUrl={props.backendUrl}
          isAliveBackend={props.isAliveBackend}
          onNavigateToJobs={() => props.setActiveTab("jobs")}
        />
      )}

      <PresetSelectionDialog
        pendingWorkflow={props.pendingPresetSelection}
        onClose={() => props.setPendingPresetSelection(null)}
        onSelectPreset={(mappings: NodeMapping[], presetId: string) => {
          nodeMapping.setNodeMappings(mappings)
          nodeMapping.setActiveNodeMappingPresetId(presetId)
          props.setPendingPresetSelection(null)
        }}
        onStartWithoutMapping={() => {
          nodeMapping.setNodeMappings([])
          nodeMapping.setActiveNodeMappingPresetId(null)
          props.setPendingPresetSelection(null)
        }}
      />

      <VersionDiffDialog
        open={props.pendingDiff !== null}
        onClose={() => props.setPendingDiff(null)}
        onConfirm={() => {
          if (!props.pendingDiff) return
          if (props.pendingDiff.type === "template") {
            template.saveTemplate(
              props.pendingDiff.name,
              props.pendingDiff.newContent
            )
            template.setTemplateResetKey((k) => k + 1)
          } else {
            const w = workflow.saveWorkflow(
              props.pendingDiff.name,
              props.pendingDiff.newContent
            )
            workflow.setActiveWorkflowId(w.id)
            workflow.setWorkflowResetKey((k) => k + 1)
          }
          toast.success(
            `'${props.pendingDiff.name}' 업데이트가 완료되었습니다.`
          )
        }}
        oldContent={props.pendingDiff?.oldContent ?? ""}
        newContent={props.pendingDiff?.newContent ?? ""}
        itemName={props.pendingDiff?.name ?? ""}
      />

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      {props.isCompositionFloating && (
        <FloatingWindow
          id="floating-window-composition"
          isOpen={props.isCompositionFloating}
          onClose={() => props.setIsCompositionFloating(false)}
          onDock={() => props.setIsCompositionFloating(false)}
          initialPos={props.compositionFloatingPos}
          initialSize={props.compositionFloatingSize}
          onPosChange={props.setCompositionFloatingPos}
          onSizeChange={props.setCompositionFloatingSize}
          title="작업 구성 패널"
          onDragProgress={(cx, cy, sw, sh, isEnding) => handleDragProgress(cx, cy, sw, sh, isEnding, "composition")}
        >
          <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
            <WorkCompositionPanel
              repeatCount={repeatCount}
              setRepeatCount={setRepeatCount}
              handleRun={handleRun}
              handleRandomRun={handleRandomRun}
              randomRunCount={randomRunCount}
              setRandomRunCount={setRandomRunCount}
              estimatedRunCount={estimatedRunCount}
              canRun={canRun}
              previewCount={fakeJobQueue.length}
              compositionTab={props.compositionTab}
              setCompositionTab={props.setCompositionTab}
              onPreviewOpen={() => props.setIsSheetOpen(true)}
              onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
              onSelectionOpen={() => props.setIsSelectionOpen(true)}
              hasActiveFilter={hasActiveFilter}
              onGraphOpen={() => props.setIsGraphOpen(true)}
              isFloating={true}
              onFloatToggle={() => props.setIsCompositionFloating(false)}
            />
          </div>
        </FloatingWindow>
      )}

      {props.isJobManagerFloating && (
        <FloatingWindow
          id="floating-window-jobManager"
          isOpen={props.isJobManagerFloating}
          onClose={() => props.setIsJobManagerFloating(false)}
          onDock={() => props.setIsJobManagerFloating(false)}
          initialPos={props.jobManagerFloatingPos}
          initialSize={props.jobManagerFloatingSize}
          onPosChange={props.setJobManagerFloatingPos}
          onSizeChange={props.setJobManagerFloatingSize}
          title="작업 큐 매니저"
          onDragProgress={(cx, cy, sw, sh, isEnding) => handleDragProgress(cx, cy, sw, sh, isEnding, "jobManager")}
        >
          <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <JobManagerPanel
                jobs={props.jobs}
                paused={props.paused}
                backendUrl={props.backendUrl}
                isAliveBackend={props.isAliveBackend}
                selectedId={selectedSessionId}
                setSelectedId={setSelectedSessionId}
                markers={markers}
                setMarkersRaw={setMarkersRaw}
                activeState={activeState}
                setActiveStateRaw={setActiveStateRaw}
                sessionPickerOpen={sessionPickerOpen}
                setSessionPickerOpen={setSessionPickerOpen}
                createNewSession={createNewSession}
                sessionJobCounts={sessionJobCounts}
                sortedMarkers={sortedMarkers}
                counts={sessionCounts}
                sessionJobs={sessionJobs}
                handleTogglePause={handleTogglePause}
                handleCancelAll={handleCancelAll}
                handleRetryAllFailed={handleRetryAllFailed}
                handleDeleteAllFailed={handleDeleteAllFailed}
                isFloating={true}
                onFloatToggle={() => props.setIsJobManagerFloating(false)}
              />
            </div>
          </div>
        </FloatingWindow>
      )}

      {props.activeTab !== "gallery" && !props.isGalleryDocked && props.isGalleryFloating && (
        <FloatingWindow
          id="floating-window-gallery"
          isOpen={props.isGalleryFloating}
          onClose={() => props.setIsGalleryFloating(false)}
          onDock={() => {
            props.setIsGalleryFloating(false)
            props.setActiveTab("gallery")
          }}
          initialPos={props.galleryFloatingPos}
          initialSize={props.galleryFloatingSize}
          onPosChange={props.setGalleryFloatingPos}
          onSizeChange={props.setGalleryFloatingSize}
          title="갤러리 플로팅 창"
          onDragProgress={(cx, cy, sw, sh, isEnding) => handleDragProgress(cx, cy, sw, sh, isEnding, "gallery")}
          toolbar={
            <div className="flex flex-wrap items-center gap-1.5 w-full">
              {/* 상태 필터 Select */}
              <Select
                value={galleryStatusFilter}
                onValueChange={(v: string) => {
                  setGalleryStatusFilter(v as "pending" | "approved" | "rejected" | "trashed" | "all")
                }}
              >
                <SelectTrigger className="!h-7 w-[82px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["all", "pending", "approved", "rejected", "trashed"] as const).map((s) => (
                    <SelectItem key={s} value={s} className="text-[12px] font-bold">
                      {s === "all" ? "전체" : s === "pending" ? "대기" : s === "approved" ? "통과" : s === "rejected" ? "탈락" : "휴지통"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 뷰 모드 Select */}
              <Select
                value={galleryGroupMode ? "group" : galleryViewMode}
                onValueChange={(v: string) => {
                  if (v === "group") {
                    setGalleryGroupMode(true)
                  } else {
                    setGalleryGroupMode(false)
                    setGalleryViewMode(v as "grid" | "compare")
                  }
                }}
              >
                <SelectTrigger className="!h-7 w-[78px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group" className="text-[12px] font-bold">그룹</SelectItem>
                  <SelectItem value="grid" className="text-[12px] font-bold">그리드</SelectItem>
                  <SelectItem value="compare" className="text-[12px] font-bold">비교</SelectItem>
                </SelectContent>
              </Select>

              {/* 정렬 기준 Select */}
              <Select
                value={gallerySortKey}
                onValueChange={(k: string) => {
                  if (gallerySortKey === k) {
                    setGallerySortDir(gallerySortDir === "asc" ? "desc" : "asc")
                  } else {
                    setGallerySortKey(k as "createdAt" | "filename" | "sizeBytes")
                    setGallerySortDir("desc")
                  }
                }}
              >
                <SelectTrigger className="!h-7 w-[74px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt" className="text-[12px] font-bold">날짜순</SelectItem>
                  <SelectItem value="filename" className="text-[12px] font-bold">파일명순</SelectItem>
                  <SelectItem value="sizeBytes" className="text-[12px] font-bold">크기순</SelectItem>
                </SelectContent>
              </Select>

              {/* 정렬 방향 토글 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setGallerySortDir(gallerySortDir === "asc" ? "desc" : "asc")}
                    className="!h-7 !w-7 shrink-0 border-line bg-background p-0 shadow-none hover:bg-muted"
                  >
                    {gallerySortDir === "asc" ? (
                      <ArrowDown className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUp className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">정렬 방향 토글</TooltipContent>
              </Tooltip>

              {/* 썸네일 크기 조절 슬라이더 */}
              {(galleryGroupMode || galleryViewMode === "grid") && (
                <div className="flex items-center gap-1.5 rounded-md border border-line bg-background/50 px-1.5 h-7 shadow-none">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center text-muted-foreground">
                        <LayoutGrid className="h-3 w-3" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-bold">이미지 크기 조절</TooltipContent>
                  </Tooltip>
                  <input
                    type="range"
                    min="100"
                    max="300"
                    step="10"
                    value={galleryThumbnailSize}
                    onChange={(e) => setGalleryThumbnailSize(Number(e.target.value))}
                    className="h-1 w-12 cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                  />
                  <span className="text-[9px] font-mono font-bold text-muted-foreground w-[28px] text-right tabular-nums">
                    {galleryThumbnailSize}px
                  </span>
                </div>
              )}

              <div className="h-4 w-px shrink-0 bg-line/60" />

              {/* 새로고침 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="!h-7 !w-7 p-0"
                    onClick={handleGalleryRefresh}
                  >
                    <RefreshCwIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">새로고침</TooltipContent>
              </Tooltip>

              {/* 내보내기 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="!h-7 !w-7 p-0"
                    onClick={handleGalleryExport}
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">내보내기</TooltipContent>
              </Tooltip>

              {/* 휴지통 비우기 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="!h-7 !w-7 p-0 hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                    onClick={handleGalleryEmptyTrash}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold bg-destructive text-destructive-foreground">휴지통 비우기</TooltipContent>
              </Tooltip>

              {/* 검색 필터 토글 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={galleryShowFilters ? "secondary" : "outline"}
                    className="relative !h-7 !w-7 p-0"
                    onClick={() => setGalleryShowFilters(!galleryShowFilters)}
                  >
                    <FilterIcon className="h-3.5 w-3.5" />
                    {galleryHasAnyFilter && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">검색 토글</TooltipContent>
              </Tooltip>

              {/* 검색창 조건부 렌더링 */}
              {galleryShowFilters && (
                <div className="w-full mt-1.5 pt-1.5 border-t border-line/40 flex items-center gap-2">
                  <div className="flex-1">
                    <TagInputSearch
                      value={gallerySearchInput}
                      tags={gallerySearchTags}
                      candidates={galleryCandidates.filter((c) => {
                        const valClean = gallerySearchInput.replace(/^[@#$]/, "").toLowerCase()
                        return c.value.toLowerCase().includes(valClean)
                      })}
                      placeholder="검색어 입력 (@파일명, #태그, $메타데이터)"
                      onValueChange={(val: string) => setGallerySearchInput(val)}
                      onAddTag={(tag: string) => {
                        if (!gallerySearchTags.includes(tag)) {
                          setGallerySearchTags([...gallerySearchTags, tag])
                        }
                        setGallerySearchInput("")
                      }}
                      onRemoveTag={(tag: string) => {
                        setGallerySearchTags(gallerySearchTags.filter((t) => t !== tag))
                      }}
                      size="sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-[10px] font-bold text-muted-foreground shrink-0"
                    onClick={() => {
                      setGallerySearchTags([])
                      setGallerySearchInput("")
                      setGalleryHideRejected(false)
                    }}
                  >
                    초기화
                  </Button>
                </div>
              )}
            </div>
          }
        >
          <SavedImagesGallery
            backendUrl={props.backendUrl}
            enableHover={props.settings.enableHover}
            imagePageSize={props.settings.imagePageSize}
            imageLazyLoad={props.settings.imageLazyLoad}
            singleDownloadMode={props.settings.singleDownloadMode}
            filenameFilter={galleryFilenameFilter}
            tagFilter={galleryTagFilter}
            metadataFilter={galleryMetadataFilter}
            generalFilters={galleryGeneralFilters}
            onTokensExtracted={setGalleryCandidates}
            onReloadReady={(reload) => {
              galleryReloadRef.current = reload
            }}
            toolbarState={{
              statusFilter: galleryStatusFilter,
              setStatusFilter: setGalleryStatusFilter,
              galleryViewMode: galleryViewMode,
              setGalleryViewMode: setGalleryViewMode,
              groupMode: galleryGroupMode,
              setGroupMode: setGalleryGroupMode,
              showFilters: galleryShowFilters,
              setShowFilters: setGalleryShowFilters,
              hasAnyFilter: galleryHasAnyFilter,
              hideRejected: galleryHideRejected,
              setHideRejected: setGalleryHideRejected,
              sortKey: gallerySortKey,
              setSortKey: setGallerySortKey,
              sortDir: gallerySortDir,
              setSortDir: setGallerySortDir,
              thumbnailSize: galleryThumbnailSize,
              setThumbnailSize: setGalleryThumbnailSize,
              clearAllFilters: () => {
                setGallerySearchTags([])
                setGallerySearchInput("")
                setGalleryHideRejected(false)
              },
              reload: handleGalleryRefresh,
              handleExport: handleGalleryExport,
              handleEmptyTrash: handleGalleryEmptyTrash,
            }}
          />
        </FloatingWindow>
      )}

      {props.activeTab !== "stats" && props.isStatsFloating && (
        <FloatingWindow
          id="floating-window-stats"
          isOpen={props.isStatsFloating}
          onClose={() => props.setIsStatsFloating(false)}
          onDock={() => {
            props.setIsStatsFloating(false)
            props.setActiveTab("stats")
          }}
          initialPos={props.statsFloatingPos}
          initialSize={props.statsFloatingSize}
          onPosChange={props.setStatsFloatingPos}
          onSizeChange={props.setStatsFloatingSize}
          title="통계"
          onDragProgress={(cx, cy, sw, sh, isEnding) =>
            handleDragProgress(cx, cy, sw, sh, isEnding, "stats")
          }
        >
          <div className="flex h-full w-full flex-col overflow-y-auto bg-panel p-4 md:p-6">
            <StatisticsPanel jobs={props.jobs} workers={props.workers} />
          </div>
        </FloatingWindow>
      )}

      {props.activeTab !== "curation" && props.isCurationFloating && (
        <FloatingWindow
          id="floating-window-curation"
          isOpen={props.isCurationFloating}
          onClose={() => props.setIsCurationFloating(false)}
          onDock={() => {
            props.setIsCurationFloating(false)
            props.setActiveTab("curation")
          }}
          initialPos={props.curationFloatingPos}
          initialSize={props.curationFloatingSize}
          onPosChange={props.setCurationFloatingPos}
          onSizeChange={props.setCurationFloatingSize}
          title="큐레이션"
          onDragProgress={(cx, cy, sw, sh, isEnding) =>
            handleDragProgress(cx, cy, sw, sh, isEnding, "curation")
          }
        >
          <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
            <CombinationPicker
              backendUrl={props.backendUrl}
              cegTemplate={template.cegTemplate}
              savedTemplates={template.savedTemplates}
              enableHover={props.settings.enableHover}
              autoApplyReject={props.settings.autoApplyReject}
              savedWorkflows={workflow.savedWorkflows}
              toolbarState={{
                selectedAxis: curationSelectedAxis,
                setSelectedAxis: setCurationSelectedAxis,
                viewMode: "gallery" as const,
                setViewMode: () => {},
                hideTopSection: true,
                exportIsLoading: false,
                setExportIsLoading: () => {},
                exportMessage: null,
                setExportMessage: () => {},
                regenMessage: null,
                setRegenMessage: () => {},
                onExport: () => {},
                onRegenerate: () => {},
              }}
            />
          </div>
        </FloatingWindow>
      )}

      {snapDockZone && (
        <div
          className={cn(
            "fixed pointer-events-none z-50 flex items-center justify-center border border-primary/30 bg-primary/10 backdrop-blur-xs transition-all duration-300 animate-pulse",
            snapDockZone.zone === "left" && "left-0 top-0 bottom-0 w-1/2 rounded-r-2xl border-l-0",
            snapDockZone.zone === "right" && "right-0 top-0 bottom-0 w-1/2 rounded-l-2xl border-r-0",
            snapDockZone.zone === "top" && "left-0 right-0 top-0 h-1/2 rounded-b-2xl border-t-0",
            snapDockZone.zone === "bottom" && "left-0 right-0 bottom-0 h-1/2 rounded-t-2xl border-b-0"
          )}
        >
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-panel/60 border border-line shadow-2xl backdrop-blur-xl scale-110 animate-in zoom-in-95 duration-200">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/30 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]">
              {snapDockZone.zone === "left" && <ArrowLeft className="h-6 w-6" />}
              {snapDockZone.zone === "right" && <ArrowRight className="h-6 w-6" />}
              {snapDockZone.zone === "top" && <ArrowUp className="h-6 w-6" />}
              {snapDockZone.zone === "bottom" && <ArrowDown className="h-6 w-6" />}
            </div>
            <span className="mt-3 text-xs font-black text-foreground tracking-wider uppercase">
              {snapDockZone.zone === "left" || snapDockZone.zone === "right"
                ? "가로 결합 스냅"
                : "세로 결합 스냅"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
