/**
 * ReactNode - HTML/CSS로 그려지는 리액트 노드 컴포넌트
 */

import { useRef, useMemo, useLayoutEffect, useState } from "react"
import { useReactGraphStore } from "@/lib/comfy-graph/stores/reactGraphStore"
import { useNodeDefStore } from "@/lib/comfy-graph/stores/nodeDefStore"
import { ReactWidget } from "./ReactWidget"
import { X } from "lucide-react"
import type { ComfyNodeInput, ComfyNodeOutput } from "@/lib/comfy-graph/types/workflow"
import { LGraphEventMode } from "@/lib/comfy-graph/core/types/globalEnums"

interface ReactNodeProps {
  id: number
  type: string
  pos: [number, number]
  size: [number, number]
  selected: boolean
}

export function ReactNode({ id, type, pos, size, selected }: ReactNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [minHeight, setMinHeight] = useState(80)
  const sizeRef = useRef(size)
  sizeRef.current = size

  const updateNodePos  = useReactGraphStore((s) => s.updateNodePos)
  const updateNodeSize = useReactGraphStore((s) => s.updateNodeSize)
  const removeNode     = useReactGraphStore((s) => s.removeNode)
  const selectNode     = useReactGraphStore((s) => s.selectNode)
  const updateWidgetValue = useReactGraphStore((s) => s.updateWidgetValue)
  const changeNodeMode = useReactGraphStore((s) => s.changeNodeMode)
  const zoom = useReactGraphStore((s) => s.zoom)

  const getNodeDef = useNodeDefStore((s) => s.getNodeDef)
  const nodeDef    = useMemo(() => getNodeDef(type), [type, getNodeDef])
  const nodeData   = useReactGraphStore((s) => s.nodes.find((n) => n.id === id))

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const titleBar = content.previousElementSibling as HTMLElement | null
    const titleBarHeight = titleBar?.offsetHeight ?? 28
    const contentHeight = titleBarHeight + content.scrollHeight
    setMinHeight(contentHeight)
    if (sizeRef.current[1] < contentHeight) {
      updateNodeSize(id, [sizeRef.current[0], contentHeight])
    }
  }, [id, updateNodeSize, nodeData])

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
      const nextH = Math.max(minHeight, Math.round(startH + (ev.clientY - startMY) / zoom))
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
      const nextH = Math.max(minHeight, Math.round(startH + (ev.clientY - startMY) / zoom))
      updateNodeSize(id, [nextW, nextH])
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 정규화된 노드 데이터 (nodeDef fallback 포함) ───────────
  const { inputs, outputs, widgetNames, widgetSpecs } = useMemo(() => {
    const def = nodeDef
    let names: string[] = (nodeData?.properties?.widget_names as string[]) || []
    let ins: ComfyNodeInput[] = nodeData?.inputs ? [...nodeData.inputs] : []
    let outs: ComfyNodeOutput[] = nodeData?.outputs ? [...nodeData.outputs] : []

    // nodeDef 기반 fallback: inputs / outputs / widgetNames 생성
    if (def) {
      if (names.length === 0) {
        const req = def.input?.required ?? {}
        const opt = def.input?.optional ?? {}
        for (const [name, spec] of Object.entries({ ...req, ...opt })) {
          const typeSpec = spec[0]
          const isWidget =
            Array.isArray(typeSpec) ||
            ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"].includes(
              String(typeSpec).toUpperCase()
            )
          if (isWidget) names.push(name)
        }
      }

      if (ins.length === 0) {
        const req = def.input?.required ?? {}
        const opt = def.input?.optional ?? {}
        for (const [name, spec] of Object.entries({ ...req, ...opt })) {
          const typeSpec = spec[0]
          const isWidget =
            Array.isArray(typeSpec) ||
            ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"].includes(
              String(typeSpec).toUpperCase()
            )
          ins.push({
            name,
            type: String(typeSpec),
            ...(isWidget ? { widget: { name, config: spec[1] || {} } } : {}),
          })
        }
      }

      if (outs.length === 0 && def.output) {
        for (let i = 0; i < def.output.length; i++) {
          outs.push({
            name: def.output_name[i] || def.output[i] || `out_${i}`,
            type: def.output[i] || "*",
          })
        }
      }
    }

    // inputs 에 widget 속성이 없는데 widgetNames 에 포함되면 보충
    const nameSet = new Set(names)
    ins = ins.map((input) => {
      if (!input.widget && nameSet.has(input.name)) {
        return { ...input, widget: { name: input.name, config: {} } }
      }
      return input
    })

    const specs = {
      ...(def?.input?.required ?? {}),
      ...(def?.input?.optional ?? {}),
    }

    return { inputs: ins, outputs: outs, widgetNames: names, widgetSpecs: specs }
  }, [nodeDef, nodeData])

  const nodeMode = (nodeData?.mode ?? LGraphEventMode.ALWAYS) as LGraphEventMode
  const isBypassed = nodeMode === LGraphEventMode.BYPASS
  const isMuted    = nodeMode === LGraphEventMode.NEVER
  const isDisabled = isBypassed || isMuted

  // ─── 렌더 ───────────────────────────────────────────────────
  return (
    <div
      ref={nodeRef}
      data-node-id={id}
      className={`absolute rounded-lg border shadow-md flex flex-col select-none ${
        selected
          ? "border-primary ring-2 ring-primary/25 shadow-lg"
          : isMuted
            ? "border-zinc-700"
            : "border-border"
      } ${isMuted ? "opacity-50" : isBypassed ? "opacity-75" : "bg-background/95"}`}
      style={{
        left:   pos[0],
        top:    pos[1],
        width:  size[0],
        height: size[1],
        zIndex: selected ? 100 : 10,
        minWidth: 180,
        ...(isBypassed ? { backgroundColor: "rgba(120,120,120,0.35)" } : {}),
      }}
      onClick={(e) => {
        e.stopPropagation()
        selectNode(id, e.ctrlKey || e.metaKey)
      }}
    >
      {/* ── Title bar ─────────────────────────────────────── */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className={`shrink-0 flex items-center justify-between px-3 py-1.5 border-b rounded-t-lg cursor-grab active:cursor-grabbing text-xs font-bold text-foreground ${
          isMuted ? "bg-zinc-800/60 border-zinc-700" : isBypassed ? "bg-zinc-600/40 border-zinc-600/50" : "bg-muted/65 border-border"
        }`}
      >
        <span className="truncate">{nodeDef?.display_name || type}</span>
        <div className="flex items-center gap-1">
          {/* ── Mode toggle ── */}
          <button
            title={isBypassed ? "Bypass (off)" : isMuted ? "Muted (off)" : "Always (on)"}
            onClick={(e) => {
              e.stopPropagation()
              // Cycle: ALWAYS → BYPASS → NEVER → ALWAYS
              const next = isBypassed ? LGraphEventMode.NEVER : isMuted ? LGraphEventMode.ALWAYS : LGraphEventMode.BYPASS
              changeNodeMode(id, next)
            }}
            className={`text-[9px] font-bold px-1 py-0.5 rounded leading-none transition-colors ${
              isMuted
                ? "bg-red-950/60 text-red-400 hover:bg-red-900/60"
                : isBypassed
                  ? "bg-amber-950/60 text-amber-400 hover:bg-amber-900/60"
                  : "bg-green-950/60 text-green-400 hover:bg-green-900/60"
            }`}
          >
            {isMuted ? "OFF" : isBypassed ? "BYP" : "ON"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); removeNode(id) }}
            className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── Content (slots + widgets) ──────────────────────── */}
      <div ref={contentRef} className="flex-1 py-1 flex flex-col gap-0.5 text-[11px]">
        {/* Inputs & Outputs row */}
        <div className="grid grid-cols-2 gap-2 px-1">
          {/* Left: Pure Inputs (no widget) */}
          <div className="flex flex-col gap-0.5 items-start">
            {inputs.map((input, idx) => {
              if (input.widget) return null
              return (
                <div key={`in-${idx}`} className="flex items-center gap-1.5 text-left h-4 relative pl-3.5">
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
          <div className="flex flex-col gap-0.5 items-end ml-auto">
            {outputs.map((output, idx) => (
              <div key={`out-${idx}`} className="flex items-center gap-1.5 text-right h-4 relative pr-3.5">
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
        {inputs.some((i) => i.widget) && (
          <div className="flex flex-col border-t border-border/50 pt-1 gap-0">
            {inputs.map((input, idx) => {
              if (!input.widget) return null
              const widgetName = input.widget.name
              const widgetIdx = widgetNames.indexOf(widgetName)
              const widgetValue = widgetIdx !== -1 ? nodeData?.widgets_values?.[widgetIdx] : undefined

              return (
                <div key={`widget-in-${idx}`} className="flex flex-col gap-0 pr-2 py-0.5">
                  {/* 라벨 — 입력칸 위 */}
                  <span className="text-[10px] text-muted-foreground font-bold truncate pl-4">
                    {widgetName}
                  </span>
                  {/* 소켓 + 입력칸 한 줄 */}
                  <div className="flex items-center gap-1.5">
                    <div
                      data-slot-node-id={id}
                      data-slot-type="input"
                      data-slot-index={idx}
                      data-slot-datatype={input.type}
                      className={`shrink-0 w-2.5 h-2.5 rounded-full border border-background cursor-crosshair transition-colors ${
                        input.link ? "bg-green-500" : "bg-gray-400/70 hover:bg-green-400"
                      }`}
                      title={input.type}
                    />
                    <div className="flex-1 min-w-0">
                      {input.link ? (
                        <span className="text-[9px] text-green-500 font-mono">linked</span>
                      ) : (
                        <ReactWidget
                          name={widgetName}
                          value={widgetValue}
                          spec={widgetSpecs[widgetName]}
                          onChange={(newVal) => updateWidgetValue(id, widgetName, newVal)}
                          showLabel={false}
                          disabled={isDisabled}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pure widgets not exposed as inputs */}
        {(() => {
          const linkedWidgetNames = new Set(
            inputs.filter((i) => i.widget).map((i) => i.widget!.name)
          )
          const pureWidgets = widgetNames.filter((n) => !linkedWidgetNames.has(n))
          if (pureWidgets.length === 0) return null
          return (
            <div className="flex flex-col border-t border-border/50 pt-1 gap-0">
              {pureWidgets.map((name) => (
                <div key={`widget-${name}`} className="px-2 py-0.5">
                  <ReactWidget
                    name={name}
                    value={nodeData?.widgets_values?.[widgetNames.indexOf(name)]}
                    spec={widgetSpecs[name]}
                    onChange={(newVal) => updateWidgetValue(id, name, newVal)}
                    disabled={isDisabled}
                  />
                </div>
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
