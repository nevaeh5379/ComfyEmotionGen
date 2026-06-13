/**
 * ReactWidget - HTML 기반 노드 위젯 컴포넌트
 */

import type { InputSpec } from "@/lib/comfy-graph/types/nodeDef"

interface ReactWidgetProps {
  name: string
  value: unknown
  spec: InputSpec | undefined
  onChange: (val: unknown) => void
}

export function ReactWidget({ name, value, spec, onChange }: ReactWidgetProps) {
  const typeSpec = spec?.[0]
  const config = spec?.[1] || {}

  // 1. COMBO 타입 (배열 형식의 후보군이 지정된 경우)
  if (Array.isArray(typeSpec)) {
    const options = typeSpec
    const strVal = String(value ?? options[0] ?? "")

    return (
      <div className="flex flex-col gap-1 px-3 py-1">
        <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold">
          <span className="truncate">{name}</span>
        </div>
        <select
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-xs rounded border border-input bg-background/50 px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring select-none"
        >
          {options.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </div>
    )
  }

  const typeName = String(typeSpec).toUpperCase()

  // 2. BOOLEAN 타입 (토글 스위치/체크박스)
  if (typeName === "BOOLEAN") {
    const boolVal = !!value

    return (
      <div className="flex items-center justify-between px-3 py-1.5 hover:bg-accent/10 rounded">
        <span className="text-[10px] text-muted-foreground font-bold truncate">{name}</span>
        <input
          type="checkbox"
          checked={boolVal}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-input bg-background focus:ring-ring text-primary"
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
      <div className="flex flex-col gap-1 px-3 py-1">
        <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold">
          <span className="truncate">{name}</span>
          <span className="mono text-[9px] opacity-75">{numVal}</span>
        </div>
        <input
          type="number"
          value={isNaN(numVal) ? "" : numVal}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const rawVal = e.target.value
            if (rawVal === "") {
              onChange(isInt ? 0 : 0.0)
              return
            }
            const val = isInt ? parseInt(rawVal, 10) : parseFloat(rawVal)
            onChange(isNaN(val) ? 0 : val)
          }}
          className="w-full text-xs rounded border border-input bg-background/50 px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
        />
      </div>
    )
  }

  // 4. STRING 또는 기타 기본 텍스트 필드
  const strVal = String(value ?? "")

  return (
    <div className="flex flex-col gap-1 px-3 py-1">
      <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold">
        <span className="truncate">{name}</span>
      </div>
      <input
        type="text"
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs rounded border border-input bg-background/50 px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}
