/**
 * ReactNode - HTML/CSS로 그려지는 리액트 노드 컴포넌트
 */

import { useRef, useMemo, useLayoutEffect, useState, type ReactNode } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { ReactWidget } from "./ReactWidget"
import { X } from "lucide-react"
import type { ComfyNodeInput, ComfyNodeOutput } from "@/comfyui/types/workflow"
const LGraphEventMode = LiteGraph.LGraphEventMode ?? {
  ALWAYS: 0,
  NEVER: 2,
  BYPASS: 4,
}
import type { InputSpec } from "@/comfyui/types/nodeDef"

interface LiveWidget {
  name: string
  type?: string
  value?: unknown
  callback?: ((value: unknown) => void) | null
  element?: HTMLElement | null
  options?: Record<string, unknown>
}

interface LiveSlot {
  name: string
  type: string | string[]
  link?: number | null
  links?: number[] | null
  widget?: LiveWidget | null
}

interface LiveNode {
  widgets?: LiveWidget[]
  inputs?: LiveSlot[]
  outputs?: LiveSlot[]
  properties?: Record<string, unknown>
}

interface App {
  graph?: {
    getNodeById: (id: number) => LiveNode | undefined
  }
  syncGraphNode?: (id: number) => void
}

function getLiveNode(id: number): LiveNode | undefined {
  return (window as unknown as { app?: App }).app?.graph?.getNodeById(id)
}

function getApp(): App | undefined {
  return (window as unknown as { app?: App }).app
}

interface ReactNodeProps {
  id: number
  type: string
  pos: [number, number]
  size: [number, number]
  selected: boolean
}

export function ReactNode({ id, type, pos, size, selected }: ReactNodeProps): ReactNode {
  const nodeRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [minHeight, setMinHeight] = useState(80)
  const sizeRef = useRef(size)
  useLayoutEffect(() => {
    sizeRef.current = size
  })

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
  const handleHeaderMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    e.stopPropagation()

    useReactGraphStore.getState().takeSnapshot()
    selectNode(id, e.ctrlKey || e.metaKey)

    const startX = pos[0], startY = pos[1]
    const startMX = e.clientX, startMY = e.clientY

    const onMove = (ev: MouseEvent): void => {
      updateNodePos(id, [
        Math.round(startX + (ev.clientX - startMX) / zoom),
        Math.round(startY + (ev.clientY - startMY) / zoom),
      ])
    }
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 너비 리사이즈 (우측 핸들) ──────────────────────────────
  const handleRightResize = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const startW = size[0], startMX = e.clientX

    const onMove = (ev: MouseEvent): void => {
      const nextW = Math.max(180, Math.round(startW + (ev.clientX - startMX) / zoom))
      updateNodeSize(id, [nextW, size[1]])
    }
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 높이 리사이즈 (하단 핸들) ──────────────────────────────
  const handleBottomResize = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const startH = size[1], startMY = e.clientY

    const onMove = (ev: MouseEvent): void => {
      const nextH = Math.max(minHeight, Math.round(startH + (ev.clientY - startMY) / zoom))
      updateNodeSize(id, [size[0], nextH])
    }
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 코너 리사이즈 (우하단 핸들) ────────────────────────────
  const handleCornerResize = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const startW = size[0], startH = size[1]
    const startMX = e.clientX, startMY = e.clientY

    const onMove = (ev: MouseEvent): void => {
      const nextW = Math.max(180, Math.round(startW + (ev.clientX - startMX) / zoom))
      const nextH = Math.max(minHeight, Math.round(startH + (ev.clientY - startMY) / zoom))
      updateNodeSize(id, [nextW, nextH])
    }
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
  }

  // ─── 정규화된 노드 데이터 (nodeDef fallback 및 liveNode 지원) ──
  const liveNode = useMemo(() => {
    return getLiveNode(id)
  }, [id])

  const { inputs, outputs, widgetNames, widgetSpecs } = useMemo(() => {
    let names: string[] = []
    let ins: ComfyNodeInput[] = []
    let outs: ComfyNodeOutput[] = []
    const specs: Record<string, InputSpec> = {}

    if (liveNode) {
      if (liveNode.widgets) {
        names = liveNode.widgets.map((w: LiveWidget) => w.name)
        for (const w of liveNode.widgets) {
          specs[w.name] = [w.type ?? "string", w.options ?? {}]
        }
      }
      if (liveNode.inputs) {
        ins = liveNode.inputs.map((slot: LiveSlot) => ({
          name: slot.name,
          type: String(slot.type),
          link: slot.link ?? undefined,
          widget: slot.widget
            ? { name: slot.widget.name, config: {} }
            : undefined,
        }))
      }
      if (liveNode.outputs) {
        outs = liveNode.outputs.map((slot: LiveSlot, i: number) => ({
          name: slot.name,
          type: String(slot.type),
          links: slot.links ?? undefined,
          slot_index: i,
        }))
      }
    } else {
      names = (nodeData?.properties?.widget_names as string[] | undefined) ?? []
      ins = nodeData?.inputs !== undefined ? [...nodeData.inputs] : []
      outs = nodeData?.outputs !== undefined ? [...nodeData.outputs] : []

      const req = nodeDef?.input?.required ?? {}
      const opt = nodeDef?.input?.optional ?? {}
      for (const [name, spec] of Object.entries({ ...req, ...opt })) {
        const inputSpec = spec
        const typeSpec = inputSpec[0]
        const typeStr = typeof typeSpec === "string" ? typeSpec : ""
        const isWidget =
          Array.isArray(typeSpec) ||
          ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"].includes(typeStr.toUpperCase())
        if (isWidget) names.push(name)
      }

      if (ins.length === 0) {
        for (const [name, spec] of Object.entries({ ...req, ...opt })) {
          const inputSpec = spec
          const typeSpec = inputSpec[0]
          const typeStr = typeof typeSpec === "string" ? typeSpec : ""
          const isWidget =
            Array.isArray(typeSpec) ||
            ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"].includes(typeStr.toUpperCase())
          ins.push({
            name,
            type: String(typeSpec),
            ...(isWidget ? { widget: { name, config: inputSpec[1] ?? {} } } : {}),
          })
        }
      }

      if (outs.length === 0 && nodeDef) {
        for (let i = 0; i < nodeDef.output.length; i++) {
          outs.push({
            name: nodeDef.output_name[i] ?? nodeDef.output[i] ?? `out_${String(i)}`,
            type: nodeDef.output[i] ?? "*",
          })
        }
      }

      const allSpecs = {
        ...(nodeDef?.input?.required ?? {}),
        ...(nodeDef?.input?.optional ?? {}),
      }
      for (const [name, spec] of Object.entries(allSpecs)) {
        specs[name] = spec
      }
    }

    const nameSet = new Set(names)
    ins = ins.map((input) => {
      if (!input.widget && nameSet.has(input.name)) {
        return { ...input, widget: { name: input.name, config: {} } }
      }
      return input
    })

    return { inputs: ins, outputs: outs, widgetNames: names, widgetSpecs: specs }
  }, [nodeDef, nodeData, liveNode])

  const LGraphEventModeValues = LGraphEventMode
  const nodeMode = nodeData?.mode ?? LGraphEventModeValues.ALWAYS
  const isBypassed = nodeMode === LGraphEventModeValues.BYPASS
  const isMuted    = nodeMode === LGraphEventModeValues.NEVER
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
        <span className="truncate">{nodeDef?.display_name ?? type}</span>
        <div className="flex items-center gap-1">
          {/* ── Mode toggle ── */}
          <button
            title={isBypassed ? "Bypass (off)" : isMuted ? "Muted (off)" : "Always (on)"}
            onClick={(e) => {
              e.stopPropagation()
              // Cycle: ALWAYS → BYPASS → NEVER → ALWAYS
              const next = isBypassed ? LGraphEventModeValues.NEVER : isMuted ? LGraphEventModeValues.ALWAYS : LGraphEventModeValues.BYPASS
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
                <div key={`in-${String(idx)}`} className="flex items-center gap-1.5 text-left h-4 relative pl-3.5">
                  <div
                    data-slot-node-id={id}
                    data-slot-type="input"
                    data-slot-index={idx}
                    data-slot-name={input.name}
                    data-slot-datatype={input.type}
                    className={`absolute left-0 w-2.5 h-2.5 rounded-full border border-background cursor-crosshair transition-colors ${
                      input.link !== undefined ? "bg-green-500" : "bg-gray-400/70 hover:bg-green-400"
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
              <div key={`out-${String(idx)}`} className="flex items-center gap-1.5 text-right h-4 relative pr-3.5">
                <span className="truncate max-w-[80px] text-muted-foreground font-semibold">
                  {output.name}
                </span>
                <div
                  data-slot-node-id={id}
                  data-slot-type="output"
                  data-slot-index={idx}
                  data-slot-name={output.name}
                  data-slot-datatype={output.type}
                  className={`absolute right-0 w-2.5 h-2.5 rounded-full border border-background cursor-crosshair transition-colors ${
                    output.links !== undefined && output.links.length > 0
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
                <div key={`widget-in-${String(idx)}`} className="flex flex-col gap-0 pr-2 py-0.5">
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
                    data-slot-name={input.name}
                    data-slot-datatype={input.type}
                    className={`shrink-0 w-2.5 h-2.5 rounded-full border border-background cursor-crosshair transition-colors ${
                      input.link !== undefined ? "bg-green-500" : "bg-gray-400/70 hover:bg-green-400"
                    }`}
                    title={input.type}
                  />
                    <div className="flex-1 min-w-0">
                      {input.link !== undefined ? (
                        <span className="text-[9px] text-green-500 font-mono">linked</span>
                      ) : (
                        <ReactWidget
                          name={widgetName}
                          value={widgetValue}
                          spec={widgetSpecs[widgetName]}
                          onChange={(newVal) => {
                            updateWidgetValue(id, widgetName, newVal)
                            const liveW = liveNode?.widgets?.find((w: LiveWidget) => w.name === widgetName)
                            if (liveW) {
                              liveW.value = newVal
                              if (liveW.callback) {
                                try {
                                  liveW.callback(newVal)
                                } catch (err) {
                                  void err
                                }
                              }
                            }
                            getApp()?.syncGraphNode?.(id)
                          }}
                          showLabel={false}
                          disabled={isDisabled}
                          element={liveNode?.widgets?.find((w: LiveWidget) => w.name === widgetName)?.element ?? null}
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
        {(() : ReactNode | null => {
          const linkedWidgetNames = new Set<string>()
          for (const i of inputs) {
            if (i.widget !== undefined) {
              linkedWidgetNames.add(i.widget.name)
            }
          }
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
                    onChange={(newVal) => {
                      updateWidgetValue(id, name, newVal)
                      const liveW = liveNode?.widgets?.find((w: LiveWidget) => w.name === name)
                      if (liveW) {
                        liveW.value = newVal
                        if (liveW.callback) {
                          try {
                            liveW.callback(newVal)
                          } catch (err) {
                            void err
                          }
                        }
                      }
                      getApp()?.syncGraphNode?.(id)
                    }}
                    disabled={isDisabled}
                    element={liveNode?.widgets?.find((w: LiveWidget) => w.name === name)?.element ?? null}
                  />
                </div>
              ))}
            </div>
          )
        })()}

        {/* Custom HTML injected by properties */}
        {(() : ReactNode | null => {
          const rawHtml = liveNode?.properties?.html ?? liveNode?.properties?.custom_html ?? liveNode?.properties?.text_html ?? nodeData?.properties?.html ?? nodeData?.properties?.custom_html
          const customHtml = typeof rawHtml === "string" ? rawHtml : ""
          if (!customHtml) return null
          return (
            <div
              className="border-t border-border/50 p-2 overflow-auto max-h-[250px] text-xs text-foreground bg-accent/5 select-text lm-custom-html"
              dangerouslySetInnerHTML={{ __html: customHtml }}
              onMouseDown={(e) => { e.stopPropagation() }}
            />
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
