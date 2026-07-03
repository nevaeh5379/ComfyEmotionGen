import { useEffect, useRef, useLayoutEffect } from "react"
import type { InputSpec } from "@/comfyui/types/nodeDef"
import type { WidgetValue } from "@/comfyui/stores/widgetStore"

interface HTMLElementWidgetProps {
  element: HTMLElement
}

export function HTMLElementWidget({
  element,
}: HTMLElementWidgetProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<HTMLElement>(element)


  useLayoutEffect(() => {
    const el = elementRef.current
    const container = containerRef.current
    if (!container) return
    const wasAttached = el.parentNode === container
    if (!wasAttached) {
      el.style.display = "block"
      el.style.position = "relative"
      el.style.visibility = "visible"
      el.style.opacity = "1"
      el.style.width = "100%"
      el.style.height = "auto"

      container.innerHTML = ""
      container.appendChild(el)
      const childCount = el.childElementCount
      const htmlLen = el.innerHTML.length
      const bounding = el.getBoundingClientRect()
      console.log(
        `[CEG] HTMLElementWidget attach tag=${el.tagName} children=${String(childCount)} htmlLen=${String(htmlLen)} rect=${String(Math.round(bounding.width))}x${String(Math.round(bounding.height))}`
      )
    }
  })


  useEffect(() => {
    const el = elementRef.current
    return (): void => {
      console.log(
        `[CEG] HTMLElementWidget unmounting element tag=${el.tagName}`
      )
      if (el.parentNode !== null) {
        el.parentNode.removeChild(el)
      }
    }
  }, [])

  return (
    <div ref={containerRef} className="min-h-[40px] w-full text-foreground" />
  )
}

export interface CanvasWidget {
  type: string
  name: string
  value: WidgetValue
  element?: HTMLElement
  options: Record<string, unknown>
  callback:
    | ((value: WidgetValue, canvas?: unknown, node?: unknown) => void)
    | null
  computeSize?: (width: number) => [number, number]
  height?: number
  draw?: (
    ctx: CanvasRenderingContext2D,
    node: CanvasNode,
    width: number,
    y: number,
    height: number
  ) => void
  mouse?: (event: MouseEvent, pos: [number, number], node: CanvasNode) => void
  y?: number
}

export interface CanvasNode {
  id: number
  widgets?: CanvasWidget[]
  size?: [number, number]
}

interface ReactWidgetProps {
  name: string
  value: WidgetValue
  spec: InputSpec | undefined
  onChange: (val: WidgetValue) => void
  showLabel?: boolean
  disabled?: boolean
  element?: HTMLElement | null
  /** 호출 위치 식별용 (디버그) */
  source?: string
  widget?: CanvasWidget
  node?: CanvasNode
}

interface CanvasWidgetProps {
  widget: CanvasWidget
  node: CanvasNode
  width: number
  disabled?: boolean
}

export function CanvasWidget({
  widget,
  node,
  width,
  disabled = false,
}: CanvasWidgetProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const height =
    typeof widget.computeSize === "function"
      ? widget.computeSize(width)[1]
      : (widget.height ?? 30)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${String(width)}px`
    canvas.style.height = `${String(height)}px`
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    let widgetY = widget.y ?? 0
    if (widgetY === 0 && node.widgets !== undefined) {
      const idx = node.widgets.indexOf(widget)
      if (idx !== -1) {
        for (let i = 0; i < idx; i++) {
          const w = node.widgets[i]
          if (w !== undefined) {
            widgetY +=
              typeof w.computeSize === "function"
                ? w.computeSize(width)[1]
                : (w.height ?? 30)
            widgetY += 4 // margin
          }
        }
      }
    }

    if (typeof widget.draw === "function") {
      try {
        ctx.save()
        ctx.translate(0, -widgetY)
        widget.draw(ctx, node, width, widgetY, height)
        ctx.restore()
      } catch (err) {
        console.error("[CEG] widget.draw failed:", err)
      }
    }
  }, [widget, node, width, height])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (typeof widget.mouse !== "function") return

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()

    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top

    let yOffset = 0
    if (node.widgets !== undefined) {
      const idx = node.widgets.indexOf(widget)
      if (idx !== -1) {
        for (let i = 0; i < idx; i++) {
          const w = node.widgets[i]
          if (w !== undefined) {
            yOffset +=
              typeof w.computeSize === "function"
                ? w.computeSize(width)[1]
                : (w.height ?? 30);
            yOffset += 4 // margin
          }
        }
      }
    }

    const nodeRelativePos: [number, number] = [localX, localY + yOffset]

    try {
      const isNavArea = (widget as any).node && (localX >= (widget as any).node.size[0] - 44);
      
      if (!isNavArea) {
        try {
          const rawWidget = widget as any;
          let nextToggled = true;
          if (rawWidget.value) {
            rawWidget.value.toggled = !rawWidget.value.toggled;
            nextToggled = rawWidget.value.toggled;
          } else {
            rawWidget.toggled = !rawWidget.toggled;
            nextToggled = rawWidget.toggled;
          }

          if (typeof rawWidget.toggle === "function") {
            try { rawWidget.toggle(); } catch(e) {}
          }
          
          if (typeof rawWidget.doModeChange === "function") {
            try { rawWidget.doModeChange(); } catch(e) {}
          }



          if (rawWidget.group) {
            const group = rawWidget.group;
            const gx = group.pos[0];
            const gy = group.pos[1];
            const gw = group.size[0];
            const gh = group.size[1];
            
            const targetMode = nextToggled ? 0 : 2; // ALWAYS(0) / NEVER(2)
            const app = (window as any).app;
            if (app?.graph?.nodes) {
              app.graph.nodes.forEach((n: any) => {

                if (n.id === node.id || n.type === "Fast Groups Muter (rgthree)" || n.constructor?.name?.includes("Muter")) return;
                
                const x = n.pos[0];
                const y = n.pos[1];
                if (x >= gx && x <= gx + gw && y >= gy && y <= gy + gh) {
                  n.mode = targetMode; // 실메모리 모드 직접 대입
                }
              });
            }
          }
          console.log("[CEG] Direct child node Mute sync success! nextToggled:", nextToggled);
        } catch (err) {
          console.error("[CEG] Direct toggle invocation failed:", err);
        }
      }

      const triggerMouseFn = (evtType: "down" | "move" | "up", evt: Event, pos: [number, number]) => {
        const mappedType = evtType === "down" ? "mousedown"
                         : evtType === "move" ? "mousemove"
                         : evtType === "up" ? "mouseup"
                         : evt.type;
        
        const mappedEvent = Object.create(evt);
        Object.defineProperty(mappedEvent, "type", { value: mappedType, writable: true, configurable: true });

        const mouseFn = widget.mouse;
        if (typeof mouseFn === "function") {
          mouseFn.call(widget, mappedEvent, pos, node);
        }

        const rawWidget = widget as any;
        if (evtType === "down") {
          if (typeof rawWidget.onMouseDown === "function") {
            rawWidget.onMouseDown(mappedEvent, pos, node);
          }
        } else if (evtType === "move") {
          if (typeof rawWidget.onMouseMove === "function") {
            rawWidget.onMouseMove(mappedEvent, pos, node);
          }
        } else if (evtType === "up") {
          if (typeof rawWidget.onMouseUp === "function") {
            rawWidget.onMouseUp(mappedEvent, pos, node);
          }
          if (typeof rawWidget.onMouseClick === "function") {
            rawWidget.onMouseClick(mappedEvent, pos, node);
          }
        }
      };

      triggerMouseFn("down", e.nativeEvent, nodeRelativePos)
 
      const onPointerMove = (moveEvent: PointerEvent): void => {
        const moveRect = canvas.getBoundingClientRect()
        const mx = moveEvent.clientX - moveRect.left
        const my = moveEvent.clientY - moveRect.top
        triggerMouseFn("move", moveEvent, [mx, my + yOffset])
      }
 
      const onPointerUp = (upEvent: PointerEvent): void => {
        const upRect = canvas.getBoundingClientRect()
        const ux = upEvent.clientX - upRect.left
        const uy = upEvent.clientY - upRect.top
        triggerMouseFn("up", upEvent, [ux, uy + yOffset])
 
        window.removeEventListener("pointermove", onPointerMove)
        window.removeEventListener("pointerup", onPointerUp)
 
        if (typeof (window as any).app?.syncGraphNode === "function") {
          (window as any).app.syncGraphNode(node.id)
        }
      }
 
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", onPointerUp)
    } catch (err) {
      console.error("[CEG] widget.mouse failed:", err)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      className="block cursor-pointer select-none"
      style={{ width, height }}
    />
  )
}

export function ReactWidget({
  name,
  value,
  spec,
  onChange,
  showLabel = true,
  disabled = false,
  element,
  source: _source = "?",
  widget,
  node,
}: ReactWidgetProps): React.JSX.Element {
  const typeSpec = spec?.[0]
  const config = spec?.[1] ?? {}

  const isCombo =
    Array.isArray(typeSpec) ||
    (typeof typeSpec === "string" && typeSpec.toUpperCase() === "COMBO")

  const isStandardType =
    (typeof typeSpec === "string" &&
      [
        "INT",
        "FLOAT",
        "STRING",
        "BOOLEAN",
        "NUMBER",
        "COMBO",
        "TOGGLE",
      ].includes(typeSpec.toUpperCase())) ||
    isCombo

  const isCustomDOMElement =
    element !== null &&
    element !== undefined &&
    !["SELECT", "INPUT", "TEXTAREA"].includes(element.tagName.toUpperCase())

  if (isCustomDOMElement) {
    return <HTMLElementWidget element={element} />
  }

  if (widget && typeof widget.draw === "function" && !isStandardType && node) {
    const canvasWidth = node.size?.[0] !== undefined ? node.size[0] - 24 : 180
    return (
      <CanvasWidget
        widget={widget}
        node={node}
        width={canvasWidth}
        disabled={disabled}
      />
    )
  }

  if (element && !isStandardType) {
    return <HTMLElementWidget element={element} />
  }

  const typeName = String(typeSpec).toUpperCase()


  if (typeName === "BUTTON") {
    const btnLabel =
      name ||
      (typeof value === "string"
        ? value
        : typeof value === "number"
          ? String(value)
          : typeof value === "boolean"
            ? String(value)
            : "")
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          const w = widget
          if (w && typeof w.callback === "function") {
            try {
              w.callback(w.value, window.app.canvas, node)
            } catch (err) {
              console.error("[CEG] button callback failed:", err)
            }
          }
          if (node?.id !== undefined) {
            window.app.syncGraphNode?.(node.id)
          }
        }}
        className="w-full cursor-pointer rounded border border-border bg-accent/30 px-1.5 py-1 text-center text-[11px] font-bold text-foreground transition-colors select-none hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {btnLabel}
      </button>
    )
  }


  if (isCombo) {
    const options = Array.isArray(typeSpec)
      ? typeSpec
      : ((config.values as string[] | undefined) ??
        (widget
          ? (widget.options.values as string[] | undefined)
          : undefined) ??
        [])
    const strVal = typeof value === "string" ? value : (options[0] ?? "")

    return (
      <div className="flex flex-col gap-0.5">
        {showLabel && (
          <span className="truncate text-[10px] font-bold text-muted-foreground">
            {name}
          </span>
        )}
        <select
          value={strVal}
          onChange={(e) => {
            onChange(e.target.value)
          }}
          disabled={disabled}
          className="w-full rounded border border-input bg-background/50 px-1.5 py-0.5 text-[11px] text-foreground select-none focus:ring-1 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    )
  }


  if (typeName === "BOOLEAN") {
    const boolVal = value === true || value === 1 || value === "true"

    return (
      <div className="flex items-center justify-between rounded px-1 py-0.5 hover:bg-accent/10">
        {showLabel && (
          <span className="truncate text-[10px] font-bold text-muted-foreground">
            {name}
          </span>
        )}
        <input
          type="checkbox"
          checked={boolVal}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.checked)
          }}
          className="h-3 w-3 rounded border-input bg-background text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    )
  }


  if (typeName === "INT" || typeName === "FLOAT") {
    const parsed = typeof value === "number" ? value : Number(value)
    const numVal = Number.isFinite(parsed) ? parsed : 0
    const isInt = typeName === "INT"

    const min = config.min !== undefined ? Number(config.min) : undefined
    const max = config.max !== undefined ? Number(config.max) : undefined
    const step =
      config.step !== undefined ? Number(config.step) : isInt ? 1 : 0.1

    return (
      <div className="flex flex-col gap-0.5">
        {showLabel && (
          <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
            <span className="truncate">{name}</span>
            <span className="mono text-[9px] opacity-75">
              {isNaN(numVal) ? "0" : String(numVal)}
            </span>
          </div>
        )}
        <input
          type="number"
          value={isNaN(numVal) ? "" : numVal}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const rawVal = e.target.value
            if (rawVal === "") {
              onChange(isInt ? 0 : 0.0)
              return
            }
            const val = isInt ? parseInt(rawVal, 10) : parseFloat(rawVal)
            onChange(isNaN(val) ? 0 : val)
          }}
          className="w-full rounded border border-input bg-background/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground focus:ring-1 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    )
  }


  const strVal = typeof value === "string" ? value : ""

  return (
    <div className="flex flex-col gap-0.5">
      {showLabel && (
        <span className="truncate text-[10px] font-bold text-muted-foreground">
          {name}
        </span>
      )}
      <textarea
        value={strVal}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        className="min-h-[40px] w-full resize-y rounded border border-input bg-background/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground focus:ring-1 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}
