import { useCallback, useEffect, type RefObject } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"

interface UseViewportControlsOptions {
  containerRef: RefObject<HTMLDivElement | null>
  onWorkspacePanStart?: () => void
}

interface UseViewportControlsResult {
  zoom: number
  pan: [number, number]
  setZoom: (zoom: number) => void
  setPan: (pan: [number, number]) => void
  handleWorkspaceMouseDown: (event: React.MouseEvent) => void
  screenToWorld: (screenX: number, screenY: number) => [number, number]
}

export function useViewportControls({
  containerRef,
  onWorkspacePanStart,
}: UseViewportControlsOptions): UseViewportControlsResult {
  const zoom = useReactGraphStore((state) => state.zoom)
  const pan = useReactGraphStore((state) => state.pan)
  const setZoom = useReactGraphStore((state) => state.setZoom)
  const setPan = useReactGraphStore((state) => state.setPan)
  const deselectAll = useReactGraphStore((state) => state.deselectAll)

  const handleWorkspaceMouseDown = useCallback(
    (event: React.MouseEvent): void => {
      const isMiddle = event.button === 1
      const isLeft = event.button === 0
      if (!isLeft && !isMiddle) return

      const target = event.target as HTMLElement
      const isOnNode = target.closest("[data-node-id]") !== null
      const isOnPin = target.closest("[data-slot-node-id]") !== null
      const isOnMenu = target.closest(".context-menu-container") !== null
      const isOnGroup = target.closest("[data-group-id]") !== null
      if (!isMiddle && (isOnNode || isOnPin || isOnMenu || isOnGroup)) return

      event.preventDefault()
      deselectAll()
      onWorkspacePanStart?.()

      const startPanX = pan[0]
      const startPanY = pan[1]
      const startMouseX = event.clientX
      const startMouseY = event.clientY

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        const dx = moveEvent.clientX - startMouseX
        const dy = moveEvent.clientY - startMouseY
        setPan([startPanX + dx, startPanY + dy])
      }

      const handleMouseUp = (): void => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }

      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    },
    [deselectAll, onWorkspacePanStart, pan, setPan]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault()

      const rect = container.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top

      const zoomFactor = 1.08
      const nextZoom = event.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor

      const newPanX = mouseX - ((mouseX - pan[0]) / zoom) * nextZoom
      const newPanY = mouseY - ((mouseY - pan[1]) / zoom) * nextZoom

      setZoom(nextZoom)
      setPan([newPanX, newPanY])
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return (): void => {
      container.removeEventListener("wheel", handleWheel)
    }
  }, [containerRef, zoom, pan, setZoom, setPan])

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): [number, number] => {
      if (!containerRef.current) return [screenX, screenY]
      const rect = containerRef.current.getBoundingClientRect()
      const relativeX = screenX - rect.left
      const relativeY = screenY - rect.top
      return [(relativeX - pan[0]) / zoom, (relativeY - pan[1]) / zoom]
    },
    [containerRef, pan, zoom]
  )

  return {
    zoom,
    pan,
    setZoom,
    setPan,
    handleWorkspaceMouseDown,
    screenToWorld,
  }
}
