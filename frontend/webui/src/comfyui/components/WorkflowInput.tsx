import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import type { ObjectInfoInputSpec } from "../types/renderTypes"

interface WorkflowInputProps {
  nodeId: string
  inputKey: string
  value: any
  spec: ObjectInfoInputSpec | null
  onSave: (val: any) => void
}

export function WorkflowInput({
  nodeId,
  inputKey,
  value,
  spec,
  onSave,
}: WorkflowInputProps) {
  const [localValue, setLocalValue] = useState<any>(value)

  // Sync state if value changes externally (e.g., workflow template loads)
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const enumOptions = Array.isArray(spec?.[0]) ? (spec[0] as string[]) : null
  const typeStr = typeof spec?.[0] === "string" ? spec[0] : null
  const extraParams = spec?.[1] || {}

  // 1. Boolean input
  const isBoolean = typeStr === "BOOLEAN" || typeof value === "boolean"
  if (isBoolean) {
    const boolValue = localValue === true || localValue === "true"
    return (
      <div className="flex items-center space-x-2 py-1 select-none">
        <Switch
          id={`input-${nodeId}-${inputKey}`}
          checked={boolValue}
          onCheckedChange={(checked) => {
            setLocalValue(checked)
            onSave(checked)
          }}
        />
        <Label
          htmlFor={`input-${nodeId}-${inputKey}`}
          className="text-xs cursor-pointer text-muted-foreground hover:text-foreground font-medium"
        >
          {boolValue ? "True" : "False"}
        </Label>
      </div>
    )
  }

  // 2. Select dropdown (Enum options)
  if (enumOptions) {
    return (
      <Select
        value={String(localValue ?? "")}
        onValueChange={(val) => {
          setLocalValue(val)
          onSave(val)
        }}
      >
        <SelectTrigger className="h-8 w-full text-[11px] bg-background shadow-xs">
          <SelectValue placeholder="선택..." />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {enumOptions.map((opt) => (
            <SelectItem key={opt} value={opt} className="text-[11px]">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // 3. Numeric input (INT / FLOAT)
  const isNumber =
    typeof value === "number" || typeStr === "INT" || typeStr === "FLOAT"
  if (isNumber) {
    const min = extraParams.min !== undefined ? Number(extraParams.min) : undefined
    const max = extraParams.max !== undefined ? Number(extraParams.max) : undefined
    const step =
      extraParams.step !== undefined
        ? Number(extraParams.step)
        : typeStr === "FLOAT"
          ? 0.01
          : 1

    const handleBlurOrSubmit = () => {
      if (localValue === "" || localValue === undefined || localValue === null) {
        const fallback = typeStr === "INT" ? 0 : 0.0
        setLocalValue(fallback)
        onSave(fallback)
        return
      }
      let num = Number(localValue)
      if (isNaN(num)) {
        num = 0
      }
      
      // Enforce bounds if defined
      if (min !== undefined && num < min) num = min
      if (max !== undefined && num > max) num = max

      // Enforce type conversion
      const finalValue = typeStr === "INT" ? Math.round(num) : num
      
      setLocalValue(finalValue)
      if (finalValue !== value) {
        onSave(finalValue)
      }
    }

    return (
      <Input
        type="number"
        value={localValue === null || localValue === undefined ? "" : localValue}
        onChange={(e) => {
          const val = e.target.value
          setLocalValue(val === "" ? "" : val)
        }}
        onBlur={handleBlurOrSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleBlurOrSubmit()
            e.currentTarget.blur()
          }
        }}
        min={min}
        max={max}
        step={step}
        className="h-8 w-full text-xs bg-background shadow-xs font-mono"
      />
    )
  }

  // 4. String / text input (Multiline vs Singleline)
  const isMultiline =
    extraParams.multiline === true ||
    inputKey === "text" ||
    inputKey === "prompt" ||
    (typeof value === "string" && (value.includes("\n") || value.length > 50))

  const handleTextBlurOrSubmit = () => {
    if (localValue !== value) {
      onSave(localValue)
    }
  }

  if (isMultiline) {
    return (
      <Textarea
        value={localValue ?? ""}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleTextBlurOrSubmit}
        placeholder="텍스트 입력..."
        className="min-h-[80px] text-xs bg-background shadow-xs leading-normal py-1.5"
      />
    )
  }

  return (
    <Input
      type="text"
      value={localValue ?? ""}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleTextBlurOrSubmit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          handleTextBlurOrSubmit()
          e.currentTarget.blur()
        }
      }}
      placeholder="값 입력..."
      className="h-8 w-full text-xs bg-background shadow-xs"
    />
  )
}
