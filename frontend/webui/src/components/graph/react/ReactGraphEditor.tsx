/**
 * ReactGraphEditor - React/DOM/SVG 기반 메인 노드 그래프 에디터
 */

import { useRef, useState, useEffect, useMemo, memo } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { useSubgraphNavigationStore } from "@/comfyui/stores/subgraphNavigationStore"
import { ReactNode } from "./ReactNode"
import { SvgConnections } from "./SvgConnections"
import { ReactGroup } from "./ReactGroup"
import { ChevronRight } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import {
  isRootGraphId,
  isValidSlotConnection,
} from "@/comfyui/utils/workflowGraphModel"
import { useComfyRuntimeBridge } from "./useComfyRuntimeBridge"
import { useExecutionStatusBridge } from "./useExecutionStatusBridge"

const NodeLayerItem = memo(function NodeLayerItem({
  id,
}: {
  id: number
}): JSX.Element | null {
  const node = useReactGraphStore(
    useShallow((s) => s.nodes.find((n) => n.id === id) ?? null)
  )
  const selected = useReactGraphStore((s) => s.selectedNodeIds.has(id))
  if (!node) return null
  return (
    <ReactNode
      key={`node-${String(node.id)}`}
      id={node.id}
      type={node.type}
      pos={node.pos}
      size={node.size}
      selected={selected}
    />
  )
})

const NodeLayer = memo(function NodeLayer(): JSX.Element {
  // 활성 그래프에 속한 노드 ID만 렌더링 (루트=null/undefined, 서브그래프=UUID)
  const nodeIds = useReactGraphStore(
    useShallow((s) => {
      const activeId = s.activeGraphId
      return s.nodes
        .filter((n) =>
          activeId === null ? isRootGraphId(n.graphId) : n.graphId === activeId
        )
        .map((n) => n.id)
    })
  )
  return (
    <>
      {nodeIds.map((id) => (
        <NodeLayerItem key={`node-${String(id)}`} id={id} />
      ))}
    </>
  )
})

const GroupLayerItem = memo(function GroupLayerItem({
  id,
}: {
  id: number
}): JSX.Element | null {
  return <ReactGroup id={id} />
})

const GroupLayer = memo(function GroupLayer(): JSX.Element {
  // 활성 그래프에 속한 그룹 ID만 렌더링
  const groupIds = useReactGraphStore(
    useShallow((s) => {
      const activeId = s.activeGraphId
      return s.groups
        .filter((g) =>
          activeId === null ? isRootGraphId(g.graphId) : g.graphId === activeId
        )
        .map((g) => g.id)
    })
  )
  return (
    <>
      {groupIds.map((id) => (
        <GroupLayerItem key={`group-${String(id)}`} id={id} />
      ))}
    </>
  )
})

/** 브레드크럼: 루트 > SubgraphA > SubgraphB. 클릭 시 해당 레벨로 이동. */
function SubgraphBreadcrumb(): JSX.Element | null {
  const idStack = useSubgraphNavigationStore((s) => s.idStack)
  const activeSubgraph = useSubgraphNavigationStore((s) => s.activeSubgraph)
  const navigateToRoot = useSubgraphNavigationStore((s) => s.navigateToRoot)
  const navigateToLevel = useSubgraphNavigationStore((s) => s.navigateToLevel)
  const subgraphs = useReactGraphStore((s) => s.subgraphs)
  const activeGraphId = useReactGraphStore((s) => s.activeGraphId)

  // 루트에 있을 때는 브레드크럼 미표시
  if (activeGraphId === null) return null

  return (
    <div className="absolute top-2 left-2 z-[500] flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-200 backdrop-blur-sm">
      <button
        className="cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-700"
        onClick={(): void => {
          navigateToRoot()
        }}
      >
        Root
      </button>
      {idStack.map((id, i) => {
        const model = subgraphs.get(id)
        const name = model?.name ?? "Subgraph"
        const isCurrent = id === activeGraphId
        return (
          <span key={`crumb-${id}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-zinc-500" />
            <button
              className={`cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-700 ${isCurrent ? "font-semibold text-zinc-100" : ""}`}
              onClick={(): void => {
                navigateToLevel(i + 1)
              }}
            >
              {name}
            </button>
          </span>
        )
      })}
      {/* 현재 활성 subgraph가 idStack에 없는 경우 (최상위 진입 직후) */}
      {activeSubgraph !== null && !idStack.includes(activeGraphId) ? (
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-zinc-500" />
          <span className="px-1.5 py-0.5 font-semibold text-zinc-100">
            {activeSubgraph.name}
          </span>
        </span>
      ) : null}
    </div>
  )
}

export function ReactGraphEditor(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null)
  const hiddenContainerRef = useRef<HTMLDivElement>(null)

  const nodeDefs = useNodeDefStore((s) => s.nodeDefs)
  const isReady = useComfyRuntimeBridge({
    hiddenCanvasRef,
    hiddenContainerRef,
    nodeDefs,
  })
  useExecutionStatusBridge()

  const zoom = useReactGraphStore((s) => s.zoom)
  const pan = useReactGraphStore((s) => s.pan)
  const setZoom = useReactGraphStore((s) => s.setZoom)
  const setPan = useReactGraphStore((s) => s.setPan)
  const _selectNode = useReactGraphStore((s) => s.selectNode)
  const deselectAll = useReactGraphStore((s) => s.deselectAll)
  const connect = useReactGraphStore((s) => s.connect)
  const addNode = useReactGraphStore((s) => s.addNode)
  const addGroup = useReactGraphStore((s) => s.addGroup)
  const clearGraph = useReactGraphStore((s) => s.clearGraph)

  const nodeDefsByCategory = useNodeDefStore((s) => s.nodeDefsByCategory)

  // 드래그 중인 핀 및 임시 선 끝점 관리
  const [activeDragPin, setActiveDragPin] = useState<{
    nodeId: number
    type: "input" | "output"
    index: number
    datatype: string
  } | null>(null)
  const [tempLinkEnd, setTempLinkEnd] = useState<[number, number] | null>(null)
  const [dragStartPinPos, setDragStartPinPos] = useState<
    [number, number] | null
  >(null)

  // 현재 마우스가 올라가 있는 핀 추적
  const [hoveredPin, setHoveredPin] = useState<{
    nodeId: number
    type: "input" | "output"
    index: number
    datatype: string
  } | null>(null)

  // 컨텍스트 메뉴 상태 관리
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    screenX: number
    screenY: number
    nodeId?: number | undefined
    groupId?: number | undefined
  } | null>(null)

  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)

  // 마우스로 빈 공간 드래그 시 팬(Pan) 처리
  const handleWorkspaceMouseDown = (e: React.MouseEvent): void => {
    // Middle button always pans; left button only pans when clicking empty space
    const isMiddle = e.button === 1
    const isLeft = e.button === 0
    if (!isLeft && !isMiddle) return

    // 노드, 핀, 컨텍스트 메뉴, 그룹 위를 클릭했으면 팬 안함
    const target = e.target as HTMLElement
    const isOnNode = !!target.closest("[data-node-id]")
    const isOnPin = !!target.closest("[data-slot-node-id]")
    const isOnMenu = !!target.closest(".context-menu-container")
    const isOnGroup = !!target.closest("[data-group-id]")
    if (!isMiddle && (isOnNode || isOnPin || isOnMenu || isOnGroup)) return

    e.preventDefault()
    deselectAll()
    setContextMenu(null)

    const startPanX = pan[0]
    const startPanY = pan[1]
    const startMouseX = e.clientX
    const startMouseY = e.clientY

    const handleMouseMove = (ev: MouseEvent): void => {
      const dx = ev.clientX - startMouseX
      const dy = ev.clientY - startMouseY
      setPan([startPanX + dx, startPanY + dy])
    }

    const handleMouseUp = (): void => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  // 마우스 휠 스크롤 줌(Zoom) 처리
  // React의 onWheel은 passive 이벤트라 preventDefault()를 호출하면 경고가 발생하므로
  // useEffect에서 { passive: false } 옵션으로 직접 등록합니다.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()

      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const zoomFactor = 1.08
      const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor

      // 마우스 위치 기준으로 확대/축소: 마우스가 가리키던 월드 좌표를 유지하도록 pan 보정
      const newPanX = mouseX - ((mouseX - pan[0]) / zoom) * nextZoom
      const newPanY = mouseY - ((mouseY - pan[1]) / zoom) * nextZoom

      setZoom(nextZoom)
      setPan([newPanX, newPanY])
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return (): void => {
      container.removeEventListener("wheel", handleWheel)
    }
  }, [zoom, pan, setZoom, setPan])

  // 화면 좌표(Screen) -> 캔버스 월드 좌표(World) 변환
  const screenToWorld = (
    screenX: number,
    screenY: number
  ): [number, number] => {
    if (!containerRef.current) return [screenX, screenY]
    const rect = containerRef.current.getBoundingClientRect()
    const relativeX = screenX - rect.left
    const relativeY = screenY - rect.top
    return [(relativeX - pan[0]) / zoom, (relativeY - pan[1]) / zoom]
  }

  // 우클릭 컨텍스트 메뉴 핸들러
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const target = e.target as HTMLElement
    const nodeEl = target.closest("[data-node-id]")
    const idAttr = nodeEl?.getAttribute("data-node-id")
    const clickedNodeId =
      idAttr !== undefined && idAttr !== null ? parseInt(idAttr, 10) : undefined

    const groupEl = target.closest("[data-group-id]")
    const groupIdAttr = groupEl?.getAttribute("data-group-id")
    const clickedGroupId =
      groupIdAttr !== undefined && groupIdAttr !== null
        ? parseInt(groupIdAttr, 10)
        : undefined

    setContextMenu({
      x,
      y,
      screenX: e.clientX,
      screenY: e.clientY,
      nodeId: clickedNodeId,
      groupId: clickedGroupId,
    })
    setActiveSubmenu(null)
    setHoveredCategory(null)
  }

  // 드래그 중인 임시 연결선의 시작점 좌표 계산
  useEffect(() => {
    if (!activeDragPin || !containerRef.current) {
      setDragStartPinPos(null)
      return
    }
    const containerRect = containerRef.current.getBoundingClientRect()

    const nodeIdStr = String(activeDragPin.nodeId)
    const typeStr = activeDragPin.type
    const indexStr = String(activeDragPin.index)
    const selector = `[data-slot-node-id="${nodeIdStr}"][data-slot-type="${typeStr}"][data-slot-index="${indexStr}"]`
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
  }, [activeDragPin, zoom, pan])

  // 임시 연결선 패스 생성
  const tempLinkPath = useMemo(() => {
    if (!dragStartPinPos || !tempLinkEnd) return ""
    const p1 = dragStartPinPos
    const p2 = tempLinkEnd

    // 드래그 방향에 따라 제어점 곡률 조절
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
    if (!hoveredPin) return "#3b82f6" // Default blue
    return isHoveredPinCompatible ? "#10b981" : "#ef4444" // Green if compatible, Red if not
  }, [hoveredPin, isHoveredPinCompatible])

  // 전역 마우스 무브 및 마우스 업 핸들러 (연결 드래그용)
  useEffect(() => {
    if (!activeDragPin) return

    const handleGlobalMouseMove = (e: MouseEvent): void => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()

      // 마우스 위치를 월드 좌표계(1x)로 변환
      const mouseX = (e.clientX - containerRect.left - pan[0]) / zoom
      const mouseY = (e.clientY - containerRect.top - pan[1]) / zoom
      setTempLinkEnd([mouseX, mouseY])
    }

    const handleGlobalMouseUp = (): void => {
      // 마우스를 뗀 곳에 반대편 타입의 다른 노드 핀이 올라와 있고, 타입이 호환되는 경우에만 연결 체결
      if (
        hoveredPin &&
        hoveredPin.nodeId !== activeDragPin.nodeId &&
        hoveredPin.type !== activeDragPin.type
      ) {
        if (isHoveredPinCompatible) {
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
  }, [activeDragPin, hoveredPin, zoom, pan, connect, isHoveredPinCompatible])

  // 핀 이벤트 위임 설정 (핀 드래깅 연동)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (target.matches("[data-slot-node-id]")) {
        e.preventDefault()
        e.stopPropagation()

        const nodeIdStr = target.getAttribute("data-slot-node-id")
        const nodeId = parseInt(nodeIdStr ?? "", 10)
        const type = target.getAttribute("data-slot-type") as "input" | "output"
        const indexStr = target.getAttribute("data-slot-index")
        const index = parseInt(indexStr ?? "", 10)
        const datatype = target.getAttribute("data-slot-datatype") ?? "*"

        setActiveDragPin({ nodeId, type, index, datatype })

        // 초기 끝점 설정
        const containerRect = container.getBoundingClientRect()
        const mouseX = (e.clientX - containerRect.left - pan[0]) / zoom
        const mouseY = (e.clientY - containerRect.top - pan[1]) / zoom
        setTempLinkEnd([mouseX, mouseY])
      }
    }

    const handleMouseEnter = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (target.matches("[data-slot-node-id]")) {
        const nodeIdStr = target.getAttribute("data-slot-node-id")
        const nodeId = parseInt(nodeIdStr ?? "", 10)
        const type = target.getAttribute("data-slot-type") as "input" | "output"
        const indexStr = target.getAttribute("data-slot-index")
        const index = parseInt(indexStr ?? "", 10)
        const datatype = target.getAttribute("data-slot-datatype") ?? "*"

        setHoveredPin({ nodeId, type, index, datatype })
      }
    }

    const handleMouseLeave = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (target.matches("[data-slot-node-id]")) {
        setHoveredPin(null)
      }
    }

    container.addEventListener("mousedown", handleMouseDown)
    container.addEventListener("mouseover", handleMouseEnter)
    container.addEventListener("mouseout", handleMouseLeave)

    return (): void => {
      container.removeEventListener("mousedown", handleMouseDown)
      container.removeEventListener("mouseover", handleMouseEnter)
      container.removeEventListener("mouseout", handleMouseLeave)
    }
  }, [zoom, pan])

  // 키보드 단축키 처리 (Delete/Backspace로 노드 삭제, Ctrl+Z/Y로 실행취소/재실행)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // 텍스트 필드를 편집하고 있는 경우 단축키 무시
      const active = document.activeElement
      if (active) {
        const tag = active.tagName.toLowerCase()
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          active.hasAttribute("contenteditable")
        ) {
          return
        }
      }

      // 1. Delete / Backspace: 선택된 노드 삭제
      if (e.key === "Delete" || e.key === "Backspace") {
        const selectedNodeIds = useReactGraphStore.getState().selectedNodeIds
        if (selectedNodeIds.size > 0) {
          const ids = Array.from(selectedNodeIds)
          useReactGraphStore.getState().removeNodes(ids)
          e.preventDefault()
        }
      }

      // 2. Ctrl+Z / Cmd+Z: 실행 취소
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          // Ctrl+Shift+Z: 다시 실행
          useReactGraphStore.getState().redo()
        } else {
          useReactGraphStore.getState().undo()
        }
        e.preventDefault()
      }

      // 3. Ctrl+Y / Cmd+Y: 다시 실행
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        useReactGraphStore.getState().redo()
        e.preventDefault()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return (): void => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  // 외부 클릭 시 컨텍스트 메뉴 닫기
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (!target.closest(".context-menu-container")) {
        setContextMenu(null)
        setActiveSubmenu(null)
        setHoveredCategory(null)
      }
    }
    document.addEventListener("mousedown", handleDocumentClick)
    return (): void => {
      document.removeEventListener("mousedown", handleDocumentClick)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      onMouseDown={handleWorkspaceMouseDown}
      onContextMenu={handleContextMenu}
      className="relative h-full w-full overflow-hidden bg-[#18181b] select-none"
      style={{
        backgroundImage: "radial-gradient(#27272a 1.2px, transparent 1.2px)",
        backgroundSize: `${String(20 * zoom)}px ${String(20 * zoom)}px`,
        backgroundPosition: `${String(pan[0])}px ${String(pan[1])}px`,
      }}
    >
      {!isReady && (
        <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center gap-2 bg-[#18181b] font-medium text-zinc-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          <span>Extensions / Live graph loading...</span>
        </div>
      )}

      <SubgraphBreadcrumb />
      {/* Zoom / Pan Wrapper */}
      <div
        className="pointer-events-none absolute inset-0 origin-top-left overflow-visible"
        style={{
          transform: `translate(${String(pan[0])}px, ${String(pan[1])}px) scale(${String(zoom)})`,
        }}
      >
        {/* Interactive nodes and edges inside transformed wrapper */}
        <div className="pointer-events-auto absolute inset-0 overflow-visible">
          {/* 0. 그룹 레이어 */}
          <GroupLayer />

          {/* 1. SVG 연결선 레이어 */}
          <SvgConnections />

          {/* 2. 임시 드래깅 연결선 그리기 */}
          {activeDragPin && tempLinkEnd && (
            <svg className="pointer-events-none absolute inset-0 z-50 h-full w-full overflow-visible">
              <path
                d={tempLinkPath}
                fill="none"
                stroke={linkColor}
                strokeWidth={2.5}
                strokeDasharray="4 4"
              />
            </svg>
          )}

          {/* 3. DOM 노드 레이어 */}
          <NodeLayer />
        </div>
      </div>

      {/* 4. 컨텍스트 메뉴 (Context Menu) */}
      {contextMenu && (
        <div
          className="context-menu-container absolute z-[1000] flex w-48 flex-col rounded-lg border border-zinc-800 bg-zinc-900/95 p-1 text-xs text-zinc-200 shadow-2xl backdrop-blur-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e): void => {
            e.stopPropagation()
          }}
        >
          {contextMenu.nodeId !== undefined ? (
            <>
              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left text-destructive transition-colors hover:bg-zinc-800 hover:text-destructive"
                onClick={(): void => {
                  const nodeId = contextMenu.nodeId
                  if (nodeId !== undefined) {
                    useReactGraphStore.getState().removeNode(nodeId)
                  }
                  setContextMenu(null)
                }}
              >
                Delete Node
              </button>
              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onClick={(): void => {
                  deselectAll()
                  setContextMenu(null)
                }}
              >
                Deselect
              </button>
              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onClick={(): void => {
                  const store = useReactGraphStore.getState()
                  // 선택된 노드들을 subgraph로 변환
                  const selectedIds = Array.from(store.selectedNodeIds)
                  if (selectedIds.length > 0) {
                    store.convertToSubgraph(selectedIds)
                  }
                  setContextMenu(null)
                }}
              >
                Convert to Subgraph
              </button>
              {/* SubgraphNode 인스턴스인 경우 진입 메뉴 추가 */}
              {((): JSX.Element | null => {
                const store = useReactGraphStore.getState()
                const node = store.nodes.find(
                  (n) => n.id === contextMenu.nodeId
                )
                if (!node) return null
                const isSubgraphInstance =
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    node.type
                  )
                if (!isSubgraphInstance) return null
                return (
                  <button
                    className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                    onClick={(): void => {
                      useSubgraphNavigationStore
                        .getState()
                        .navigateTo(node.type)
                      setContextMenu(null)
                    }}
                  >
                    Enter Subgraph
                  </button>
                )
              })()}
            </>
          ) : contextMenu.groupId !== undefined ? (
            <>
              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onClick={(): void => {
                  const currentTitle =
                    useReactGraphStore
                      .getState()
                      .groups.find((g) => g.id === contextMenu.groupId)
                      ?.title ?? ""
                  const newTitle = prompt(
                    "Enter new group title:",
                    currentTitle
                  )
                  if (newTitle !== null && newTitle.trim()) {
                    useReactGraphStore
                      .getState()
                      .updateGroupTitle(contextMenu.groupId!, newTitle.trim())
                  }
                  setContextMenu(null)
                }}
              >
                Rename Group
              </button>
              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onClick={(): void => {
                  useReactGraphStore
                    .getState()
                    .toggleGroupLock(contextMenu.groupId!)
                  setContextMenu(null)
                }}
              >
                {useReactGraphStore
                  .getState()
                  .groups.find((g) => g.id === contextMenu.groupId)?.locked
                  ? "Unlock Group"
                  : "Lock Group"}
              </button>
              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onClick={(): void => {
                  const colors = [
                    "#3b82f6",
                    "#ef4444",
                    "#10b981",
                    "#f59e0b",
                    "#8b5cf6",
                    "#ec4899",
                    "#6b7280",
                    "#333355",
                  ]
                  const curColor =
                    useReactGraphStore
                      .getState()
                      .groups.find((g) => g.id === contextMenu.groupId)
                      ?.color ?? "#333355"
                  const nextColor =
                    colors[(colors.indexOf(curColor) + 1) % colors.length] ??
                    "#333355"
                  useReactGraphStore
                    .getState()
                    .updateGroupColor(contextMenu.groupId!, nextColor)
                  setContextMenu(null)
                }}
              >
                Change Color
              </button>
              <div className="my-1 h-px bg-zinc-800" />
              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left text-destructive transition-colors hover:bg-zinc-800 hover:text-destructive"
                onClick={(): void => {
                  useReactGraphStore
                    .getState()
                    .removeGroup(contextMenu.groupId!)
                  setContextMenu(null)
                }}
              >
                Delete Group
              </button>
            </>
          ) : (
            <>
              {/* Add Node Submenu */}
              <div
                className="relative flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onMouseEnter={(): void => {
                  setActiveSubmenu("categories")
                }}
              >
                <span>Add Node</span>
                <ChevronRight className="h-3 w-3 text-zinc-400" />

                {activeSubmenu === "categories" && (
                  <div
                    className="absolute top-0 left-full ml-1 flex max-h-80 w-48 flex-col overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/95 p-1 text-xs text-zinc-200 shadow-2xl backdrop-blur-md"
                    onMouseLeave={(): void => {
                      setActiveSubmenu(null)
                      setHoveredCategory(null)
                    }}
                  >
                    {Object.keys(nodeDefsByCategory).map((category) => (
                      <div
                        key={category}
                        className="relative flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                        onMouseEnter={(): void => {
                          setHoveredCategory(category)
                        }}
                      >
                        <span className="truncate pr-2">{category}</span>
                        <ChevronRight className="h-3 w-3 text-zinc-400" />

                        {hoveredCategory === category && (
                          <div
                            className="absolute top-0 left-full ml-1 flex max-h-80 w-56 flex-col overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/95 p-1 text-xs text-zinc-200 shadow-2xl backdrop-blur-md"
                            onClick={(ev): void => {
                              ev.stopPropagation()
                            }}
                          >
                            {nodeDefsByCategory[category]?.map((def) => (
                              <button
                                key={def.name}
                                className="flex w-full cursor-pointer items-center truncate rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                                onClick={(): void => {
                                  const worldPos = screenToWorld(
                                    contextMenu.screenX,
                                    contextMenu.screenY
                                  )
                                  addNode(def.name, worldPos, def)
                                  setContextMenu(null)
                                  setActiveSubmenu(null)
                                  setHoveredCategory(null)
                                }}
                                title={def.display_name ?? def.name}
                              >
                                {def.display_name ?? def.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onClick={(): void => {
                  const worldPos = screenToWorld(
                    contextMenu.screenX,
                    contextMenu.screenY
                  )
                  addGroup("New Group", [worldPos[0], worldPos[1], 400, 300])
                  setContextMenu(null)
                }}
              >
                Add Group
              </button>

              {useReactGraphStore.getState().selectedNodeIds.size > 0 && (
                <button
                  className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                  onClick={(): void => {
                    const store = useReactGraphStore.getState()
                    const selectedIds = Array.from(store.selectedNodeIds)
                    const selectedNodes = store.nodes.filter((n) =>
                      selectedIds.includes(n.id)
                    )
                    if (selectedNodes.length > 0) {
                      let minX = Infinity,
                        minY = Infinity,
                        maxX = -Infinity,
                        maxY = -Infinity
                      for (const n of selectedNodes) {
                        minX = Math.min(minX, n.pos[0])
                        minY = Math.min(minY, n.pos[1])
                        maxX = Math.max(maxX, n.pos[0] + n.size[0])
                        maxY = Math.max(maxY, n.pos[1] + n.size[1])
                      }
                      const padding = 20
                      addGroup("Group", [
                        minX - padding,
                        minY - padding - 30,
                        maxX - minX + padding * 2,
                        maxY - minY + padding * 2 + 30,
                      ])
                    }
                    setContextMenu(null)
                  }}
                >
                  Add Group For Selected Nodes
                </button>
              )}

              <div className="my-1 h-px bg-zinc-800" />

              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-800"
                onClick={(): void => {
                  setZoom(1.0)
                  setPan([0, 0])
                  setContextMenu(null)
                }}
              >
                Reset Zoom & Pan
              </button>
              <button
                className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left text-destructive transition-colors hover:bg-zinc-800 hover:text-destructive"
                onClick={(): void => {
                  clearGraph()
                  setContextMenu(null)
                }}
              >
                Clear Canvas
              </button>
            </>
          )}
        </div>
      )}
      {/* 5. 백그라운드 LiteGraph를 위한 숨겨진 Canvas
           display:none 대신 offscreen positioning 사용:
           - display:none이면 LGraphCanvas가 HTML widget element를 DOM에 붙여도
             렌더링/레이아웃이 안 일어나 확장의 lazy init(MutationObserver,
             requestAnimationFrame 등)이 트리거되지 않음
           - offscreen positioning은 눈에는 안 보이지만 레이아웃은 계산됨 */}
      <div
        ref={hiddenContainerRef}
        style={{
          position: "fixed",
          left: "-99999px",
          top: "-99999px",
          width: "1024px",
          height: "768px",
          overflow: "hidden",
          pointerEvents: "none",
          opacity: 0,
        }}
        aria-hidden="true"
      >
        <canvas ref={hiddenCanvasRef} id="graph-canvas" />
        {/* Some extensions look for this element to configure allowed file extensions */}
        <input type="file" id="comfy-file-input" style={{ display: "none" }} />
      </div>
    </div>
  )
}
