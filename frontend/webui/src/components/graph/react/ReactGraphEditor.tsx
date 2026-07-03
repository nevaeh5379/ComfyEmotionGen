/**
 * ReactGraphEditor - React/DOM/SVG 기반 메인 노드 그래프 에디터
 */

import { useRef } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { SvgConnections } from "./SvgConnections"
import { useComfyRuntimeBridge } from "./useComfyRuntimeBridge"
import { useExecutionStatusBridge } from "./useExecutionStatusBridge"
import { useConnectionDrag } from "./useConnectionDrag"
import { useViewportControls } from "./useViewportControls"
import { useGraphKeyboardShortcuts } from "./useGraphKeyboardShortcuts"
import { GraphContextMenu } from "./GraphContextMenu"
import { useGraphContextMenu } from "./useGraphContextMenu"
import { GroupLayer, NodeLayer } from "./GraphLayers"
import { SubgraphBreadcrumb } from "./SubgraphBreadcrumb"

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
  useGraphKeyboardShortcuts()

  const deselectAll = useReactGraphStore((s) => s.deselectAll)
  const connect = useReactGraphStore((s) => s.connect)
  const addNode = useReactGraphStore((s) => s.addNode)
  const addGroup = useReactGraphStore((s) => s.addGroup)
  const clearGraph = useReactGraphStore((s) => s.clearGraph)

  const nodeDefsByCategory = useNodeDefStore((s) => s.nodeDefsByCategory)
  const {
    menu: contextMenu,
    openMenu,
    closeMenu,
  } = useGraphContextMenu({
    containerRef,
  })
  const {
    zoom,
    pan,
    setZoom,
    setPan,
    handleWorkspaceMouseDown,
    screenToWorld,
  } = useViewportControls({
    containerRef,
    onWorkspacePanStart: closeMenu,
  })
  const { activeDragPin, tempLinkEnd, tempLinkPath, linkColor } =
    useConnectionDrag({
      containerRef,
      zoom,
      pan,
      connect,
    })

  return (
    <div
      ref={containerRef}
      onMouseDown={handleWorkspaceMouseDown}
      onContextMenu={openMenu}
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

      {contextMenu && (
        <GraphContextMenu
          menu={contextMenu}
          nodeDefsByCategory={nodeDefsByCategory}
          screenToWorld={screenToWorld}
          addNode={addNode}
          addGroup={addGroup}
          setZoom={setZoom}
          setPan={setPan}
          clearGraph={clearGraph}
          deselectAll={deselectAll}
          onClose={closeMenu}
        />
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
