/**
 * ReactNode - HTML/CSS로 그려지는 리액트 노드 컴포넌트
 */

import { useRef, useMemo } from "react"
import { useReactGraphStore } from "@/lib/comfy-graph/stores/reactGraphStore"
import { useNodeDefStore } from "@/lib/comfy-graph/stores/nodeDefStore"
import { ReactWidget } from "./ReactWidget"
import { X } from "lucide-react"

interface ReactNodeProps {
  id: number
  type: string
  pos: [number, number]
  size: [number, number]
  selected: boolean
}

export function ReactNode({ id, type, pos, size, selected }: ReactNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null)
  
  const updateNodePos = useReactGraphStore((s) => s.updateNodePos)
  const removeNode = useReactGraphStore((s) => s.removeNode)
  const selectNode = useReactGraphStore((s) => s.selectNode)
  const updateWidgetValue = useReactGraphStore((s) => s.updateWidgetValue)
  const zoom = useReactGraphStore((s) => s.zoom)
  
  const getNodeDef = useNodeDefStore((s) => s.getNodeDef)
  const nodeDef = useMemo(() => getNodeDef(type), [type, getNodeDef])

  const nodeData = useReactGraphStore((s) => s.nodes.find((n) => n.id === id))

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    // Left click only
    if (e.button !== 0) return
    e.stopPropagation()

    // Take snapshot of graph before dragging starts
    useReactGraphStore.getState().takeSnapshot()

    // Select this node
    selectNode(id, e.ctrlKey || e.metaKey)

    const startX = pos[0]
    const startY = pos[1]
    const startMouseX = e.clientX
    const startMouseY = e.clientY

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouseX
      const dy = ev.clientY - startMouseY
      
      // 스케일에 맞춰 드래그 델타 분배
      const nextX = Math.round(startX + dx / zoom)
      const nextY = Math.round(startY + dy / zoom)

      updateNodePos(id, [nextX, nextY])
    }

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  // 노드 위젯 정의 리스트 매핑
  const widgetSpecs = useMemo(() => {
    const req = nodeDef?.input?.required ?? {}
    const opt = nodeDef?.input?.optional ?? {}
    return { ...req, ...opt }
  }, [nodeDef])

  const widgetNames = (nodeData?.properties?.widget_names as string[]) || []

  return (
    <div
      ref={nodeRef}
      data-node-id={id}
      className={`absolute rounded-lg border bg-background/95 shadow-md flex flex-col min-w-[210px] select-none transition-shadow ${
        selected ? "border-primary ring-2 ring-primary/25 shadow-lg" : "border-border"
      }`}
      style={{
        left: pos[0],
        top: pos[1],
        width: size[0],
        zIndex: selected ? 100 : 10,
      }}
      onClick={(e) => {
        e.stopPropagation()
        selectNode(id, e.ctrlKey || e.metaKey)
      }}
    >
      {/* Title bar */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/65 rounded-t-lg cursor-grab active:cursor-grabbing text-xs font-bold text-foreground select-none"
      >
        <span className="truncate">{nodeDef?.display_name || type}</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeNode(id)
          }}
          className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Slots & Widgets container */}
      <div className="flex-1 py-2 flex flex-col gap-1.5 text-[11px]">
        {/* Inputs & Outputs (Slots) */}
        <div className="grid grid-cols-2 gap-2 px-1">
          {/* Left: Inputs */}
          <div className="flex flex-col gap-1 items-start">
            {nodeData?.inputs?.map((input, idx) => (
              <div
                key={`in-${idx}`}
                className="flex items-center gap-1.5 text-left h-5 relative pl-3.5"
              >
                {/* Connection Pin */}
                <div
                  data-slot-node-id={id}
                  data-slot-type="input"
                  data-slot-index={idx}
                  data-slot-datatype={input.type}
                  className={`absolute left-0 w-2.5 h-2.5 rounded-full border border-background cursor-crosshair transition-colors ${
                    input.link ? "bg-green-500" : "bg-gray-400/70 hover:bg-green-400"
                  }`}
                  title={input.type}
                />
                <span className="truncate max-w-[80px] text-muted-foreground font-semibold">
                  {input.name}
                </span>
              </div>
            ))}
          </div>

          {/* Right: Outputs */}
          <div className="flex flex-col gap-1 items-end ml-auto">
            {nodeData?.outputs?.map((output, idx) => (
              <div
                key={`out-${idx}`}
                className="flex items-center gap-1.5 text-right h-5 relative pr-3.5"
              >
                <span className="truncate max-w-[80px] text-muted-foreground font-semibold">
                  {output.name}
                </span>
                {/* Connection Pin */}
                <div
                  data-slot-node-id={id}
                  data-slot-type="output"
                  data-slot-index={idx}
                  data-slot-datatype={output.type}
                  className={`absolute right-0 w-2.5 h-2.5 rounded-full border border-background cursor-crosshair transition-colors ${
                    output.links && output.links.length > 0
                      ? "bg-green-500"
                      : "bg-gray-400/70 hover:bg-green-400"
                  }`}
                  title={output.type}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Widgets */}
        {widgetNames.length > 0 && (
          <div className="flex flex-col border-t border-border/50 pt-2 gap-1">
            {widgetNames.map((name, idx) => {
              const val = nodeData?.widgets_values?.[idx]
              const spec = widgetSpecs[name]

              return (
                <ReactWidget
                  key={`widget-${idx}`}
                  name={name}
                  value={val}
                  spec={spec}
                  onChange={(newVal) => updateWidgetValue(id, name, newVal)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
