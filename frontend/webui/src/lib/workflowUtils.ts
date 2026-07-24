import {
  ComfyWorkflowSchema,
  type ComfyWorkflow,
  type NodeMapping,
  type NodeInputValue,
} from "./workflow"
import { MAX_RANDOM_SEED } from "./constants"
import type { RenderItem } from "../comfyui/types/renderTypes"

const CEG_CONTEXT_NODE = "CEGContext"
const CEG_SEED_NODE = "CEGSeed"
const CEG_VALUE_NODES = new Set([
  "CEGText",
  "CEGInteger",
  "CEGFloat",
  "CEGBoolean",
])

export const parseWorkflow = (json: string): ComfyWorkflow => {
  let obj: unknown
  try {
    obj = JSON.parse(json)
  } catch (e) {
    console.error("Workflow JSON parse error:", e)
    throw new Error(
      "Invalid workflow format: " + (e instanceof Error ? e.message : String(e))
    )
  }
  const parsed = ComfyWorkflowSchema.safeParse(obj)
  if (!parsed.success) {
    console.error("Workflow validation error:", parsed.error)
    throw new Error("Invalid workflow format: " + parsed.error.message)
  }
  return parsed.data
}

export const itemKey = (item: RenderItem): string =>
  `${item.filename} ${item.prompt}`

export const substitute = (text: string, item: RenderItem): string => {
  let r = text || ""
  Object.entries(item.meta).forEach(([k, v]) => {
    r = r.split(`{{${k}}}`).join(v)
    r = r.split(`{${k}}`).join(v)
  })
  r = r.split("{{input}}").join(item.prompt || "")
  r = r.split("{input}").join(item.prompt || "")
  return r
}

export const buildAutoMappings = (workflow: ComfyWorkflow): NodeMapping[] => {
  const auto: NodeMapping[] = []

  const clipNode =
    Object.entries(workflow).find(([, n]) => {
      if (n.class_type !== "CLIPTextEncode") return false
      const title = n._meta?.title ?? ""
      return title.includes("positive") || title.includes("prompt")
    }) ??
    Object.entries(workflow).find(([, n]) => n.class_type === "CLIPTextEncode")
  if (clipNode)
    auto.push({
      id: crypto.randomUUID(),
      nodeId: clipNode[0],
      inputKey: "text",
      sourceType: "prompt",
    })

  const saveNode = Object.entries(workflow).find(
    ([, n]) => n.class_type === "SaveImage"
  )
  if (saveNode)
    auto.push({
      id: crypto.randomUUID(),
      nodeId: saveNode[0],
      inputKey: "filename_prefix",
      sourceType: "filename",
    })

  Object.entries(workflow).forEach(([nodeId, node]) => {
    if (node.class_type === "LoadImage")
      auto.push({
        id: crypto.randomUUID(),
        nodeId,
        inputKey: "image",
        sourceType: "image",
      })
  })

  Object.entries(workflow).forEach(([nodeId, node]) => {
    Object.entries(node.inputs).forEach(([inputKey, value]) => {
      if (typeof value === "number" && inputKey.toLowerCase().includes("seed"))
        auto.push({
          id: crypto.randomUUID(),
          nodeId,
          inputKey,
          sourceType: "seed",
          seedValue: value,
          seedRandom: true,
        })
    })
  })

  return auto
}

export const applyAxisFilters = (
  items: RenderItem[],
  filter: Record<string, Record<string, boolean>>
): RenderItem[] => {
  const hasAnyDisabled = Object.values(filter).some((vals) =>
    Object.values(vals).some((v) => !v)
  )
  if (!hasAnyDisabled) return items.slice()
  return items.filter((item) =>
    Object.entries(item.meta).every(([key, value]) => {
      const axisVals = filter[key]
      if (!axisVals) return true
      return axisVals[value] !== false
    })
  )
}

export const randomSelect = <T>(items: T[], count: number): T[] => {
  const pool = items.slice()
  const selected: T[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    const removed = pool.splice(idx, 1)
    const val = removed[0]
    if (val !== undefined) {
      selected.push(val)
    }
  }
  return selected
}

export const filterByItem = (
  item: RenderItem,
  setFilter: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, boolean>>>
  >
): void => {
  setFilter((prev) => {
    const next: Record<string, Record<string, boolean>> = {}
    for (const axis of Object.keys(prev)) {
      const itemValue = item.meta[axis]
      if (itemValue === undefined) {
        next[axis] = { ...prev[axis] }
      } else {
        const axisValues = prev[axis]
        if (axisValues) {
          next[axis] = Object.fromEntries(
            Object.keys(axisValues).map((v) => [v, v === itemValue])
          )
        }
      }
    }
    return next
  })
}

export const buildWorkflowForItem = (
  workflowJson: string,
  item: RenderItem,
  nodeMappings: NodeMapping[],
  imageNameMap: Record<string, string>
): ComfyWorkflow => {
  const workflow = parseWorkflow(workflowJson)

  injectCegNodes(workflow, item)

  nodeMappings.forEach(
    ({
      nodeId,
      inputKey,
      sourceType,
      seedValue,
      seedRandom,
      fixedValue,
      slotKey,
    }) => {
      if (!workflow[nodeId]) return
      switch (sourceType) {
        case "prompt":
          workflow[nodeId].inputs[inputKey] = item.prompt
          break
        case "filename":
          workflow[nodeId].inputs[inputKey] = item.filename
          break
        case "slot": {
          const key = (slotKey ?? "").trim().replace(/^slot\./, "")
          if (key !== "" && item.slots !== undefined && key in item.slots) {
            workflow[nodeId].inputs[inputKey] = item.slots[key] ?? ""
          }
          break
        }
        case "seed": {
          const v =
            seedRandom === true
              ? Math.floor(Math.random() * MAX_RANDOM_SEED)
              : (seedValue ?? 0)
          workflow[nodeId].inputs[inputKey] = v
          break
        }
        case "image": {
          const name = imageNameMap[`${nodeId}.${inputKey}`]
          if (name !== undefined && name !== "") {
            workflow[nodeId].inputs[inputKey] = name
          }
          break
        }
        case "fixed":
          workflow[nodeId].inputs[inputKey] = fixedValue ?? ""
          break
      }
    }
  )

  return workflow
}

const readCegValue = (
  item: RenderItem,
  source: NodeInputValue | undefined,
  key: NodeInputValue | undefined
): string | number | boolean | null | undefined => {
  if (typeof key !== "string" || key.trim() === "") return undefined
  if (source === "meta") return item.meta[key]
  if (source === "slot") return item.slots?.[key]
  return undefined
}

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const booleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off"].includes(normalized)) return false
  return undefined
}

const injectCegNodes = (workflow: ComfyWorkflow, item: RenderItem): void => {
  const seed = Math.floor(Math.random() * MAX_RANDOM_SEED)

  Object.values(workflow).forEach((node) => {
    if (node.class_type === CEG_CONTEXT_NODE) {
      node.inputs.prompt = item.prompt
      node.inputs.filename = item.filename
      node.inputs.seed = seed
      node.inputs.metadata_json = JSON.stringify(item.meta)
      node.inputs.slots_json = JSON.stringify(item.slots ?? {})
      return
    }

    if (node.class_type === CEG_SEED_NODE) {
      node.inputs.seed = seed
      return
    }

    if (!CEG_VALUE_NODES.has(node.class_type)) return
    const value = readCegValue(item, node.inputs.source, node.inputs.key)
    if (value === undefined || value === null) return

    switch (node.class_type) {
      case "CEGText":
        node.inputs.value = String(value)
        break
      case "CEGInteger": {
        const parsed = finiteNumber(value)
        if (parsed !== undefined) node.inputs.value = Math.trunc(parsed)
        break
      }
      case "CEGFloat": {
        const parsed = finiteNumber(value)
        if (parsed !== undefined) node.inputs.value = parsed
        break
      }
      case "CEGBoolean": {
        const parsed = booleanValue(value)
        if (parsed !== undefined) node.inputs.value = parsed
        break
      }
    }
  })
}

// ── Axis entry context helpers ────────────────────────────────────────

export type AxisValueFilter = Record<string, Record<string, boolean>>

export interface AxisEntryLocation {
  axisName: string
  entryKey: string
  allEntryKeys: string[]
}

const AXIS_OPEN_RE = /^\{\{\s*axis\s+([a-zA-Z_][a-zA-Z0-9_-]*)/
const AXIS_CLOSE_RE = /^\{\{\s*\/axis\s*\}\}/
const ENTRY_SIMPLE_RE =
  /^([a-zA-Z_][a-zA-Z0-9_-]*)(?:\s+as\s+"(?:[^"\\]|\\.)*")?\s*:\s*"(?:[^"\\]|\\.)*"$/
const ENTRY_COMPLEX_RE =
  /^([a-zA-Z_][a-zA-Z0-9_-]*)(?:\s+as\s+"(?:[^"\\]|\\.)*")?\s*:\s*\{/
const ENTRY_KEY_RE = /^([a-zA-Z_][a-zA-Z0-9_-]*)/

function extractEntryKey(line: string): string | null {
  const t = line.trim()
  if (t === "" || t.startsWith("#") || t.startsWith("//")) return null
  if (t.startsWith("{{")) return null
  if (ENTRY_SIMPLE_RE.test(t)) {
    const m = ENTRY_KEY_RE.exec(t)
    return m ? (m[1] ?? null) : null
  }
  if (ENTRY_COMPLEX_RE.test(t)) {
    const m = ENTRY_KEY_RE.exec(t)
    return m ? (m[1] ?? null) : null
  }
  return null
}

/**
 * 템플릿 텍스트에서 지정한 줄이 속한 axis 블록과 entry key를 추출한다.
 * lineIndex는 0-based. axis 블록 밖이거나 값 줄이 아니면 null 반환.
 */
export function parseAxisEntryAtLine(
  text: string,
  lineIndex: number
): AxisEntryLocation | null {
  const lines = text.split("\n")
  if (lineIndex < 0 || lineIndex >= lines.length) return null

  // 위로 스캔하며 axis 블록 시작 찾기 (도중 /axis 만나면 블록 밖)
  let axisName: string | null = null
  let blockStart = -1
  for (let i = lineIndex; i >= 0; i--) {
    const raw = lines[i]
    if (raw === undefined) continue
    const t = raw.trim()
    if (AXIS_CLOSE_RE.test(t)) return null
    const open = AXIS_OPEN_RE.exec(t)
    if (open !== null) {
      axisName = open[1] ?? null
      blockStart = i
      break
    }
  }
  if (axisName === null || axisName === "" || blockStart === -1) return null

  // 아래로 스캔하며 블록 끝 찾기 + 모든 entry key 수집
  const allEntryKeys: string[] = []
  for (let i = blockStart + 1; i < lines.length; i++) {
    const raw = lines[i]
    if (raw === undefined) continue
    const t = raw.trim()
    if (AXIS_CLOSE_RE.test(t)) {
      break
    }
    const key = extractEntryKey(raw)
    if (key !== null) allEntryKeys.push(key)
  }

  const targetRaw = lines[lineIndex]
  if (targetRaw === undefined) return null
  const entryKey = extractEntryKey(targetRaw)
  if (entryKey === null) return null

  return {
    axisName,
    entryKey,
    allEntryKeys,
  }
}

/** 템플릿 텍스트 전체에서 각 줄의 axis entry 위치를 계산 (라인 데코레이션용). */
export function buildAxisEntryActiveMap(
  text: string,
  filter: AxisValueFilter
): Map<number, boolean> {
  const lines = text.split("\n")
  const map = new Map<number, boolean>()
  let currentAxis: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw === undefined) continue
    const t = raw.trim()
    if (AXIS_CLOSE_RE.test(t)) {
      currentAxis = null
      continue
    }
    if (currentAxis === null) {
      const open = AXIS_OPEN_RE.exec(t)
      if (open !== null) currentAxis = open[1] ?? null
      continue
    }
    const key = extractEntryKey(raw)
    if (key !== null && currentAxis !== "") {
      const vals = filter[currentAxis]
      const active = vals ? vals[key] !== false : true
      map.set(i, active)
    }
  }
  return map
}

/** 지정한 axis의 값만 활성화, 나머지는 비활성화. */
export function setAxisOnlyValue(
  filter: AxisValueFilter,
  axisName: string,
  valueKey: string,
  allEntryKeys: string[]
): AxisValueFilter {
  const next: Record<string, boolean> = {}
  for (const k of allEntryKeys) next[k] = k === valueKey
  return { ...filter, [axisName]: next }
}

/** 지정한 axis의 값 하나를 비활성화. */
export function disableAxisValue(
  filter: AxisValueFilter,
  axisName: string,
  valueKey: string
): AxisValueFilter {
  const prev = filter[axisName] ?? {}
  return { ...filter, [axisName]: { ...prev, [valueKey]: false } }
}

/** 지정한 axis의 모든 값을 활성화. */
export function enableAllAxis(
  filter: AxisValueFilter,
  axisName: string,
  allEntryKeys: string[]
): AxisValueFilter {
  const next: Record<string, boolean> = {}
  for (const k of allEntryKeys) next[k] = true
  const prev = filter[axisName] ?? {}
  return { ...filter, [axisName]: { ...prev, ...next } }
}
