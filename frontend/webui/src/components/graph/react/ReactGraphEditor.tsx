/**
 * ReactGraphEditor - React/DOM/SVG 기반 메인 노드 그래프 에디터
 */

import { useRef, useState, useEffect, useMemo, memo } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { useSubgraphNavigationStore } from "@/comfyui/stores/subgraphNavigationStore"
import { ReactNode } from "./ReactNode"
import { SvgConnections } from "./SvgConnections"
import { ChevronRight } from "lucide-react"
import { ComfyAppService } from "@/comfyui/services/appService"
import { widgetStore, type WidgetValue } from "@/comfyui/stores/widgetStore"
import { useShallow } from "zustand/react/shallow"


const NodeLayerItem = memo(function NodeLayerItem({ id }: { id: number }): JSX.Element | null {
  const node = useReactGraphStore(useShallow((s) => s.nodes.find((n) => n.id === id) ?? null))
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
  const nodeIds = useReactGraphStore(useShallow((s) => {
    const activeId = s.activeGraphId
    return s.nodes
      .filter((n) =>
        activeId === null
          ? (n.graphId === null || n.graphId === undefined)
          : n.graphId === activeId
      )
      .map((n) => n.id)
  }))
  return (
    <>
      {nodeIds.map((id) => (
        <NodeLayerItem key={`node-${String(id)}`} id={id} />
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
    <div className="absolute top-2 left-2 z-[500] flex items-center gap-1 bg-zinc-900/80 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200 backdrop-blur-sm">
      <button
        className="px-1.5 py-0.5 rounded hover:bg-zinc-700 transition-colors cursor-pointer"
        onClick={(): void => { navigateToRoot() }}
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
              className={`px-1.5 py-0.5 rounded hover:bg-zinc-700 transition-colors cursor-pointer ${isCurrent ? "text-zinc-100 font-semibold" : ""}`}
              onClick={(): void => { navigateToLevel(i + 1) }}
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
          <span className="px-1.5 py-0.5 text-zinc-100 font-semibold">{activeSubgraph.name}</span>
        </span>
      ) : null}
    </div>
  )
}


export function ReactGraphEditor(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null)
  const hiddenContainerRef = useRef<HTMLDivElement>(null)

  const [isReady, setIsReady] = useState(false)
  const nodeDefs = useNodeDefStore((s) => s.nodeDefs)

  const zoom = useReactGraphStore((s) => s.zoom)
  const pan = useReactGraphStore((s) => s.pan)
  const setZoom = useReactGraphStore((s) => s.setZoom)
  const setPan = useReactGraphStore((s) => s.setPan)
  const _selectNode = useReactGraphStore((s) => s.selectNode)
  const deselectAll = useReactGraphStore((s) => s.deselectAll)
  const connect = useReactGraphStore((s) => s.connect)
  const addNode = useReactGraphStore((s) => s.addNode)
  const clearGraph = useReactGraphStore((s) => s.clearGraph)

  const nodeDefsByCategory = useNodeDefStore((s) => s.nodeDefsByCategory)

  // 백그라운드 LiteGraph 및 익스텐션 초기화
  useEffect(() => {
    let cancelled = false
    async function initApp(): Promise<void> {
      const rawApp = window.app
      console.log("[CEG:DEBUG ReactGraphEditor] useEffect START, hiddenCanvas=" + String(!!hiddenCanvasRef.current), "hiddenContainer=" + String(!!hiddenContainerRef.current), "extensionsLoaded=" + String(rawApp.extensionsLoaded ?? false), "app.graph=" + String(true), "nodeDefs=" + String(Object.keys(nodeDefs).length), "extensions=" + String(rawApp.extensions.length));

      if (!hiddenCanvasRef.current || !hiddenContainerRef.current) {
        console.log("[CEG:DEBUG ReactGraphEditor] SKIPPED: refs null");
        return;
      }

      // 1. 백그라운드 ComfyAppService 인스턴스 먼저 생성 (ext.init() 전에 실제 graph 필요)
      console.log("[CEG:DEBUG ReactGraphEditor] Step 1: Creating ComfyAppService with nodeDefs count:", String(Object.keys(nodeDefs).length));

      const appService = new ComfyAppService({
        canvas: hiddenCanvasRef.current,
        container: hiddenContainerRef.current,
        nodeDefs,
      })
      rawApp.graph = appService.graph as unknown as LGraph
      rawApp.canvas = appService.canvas
      rawApp.extensionManager = appService.extensionManager
      rawApp.api = appService.api
      rawApp.syncGraphNode = (nodeId: number): void => {
        const liveNode = appService.graph.getNodeById(nodeId)
        if (liveNode === null) return
        const widgetsValues = (liveNode as { widgets?: { value: unknown }[] }).widgets?.map((w) => w.value as WidgetValue) ?? []
        useReactGraphStore.setState({
          nodes: useReactGraphStore.getState().nodes.map((n) =>
            n.id === nodeId ? { ...n, widgets_values: widgetsValues } : n
          ),
        })
      }
      ;(rawApp.graph as unknown as Record<string, unknown>)._canvas = appService.canvas
      appService.canvas.app = rawApp

      window.__comfyAppService = appService

      // 2. 익스텐션 로드 및 init (실제 graph/canvas 위에서 실행)
      if (rawApp.extensionsLoaded !== true) {
        const apiClient: { getExtensions(): Promise<string[]>; api_base: string } = window.api
        try {
          const extensionUrls = await apiClient.getExtensions()
          console.log("[CEG:DEBUG ReactGraphEditor] Step 2a: Got extension URLs:", String(extensionUrls.length), extensionUrls);
          // 병렬로 import()를 시작하고, 배열 순서대로 await하여 등록 순서를 보존합니다.
          const fullUrls = extensionUrls.map((url) => url.startsWith("http") ? url : `${apiClient.api_base}${url}`);
          console.log("[CEG:DEBUG ReactGraphEditor] Importing extensions in parallel:", fullUrls.length);
          const importPromises = fullUrls.map((fullUrl) => import(/* @vite-ignore */ fullUrl).then(() => fullUrl).catch((err: unknown) => { console.error(`Failed to load extension: ${fullUrl}`, err); return null; }));
          for (const promise of importPromises) {
            const result = await promise;
            if (result !== null) {
              console.log("[CEG:DEBUG ReactGraphEditor] Import success:", result);
            }
          }
        } catch (err) {
          console.error("Failed to fetch extension list:", err)
        }
        rawApp.extensionsLoaded = true

        console.log("[CEG:DEBUG ReactGraphEditor] Step 2b: Extensions registered:", String(rawApp.extensions.length), rawApp.extensions.map(e => e.name));

        // Re-register node defs NOW that extensions' beforeRegisterNodeDef hooks are available
        console.log("[CEG:DEBUG ReactGraphEditor] Step 2c: Re-registering node defs with extensions available");
        appService.registerNodeDefs(nodeDefs)

        for (const ext of rawApp.extensions) {
          if (ext.init !== undefined) {
            try {
              console.log("[CEG:DEBUG ReactGraphEditor] Calling ext.init for:", ext.name);
              await ext.init(rawApp)
            } catch (err) {
              console.error(`Extension init failed for ${ext.name}:`, err)
            }
          }
        }

        // Register custom widget types from extensions' getCustomWidgets()
        for (const ext of rawApp.extensions) {
          if (ext.getCustomWidgets !== undefined) {
            try {
              const customWidgets = await ext.getCustomWidgets(rawApp)
              if (customWidgets !== undefined && customWidgets !== null) {
                const factories = customWidgets
                const typeNames = Object.keys(factories)
                // 타입 이름 등록 + 실제 팩토리 함수 저장
                widgetStore.registerMany(typeNames)
                for (const [typeName, factory] of Object.entries(factories)) {
                  if (typeof factory === "function") {
                    widgetStore.registerCustomWidgetFactory(
                      typeName,
                      factory as Parameters<typeof widgetStore.registerCustomWidgetFactory>[1]
                    )
                  }
                }
                if (typeNames.length > 0) {
                  console.log("[CEG:DEBUG ReactGraphEditor] Registered custom widgets from", ext.name, typeNames);
                }
              }
            } catch (err) {
              console.error(`Extension getCustomWidgets failed for ${ext.name}:`, err)
            }
          }
        }

        for (const ext of rawApp.extensions) {
          if (ext.registerCustomNodes !== undefined) {
            try {
              console.log("[CEG:DEBUG ReactGraphEditor] Calling ext.registerCustomNodes for:", ext.name);
              await ext.registerCustomNodes(rawApp)
            } catch (err) {
              console.error(`Extension registerCustomNodes failed for ${ext.name}:`, err)
            }
          }
        }
      }

      if (cancelled) return

      // setup 훅 실행
      for (const ext of rawApp.extensions) {
        if (ext.setup !== undefined) {
          try {
            console.log("[CEG:DEBUG ReactGraphEditor] Calling ext.setup for:", ext.name);
            await ext.setup(rawApp)
          } catch (err) {
            console.error(`Extension setup failed for ${ext.name}:`, err)
          }
        }
      }

      // 최초 그래프 상태 동기화
      const state = useReactGraphStore.getState()
      console.log("[CEG:DEBUG ReactGraphEditor] Step 3: Syncing initial state, nodes in store:", String(state.nodes.length));
      if (state.nodes.length > 0) {
        const workflow = {
          last_node_id: Math.max(0, ...state.nodes.map(n => n.id)),
          last_link_id: Math.max(0, ...state.links.map(l => l.id)),
          nodes: state.nodes,
          links: state.links,
          version: 0.4,
        }
        console.log("[CEG:DEBUG ReactGraphEditor] Calling loadGraphData with", String(workflow.nodes.length), "nodes");
        appService.loadGraphData(workflow)
        console.log("[CEG:DEBUG ReactGraphEditor] loadGraphData complete, graph now has", String((appService.graph as unknown as { nodes: unknown[] }).nodes.length), "nodes");
      }

      setIsReady(true)
    }

    void initApp()

    return (): void => {
      cancelled = true
    }
  }, [nodeDefs])

  // ComfyUI 백엔드 실행 상태 WebSocket 이벤트 리스너 등록
  useEffect(() => {
    const api = window.api

    const handleExecutionStart = (e: Event): void => {
      const customEvent = e as CustomEvent<Record<string, unknown>>
      const detail = customEvent.detail
      console.log("[CEG] execution_start:", detail)
      useReactGraphStore.setState({
        executionStatus: "running",
        executingPromptId: detail.prompt_id as string | null ?? null,
        executingNodeId: null,
        executedNodeIds: new Set<number>(),
        overallProgress: null,
      })
    }

    const handleExecuting = (e: Event): void => {
      const customEvent = e as CustomEvent<Record<string, unknown>>
      const detail = customEvent.detail

      let nodeId: unknown = null
      let promptId: string | null = null

      if (typeof detail === "object") {
        nodeId = detail.node
        promptId = (detail.prompt_id as string | null) ?? null
      } else {
        nodeId = detail
      }

      const nodeIdNum = nodeId !== null && nodeId !== undefined && nodeId !== "" ? Number(nodeId) : null
      console.log("[CEG] executing node:", nodeIdNum, "promptId:", promptId)

      const store = useReactGraphStore.getState()
      const nextExecuted = new Set(store.executedNodeIds)

      // If we move to a new node, the previous node must have finished executing
      if (store.executingNodeId !== null && store.executingNodeId !== nodeIdNum) {
        nextExecuted.add(store.executingNodeId)
      }

      const updateObj: Partial<typeof store> = {
        executingNodeId: nodeIdNum,
        executedNodeIds: nextExecuted,
      }

      if (promptId !== null) {
        updateObj.executingPromptId = promptId
      }

      if (nodeIdNum !== null && store.executionStatus === "idle") {
        updateObj.executionStatus = "running"
      }

      useReactGraphStore.setState(updateObj)
    }

    const handleProgress = (e: Event): void => {
      const customEvent = e as CustomEvent<Record<string, unknown>>
      const detail = customEvent.detail
      const store = useReactGraphStore.getState()
      console.log("[CEG] progress:", detail)

      const updateObj: Partial<typeof store> = {
        overallProgress: {
          value: detail.value as number,
          max: detail.max as number,
        }
      }

      if (detail.prompt_id !== null) {
        updateObj.executingPromptId = detail.prompt_id as string
      }
      if (store.executionStatus === "idle") {
        updateObj.executionStatus = "running"
      }

      useReactGraphStore.setState(updateObj)
    }

    const handleExecuted = (e: Event): void => {
      const customEvent = e as CustomEvent<Record<string, unknown>>
      const detail = customEvent.detail
      const store = useReactGraphStore.getState()
      const nextExecuted = new Set(store.executedNodeIds)
      if (detail.node !== null && detail.node !== undefined) {
        nextExecuted.add(Number(detail.node))
      }
      console.log("[CEG] executed node:", Number(detail.node))

      const updateObj: Partial<typeof store> = {
        executedNodeIds: nextExecuted
      }
      if (detail.prompt_id !== null) {
        updateObj.executingPromptId = detail.prompt_id as string
      }
      if (store.executionStatus === "idle") {
        updateObj.executionStatus = "running"
      }

      useReactGraphStore.setState(updateObj)
    }

    const handleExecutionCached = (e: Event): void => {
      const customEvent = e as CustomEvent<Record<string, unknown>>
      const detail = customEvent.detail
      const store = useReactGraphStore.getState()
      const nextExecuted = new Set(store.executedNodeIds)
      if (Array.isArray(detail.nodes)) {
        detail.nodes.forEach((n: unknown) => {
          nextExecuted.add(Number(n))
        })
      }
      console.log("[CEG] execution_cached nodes:", detail.nodes)

      const updateObj: Partial<typeof store> = {
        executedNodeIds: nextExecuted
      }
      if (detail.prompt_id !== null) {
        updateObj.executingPromptId = detail.prompt_id as string
      }
      if (store.executionStatus === "idle") {
        updateObj.executionStatus = "running"
      }

      useReactGraphStore.setState(updateObj)
    }

    const handleExecutionSuccess = (e: Event): void => {
      const customEvent = e as CustomEvent<Record<string, unknown>>
      const detail = customEvent.detail
      const store = useReactGraphStore.getState()
      console.log("[CEG] execution_success:", detail)
      
      if (store.executingPromptId !== null && (detail.prompt_id as string | null | undefined) !== null && (detail.prompt_id as string | null | undefined) !== undefined && store.executingPromptId !== (detail.prompt_id as string)) {
        return
      }

      const nextExecuted = new Set(store.executedNodeIds)
      if (store.executingNodeId !== null) {
        nextExecuted.add(store.executingNodeId)
      }

      useReactGraphStore.setState({
        executionStatus: "success",
        executingNodeId: null,
        executedNodeIds: nextExecuted,
        overallProgress: store.overallProgress ? { value: store.overallProgress.max, max: store.overallProgress.max } : null,
      })
      
      setTimeout(() => {
        const current = useReactGraphStore.getState()
        if (current.executionStatus === "success") {
          useReactGraphStore.setState({
            executionStatus: "idle",
            executingPromptId: null,
            executedNodeIds: new Set<number>(),
            overallProgress: null,
          })
        }
      }, 3000)
    }

    const handleExecutionError = (_e: Event): void => {
      console.log("[CEG] execution_error")
      useReactGraphStore.setState({
        executionStatus: "error",
        executingNodeId: null,
        overallProgress: null,
      })
    }

    const handleExecutionInterrupted = (_e: Event): void => {
      console.log("[CEG] execution_interrupted")
      useReactGraphStore.setState({
        executionStatus: "interrupted",
        executingNodeId: null,
        overallProgress: null,
      })
      setTimeout(() => {
        const current = useReactGraphStore.getState()
        if (current.executionStatus === "interrupted") {
          useReactGraphStore.setState({
            executionStatus: "idle",
            executingPromptId: null,
            executedNodeIds: new Set<number>(),
            overallProgress: null,
          })
        }
      }, 3000)
    }

    api.addEventListener("execution_start", handleExecutionStart)
    api.addEventListener("executing", handleExecuting)
    api.addEventListener("progress", handleProgress)
    api.addEventListener("executed", handleExecuted)
    api.addEventListener("execution_cached", handleExecutionCached)
    api.addEventListener("execution_success", handleExecutionSuccess)
    api.addEventListener("execution_error", handleExecutionError)
    api.addEventListener("execution_interrupted", handleExecutionInterrupted)

    return (): void => {
      api.removeEventListener("execution_start", handleExecutionStart)
      api.removeEventListener("executing", handleExecuting)
      api.removeEventListener("progress", handleProgress)
      api.removeEventListener("executed", handleExecuted)
      api.removeEventListener("execution_cached", handleExecutionCached)
      api.removeEventListener("execution_success", handleExecutionSuccess)
      api.removeEventListener("execution_error", handleExecutionError)
      api.removeEventListener("execution_interrupted", handleExecutionInterrupted)
    }
  }, [])

  // 드래그 중인 핀 및 임시 선 끝점 관리
  const [activeDragPin, setActiveDragPin] = useState<{
    nodeId: number
    type: "input" | "output"
    index: number
    datatype: string
  } | null>(null)
  const [tempLinkEnd, setTempLinkEnd] = useState<[number, number] | null>(null)
  const [dragStartPinPos, setDragStartPinPos] = useState<[number, number] | null>(null)

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
  } | null>(null)

  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)

  // 마우스로 빈 공간 드래그 시 팬(Pan) 처리
  const handleWorkspaceMouseDown = (e: React.MouseEvent): void => {
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
      const newPanX = mouseX - (mouseX - pan[0]) / zoom * nextZoom
      const newPanY = mouseY - (mouseY - pan[1]) / zoom * nextZoom

      setZoom(nextZoom)
      setPan([newPanX, newPanY])
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return (): void => { container.removeEventListener("wheel", handleWheel); }
  }, [zoom, pan, setZoom, setPan])

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
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const target = e.target as HTMLElement
    const nodeEl = target.closest("[data-node-id]")
    const idAttr = nodeEl?.getAttribute("data-node-id")
    const clickedNodeId = idAttr !== undefined && idAttr !== null ? parseInt(idAttr, 10) : undefined

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
      className="relative w-full h-full overflow-hidden bg-[#18181b] select-none"
      style={{
        backgroundImage: "radial-gradient(#27272a 1.2px, transparent 1.2px)",
        backgroundSize: `${String(20 * zoom)}px ${String(20 * zoom)}px`,
        backgroundPosition: `${String(pan[0])}px ${String(pan[1])}px`,
      }}
    >
      {!isReady && (
        <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center bg-[#18181b] text-zinc-400 gap-2 font-medium">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          <span>Extensions / Live graph loading...</span>
        </div>
      )}

      <SubgraphBreadcrumb />
      {/* Zoom / Pan Wrapper */}
      <div
        className="absolute inset-0 origin-top-left overflow-visible pointer-events-none"
        style={{
          transform: `translate(${String(pan[0])}px, ${String(pan[1])}px) scale(${String(zoom)})`,
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
          <NodeLayer />
        </div>
      </div>

      {/* 4. 컨텍스트 메뉴 (Context Menu) */}
      {contextMenu && (
        <div
          className="context-menu-container absolute bg-zinc-900/95 border border-zinc-800 rounded-lg shadow-2xl p-1 text-xs text-zinc-200 z-[1000] w-48 backdrop-blur-md flex flex-col"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e): void => { e.stopPropagation(); }}
        >
          {contextMenu.nodeId !== undefined ? (
            <>
              <button
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer text-destructive hover:text-destructive"
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
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                onClick={(): void => {
                  deselectAll()
                  setContextMenu(null)
                }}
              >
                Deselect
              </button>
              <button
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
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
                const node = store.nodes.find((n) => n.id === contextMenu.nodeId)
                if (!node) return null
                const isSubgraphInstance = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.type)
                if (!isSubgraphInstance) return null
                return (
                  <button
                    className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                    onClick={(): void => {
                      useSubgraphNavigationStore.getState().navigateTo(node.type)
                      setContextMenu(null)
                    }}
                  >
                    Enter Subgraph
                  </button>
                )
              })()}
            </>
          ) : (
            <>
              {/* Add Node Submenu */}
              <div
                className="relative flex items-center justify-between w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                onMouseEnter={(): void => { setActiveSubmenu("categories"); }}
              >
                <span>Add Node</span>
                <ChevronRight className="h-3 w-3 text-zinc-400" />

                {activeSubmenu === "categories" && (
                  <div
                    className="absolute left-full top-0 ml-1 bg-zinc-900/95 border border-zinc-800 rounded-lg shadow-2xl p-1 text-xs text-zinc-200 w-48 max-h-80 overflow-y-auto backdrop-blur-md flex flex-col"
                    onMouseLeave={(): void => {
                      setActiveSubmenu(null)
                      setHoveredCategory(null)
                    }}
                  >
                    {Object.keys(nodeDefsByCategory).map((category) => (
                      <div
                        key={category}
                        className="relative flex items-center justify-between w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                        onMouseEnter={(): void => { setHoveredCategory(category); }}
                      >
                        <span className="truncate pr-2">{category}</span>
                        <ChevronRight className="h-3 w-3 text-zinc-400" />

                        {hoveredCategory === category && (
                          <div
                            className="absolute left-full top-0 ml-1 bg-zinc-900/95 border border-zinc-800 rounded-lg shadow-2xl p-1 text-xs text-zinc-200 w-56 max-h-80 overflow-y-auto backdrop-blur-md flex flex-col"
                            onClick={(ev): void => { ev.stopPropagation(); }}
                          >
                            {nodeDefsByCategory[category]?.map((def) => (
                              <button
                                key={def.name}
                                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer truncate"
                                onClick={(): void => {
                                  const worldPos = screenToWorld(contextMenu.screenX, contextMenu.screenY)
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

              <div className="h-px bg-zinc-800 my-1" />

              <button
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                onClick={(): void => {
                  setZoom(1.0)
                  setPan([0, 0])
                  setContextMenu(null)
                }}
              >
                Reset Zoom & Pan
              </button>
              <button
                className="flex items-center w-full px-2.5 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors cursor-pointer text-destructive hover:text-destructive"
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
        <canvas ref={hiddenCanvasRef} />
        {/* VHS and other extensions look for this element to configure allowed file extensions */}
        <input type="file" id="comfy-file-input" style={{ display: "none" }} />
      </div>
    </div>
  )
}
