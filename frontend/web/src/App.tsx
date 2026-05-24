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
import { useGlobalShortcuts } from "./comfyui/hooks/useGlobalShortcuts"
import { CombinationPicker } from "./comfyui/components/combinationpicker/CombinationPicker"
import { DEFAULT_AXIS } from "./comfyui/components/combinationpicker/freeCurationGroupers"
import { CurationToolbarProvider } from "./comfyui/components/combinationpicker/CurationToolbarTypes"
import { WorkflowGraphViewer } from "./comfyui/components/WorkflowGraphViewer"
import { JobManagerPanel } from "./comfyui/components/JobManagerPanel"
import { JobStatusPopup } from "./comfyui/components/JobStatusPopup"
import { SettingsPanel } from "./comfyui/components/SettingsPanel"
import { StatisticsPanel } from "./comfyui/components/StatisticsPanel"
import { TemplateGeneratorPanel } from "./comfyui/components/TemplateGeneratorPanel"
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
import {
  PendingDialogProvider,
  usePendingDialog,
} from "./comfyui/contexts/PendingDialogContext"
import {
  PanelLayoutProvider,
  usePanelLayout,
} from "./comfyui/contexts/PanelLayoutContext"
import {
  GalleryToolbarProvider,
  useGalleryToolbar,
} from "./comfyui/contexts/GalleryToolbarContext"
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
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

  const [storedBackendUrl] = useLocalStorage(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  const backendUrl = IS_PACKAGE_MODE
    ? (PACKAGE_BACKEND_URL as string)
    : storedBackendUrl

  return (
    <PendingDialogProvider>
      <PanelLayoutProvider>
        <GalleryToolbarProvider backendUrl={backendUrl}>
          <TemplateProvider>
            <WorkflowProvider>
              <NodeMappingProvider backendUrl={backendUrl}>
                <AppContent />
              </NodeMappingProvider>
            </WorkflowProvider>
          </TemplateProvider>
        </GalleryToolbarProvider>
      </PanelLayoutProvider>
    </PendingDialogProvider>
  )
}

// ---------------------------------------------------------------------------
// AppContent — inside all 3 contexts
// ---------------------------------------------------------------------------
function AppContent() {
  useRenderLog("AppContent")

  const panel = usePanelLayout()
  const tb = useGalleryToolbar()
  const {
    pendingSave,
    setPendingSave,
    pendingDiff,
    setPendingDiff,
    pendingPresetSelection,
    setPendingPresetSelection,
  } = usePendingDialog()

  const { isConnected: backendAlive, jobs, workers, paused } = useBackend()
  const { settings, updateSetting } = useSettings()

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

  // UI state
  const [activeTab, setActiveTab] = useState<TabId>("jobs")
  const [compositionTab, setCompositionTab] = useState<"ceg" | "workflow">(
    "ceg"
  )

  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isAxisFilterOpen, setIsAxisFilterOpen] = useState(false)
  const [isSelectionOpen, setIsSelectionOpen] = useState(false)
  const [isAliveBackend, setIsAliveBackend] = useState(false)
  const [previewFilter, setPreviewFilter] = useState("")

  // Destructure panel setters for stable refs in callbacks
  const {
    composition: {
      isFloating: isCompositionFloating,
      setIsFloating: setIsCompositionFloating,
      pos: compositionFloatingPos,
      setPos: setCompositionFloatingPos,
      size: compositionFloatingSize,
      setSize: setCompositionFloatingSize,
    },
    jobManager: {
      isFloating: isJobManagerFloating,
      setIsFloating: setIsJobManagerFloating,
      pos: jobManagerFloatingPos,
      setPos: setJobManagerFloatingPos,
      size: jobManagerFloatingSize,
      setSize: setJobManagerFloatingSize,
    },
    gallery: {
      isFloating: isGalleryFloating,
      setIsFloating: setIsGalleryFloating,
      pos: galleryFloatingPos,
      setPos: setGalleryFloatingPos,
      size: galleryFloatingSize,
      setSize: setGalleryFloatingSize,
      isDocked: isGalleryDocked,
      setIsDocked: setIsGalleryDocked,
      dockedSide: galleryDockedSide,
      setDockedSide: setGalleryDockedSide,
    },
    stats: {
      isFloating: isStatsFloating,
      setIsFloating: setIsStatsFloating,
      pos: statsFloatingPos,
      setPos: setStatsFloatingPos,
      size: statsFloatingSize,
      setSize: setStatsFloatingSize,
      isDocked: isStatsDocked,
      setIsDocked: setIsStatsDocked,
      dockedSide: statsDockedSide,
      setDockedSide: setStatsDockedSide,
    },
    curation: {
      isFloating: isCurationFloating,
      setIsFloating: setIsCurationFloating,
      pos: curationFloatingPos,
      setPos: setCurationFloatingPos,
      size: curationFloatingSize,
      setSize: setCurationFloatingSize,
      isDocked: isCurationDocked,
      setIsDocked: setIsCurationDocked,
      dockedSide: curationDockedSide,
      setDockedSide: setCurationDockedSide,
    },
  } = panel

  const dragSessionRef = useRef<{
    windowType: "composition" | "jobManager" | "stats" | "curation" | "gallery"
    startX: number
    startY: number
    isPopoutTriggered: boolean
    size: { w: number; h: number }
  } | null>(null)

  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const [jobsLayoutOrientation, setJobsLayoutOrientation] = useLocalStorage<
    "horizontal" | "vertical"
  >("ceg_jobsLayoutOrientation", "horizontal")

  const [jobsPanelOrder, setJobsPanelOrder] = useLocalStorage<
    "composition-first" | "manager-first"
  >("ceg_jobsPanelOrder", "composition-first")

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
      windowType:
        | "composition"
        | "jobManager"
        | "gallery"
        | "stats"
        | "curation"
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
            setGalleryDockedSide(
              activeZone === "left" || activeZone === "top" ? "start" : "end"
            )
            setJobsLayoutOrientation(
              activeZone === "left" || activeZone === "right"
                ? "horizontal"
                : "vertical"
            )
            setActiveTab("jobs")
            toast.success("갤러리가 메인 패널에 결합되었습니다.")
          } else if (windowType === "stats") {
            setIsStatsFloating(false)
            setIsStatsDocked(true)
            setStatsDockedSide(
              activeZone === "left" || activeZone === "top" ? "start" : "end"
            )
            setJobsLayoutOrientation(
              activeZone === "left" || activeZone === "right"
                ? "horizontal"
                : "vertical"
            )
            setActiveTab("jobs")
            toast.success("통계 패널이 메인 패널에 결합되었습니다.")
          } else if (windowType === "curation") {
            setIsCurationFloating(false)
            setIsCurationDocked(true)
            setCurationDockedSide(
              activeZone === "left" || activeZone === "top" ? "start" : "end"
            )
            setJobsLayoutOrientation(
              activeZone === "left" || activeZone === "right"
                ? "horizontal"
                : "vertical"
            )
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
      setStatsDockedSide,
      setGalleryDockedSide,
      setCurationDockedSide,
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
          ? compositionFloatingSize
          : jobManagerFloatingSize

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

          if (distance > 8) {
            session.isPopoutTriggered = true

            const w = session.size.w
            const initX = moveEvent.clientX - w / 2
            const initY = moveEvent.clientY - 20

            if (session.windowType === "composition") {
              setCompositionFloatingPos({ x: initX, y: initY })
              setIsCompositionFloating(true)
            } else {
              setJobManagerFloatingPos({ x: initX, y: initY })
              setIsJobManagerFloating(true)
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
          const domId =
            session.windowType === "composition"
              ? "floating-window-composition"
              : "floating-window-jobManager"
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
          handleDragProgress(
            upEvent.clientX,
            upEvent.clientY,
            window.innerWidth,
            window.innerHeight,
            true,
            session.windowType
          )

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
                setCompositionFloatingPos(finalPos)
              } else {
                setJobManagerFloatingPos(finalPos)
              }
            }
          }, 50)
        }

        dragSessionRef.current = null
      }

      document.addEventListener("mousemove", handleGlobalMouseMove)
      document.addEventListener("mouseup", handleGlobalMouseUp)
    },
    [
      compositionFloatingSize,
      jobManagerFloatingSize,
      setCompositionFloatingPos,
      setIsCompositionFloating,
      setJobManagerFloatingPos,
      setIsJobManagerFloating,
      handleDragProgress,
    ]
  )

  const handleNavTabDragStart = useCallback(
    (
      tabId: "stats" | "curation" | "gallery",
      clientX: number,
      clientY: number
    ) => {
      const size =
        tabId === "stats"
          ? statsFloatingSize
          : tabId === "gallery"
            ? galleryFloatingSize
            : curationFloatingSize

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
              setStatsFloatingPos({ x: initX, y: initY })
              setIsStatsFloating(true)
              if (activeTab === "stats") setActiveTab("jobs")
            } else if (session.windowType === "gallery") {
              setGalleryFloatingPos({ x: initX, y: initY })
              setIsGalleryFloating(true)
              if (activeTab === "gallery") setActiveTab("jobs")
            } else {
              setCurationFloatingPos({ x: initX, y: initY })
              setIsCurationFloating(true)
              if (activeTab === "curation") setActiveTab("jobs")
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
                setStatsFloatingPos(finalPos)
              } else if (session.windowType === "gallery") {
                setGalleryFloatingPos(finalPos)
              } else {
                setCurationFloatingPos(finalPos)
              }
            }
          }, 50)
        }

        dragSessionRef.current = null
      }

      document.addEventListener("mousemove", handleGlobalMouseMove)
      document.addEventListener("mouseup", handleGlobalMouseUp)
    },
    [
      activeTab,
      statsFloatingSize,
      galleryFloatingSize,
      curationFloatingSize,
      setStatsFloatingPos,
      setIsStatsFloating,
      setGalleryFloatingPos,
      setIsGalleryFloating,
      setCurationFloatingPos,
      setIsCurationFloating,
      setActiveTab,
      handleDragProgress,
    ]
  )

  // ── Contexts ──
  const template = useTemplateContext()
  const workflow = useWorkflowContext()
  const nodeMapping = useNodeMappingContext()

  const confirm = useConfirm()

  // ── session state (lifted) ──────────────────────────────────────────
  const initialMarkers = useMemo(() => initMarkers(), [])
  const [markers, setMarkersRaw] = useState<SessionMarkerRaw[]>(
    () => initialMarkers
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
    for (const j of jobs) {
      const sid = jobSessionId(j.createdAt, sortedMarkers, activeState)
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [jobs, sortedMarkers, activeState])

  const sessionJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          jobSessionId(j.createdAt, sortedMarkers, activeState) ===
          selectedSessionId
      ),
    [jobs, sortedMarkers, activeState, selectedSessionId]
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
        fetch(`${backendUrl}${API.webhooks.batchComplete}`, {
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
    backendUrl,
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
      await fetch(`${backendUrl}${paused ? API.jobs.resume : API.jobs.pause}`, {
        method: "POST",
      })
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
      await fetch(`${backendUrl}${API.jobs.cancelAll}`, {
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
        await fetch(`${backendUrl}${API.jobs.retry(j.id)}`, {
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
      await fetch(`${backendUrl}${API.jobs.delete}`, {
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

  // ── Gallery toolbar state is now in GalleryToolbarContext ──
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
    backendUrl,
    isAliveBackend,
  })

  const filteredPreview = useMemo(() => {
    const needle = previewFilter.trim().toLowerCase()
    if (!needle) return fakeJobQueue
    return fakeJobQueue.filter(
      (it) =>
        it.filename.toLowerCase().includes(needle) ||
        it.prompt.toLowerCase().includes(needle)
    )
  }, [fakeJobQueue, previewFilter])

  useWatchValues("AppContent", {
    backendAlive,
    jobs,
    workers,
    paused,
    activeTab,
    fakeJobQueue,
    isSheetOpen,
    isGraphOpen,
    isAxisFilterOpen,
    isSelectionOpen,
    isAliveBackend,
    previewFilter,
    parserError,
    axisValueFilter,
    pendingSave,
    cegTemplate: template.cegTemplate,
    workflowJson: workflow.workflowJson,
    nodeMappings: nodeMapping.nodeMappings,
  })

  // ── Backend health check ──
  useEffect(() => {
    let cancelled = false
    const checkHealth = async () => {
      try {
        const response = await fetch(`${backendUrl}${API.health}`)
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
      if (!cancelled) setIsAliveBackend(ok)
    }
    tick()
    const timer = setInterval(tick, HEALTH_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [backendUrl])

  // ── Object info fetch ──
  useEffect(() => {
    if (!isAliveBackend) return
    fetch(`${backendUrl}${API.objectInfo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) nodeMapping.setObjectInfo(data)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, isAliveBackend])

  // ── Quick save handler (Ctrl+S shortcut) ──
  const handleQuickSave = useCallback(() => {
    if (compositionTab === "ceg") {
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
  }, [compositionTab, template, workflow])

  const canRun =
    Boolean(workflow.workflowJson) && isAliveBackend && backendAlive

  // ── Global keyboard shortcuts ──
  useGlobalShortcuts({
    activeTab,
    mobileJobTab,
    canRun,
    handleRun,
    handleSave: handleQuickSave,
    handleGalleryRefresh: tb.handleRefresh,
    setActiveTab,
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
    pendingSave?.type === "template"
      ? template.savedTemplates
      : pendingSave?.type === "workflow"
        ? workflow.savedWorkflows
        : nodeMapping.savedNodeMappings

  const handleNameConflictSaveNew = () => {
    if (!pendingSave) return
    const newName = nextFreeName(pendingSave.name, pendingSaveItems)
    if (pendingSave.type === "template") {
      template.saveTemplate(newName, template.cegTemplate)
      template.setTemplateResetKey((k) => k + 1)
    } else if (pendingSave.type === "workflow") {
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
    setPendingSave(null)
  }

  const handleNameConflictOverwrite = () => {
    if (!pendingSave) return
    if (pendingSave.type === "template") {
      template.saveTemplate(pendingSave.name, template.cegTemplate)
      template.setTemplateResetKey((k) => k + 1)
    } else if (pendingSave.type === "workflow") {
      const w = workflow.saveWorkflow(pendingSave.name, workflow.workflowJson)
      workflow.setActiveWorkflowId(w.id)
      workflow.setWorkflowResetKey((k) => k + 1)
    } else {
      if (workflow.activeWorkflowId) {
        nodeMapping.saveMappingPreset(
          workflow.activeWorkflowId,
          pendingSave.name,
          nodeMapping.nodeMappings
        )
        nodeMapping.setNodeMappingResetKey((k) => k + 1)
      }
    }
    setPendingSave(null)
  }

  return (
    <div
      className={`flex flex-col bg-background ${
        activeTab === "jobs" || activeTab === "generator" ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
      }`}
    >
      <CurationToolbarProvider
        selectedAxis={curationSelectedAxis}
        setSelectedAxis={setCurationSelectedAxis}
        savedTemplates={template.savedTemplates}
      >
      <Header
        useWindowMode={settings.useWindowMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAliveBackend={isAliveBackend}
        backendAlive={backendAlive}
        workers={workers}
        jobsCount={jobs.length}
        mobileJobTab={mobileJobTab}
        setMobileJobTab={setMobileJobTab}
        compositionTab={compositionTab}
        setCompositionTab={setCompositionTab}
        repeatCount={repeatCount}
        setRepeatCount={setRepeatCount}
        handleRun={handleRun}
        handleRandomRun={handleRandomRun}
        randomRunCount={randomRunCount}
        setRandomRunCount={setRandomRunCount}
        canRun={canRun}
        estimatedRunCount={estimatedRunCount}
        setIsSelectionOpen={setIsSelectionOpen}
        hasActiveFilter={hasActiveFilter}
        setIsAxisFilterOpen={setIsAxisFilterOpen}
        setIsGraphOpen={setIsGraphOpen}
        onStatsDragStart={(cx, cy) => handleNavTabDragStart("stats", cx, cy)}
        onCurationDragStart={(cx, cy) =>
          handleNavTabDragStart("curation", cx, cy)
        }
        onGalleryDragStart={(cx, cy) =>
          handleNavTabDragStart("gallery", cx, cy)
        }
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
        paused={paused}
        onTogglePause={handleTogglePause}
        onCancelAll={handleCancelAll}
        onRetryAllFailed={handleRetryAllFailed}
        onDeleteAllFailed={handleDeleteAllFailed}
        activeJobsCount={sessionCounts.active}
      />

      <main
        className={`flex w-full flex-1 flex-col ${
          activeTab === "jobs" || activeTab === "generator" ? "overflow-hidden" : ""
        }`}
      >
        {activeTab === "stats" && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
            <StatisticsPanel jobs={jobs} workers={workers} />
          </div>
        )}
        {activeTab === "gallery" && (
          <div className="flex flex-1 flex-col bg-background">
            <SavedImagesGallery
              backendUrl={backendUrl}
              enableHover={settings.enableHover}
              imagePageSize={settings.imagePageSize}
              imageLazyLoad={settings.imageLazyLoad}
              singleDownloadMode={settings.singleDownloadMode}
              filenameFilter={tb.filenameFilter}
              tagFilter={tb.tagFilter}
              metadataFilter={tb.metadataFilter}
              generalFilters={tb.generalFilters}
              onTokensExtracted={tb.setCandidates}
              onReloadReady={(reload) => {
                tb.registerReload(reload)
              }}
              toolbarState={tb}
            />
          </div>
        )}
        {activeTab === "curation" && (
          <div className="flex flex-col bg-background">
            <CombinationPicker
              backendUrl={backendUrl}
              cegTemplate={template.cegTemplate}
              savedTemplates={template.savedTemplates}
              enableHover={settings.enableHover}
              autoApplyReject={settings.autoApplyReject}
              hideEmptyCurationFolders={settings.hideEmptyCurationFolders}
              savedWorkflows={workflow.savedWorkflows}
              toolbarState={{
                selectedAxis: curationSelectedAxis,
                setSelectedAxis: setCurationSelectedAxis,
                viewMode: "gallery" as const,
                setViewMode: () => {},
                hideTopSection: true,
              }}
            />
          </div>
        )}
        {activeTab === "generator" && (
          <div className="flex flex-1 flex-col min-h-0">
            <TemplateGeneratorPanel
              setActiveTab={setActiveTab}
              backendUrl={backendUrl}
            />
          </div>
        )}
        {activeTab === "settings" && (
          <div className="flex-1 overflow-y-auto">
            <SettingsPanel
              settings={settings}
              updateSetting={updateSetting}
              backendUrl={backendUrl}
              onBackendUrlChange={setBackendUrl}
              workers={workers}
            />
          </div>
        )}
        {activeTab === "jobs" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Desktop: Resizable, Mobile: Single Panel */}
            <div className="hidden md:contents">
              {(() => {
                // ── 패널 콘텐츠 ──────────────────────────────────────────
                const compositionEl = !isCompositionFloating ? (
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
                    compositionTab={compositionTab}
                    setCompositionTab={setCompositionTab}
                    onPreviewOpen={() => setIsSheetOpen(true)}
                    onAxisFilterOpen={() => setIsAxisFilterOpen(true)}
                    onSelectionOpen={() => setIsSelectionOpen(true)}
                    hasActiveFilter={hasActiveFilter}
                    onGraphOpen={() => setIsGraphOpen(true)}
                    isFloating={false}
                    jobsLayoutOrientation={jobsLayoutOrientation}
                    onToggleJobsLayoutOrientation={() =>
                      setJobsLayoutOrientation(
                        jobsLayoutOrientation === "horizontal"
                          ? "vertical"
                          : "horizontal"
                      )
                    }
                    {...(settings.useWindowMode
                      ? {
                          onFloatToggle: () => setIsCompositionFloating(true),
                          onHeaderDragStart: (e: React.MouseEvent) =>
                            handleHeaderDragStart(e, "composition"),
                        }
                      : {})}
                  />
                ) : null

                const jobManagerEl = !isJobManagerFloating ? (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <JobManagerPanel
                      jobs={jobs}
                      paused={paused}
                      backendUrl={backendUrl}
                      isAliveBackend={isAliveBackend}
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
                      {...(settings.useWindowMode
                        ? {
                            onFloatToggle: () => setIsJobManagerFloating(true),
                            onHeaderDragStart: (e: React.MouseEvent) =>
                              handleHeaderDragStart(e, "jobManager"),
                          }
                        : {})}
                    />
                  </div>
                ) : null

                // 도킹 패널 공통 헤더 버튼
                const panelBtn = (
                  icon: React.ReactNode,
                  onClick: () => void,
                  title: string
                ) => (
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={onClick}
                    title={title}
                  >
                    {icon}
                  </button>
                )

                // ── 패널 리스트 구성 ────────────────────────────────────
                type PanelItem = {
                  id: string
                  el: React.ReactNode
                  minSize?: number
                }

                // 코어 패널 (composition / jobManager)
                const corePanels: PanelItem[] = []
                const comp = compositionEl
                  ? { id: "composition", el: compositionEl, minSize: 20 }
                  : null
                const mgr = jobManagerEl
                  ? { id: "jobManager", el: jobManagerEl }
                  : null
                if (jobsPanelOrder === "composition-first") {
                  if (comp) corePanels.push(comp)
                  if (mgr) corePanels.push(mgr)
                } else {
                  if (mgr) corePanels.push(mgr)
                  if (comp) corePanels.push(comp)
                }

                // 추가 도킹 패널 — snap 방향에 따라 start/end 분리
                const startExtra: PanelItem[] = []
                const endExtra: PanelItem[] = []
                const addExtra = (item: PanelItem, side: "start" | "end") =>
                  (side === "start" ? startExtra : endExtra).push(item)

                if (isStatsDocked)
                  addExtra(
                    {
                      id: "stats",
                      el: (
                        <div className="flex h-full w-full flex-col">
                          <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                            <span className="text-[13px] font-bold">통계</span>
                            <div className="flex items-center gap-0.5">
                              {settings.useWindowMode &&
                                panelBtn(
                                  <ExternalLink className="h-3.5 w-3.5" />,
                                  () => {
                                    setIsStatsDocked(false)
                                    setIsStatsFloating(true)
                                  },
                                  "창으로 분리"
                                )}
                              {panelBtn(
                                <XIcon className="h-3.5 w-3.5" />,
                                () => setIsStatsDocked(false),
                                "패널 닫기"
                              )}
                            </div>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                            <StatisticsPanel jobs={jobs} workers={workers} />
                          </div>
                        </div>
                      ),
                    },
                    statsDockedSide
                  )

                if (isGalleryDocked)
                  addExtra(
                    {
                      id: "gallery",
                      el: (
                        <div className="flex h-full w-full flex-col">
                          <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                            <span className="text-[13px] font-bold">
                              갤러리
                            </span>
                            <div className="flex items-center gap-0.5">
                              {settings.useWindowMode &&
                                panelBtn(
                                  <ExternalLink className="h-3.5 w-3.5" />,
                                  () => {
                                    setIsGalleryDocked(false)
                                    setIsGalleryFloating(true)
                                  },
                                  "창으로 분리"
                                )}
                              {panelBtn(
                                <XIcon className="h-3.5 w-3.5" />,
                                () => setIsGalleryDocked(false),
                                "패널 닫기"
                              )}
                            </div>
                          </div>
                          <div className="min-h-0 flex-1 overflow-hidden">
                            <SavedImagesGallery
                              backendUrl={backendUrl}
                              enableHover={settings.enableHover}
                              imagePageSize={settings.imagePageSize}
                              imageLazyLoad={settings.imageLazyLoad}
                              singleDownloadMode={settings.singleDownloadMode}
                              filenameFilter={tb.filenameFilter}
                              tagFilter={tb.tagFilter}
                              metadataFilter={tb.metadataFilter}
                              generalFilters={tb.generalFilters}
                              onTokensExtracted={tb.setCandidates}
                              onReloadReady={(reload) => {
                                tb.registerReload(reload)
                              }}
                              toolbarState={tb}
                            />
                          </div>
                        </div>
                      ),
                    },
                    galleryDockedSide
                  )

                if (isCurationDocked)
                  addExtra(
                    {
                      id: "curation",
                      el: (
                        <div className="flex h-full w-full flex-col">
                          <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
                            <span className="text-[13px] font-bold">
                              큐레이션
                            </span>
                            <div className="flex items-center gap-0.5">
                              {settings.useWindowMode &&
                                panelBtn(
                                  <ExternalLink className="h-3.5 w-3.5" />,
                                  () => {
                                    setIsCurationDocked(false)
                                    setIsCurationFloating(true)
                                  },
                                  "창으로 분리"
                                )}
                              {panelBtn(
                                <XIcon className="h-3.5 w-3.5" />,
                                () => setIsCurationDocked(false),
                                "패널 닫기"
                              )}
                            </div>
                          </div>
                          <div className="min-h-0 flex-1 overflow-hidden">
                            <CombinationPicker
                              backendUrl={backendUrl}
                              cegTemplate={template.cegTemplate}
                              savedTemplates={template.savedTemplates}
                              enableHover={settings.enableHover}
                              autoApplyReject={settings.autoApplyReject}
                              hideEmptyCurationFolders={settings.hideEmptyCurationFolders}
                              savedWorkflows={workflow.savedWorkflows}
                              toolbarState={{
                                selectedAxis: curationSelectedAxis,
                                setSelectedAxis: setCurationSelectedAxis,
                                viewMode: "gallery" as const,
                                setViewMode: () => {},
                                hideTopSection: true,
                              }}
                            />
                          </div>
                        </div>
                      ),
                    },
                    curationDockedSide
                  )

                // start → core → end 순서로 최종 패널 리스트
                const panels: PanelItem[] = [
                  ...startExtra,
                  ...corePanels,
                  ...endExtra,
                ]

                // ── 렌더링 ──────────────────────────────────────────────
                if (panels.length === 0) {
                  return (
                    <div className="flex flex-1 animate-in flex-col items-center justify-center bg-background p-8 text-center duration-300 select-none fade-in">
                      <div className="relative flex max-w-md animate-in flex-col items-center justify-center space-y-6 overflow-hidden rounded-2xl border border-line/45 bg-panel/40 p-8 shadow-xl backdrop-blur-xl duration-300 zoom-in-95 before:absolute before:inset-0 before:-z-10 before:rounded-2xl before:bg-gradient-to-tr before:from-primary/5 before:via-transparent before:to-primary/10">
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Workflow className="h-8 w-8 animate-pulse" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-lg font-bold tracking-tight text-foreground">
                            모든 작업 패널이 창 모드로 분리되었습니다
                          </h3>
                          <p className="px-4 text-sm leading-relaxed text-muted-foreground">
                            작업 구성 패널과 작업 큐 매니저가 개별 플로팅 창으로
                            활성화되었습니다.
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            setIsCompositionFloating(false)
                            setIsJobManagerFloating(false)
                          }}
                          className="group flex h-10 items-center gap-2 rounded-xl bg-primary px-6 py-2 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90"
                        >
                          <RotateCcw className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
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
                    key={panels.map((p) => p.id).join(",")}
                    autoSaveId={`job-layout-${panels.map((p) => p.id).join(",")}-${jobsLayoutOrientation}`}
                    orientation={jobsLayoutOrientation}
                    className="min-h-0 flex-1 overflow-hidden"
                  >
                    {panels.flatMap((panel, i) => {
                      const items = []
                      if (i > 0)
                        items.push(<ResizableHandle key={`h-${panel.id}`} />)
                      items.push(
                        <ResizablePanel
                          key={panel.id}
                          id={panel.id}
                          defaultSize={defaultSize}
                          minSize={panel.minSize ?? 15}
                          className={cn(
                            "flex min-h-0 flex-col overflow-hidden bg-panel",
                            i < panels.length - 1 &&
                              (jobsLayoutOrientation === "horizontal"
                                ? "border-r border-line"
                                : "border-b border-line")
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
                    compositionTab={compositionTab}
                    setCompositionTab={setCompositionTab}
                    onPreviewOpen={() => setIsSheetOpen(true)}
                    onAxisFilterOpen={() => setIsAxisFilterOpen(true)}
                    onSelectionOpen={() => setIsSelectionOpen(true)}
                    hasActiveFilter={hasActiveFilter}
                    onGraphOpen={() => setIsGraphOpen(true)}
                  />
                </div>
              )}
              {(mobileJobTab === "status" || mobileJobTab === "list") && (
                <div className="flex min-h-0 flex-1 flex-col bg-panel">
                  <JobManagerPanel
                    jobs={jobs}
                    paused={paused}
                    backendUrl={backendUrl}
                    isAliveBackend={isAliveBackend}
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
                      label: `기록 (${jobs.length})`,
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
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        fakeJobQueue={fakeJobQueue}
        previewFilter={previewFilter}
        onPreviewFilterChange={setPreviewFilter}
        filteredPreview={filteredPreview}
        filteredByAxisSet={filteredByAxisSet}
      />

      <AxisFilterSheet
        open={isAxisFilterOpen}
        onOpenChange={setIsAxisFilterOpen}
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
        open={isSelectionOpen}
        onOpenChange={setIsSelectionOpen}
        fakeJobQueue={fakeJobQueue}
        filteredPreview={filteredPreview}
        previewFilter={previewFilter}
        onPreviewFilterChange={setPreviewFilter}
        uncheckedItems={uncheckedItems}
        selectedCount={selectedCount}
        canRun={canRun}
        checkAllItems={checkAllItems}
        uncheckAllItems={uncheckAllItems}
        toggleItemCheck={toggleItemCheck}
        onRunSelected={async () => {
          const ok = await handleRunSelected()
          if (ok) setIsSelectionOpen(false)
        }}
      />

      {workflow.parsedWorkflow?.success && (
        <WorkflowGraphViewer
          workflow={workflow.parsedWorkflow.data}
          isOpen={isGraphOpen}
          onClose={() => setIsGraphOpen(false)}
          backendUrl={backendUrl}
        />
      )}

      <NameConflictDialog
        pendingSave={pendingSave}
        onClose={() => setPendingSave(null)}
        newName={nextFreeName(pendingSave?.name ?? "", pendingSaveItems)}
        onSaveNew={handleNameConflictSaveNew}
        onOverwrite={handleNameConflictOverwrite}
      />

      {activeTab !== "jobs" && (
        <JobStatusPopup
          jobs={jobs}
          paused={paused}
          backendUrl={backendUrl}
          isAliveBackend={isAliveBackend}
          onNavigateToJobs={() => setActiveTab("jobs")}
        />
      )}

      <PresetSelectionDialog
        pendingWorkflow={pendingPresetSelection}
        onClose={() => setPendingPresetSelection(null)}
        onSelectPreset={(mappings: NodeMapping[], presetId: string) => {
          nodeMapping.setNodeMappings(mappings)
          nodeMapping.setActiveNodeMappingPresetId(presetId)
          setPendingPresetSelection(null)
        }}
        onStartWithoutMapping={() => {
          nodeMapping.setNodeMappings([])
          nodeMapping.setActiveNodeMappingPresetId(null)
          setPendingPresetSelection(null)
        }}
      />

      <VersionDiffDialog
        open={pendingDiff !== null}
        onClose={() => setPendingDiff(null)}
        onConfirm={() => {
          if (!pendingDiff) return
          if (pendingDiff.type === "template") {
            template.saveTemplate(pendingDiff.name, pendingDiff.newContent)
            template.setTemplateResetKey((k) => k + 1)
          } else {
            const w = workflow.saveWorkflow(
              pendingDiff.name,
              pendingDiff.newContent
            )
            workflow.setActiveWorkflowId(w.id)
            workflow.setWorkflowResetKey((k) => k + 1)
          }
          toast.success(`'${pendingDiff.name}' 업데이트가 완료되었습니다.`)
        }}
        oldContent={pendingDiff?.oldContent ?? ""}
        newContent={pendingDiff?.newContent ?? ""}
        itemName={pendingDiff?.name ?? ""}
      />

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      {isCompositionFloating && (
        <FloatingWindow
          id="floating-window-composition"
          isOpen={isCompositionFloating}
          onClose={() => setIsCompositionFloating(false)}
          onDock={() => setIsCompositionFloating(false)}
          initialPos={compositionFloatingPos}
          initialSize={compositionFloatingSize}
          onPosChange={setCompositionFloatingPos}
          onSizeChange={setCompositionFloatingSize}
          title="작업 구성 패널"
          onDragProgress={(cx, cy, sw, sh, isEnding) =>
            handleDragProgress(cx, cy, sw, sh, isEnding, "composition")
          }
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
              compositionTab={compositionTab}
              setCompositionTab={setCompositionTab}
              onPreviewOpen={() => setIsSheetOpen(true)}
              onAxisFilterOpen={() => setIsAxisFilterOpen(true)}
              onSelectionOpen={() => setIsSelectionOpen(true)}
              hasActiveFilter={hasActiveFilter}
              onGraphOpen={() => setIsGraphOpen(true)}
              isFloating={true}
              onFloatToggle={() => setIsCompositionFloating(false)}
            />
          </div>
        </FloatingWindow>
      )}

      {isJobManagerFloating && (
        <FloatingWindow
          id="floating-window-jobManager"
          isOpen={isJobManagerFloating}
          onClose={() => setIsJobManagerFloating(false)}
          onDock={() => setIsJobManagerFloating(false)}
          initialPos={jobManagerFloatingPos}
          initialSize={jobManagerFloatingSize}
          onPosChange={setJobManagerFloatingPos}
          onSizeChange={setJobManagerFloatingSize}
          title="작업 큐 매니저"
          onDragProgress={(cx, cy, sw, sh, isEnding) =>
            handleDragProgress(cx, cy, sw, sh, isEnding, "jobManager")
          }
        >
          <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <JobManagerPanel
                jobs={jobs}
                paused={paused}
                backendUrl={backendUrl}
                isAliveBackend={isAliveBackend}
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
                onFloatToggle={() => setIsJobManagerFloating(false)}
              />
            </div>
          </div>
        </FloatingWindow>
      )}

      {activeTab !== "gallery" && !isGalleryDocked && isGalleryFloating && (
        <FloatingWindow
          id="floating-window-gallery"
          isOpen={isGalleryFloating}
          onClose={() => setIsGalleryFloating(false)}
          onDock={() => {
            setIsGalleryFloating(false)
            setActiveTab("gallery")
          }}
          initialPos={galleryFloatingPos}
          initialSize={galleryFloatingSize}
          onPosChange={setGalleryFloatingPos}
          onSizeChange={setGalleryFloatingSize}
          title="갤러리 플로팅 창"
          onDragProgress={(cx, cy, sw, sh, isEnding) =>
            handleDragProgress(cx, cy, sw, sh, isEnding, "gallery")
          }
          toolbar={
            <div className="flex w-full flex-wrap items-center gap-1.5">
              {/* 상태 필터 Select */}
              <Select
                value={tb.statusFilter}
                onValueChange={(v: string) => {
                  tb.setStatusFilter(
                    v as "pending" | "approved" | "rejected" | "trashed" | "all"
                  )
                }}
              >
                <SelectTrigger className="!h-7 w-[82px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "all",
                      "pending",
                      "approved",
                      "rejected",
                      "trashed",
                    ] as const
                  ).map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      className="text-[12px] font-bold"
                    >
                      {s === "all"
                        ? "전체"
                        : s === "pending"
                          ? "대기"
                          : s === "approved"
                            ? "통과"
                            : s === "rejected"
                              ? "탈락"
                              : "휴지통"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 뷰 모드 Select */}
              <Select
                value={tb.groupMode ? "group" : tb.viewMode}
                onValueChange={(v: string) => {
                  if (v === "group") {
                    tb.setGroupMode(true)
                  } else {
                    tb.setGroupMode(false)
                    tb.setViewMode(v as "grid" | "compare")
                  }
                }}
              >
                <SelectTrigger className="!h-7 w-[78px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group" className="text-[12px] font-bold">
                    그룹
                  </SelectItem>
                  <SelectItem value="grid" className="text-[12px] font-bold">
                    그리드
                  </SelectItem>
                  <SelectItem value="compare" className="text-[12px] font-bold">
                    비교
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* 정렬 기준 Select */}
              <Select
                value={tb.sortKey}
                onValueChange={(k: string) => {
                  if (tb.sortKey === k) {
                    tb.setSortDir(tb.sortDir === "asc" ? "desc" : "asc")
                  } else {
                    tb.setSortKey(k as "createdAt" | "filename" | "sizeBytes")
                    tb.setSortDir("desc")
                  }
                }}
              >
                <SelectTrigger className="!h-7 w-[74px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="createdAt"
                    className="text-[12px] font-bold"
                  >
                    날짜순
                  </SelectItem>
                  <SelectItem
                    value="filename"
                    className="text-[12px] font-bold"
                  >
                    파일명순
                  </SelectItem>
                  <SelectItem
                    value="sizeBytes"
                    className="text-[12px] font-bold"
                  >
                    크기순
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* 정렬 방향 토글 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      tb.setSortDir(tb.sortDir === "asc" ? "desc" : "asc")
                    }
                    className="!h-7 !w-7 shrink-0 border-line bg-background p-0 shadow-none hover:bg-muted"
                  >
                    {tb.sortDir === "asc" ? (
                      <ArrowDown className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUp className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">
                  정렬 방향 토글
                </TooltipContent>
              </Tooltip>

              {/* 썸네일 크기 조절 슬라이더 */}
              {(tb.groupMode || tb.viewMode === "grid") && (
                <div className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-background/50 px-1.5 shadow-none">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center text-muted-foreground">
                        <LayoutGrid className="h-3 w-3" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-bold">
                      이미지 크기 조절
                    </TooltipContent>
                  </Tooltip>
                  <input
                    type="range"
                    min="100"
                    max="300"
                    step="10"
                    value={tb.thumbnailSize}
                    onChange={(e) =>
                      tb.setThumbnailSize(Number(e.target.value))
                    }
                    className="h-1 w-12 cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus:outline-none"
                  />
                  <span className="w-[34px] text-right font-mono text-[9px] font-bold whitespace-nowrap text-muted-foreground tabular-nums">
                    {tb.thumbnailSize}px
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
                    onClick={tb.handleRefresh}
                  >
                    <RefreshCwIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">
                  새로고침
                </TooltipContent>
              </Tooltip>

              {/* 내보내기 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="!h-7 !w-7 p-0"
                    onClick={tb.handleExport}
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">
                  내보내기
                </TooltipContent>
              </Tooltip>

              {/* 휴지통 비우기 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="!h-7 !w-7 p-0 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    onClick={tb.handleEmptyTrash}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-destructive-foreground bg-destructive text-xs font-bold">
                  휴지통 비우기
                </TooltipContent>
              </Tooltip>

              {/* 검색 필터 토글 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={tb.showFilters ? "secondary" : "outline"}
                    className="relative !h-7 !w-7 p-0"
                    onClick={() => tb.setShowFilters(!tb.showFilters)}
                  >
                    <FilterIcon className="h-3.5 w-3.5" />
                    {tb.hasAnyFilter && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs font-bold">
                  검색 토글
                </TooltipContent>
              </Tooltip>

              {/* 검색창 조건부 렌더링 */}
              {tb.showFilters && (
                <div className="mt-1.5 flex w-full items-center gap-2 border-t border-line/40 pt-1.5">
                  <div className="flex-1">
                    <TagInputSearch
                      value={tb.searchInput}
                      tags={tb.searchTags}
                      candidates={tb.candidates.filter((c) => {
                        const valClean = tb.searchInput
                          .replace(/^[@#$]/, "")
                          .toLowerCase()
                        return c.value.toLowerCase().includes(valClean)
                      })}
                      placeholder="검색어 입력 (@파일명, #태그, $메타데이터)"
                      onValueChange={(val: string) => tb.setSearchInput(val)}
                      onAddTag={(tag: string) => {
                        if (!tb.searchTags.includes(tag)) {
                          tb.setSearchTags([...tb.searchTags, tag])
                        }
                        tb.setSearchInput("")
                      }}
                      onRemoveTag={(tag: string) => {
                        tb.setSearchTags(tb.searchTags.filter((t) => t !== tag))
                      }}
                      size="sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-1.5 text-[10px] font-bold text-muted-foreground"
                    onClick={tb.clearAllFilters}
                  >
                    초기화
                  </Button>
                </div>
              )}
            </div>
          }
        >
          <SavedImagesGallery
            backendUrl={backendUrl}
            enableHover={settings.enableHover}
            imagePageSize={settings.imagePageSize}
            imageLazyLoad={settings.imageLazyLoad}
            singleDownloadMode={settings.singleDownloadMode}
            filenameFilter={tb.filenameFilter}
            tagFilter={tb.tagFilter}
            metadataFilter={tb.metadataFilter}
            generalFilters={tb.generalFilters}
            onTokensExtracted={tb.setCandidates}
            onReloadReady={(reload) => {
              tb.registerReload(reload)
            }}
            toolbarState={tb}
          />
        </FloatingWindow>
      )}

      {activeTab !== "stats" && isStatsFloating && (
        <FloatingWindow
          id="floating-window-stats"
          isOpen={isStatsFloating}
          onClose={() => setIsStatsFloating(false)}
          onDock={() => {
            setIsStatsFloating(false)
            setActiveTab("stats")
          }}
          initialPos={statsFloatingPos}
          initialSize={statsFloatingSize}
          onPosChange={setStatsFloatingPos}
          onSizeChange={setStatsFloatingSize}
          title="통계"
          onDragProgress={(cx, cy, sw, sh, isEnding) =>
            handleDragProgress(cx, cy, sw, sh, isEnding, "stats")
          }
        >
          <div className="flex h-full w-full flex-col overflow-y-auto bg-panel p-4 md:p-6">
            <StatisticsPanel jobs={jobs} workers={workers} />
          </div>
        </FloatingWindow>
      )}

      {activeTab !== "curation" && isCurationFloating && (
        <FloatingWindow
          id="floating-window-curation"
          isOpen={isCurationFloating}
          onClose={() => setIsCurationFloating(false)}
          onDock={() => {
            setIsCurationFloating(false)
            setActiveTab("curation")
          }}
          initialPos={curationFloatingPos}
          initialSize={curationFloatingSize}
          onPosChange={setCurationFloatingPos}
          onSizeChange={setCurationFloatingSize}
          title="큐레이션"
          onDragProgress={(cx, cy, sw, sh, isEnding) =>
            handleDragProgress(cx, cy, sw, sh, isEnding, "curation")
          }
        >
          <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
            <CombinationPicker
              backendUrl={backendUrl}
              cegTemplate={template.cegTemplate}
              savedTemplates={template.savedTemplates}
              enableHover={settings.enableHover}
              autoApplyReject={settings.autoApplyReject}
              hideEmptyCurationFolders={settings.hideEmptyCurationFolders}
              savedWorkflows={workflow.savedWorkflows}
              toolbarState={{
                selectedAxis: curationSelectedAxis,
                setSelectedAxis: setCurationSelectedAxis,
                viewMode: "gallery" as const,
                setViewMode: () => {},
                hideTopSection: true,
              }}
            />
          </div>
        </FloatingWindow>
      )}

      {snapDockZone && (
        <div
          className={cn(
            "pointer-events-none fixed z-50 flex animate-pulse items-center justify-center border border-primary/30 bg-primary/10 backdrop-blur-xs transition-all duration-300",
            snapDockZone.zone === "left" &&
              "top-0 bottom-0 left-0 w-1/2 rounded-r-2xl border-l-0",
            snapDockZone.zone === "right" &&
              "top-0 right-0 bottom-0 w-1/2 rounded-l-2xl border-r-0",
            snapDockZone.zone === "top" &&
              "top-0 right-0 left-0 h-1/2 rounded-b-2xl border-t-0",
            snapDockZone.zone === "bottom" &&
              "right-0 bottom-0 left-0 h-1/2 rounded-t-2xl border-b-0"
          )}
        >
          <div className="flex scale-110 animate-in flex-col items-center justify-center rounded-2xl border border-line bg-panel/60 p-6 shadow-2xl backdrop-blur-xl duration-200 zoom-in-95">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]">
              {snapDockZone.zone === "left" && (
                <ArrowLeft className="h-6 w-6" />
              )}
              {snapDockZone.zone === "right" && (
                <ArrowRight className="h-6 w-6" />
              )}
              {snapDockZone.zone === "top" && <ArrowUp className="h-6 w-6" />}
              {snapDockZone.zone === "bottom" && (
                <ArrowDown className="h-6 w-6" />
              )}
            </div>
            <span className="mt-3 text-xs font-black tracking-wider text-foreground uppercase">
              {snapDockZone.zone === "left" || snapDockZone.zone === "right"
                ? "가로 결합 스냅"
                : "세로 결합 스냅"}
            </span>
          </div>
        </div>
      )}
    </CurationToolbarProvider>
    </div>
  )
}

export default App
