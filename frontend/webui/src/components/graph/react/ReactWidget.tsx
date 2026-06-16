import { useEffect, useRef } from "react"
import type { InputSpec } from "@/lib/comfy-graph/types/nodeDef"

interface HTMLElementWidgetProps {
  element: HTMLElement
}

export function HTMLElementWidget({ element }: HTMLElementWidgetProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear container first
    container.innerHTML = ""
    container.appendChild(element)

    return (): void => {
      if (element.parentNode === container) {
        container.removeChild(element)
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
  element?: HTMLElement | null | undefined
}

export function ReactWidget({ name, value, spec, onChange, showLabel = true, disabled = false, element }: ReactWidgetProps): React.ReactElement {
  if (element) {
    return <HTMLElementWidget element={element} />
  }

  const typeSpec = spec?.[0]
  const config = spec?.[1] ?? {}

  // 1. COMBO 타입 (배열 형식의 후보군이 지정된 경우)
  if (Array.isArray(typeSpec)) {
    const options = typeSpec
    const primitiveVal = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null
    const strVal = primitiveVal !== null ? String(primitiveVal) : options[0] ?? ""

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
            <option key={String(opt as string | number)} value={String(opt as string | number)}>
              {String(opt as string | number)}
            </option>
          ))}
        </select>
      </div>
    )
  }

  const typeName = String(typeSpec).toUpperCase()

  // 2. BOOLEAN 타입 (토글 스위치/체크박스)
  if (typeName === "BOOLEAN") {
    const boolVal = value === true

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

  // 4. STRING 또는 기타 기본 텍스트 필드
  const primitiveVal = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null
  const strVal = primitiveVal !== null ? String(primitiveVal) : ""

  return (
    <div className="flex flex-col gap-0.5">
      {showLabel && (
        <span className="text-[10px] text-muted-foreground font-bold truncate">
          {name}
        </span>
      )}
      <input
        type="text"
        value={strVal}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); }}
        className="w-full text-[11px] rounded border border-input bg-background/50 px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}
