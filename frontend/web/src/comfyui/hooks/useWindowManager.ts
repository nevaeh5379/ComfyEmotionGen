import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { usePanelLayout } from "../contexts/PanelLayoutContext"
import type { TabId } from "../components/layout/nav-tabs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindowType =
  | "composition"
  | "jobManager"
  | "gallery"
  | "stats"
  | "curation"

export interface SnapDockZone {
  zone: "left" | "right" | "top" | "bottom"
  windowType: WindowType
}

interface DragSession {
  windowType: WindowType
  startX: number
  startY: number
  isPopoutTriggered: boolean
  size: { w: number; h: number }
}

interface UseWindowManagerOptions {
  /** current active tab – needed to reset tab when a nav-tab panel is dragged out */
  activeTab: TabId
  /** setter for the active tab – required because tab state lives in AppContent */
  setActiveTab: (tab: TabId) => void
  /** setter for the jobs layout orientation (from useLocalStorage in AppContent) */
  setJobsLayoutOrientation: (v: "horizontal" | "vertical") => void
  /** setter for the jobs panel order (from useLocalStorage in AppContent) */
  setJobsPanelOrder: (v: "composition-first" | "manager-first") => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWindowManager({
  activeTab,
  setActiveTab,
  setJobsLayoutOrientation,
  setJobsPanelOrder,
}: UseWindowManagerOptions) {
  const panel = usePanelLayout()

  // Destructure for stable refs in callbacks
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

  // ── Snap dock zone state ──
  const [snapDockZone, setSnapDockZone] = useState<SnapDockZone | null>(null)

  // ── Drag session ref ──
  const dragSessionRef = useRef<DragSession | null>(null)

  // ── handleDragProgress ──
  const handleDragProgress = useCallback(
    (
      clientX: number,
      clientY: number,
      screenW: number,
      screenH: number,
      isEnding: boolean,
      windowType: WindowType
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

  // ── handleHeaderDragStart ──
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

  // ── handleNavTabDragStart ──
  const handleNavTabDragStart = useCallback(
    (tabId: "stats" | "curation" | "gallery", clientX: number, clientY: number) => {
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

  return {
    // Exposed panel state for rendering
    isCompositionFloating,
    setIsCompositionFloating,
    compositionFloatingPos,
    setCompositionFloatingPos,
    compositionFloatingSize,
    setCompositionFloatingSize,

    isJobManagerFloating,
    setIsJobManagerFloating,
    jobManagerFloatingPos,
    setJobManagerFloatingPos,
    jobManagerFloatingSize,
    setJobManagerFloatingSize,

    isGalleryFloating,
    setIsGalleryFloating,
    galleryFloatingPos,
    setGalleryFloatingPos,
    galleryFloatingSize,
    setGalleryFloatingSize,
    isGalleryDocked,
    setIsGalleryDocked,
    galleryDockedSide,
    setGalleryDockedSide,

    isStatsFloating,
    setIsStatsFloating,
    statsFloatingPos,
    setStatsFloatingPos,
    statsFloatingSize,
    setStatsFloatingSize,
    isStatsDocked,
    setIsStatsDocked,
    statsDockedSide,
    setStatsDockedSide,

    isCurationFloating,
    setIsCurationFloating,
    curationFloatingPos,
    setCurationFloatingPos,
    curationFloatingSize,
    setCurationFloatingSize,
    isCurationDocked,
    setIsCurationDocked,
    curationDockedSide,
    setCurationDockedSide,

    // Drag / snap handlers and state
    snapDockZone,
    setSnapDockZone,
    handleDragProgress,
    handleHeaderDragStart,
    handleNavTabDragStart,
  }
}