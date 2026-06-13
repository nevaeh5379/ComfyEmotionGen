/**
 * ReactGraphEditor - React/DOM/SVG 기반 메인 노드 그래프 에디터
 */

import { useRef, useState, useEffect, useMemo } from "react"
import { useReactGraphStore } from "@/lib/comfy-graph/stores/reactGraphStore"
import { useNodeDefStore } from "@/lib/comfy-graph/stores/nodeDefStore"
import { ReactNode } from "./ReactNode"
import { SvgConnections } from "./SvgConnections"
import { ChevronRight } from "lucide-react"

export function ReactGraphEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  const nodes = useReactGraphStore((s) => s.nodes)
  const zoom = useReactGraphStore((s) => s.zoom)
  const pan = useReactGraphStore((s) => s.pan)
  const setZoom = useReactGraphStore((s) => s.setZoom)
  const setPan = useReactGraphStore((s) => s.setPan)
  const selectNode = useReactGraphStore((s) => s.selectNode)
  const deselectAll = useReactGraphStore((s) => s.deselectAll)
  const connect = useReactGraphStore((s) => s.connect)
  const addNode = useReactGraphStore((s) => s.addNode)
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
    nodeId?: number
  } | null>(null)

  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)

  // 마우스로 빈 공간 드래그 시 팬(Pan) 처리
  const handleWorkspaceMouseDown = (e: React.MouseEvent) => {
    // Middle button always pans; left button only pans when clicking empty space
    const isMiddle = e.button === 1
    const isLeft = e.button === 0
    if (!isLeft && !isMiddle) return

    // 노드, 핀, 컨텍스트 메뉴 위를 클릭했으면 팬 안함
    const target = e.target as HTMLElement
    const isOnNode = !!target.closest("[data-node-id]")
    const isOnPin = !!target.closest("[data-slot-node-id]")
    const isOnMenu = !!target.closest(".context-menu-container")
    if (!isMiddle && (isOnNode || isOnPin || isOnMenu)) return

    e.preventDefault()
    deselectAll()
    setContextMenu(null)

    const startPanX = pan[0]
    const startPanY = pan[1]
    const startMouseX = e.clientX
    const startMouseY = e.clientY

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouseX
      const dy = ev.clientY - startMouseY
      setPan([startPanX + dx, startPanY + dy])
    }

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  // 마우스 휠 스크롤 줌(Zoom) 처리
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const zoomFactor = 1.08
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor

    // 마우스 위치 기준으로 확대/축소: 마우스가 가리키던 월드 좌표를 유지하도록 pan 보정
    const newPanX = mouseX - (mouseX - pan[0]) / zoom * nextZoom
    const newPanY = mouseY - (mouseY - pan[1]) / zoom * nextZoom

    setZoom(nextZoom)
    setPan([newPanX, newPanY])
  }

  // 화면 좌표(Screen) -> 캔버스 월드 좌표(World) 변환
  const screenToWorld = (screenX: number, screenY: number): [number, number] => {
    if (!containerRef.current) return [screenX, screenY]
    const rect = containerRef.current.getBoundingClientRect()
    const relativeX = screenX - rect.left
    const relativeY = screenY - rect.top
    return [
      (relativeX - pan[0]) / zoom,
      (relativeY - pan[1]) / zoom,
    ]
  }

  // 우클릭 컨텍스트 메뉴 핸들러
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const target = e.target as HTMLElement
    const nodeEl = target.closest("[data-node-id]")
    const clickedNodeId = nodeEl ? parseInt(nodeEl.getAttribute("data-node-id") || "", 10) : undefined

    setContextMenu({
      x,
      y,
      screenX: e.clientX,
      screenY: e.clientY,
      nodeId: clickedNodeId,
    })
    setActiveSubmenu(null)
    setHoveredCategory(null)
  }

  // 드래그 중인 임시 연결선의 시작점 좌표 계산
  const dragStartPinPos = useMemo(() => {
    if (!activeDragPin || !containerRef.current) return null
    const containerRect = containerRef.current.getBoundingClientRect()
    
    const selector = `[data-slot-node-id="${activeDragPin.nodeId}"][data-slot-type="${activeDragPin.type}"][data-slot-index="${activeDragPin.index}"]`
    const pinEl = containerRef.current.querySelector(selector)
    if (!pinEl) return null

    const pinRect = pinEl.getBoundingClientRect()
    return [
      (pinRect.left - containerRect.left + pinRect.width / 2 - pan[0]) / zoom,
      (pinRect.top - containerRect.top + pinRect.height / 2 - pan[1]) / zoom,
    ] as [number, number]
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

    return `M ${p1[0]} ${p1[1]} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`
  }, [dragStartPinPos, tempLinkEnd, activeDragPin])

  // 타입 매칭 검사 헬퍼
  const isValidConnection = (typeA: string, typeB: string): boolean => {
    if (!typeA || typeA === "" || typeA === "*") return true
    if (!typeB || typeB === "" || typeB === "*") return true

    const aStr = typeA.toLowerCase()
    const bStr = typeB.toLowerCase()

    if (aStr === bStr) return true

    const typesA = aStr.split(",")
    const typesB = bStr.split(",")
    for (const ta of typesA) {
      for (const tb of typesB) {
        const cleanA = ta.trim()
        const cleanB = tb.trim()
        if (!cleanA || cleanA === "*" || !cleanB || cleanB === "*") return true
        if (cleanA === cleanB) return true
      }
    }

    return false
  }

  const isHoveredPinCompatible = useMemo(() => {
    if (!activeDragPin || !hoveredPin) return false
    if (activeDragPin.nodeId === hoveredPin.nodeId) return false
    if (activeDragPin.type === hoveredPin.type) return false
    return isValidConnection(activeDragPin.datatype, hoveredPin.datatype)
  }, [activeDragPin, hoveredPin])

  const linkColor = useMemo(() => {
    if (!hoveredPin) return "#3b82f6" // Default blue
    return isHoveredPinCompatible ? "#10b981" : "#ef4444" // Green if compatible, Red if not
  }, [hoveredPin, isHoveredPinCompatible])

  // 전역 마우스 무브 및 마우스 업 핸들러 (연결 드래그용)
  useEffect(() => {
    if (!activeDragPin) return

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      
      // 마우스 위치를 월드 좌표계(1x)로 변환
      const mouseX = (e.clientX - containerRect.left - pan[0]) / zoom
      const mouseY = (e.clientY - containerRect.top - pan[1]) / zoom
      setTempLinkEnd([mouseX, mouseY])
    }

    const handleGlobalMouseUp = () => {
      // 마우스를 뗀 곳에 반대편 타입의 다른 노드 핀이 올라와 있고, 타입이 호환되는 경우에만 연결 체결
      if (hoveredPin && hoveredPin.nodeId !== activeDragPin.nodeId && hoveredPin.type !== activeDragPin.type) {
        if (isHoveredPinCompatible) {
          const outPin = activeDragPin.type === "output" ? activeDragPin : hoveredPin
          const inPin = activeDragPin.type === "input" ? activeDragPin : hoveredPin

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

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [activeDragPin, hoveredPin, zoom, pan, connect, isHoveredPinCompatible])

  // 핀 이벤트 위임 설정 (핀 드래깅 연동)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.matches("[data-slot-node-id]")) {
        e.preventDefault()
        e.stopPropagation()
        
        const nodeId = parseInt(target.getAttribute("data-slot-node-id") || "", 10)
        const type = target.getAttribute("data-slot-type") as "input" | "output"
        const index = parseInt(target.getAttribute("data-slot-index") || "", 10)
        const datatype = target.getAttribute("data-slot-datatype") || "*"

        setActiveDragPin({ nodeId, type, index, datatype })
        
        // 초기 끝점 설정
        const containerRect = container.getBoundingClientRect()
        const mouseX = (e.clientX - containerRect.left - pan[0]) / zoom
        const mouseY = (e.clientY - containerRect.top - pan[1]) / zoom
        setTempLinkEnd([mouseX, mouseY])
      }
    }

    const handleMouseEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.matches("[data-slot-node-id]")) {
        const nodeId = parseInt(target.getAttribute("data-slot-node-id") || "", 10)
        const type = target.getAttribute("data-slot-type") as "input" | "output"
        const index = parseInt(target.getAttribute("data-slot-index") || "", 10)
        const datatype = target.getAttribute("data-slot-datatype") || "*"

        setHoveredPin({ nodeId, type, index, datatype })
      }
    }

    const handleMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.matches("[data-slot-node-id]")) {
        setHoveredPin(null)
      }
    }

    container.addEventListener("mousedown", handleMouseDown)
    container.addEventListener("mouseover", handleMouseEnter)
    container.addEventListener("mouseout", handleMouseLeave)

    return () => {
      container.removeEventListener("mousedown", handleMouseDown)
      container.removeEventListener("mouseover", handleMouseEnter)
      container.removeEventListener("mouseout", handleMouseLeave)
    }
  }, [zoom, pan])

  // 키보드 단축키 처리 (Delete/Backspace로 노드 삭제, Ctrl+Z/Y로 실행취소/재실행)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  // 외부 클릭 시 컨텍스트 메뉴 닫기
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest(".context-menu-container")) {
        setContextMenu(null)
        setActiveSubmenu(null)
        setHoveredCategory(null)
      }
    }
    document.addEventListener("mousedown", handleDocumentClick)
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick)
    }
  }, [])

  const selectedNodeIds = useReactGraphStore((s) => s.selectedNodeIds)

  return (
    <div
      ref={containerRef}
      onMouseDown={handleWorkspaceMouseDown}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      className="relative w-full h-full overflow-hidden bg-[#18181b] select-none"
      style={{
        backgroundImage: "radial-gradient(#27272a 1.2px, transparent 1.2px)",
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${pan[0]}px ${pan[1]}px`,
      }}
    >
      {/* Zoom / Pan Wrapper */}
      <div
        className="absolute inset-0 origin-top-left overflow-visible pointer-events-none"
        style={{
          transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${zoom})`,
        }}
      >
        {/* Interactive nodes and edges inside transformed wrapper */}
        <div className="absolute inset-0 pointer-events-auto overflow-visible">
          {/* 1. SVG 연결선 레이어 */}
          <SvgConnections />

          {/* 2. 임시 드래깅 연결선 그리기 */}
          {activeDragPin && tempLinkEnd && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-50">
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
          {nodes.map((node) => (
            <ReactNode
              key={`node-${node.id}`}
              id={node.id}
              type={node.type}
              pos={node.pos}
              size={node.size}
              selected={selectedNodeIds.has(node.id)}
            />
          ))}
        </div>
      </div>

      {/* 4. 컨텍스트 메뉴 (Context Menu) */}
      {contextMenu && (
        <div
          className="context-menu-container absolute bg-zinc-900/95 border border-zinc-800 rounded-lg shadow-2xl p-1 text-xs text-zinc-200 z-[1000] w-48 backdrop-blur-md flex flex-col"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.nodeId !== undefined ? (
            <>
              <button
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer text-destructive hover:text-destructive"
                onClick={() => {
                  useReactGraphStore.getState().removeNode(contextMenu.nodeId!)
                  setContextMenu(null)
                }}
              >
                Delete Node
              </button>
              <button
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                onClick={() => {
                  deselectAll()
                  setContextMenu(null)
                }}
              >
                Deselect
              </button>
            </>
          ) : (
            <>
              {/* Add Node Submenu */}
              <div
                className="relative flex items-center justify-between w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                onMouseEnter={() => setActiveSubmenu("categories")}
              >
                <span>Add Node</span>
                <ChevronRight className="h-3 w-3 text-zinc-400" />
                
                {activeSubmenu === "categories" && (
                  <div
                    className="absolute left-full top-0 ml-1 bg-zinc-900/95 border border-zinc-800 rounded-lg shadow-2xl p-1 text-xs text-zinc-200 w-48 max-h-80 overflow-y-auto backdrop-blur-md flex flex-col"
                    onMouseLeave={() => {
                      setActiveSubmenu(null)
                      setHoveredCategory(null)
                    }}
                  >
                    {Object.keys(nodeDefsByCategory).map((category) => (
                      <div
                        key={category}
                        className="relative flex items-center justify-between w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                        onMouseEnter={() => setHoveredCategory(category)}
                      >
                        <span className="truncate pr-2">{category}</span>
                        <ChevronRight className="h-3 w-3 text-zinc-400" />
                        
                        {hoveredCategory === category && (
                          <div
                            className="absolute left-full top-0 ml-1 bg-zinc-900/95 border border-zinc-800 rounded-lg shadow-2xl p-1 text-xs text-zinc-200 w-56 max-h-80 overflow-y-auto backdrop-blur-md flex flex-col"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            {nodeDefsByCategory[category]?.map((def) => (
                              <button
                                key={def.name}
                                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer truncate"
                                onClick={() => {
                                  const worldPos = screenToWorld(contextMenu.screenX, contextMenu.screenY)
                                  addNode(def.name, worldPos, def)
                                  setContextMenu(null)
                                  setActiveSubmenu(null)
                                  setHoveredCategory(null)
                                }}
                                title={def.display_name || def.name}
                              >
                                {def.display_name || def.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-px bg-zinc-800 my-1" />

              <button
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                onClick={() => {
                  setZoom(1.0)
                  setPan([0, 0])
                  setContextMenu(null)
                }}
              >
                Reset Zoom & Pan
              </button>
              <button
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer text-destructive hover:text-destructive"
                onClick={() => {
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
    </div>
  )
}
