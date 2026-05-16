import {
  ComfyWorkflowSchema,
  type ComfyWorkflow,
  type NodeMapping,
} from "./workflow"
import type { RenderItem } from "../comfyui/renderTypes"

const MAX_RANDOM_SEED = 1_000_000_000

export const parseWorkflow = (json: string): ComfyWorkflow => {
  const parsed = ComfyWorkflowSchema.safeParse(JSON.parse(json))
  if (!parsed.success) {
    console.error("Workflow validation error:", parsed.error)
    throw new Error("Invalid workflow format")
  }
  return parsed.data
}

export const itemKey = (item: RenderItem): string =>
  `${item.filename} ${item.prompt}`

export const buildAutoMappings = (workflow: ComfyWorkflow): NodeMapping[] => {
  const auto: NodeMapping[] = []

  const clipNode =
    Object.entries(workflow).find(([, n]) => {
      if (n.class_type !== "CLIPTextEncode") return false
      const title = (n._meta?.title || "").toLowerCase()
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
          seedValue: Number(value),
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
  if (!hasAnyDisabled) return items
  return items.filter((item) =>
    Object.entries(item.meta).every(([key, value]) => {
      const axisVals = filter[key]
      if (!axisVals) return true
      return axisVals[value] !== false
    })
  )
}

export const filterByItem = (
  item: RenderItem,
  setFilter: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, boolean>>>
  >
) => {
  setFilter((prev) => {
    const next: Record<string, Record<string, boolean>> = {}
    for (const axis of Object.keys(prev)) {
      const itemValue = item.meta[axis]
      if (itemValue === undefined) {
        next[axis] = { ...prev[axis] }
      } else {
        next[axis] = Object.fromEntries(
          Object.keys(prev[axis]!).map((v) => [v, v === itemValue])
        )
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

  let firstImageName = ""
  nodeMappings.forEach(
    ({ nodeId, inputKey, sourceType, seedValue, seedRandom, fixedValue }) => {
      if (!workflow[nodeId]) return
      switch (sourceType) {
        case "prompt":
          workflow[nodeId]!.inputs[inputKey] = item.prompt
          break
        case "filename":
          workflow[nodeId]!.inputs[inputKey] = item.filename
          break
        case "seed": {
          const v = seedRandom
            ? Math.floor(Math.random() * MAX_RANDOM_SEED)
            : (seedValue ?? 0)
          workflow[nodeId]!.inputs[inputKey] = v
          break
        }
        case "image": {
          const name = imageNameMap[`${nodeId}.${inputKey}`]
          if (name) {
            workflow[nodeId]!.inputs[inputKey] = name
            if (!firstImageName) firstImageName = name
          }
          break
        }
        case "fixed":
          workflow[nodeId]!.inputs[inputKey] = fixedValue ?? ""
          break
      }
    }
  )

  // 플레이스홀더 치환: meta 변수 + 내장 변수 + 하위호환 단일중괄호
  const subs: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(item.meta).map(([k, v]) => [`{{${k}}}`, v])
    ),
    "{{input}}": item.prompt,
    "{{filename}}": item.filename,
    "{{image}}": firstImageName,
    "{input}": item.prompt,
    "{filename}": item.filename,
  }
  Object.entries(workflow).forEach(([nodeId, node]) => {
    Object.entries(node.inputs).forEach(([inputKey, inputValue]) => {
      if (typeof inputValue === "string") {
        let v = inputValue
        for (const [key, val] of Object.entries(subs)) {
          v = v.split(key).join(val)
        }
        workflow[nodeId]!.inputs[inputKey] = v
      }
    })
  })
  return workflow
}
