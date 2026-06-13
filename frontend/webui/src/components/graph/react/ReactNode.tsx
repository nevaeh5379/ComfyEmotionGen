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

  const updateNodePos  = useReactGraphStore((s) => s.updateNodePos)
  const updateNodeSize = useReactGraphStore((s) => s.updateNodeSize)
  const removeNode     = useReactGraphStore((s) => s.removeNode)
  const selectNode     = useReactGraphStore((s) => s.selectNode)
  const updateWidgetValue = useReactGraphStore((s) => s.updateWidgetValue)
  const zoom = useReactGraphStore((s) => s.zoom)

  const getNodeDef = useNodeDefStore((s) => s.getNodeDef)
  const nodeDef    = useMemo(() => getNodeDef(type), [type, getNodeDef])
  const nodeData   = useReactGraphStore((s) => s.nodes.find((n) => n.id === id))

  // ─── 이동 드래그 ────────────────────────────────────────────
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()

    useReactGraphStore.getState().takeSnapshot()
    selectNode(id, e.ctrlKey || e.metaKey)

    const startX = pos[0], startY = pos[1]
    const startMX = e.clientX, startMY = e.clientY

    const onMove = (ev: MouseEvent) => {
      updateNodePos(id, [
        Math.round(startX + (ev.clientX - startMX) / zoom),
        Math.round(startY + (ev.clientY - startMY) / zoom),
      ])
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 너비 리사이즈 (우측 핸들) ──────────────────────────────
  const handleRightResize = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const startW = size[0], startMX = e.clientX

    const onMove = (ev: MouseEvent) => {
      const nextW = Math.max(180, Math.round(startW + (ev.clientX - startMX) / zoom))
      updateNodeSize(id, [nextW, size[1]])
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 높이 리사이즈 (하단 핸들) ──────────────────────────────
  const handleBottomResize = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const startH = size[1], startMY = e.clientY

    const onMove = (ev: MouseEvent) => {
      const nextH = Math.max(80, Math.round(startH + (ev.clientY - startMY) / zoom))
      updateNodeSize(id, [size[0], nextH])
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 코너 리사이즈 (우하단 핸들) ────────────────────────────
  const handleCornerResize = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const startW = size[0], startH = size[1]
    const startMX = e.clientX, startMY = e.clientY

    const onMove = (ev: MouseEvent) => {
      const nextW = Math.max(180, Math.round(startW + (ev.clientX - startMX) / zoom))
      const nextH = Math.max(80,  Math.round(startH + (ev.clientY - startMY) / zoom))
      updateNodeSize(id, [nextW, nextH])
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 위젯 스펙 ──────────────────────────────────────────────
  const widgetSpecs = useMemo(() => {
    const req = nodeDef?.input?.required ?? {}
    const opt = nodeDef?.input?.optional ?? {}
    return { ...req, ...opt }
  }, [nodeDef])

  const widgetNames = (nodeData?.properties?.widget_names as string[]) || []

  // ─── 렌더 ───────────────────────────────────────────────────
  return (
    <div
      ref={nodeRef}
      data-node-id={id}
      className={`absolute rounded-lg border bg-background/95 shadow-md flex flex-col select-none ${
        selected ? "border-primary ring-2 ring-primary/25 shadow-lg" : "border-border"
      }`}
      style={{
        left:   pos[0],
        top:    pos[1],
        width:  size[0],
        height: size[1],
        zIndex: selected ? 100 : 10,
        minWidth: 180,
        minHeight: 80,
      }}
      onClick={(e) => {
        e.stopPropagation()
        selectNode(id, e.ctrlKey || e.metaKey)
      }}
    >
      {/* ── Title bar ─────────────────────────────────────── */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/65 rounded-t-lg cursor-grab active:cursor-grabbing text-xs font-bold text-foreground"
      >
        <span className="truncate">{nodeDef?.display_name || type}</span>
        <button
          onClick={(e) => { e.stopPropagation(); removeNode(id) }}
          className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* ── Content (slots + widgets) ──────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2 flex flex-col gap-1.5 text-[11px]">
        {/* Inputs & Outputs row */}
        <div className="grid grid-cols-2 gap-2 px-1">
          {/* Left: Pure Inputs (no widget) */}
          <div className="flex flex-col gap-1 items-start">
            {nodeData?.inputs?.map((input, idx) => {
              if (input.widget) return null
              return (
                <div key={`in-${idx}`} className="flex items-center gap-1.5 text-left h-5 relative pl-3.5">
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
              )
            })}
          </div>

          {/* Right: Outputs */}
          <div className="flex flex-col gap-1 items-end ml-auto">
            {nodeData?.outputs?.map((output, idx) => (
              <div key={`out-${idx}`} className="flex items-center gap-1.5 text-right h-5 relative pr-3.5">
                <span className="truncate max-w-[80px] text-muted-foreground font-semibold">
                  {output.name}
                </span>
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

        {/* Widget Inputs (socket + widget inline) */}
        {nodeData?.inputs && nodeData.inputs.some((i) => i.widget) && (
          <div className="flex flex-col border-t border-border/50 pt-2 gap-1">
            {nodeData.inputs.map((input, idx) => {
              if (!input.widget) return null
              const widgetName = input.widget.name
              const widgetIdx = widgetNames.indexOf(widgetName)
              const widgetValue = widgetIdx !== -1 ? nodeData?.widgets_values?.[widgetIdx] : undefined

              return (
                <div key={`widget-in-${idx}`} className="flex flex-col gap-1 relative pl-6 pr-3 py-1">
                  {/* Socket handle for widget input */}
                  <div
                    data-slot-node-id={id}
                    data-slot-type="input"
                    data-slot-index={idx}
                    data-slot-datatype={input.type}
                    className={`absolute left-1.5 top-[14px] w-2.5 h-2.5 rounded-full border border-background cursor-crosshair transition-colors ${
                      input.link ? "bg-green-500" : "bg-gray-400/70 hover:bg-green-400"
                    }`}
                    title={input.type}
                  />

                  {input.link ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-bold truncate">
                        {widgetName}
                      </span>
                      <span className="text-[9px] text-green-500 font-mono">linked</span>
                    </div>
                  ) : (
                    <ReactWidget
                      name={widgetName}
                      value={widgetValue}
                      spec={widgetSpecs[widgetName]}
                      onChange={(newVal) => updateWidgetValue(id, widgetName, newVal)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pure widgets not exposed as inputs */}
        {(() => {
          const linkedWidgetNames = new Set(
            nodeData?.inputs?.filter((i) => i.widget).map((i) => i.widget!.name) ?? []
          )
          const pureWidgets = widgetNames.filter((n) => !linkedWidgetNames.has(n))
          if (pureWidgets.length === 0) return null
          return (
            <div className="flex flex-col border-t border-border/50 pt-2 gap-1">
              {pureWidgets.map((name) => (
                <ReactWidget
                  key={`widget-${name}`}
                  name={name}
                  value={nodeData?.widgets_values?.[widgetNames.indexOf(name)]}
                  spec={widgetSpecs[name]}
                  onChange={(newVal) => updateWidgetValue(id, name, newVal)}
                />
              ))}
            </div>
          )
        })()}
      </div>

      {/* ── Resize handles ────────────────────────────────── */}
      {/* Right edge — width */}
      <div
        onMouseDown={handleRightResize}
        className="absolute top-0 right-0 w-1.5 cursor-ew-resize"
        style={{ height: "calc(100% - 6px)", top: 0 }}
      />
      {/* Bottom edge — height */}
      <div
        onMouseDown={handleBottomResize}
        className="absolute bottom-0 left-0 h-1.5 cursor-ns-resize"
        style={{ width: "calc(100% - 6px)" }}
      />
      {/* Corner — both */}
      <div
        onMouseDown={handleCornerResize}
        className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize flex items-center justify-center"
      >
        <svg width="6" height="6" viewBox="0 0 6 6" className="text-border/70">
          <path d="M0 6 L6 0 M3 6 L6 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  )
}
