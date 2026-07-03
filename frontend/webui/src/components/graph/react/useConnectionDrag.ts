import { useEffect, useMemo, useState, type RefObject } from "react"
import { isValidSlotConnection } from "@/comfyui/utils/workflowGraphModel"

interface ConnectionPin {
  nodeId: number
  type: "input" | "output"
  index: number
  datatype: string
}

interface UseConnectionDragOptions {
  containerRef: RefObject<HTMLDivElement | null>
  zoom: number
  pan: [number, number]
  connect: (
    originNodeId: number,
    originSlotIdx: number,
    targetNodeId: number,
    targetSlotIdx: number,
    type: string
  ) => void
}

interface UseConnectionDragResult {
  activeDragPin: ConnectionPin | null
  tempLinkEnd: [number, number] | null
  tempLinkPath: string
  linkColor: string
}

function readPinFromElement(target: HTMLElement): ConnectionPin | null {
  if (!target.matches("[data-slot-node-id]")) return null

  const nodeId = parseInt(target.getAttribute("data-slot-node-id") ?? "", 10)
  const type = target.getAttribute("data-slot-type")
  const index = parseInt(target.getAttribute("data-slot-index") ?? "", 10)
  const datatype = target.getAttribute("data-slot-datatype") ?? "*"

  if (
    Number.isNaN(nodeId) ||
    Number.isNaN(index) ||
    (type !== "input" && type !== "output")
  ) {
    return null
  }

  return { nodeId, type, index, datatype }
}

function worldPointFromMouse(
  container: HTMLElement,
  event: MouseEvent,
  pan: [number, number],
  zoom: number
): [number, number] {
  const containerRect = container.getBoundingClientRect()
  return [
    (event.clientX - containerRect.left - pan[0]) / zoom,
    (event.clientY - containerRect.top - pan[1]) / zoom,
  ]
}

export function useConnectionDrag({
  containerRef,
  zoom,
  pan,
  connect,
}: UseConnectionDragOptions): UseConnectionDragResult {
  const [activeDragPin, setActiveDragPin] = useState<ConnectionPin | null>(null)
  const [tempLinkEnd, setTempLinkEnd] = useState<[number, number] | null>(null)
  const [dragStartPinPos, setDragStartPinPos] = useState<
    [number, number] | null
  >(null)
  const [hoveredPin, setHoveredPin] = useState<ConnectionPin | null>(null)

  useEffect(() => {
    if (!activeDragPin || !containerRef.current) {
      setDragStartPinPos(null)
      return
    }
    const containerRect = containerRef.current.getBoundingClientRect()

    const selector = `[data-slot-node-id="${String(activeDragPin.nodeId)}"][data-slot-type="${activeDragPin.type}"][data-slot-index="${String(activeDragPin.index)}"]`
    const pinEl = containerRef.current.querySelector(selector)
    if (!pinEl) {
      setDragStartPinPos(null)
      return
    }

    const pinRect = pinEl.getBoundingClientRect()
    setDragStartPinPos([
      (pinRect.left - containerRect.left + pinRect.width / 2 - pan[0]) / zoom,
      (pinRect.top - containerRect.top + pinRect.height / 2 - pan[1]) / zoom,
    ])
  }, [activeDragPin, containerRef, zoom, pan])

  const tempLinkPath = useMemo(() => {
    if (!dragStartPinPos || !tempLinkEnd) return ""
    const p1 = dragStartPinPos
    const p2 = tempLinkEnd

    const isForward = activeDragPin?.type === "output"
    const dx = p2[0] - p1[0]
    const curve = Math.max(Math.abs(dx) * 0.55, 40)

    const cp1x = p1[0] + (isForward ? curve : -curve)
    const cp1y = p1[1]
    const cp2x = p2[0] + (isForward ? -curve : curve)
    const cp2y = p2[1]

    return `M ${String(p1[0])} ${String(p1[1])} C ${String(cp1x)} ${String(cp1y)}, ${String(cp2x)} ${String(cp2y)}, ${String(p2[0])} ${String(p2[1])}`
  }, [dragStartPinPos, tempLinkEnd, activeDragPin])

  const isHoveredPinCompatible = useMemo(() => {
    if (!activeDragPin || !hoveredPin) return false
    if (activeDragPin.nodeId === hoveredPin.nodeId) return false
    if (activeDragPin.type === hoveredPin.type) return false
    return isValidSlotConnection(activeDragPin.datatype, hoveredPin.datatype)
  }, [activeDragPin, hoveredPin])

  const linkColor = useMemo(() => {
    if (!hoveredPin) return "#3b82f6"
    return isHoveredPinCompatible ? "#10b981" : "#ef4444"
  }, [hoveredPin, isHoveredPinCompatible])

  useEffect(() => {
    if (!activeDragPin) return

    const handleGlobalMouseMove = (event: MouseEvent): void => {
      if (!containerRef.current) return
      setTempLinkEnd(
        worldPointFromMouse(containerRef.current, event, pan, zoom)
      )
    }

    const handleGlobalMouseUp = (): void => {
      if (
        hoveredPin &&
        hoveredPin.nodeId !== activeDragPin.nodeId &&
        hoveredPin.type !== activeDragPin.type &&
        isHoveredPinCompatible
      ) {
        const outPin =
          activeDragPin.type === "output" ? activeDragPin : hoveredPin
        const inPin =
          activeDragPin.type === "input" ? activeDragPin : hoveredPin

        connect(
          outPin.nodeId,
          outPin.index,
          inPin.nodeId,
          inPin.index,
          outPin.datatype
        )
      }

      setActiveDragPin(null)
      setTempLinkEnd(null)
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }

    window.addEventListener("mousemove", handleGlobalMouseMove)
    window.addEventListener("mouseup", handleGlobalMouseUp)

    return (): void => {
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [
    activeDragPin,
    hoveredPin,
    zoom,
    pan,
    connect,
    isHoveredPinCompatible,
    containerRef,
  ])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseDown = (event: MouseEvent): void => {
      const pin = readPinFromElement(event.target as HTMLElement)
      if (pin === null) return

      event.preventDefault()
      event.stopPropagation()

      setActiveDragPin(pin)
      setTempLinkEnd(worldPointFromMouse(container, event, pan, zoom))
    }

    const handleMouseEnter = (event: MouseEvent): void => {
      const pin = readPinFromElement(event.target as HTMLElement)
      if (pin !== null) setHoveredPin(pin)
    }

    const handleMouseLeave = (event: MouseEvent): void => {
      const pin = readPinFromElement(event.target as HTMLElement)
      if (pin !== null) setHoveredPin(null)
    }

    container.addEventListener("mousedown", handleMouseDown)
    container.addEventListener("mouseover", handleMouseEnter)
    container.addEventListener("mouseout", handleMouseLeave)

    return (): void => {
      container.removeEventListener("mousedown", handleMouseDown)
      container.removeEventListener("mouseover", handleMouseEnter)
      container.removeEventListener("mouseout", handleMouseLeave)
    }
  }, [containerRef, zoom, pan])

  return { activeDragPin, tempLinkEnd, tempLinkPath, linkColor }
}
