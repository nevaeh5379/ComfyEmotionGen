import { useEffect, useRef, useLayoutEffect } from "react"
import type { InputSpec } from "@/comfyui/types/nodeDef"

interface HTMLElementWidgetProps {
  element: HTMLElement
}

export function HTMLElementWidget({ element }: HTMLElementWidgetProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  // element가 실제로 container에 붙여졌을 때만 로그
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const wasAttached = element.parentNode === container
    if (!wasAttached) {
      element.style.display = "block"
      element.style.position = "relative"
      element.style.visibility = "visible"
      element.style.opacity = "1"
      element.style.width = "100%"
      element.style.height = "auto"

      container.innerHTML = ""
      container.appendChild(element)
      const childCount = element.childElementCount
      const htmlLen = element.innerHTML.length
      const bounding = element.getBoundingClientRect()
      console.log(`[CEG] HTMLElementWidget attach tag=${element.tagName} children=${String(childCount)} htmlLen=${String(htmlLen)} rect=${String(Math.round(bounding.width))}x${String(Math.round(bounding.height))}`)
    }
  }, [element])

  // unmount 시에만 element를 컨테이너에서 떼어낸다.
  useEffect(() => {
    return (): void => {
      console.log(`[CEG] HTMLElementWidget unmounting element tag=${element.tagName}`)
      if (element.parentNode !== null) {
        element.parentNode.removeChild(element)
      }
    }
  }, [element])

  return <div ref={containerRef} className="w-full min-h-[40px] text-foreground" />
}

interface ReactWidgetProps {
  name: string
  value: unknown
  spec: InputSpec | undefined
  onChange: (val: unknown) => void
  showLabel?: boolean
  disabled?: boolean
  element?: HTMLElement | null
  /** 호출 위치 식별용 (디버그) */
  source?: string
  widget?: any
  node?: any
}

interface CanvasWidgetProps {
  widget: any
  node: any
  width: number
  disabled?: boolean
}

export function CanvasWidget({ widget, node, width, disabled = false }: CanvasWidgetProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const height = typeof widget.computeSize === "function" 
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
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    let widgetY = widget.y ?? 0
    if (widgetY === 0 && node && node.widgets) {
      const idx = node.widgets.indexOf(widget)
      if (idx !== -1) {
        for (let i = 0; i < idx; i++) {
          const w = node.widgets[i]
          widgetY += typeof w.computeSize === "function" ? w.computeSize(width)[1] : (w.height ?? 30)
          widgetY += 4 // margin
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

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || typeof widget.mouse !== "function") return
    
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top

    let yOffset = 0
    if (node && node.widgets) {
      const idx = node.widgets.indexOf(widget)
      if (idx !== -1) {
        for (let i = 0; i < idx; i++) {
          const w = node.widgets[i]
          yOffset += typeof w.computeSize === "function" ? w.computeSize(width)[1] : (w.height ?? 30)
          yOffset += 4 // margin
        }
      }
    }

    const nodeRelativePos: [number, number] = [localX, localY + yOffset]

    try {
      const mockEvent = e.nativeEvent
      widget.mouse(mockEvent, nodeRelativePos, node)
      
      const onMouseMove = (moveEvent: MouseEvent) => {
        const moveRect = canvas.getBoundingClientRect()
        const mx = moveEvent.clientX - moveRect.left
        const my = moveEvent.clientY - moveRect.top
        widget.mouse(moveEvent, [mx, my + yOffset], node)
      }
      
      const onMouseUp = (upEvent: MouseEvent) => {
        const upRect = canvas.getBoundingClientRect()
        const ux = upEvent.clientX - upRect.left
        const uy = upEvent.clientY - upRect.top
        widget.mouse(upEvent, [ux, uy + yOffset], node)
        
        window.removeEventListener("mousemove", onMouseMove)
        window.removeEventListener("mouseup", onMouseUp)
        
        if (window.app?.syncGraphNode) {
          window.app.syncGraphNode(node.id)
        }
      }

      window.addEventListener("mousemove", onMouseMove)
      window.addEventListener("mouseup", onMouseUp)
    } catch (err) {
      console.error("[CEG] widget.mouse failed:", err)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      className="cursor-pointer select-none block"
      style={{ width, height }}
    />
  )
}

export function ReactWidget({ name, value, spec, onChange, showLabel = true, disabled = false, element, source: _source = "?", widget, node }: ReactWidgetProps): React.JSX.Element {
  const typeSpec = spec?.[0]
  const config = spec?.[1] ?? {}

  const isCombo = Array.isArray(typeSpec) || (typeof typeSpec === "string" && typeSpec.toUpperCase() === "COMBO")

  const isStandardType = (
    (typeof typeSpec === "string" && ["INT", "FLOAT", "STRING", "BOOLEAN", "NUMBER", "COMBO", "TOGGLE"].includes(typeSpec.toUpperCase()))
    || isCombo
  )

  const isCustomDOMElement = element && (
    !["SELECT", "INPUT", "TEXTAREA"].includes(element.tagName.toUpperCase())
  )

  if (isCustomDOMElement) {
    return <HTMLElementWidget element={element} />
  }

  if (widget && typeof widget.draw === "function" && !isStandardType) {
    const canvasWidth = (node?.size?.[0] !== undefined) ? (node.size[0] - 24) : 180
    return <CanvasWidget widget={widget} node={node} width={canvasWidth} disabled={disabled} />
  }

  if (element && !isStandardType) {
    return <HTMLElementWidget element={element} />
  }

  const typeName = String(typeSpec).toUpperCase()

  // 1.5 BUTTON 타입
  if (typeName === "BUTTON") {
    const btnLabel = name || String(value || "")
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          if (typeof widget?.callback === "function") {
            try {
              widget.callback(widget.value, window.app?.canvas, node)
            } catch (err) {
              console.error("[CEG] button callback failed:", err)
            }
          }
          if (node?.id) {
            window.app?.syncGraphNode?.(node.id)
          }
        }}
        className="w-full text-[11px] font-bold rounded border border-border bg-accent/30 hover:bg-accent/60 px-1.5 py-1 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-center select-none cursor-pointer"
      >
        {btnLabel}
      </button>
    )
  }

  // 1. COMBO 타입
  if (isCombo) {
    const options = Array.isArray(typeSpec) 
      ? typeSpec 
      : ((config.values as string[] | undefined) ?? (widget?.options?.values as string[] | undefined) ?? [])
    const strVal = typeof value === "string" ? value : (options[0] ?? "")

    return (
      <div className="flex flex-col gap-0.5">
        {showLabel && (
          <span className="text-[10px] text-muted-foreground font-bold truncate">
            {name}
          </span>
        )}
        <select
          value={strVal}
          onChange={(e) => { onChange(e.target.value); }}
          disabled={disabled}
          className="w-full text-[11px] rounded border border-input bg-background/50 px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring select-none disabled:opacity-50 disabled:cursor-not-allowed"
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

  // 2. BOOLEAN 타입 (토글 스위치/체크박스)
  if (typeName === "BOOLEAN") {
    const boolVal = value === true || value === 1 || value === "true"

    return (
      <div className="flex items-center justify-between hover:bg-accent/10 rounded px-1 py-0.5">
        {showLabel && (
          <span className="text-[10px] text-muted-foreground font-bold truncate">
            {name}
          </span>
        )}
        <input
          type="checkbox"
          checked={boolVal}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.checked); }}
          className="h-3 w-3 rounded border-input bg-background focus:ring-ring text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
    )
  }

  // 3. INT / FLOAT 수치 타입
  if (typeName === "INT" || typeName === "FLOAT") {
    const numVal = Number(value ?? config.default ?? 0)
    const isInt = typeName === "INT"

    const min = config.min !== undefined ? Number(config.min) : undefined
    const max = config.max !== undefined ? Number(config.max) : undefined
    const step = config.step !== undefined ? Number(config.step) : (isInt ? 1 : 0.1)

    return (
      <div className="flex flex-col gap-0.5">
        {showLabel && (
          <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold">
            <span className="truncate">{name}</span>
            <span className="mono text-[9px] opacity-75">{isNaN(numVal) ? "0" : String(numVal)}</span>
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
          className="w-full text-[11px] rounded border border-input bg-background/50 px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
    )
  }

  // 4. STRING 또는 기타 기본 텍스트 필드 (textarea for multiline support)
  const strVal = typeof value === "string" ? value : ""

  return (
    <div className="flex flex-col gap-0.5">
      {showLabel && (
        <span className="text-[10px] text-muted-foreground font-bold truncate">
          {name}
        </span>
      )}
      <textarea
        value={strVal}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); }}
        className="w-full min-h-[40px] text-[11px] rounded border border-input bg-background/50 px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed resize-y font-mono"
      />
    </div>
  )
}
