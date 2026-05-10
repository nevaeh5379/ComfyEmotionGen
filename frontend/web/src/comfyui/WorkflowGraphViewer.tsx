import { useMemo } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { ComfyWorkflow, NodeLink } from "@/lib/workflow"
import { computeLayout } from "./workflowGraphLayout"
import { getCategoryStyle } from "./workflowGraphCategories"
import { WorkflowGraphNode } from "./WorkflowGraphNode"
import type { WorkflowGraphNodeData } from "./WorkflowGraphNode"

const nodeTypes = { "comfyui-node": WorkflowGraphNode }

function isNodeLink(value: unknown): value is NodeLink {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number"
  )
}

function extractKeyInputs(node: ComfyWorkflow[string]) {
  const result: { label: string; value: string }[] = []
  for (const [key, val] of Object.entries(node.inputs)) {
    if (isNodeLink(val)) continue
    let display = String(val)
    if (display.length > 30) display = display.slice(0, 28) + "…"
    result.push({ label: key, value: display })
    if (result.length >= 5) break
  }
  return result
}

interface WorkflowGraphViewerProps {
  workflow: ComfyWorkflow
  isOpen: boolean
  onClose: () => void
}

function WorkflowGraphViewer({ workflow, isOpen, onClose }: WorkflowGraphViewerProps) {
  const { positions, edges: graphEdges } = useMemo(
    () => computeLayout(workflow),
    [workflow]
  )

  // Compute which output slots / input keys have connections
  const connectionMap = useMemo(() => {
    const outputSlots = new Map<string, Set<number>>()
    const inputKeys = new Map<string, Set<string>>()
    for (const e of graphEdges) {
      if (!outputSlots.has(e.source)) outputSlots.set(e.source, new Set())
      outputSlots.get(e.source)!.add(e.sourceSlot)
      if (!inputKeys.has(e.target)) inputKeys.set(e.target, new Set())
      inputKeys.get(e.target)!.add(e.targetInput)
    }
    return { outputSlots, inputKeys }
  }, [graphEdges])

  const flowNodes: Node[] = useMemo(() => {
    return Object.entries(workflow).map(([nodeId, node]) => {
      const pos = positions.get(nodeId) ?? { x: 0, y: 0 }
      const title = node._meta?.title ?? node.class_type
      const keyInputs = extractKeyInputs(node)
      const data: WorkflowGraphNodeData = {
        classType: node.class_type,
        title,
        nodeId,
        keyInputs,
        inputKeys: [...(connectionMap.inputKeys.get(nodeId) ?? [])],
        outputSlots: [...(connectionMap.outputSlots.get(nodeId) ?? [])],
      }
      return {
        id: nodeId,
        type: "comfyui-node",
        position: pos,
        data,
      }
    })
  }, [workflow, positions, connectionMap])

  const flowEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e, i) => ({
      id: `${e.source}-${e.sourceSlot}-${e.target}-${e.targetInput}-${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: `output-${e.sourceSlot}`,
      targetHandle: `input-${e.targetInput}`,
      type: "smoothstep",
      style: { stroke: "var(--border)", strokeWidth: 2 },
    }))
  }, [graphEdges])

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side="right"
        className="flex flex-col min-w-[60vw] sm:max-w-[85vw]"
      >
        <SheetHeader>
          <SheetTitle>워크플로우 그래프</SheetTitle>
          <SheetDescription>
            {Object.keys(workflow).length}개 노드, {graphEdges.length}개 연결
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 rounded-md border bg-muted/20 overflow-hidden">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={20} size={1} />
            <Controls
              position="bottom-right"
              className={cn(
                "[&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground",
                "[&>button:hover]:!bg-muted [&>button]:!shadow-sm"
              )}
            />
            <MiniMap
              position="bottom-left"
              nodeColor={(n) => {
                const d = n.data as WorkflowGraphNodeData | undefined
                return d ? getCategoryStyle(d.classType).hex : "#6b7280"
              }}
              maskColor="var(--background)"
              className="!rounded-md !border !border-border"
            />
          </ReactFlow>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { WorkflowGraphViewer }
