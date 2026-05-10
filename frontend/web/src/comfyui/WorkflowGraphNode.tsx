import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { getCategoryStyle } from "./workflowGraphCategories"

export interface WorkflowGraphNodeData extends Record<string, unknown> {
  classType: string
  title: string
  nodeId: string
  keyInputs: { label: string; value: string }[]
  inputKeys: string[]
  outputSlots: number[]
}

export type WorkflowGraphNodeType = Node<WorkflowGraphNodeData, "comfyui-node">

const HEADER_HEIGHT = 44
const BODY_LINE_HEIGHT = 20
const HANDLE_SPACING = 18

function WorkflowGraphNode({ data, selected }: NodeProps<WorkflowGraphNodeType>) {
  const style = getCategoryStyle(data.classType)
  const bodyHeight = Math.max(data.keyInputs.length, 1) * BODY_LINE_HEIGHT + 12
  const totalHeight = HEADER_HEIGHT + bodyHeight + (data.keyInputs.length > 0 ? 4 : 0)

  const getInputHandleY = (index: number, total: number) => {
    if (total <= 1) return totalHeight / 2
    const availStart = HEADER_HEIGHT + 8
    const availEnd = totalHeight - 8
    return availStart + (index / (total - 1)) * (availEnd - availStart)
  }

  const getOutputHandleY = (index: number, total: number) => {
    if (total <= 1) return totalHeight / 2
    const availStart = HEADER_HEIGHT + 8
    const availEnd = totalHeight - 8
    return availStart + (index / (total - 1)) * (availEnd - availStart)
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card shadow-sm min-w-[180px] max-w-[240px]",
        style.border,
        selected && "ring-2 ring-ring"
      )}
    >
      <div className={cn("rounded-t-md px-3 py-1.5", style.bg, "text-white")}>
        <div className="truncate text-sm font-semibold">{data.title}</div>
        <div className="truncate text-xs opacity-80">{data.classType}</div>
      </div>

      {data.keyInputs.length > 0 && (
        <div className="px-3 py-1.5 space-y-0.5 text-xs">
          {data.keyInputs.map((inp) => (
            <div key={inp.label} className="flex justify-between gap-2">
              <span className="text-muted-foreground truncate">{inp.label}</span>
              <span className="font-mono truncate max-w-[100px] text-foreground">
                {inp.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.inputKeys.map((key, i) => (
        <Handle
          key={`in-${key}`}
          type="target"
          position={Position.Left}
          id={`input-${key}`}
          style={{ top: getInputHandleY(i, data.inputKeys.length) }}
          className="!size-3 !border-2 !bg-card !border-border"
        />
      ))}

      {data.outputSlots.map((slot, i) => (
        <Handle
          key={`out-${slot}`}
          type="source"
          position={Position.Right}
          id={`output-${slot}`}
          style={{ top: getOutputHandleY(i, data.outputSlots.length) }}
          className="!size-3 !border-2 !bg-card !border-border"
        />
      ))}
    </div>
  )
}

export { WorkflowGraphNode }
