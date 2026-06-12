/**
 * Node Properties Panel
 * 선택된 노드의 속성을 표시하는 우측 패널
 */

import { useCanvasStore } from "@/lib/comfy-graph/stores/canvasStore"
import { useEffect, useState } from "react"
import { Settings2, X } from "lucide-react"

interface NodePropertiesPanelProps {
  className?: string
}

export function NodePropertiesPanel({ className = "" }: NodePropertiesPanelProps) {
  const canvas = useCanvasStore((s) => s.canvas)
  const [selectedNode, setSelectedNode] = useState<{
    id: number
    title: string
    type: string
    pos: [number, number]
    size: [number, number]
    color?: string
    bgcolor?: string
    widgets?: Array<{ name: string; value: unknown; type: string }>
    inputs?: Array<{ name: string; type: string; link: number | null }>
    outputs?: Array<{ name: string; type: string; links: number[] }>
  } | null>(null)

  useEffect(() => {
    if (!canvas || !canvas.graph) return

    const updateSelection = () => {
      const g = canvas!.graph
      if (!g) return
      const selected = g.nodes.filter((n) => n.is_selected)
      if (selected.length === 1) {
        const node = selected[0]
        setSelectedNode({
          id: node.id,
          // @ts-ignore
          title: node.title || node.type || "Node",
          type: node.type || "unknown",
          pos: node.pos,
          size: node.size,
          // @ts-ignore
          color: node.color,
          // @ts-ignore
          bgcolor: node.bgcolor,
          // @ts-ignore
          widgets: node.widgets?.map((w) => ({
            name: w.name,
            value: w.value,
            type: w.type,
          })),
          // @ts-ignore
          inputs: node.inputs?.map((i) => ({
            name: i.name,
            type: i.type,
            link: i.link,
          })),
          // @ts-ignore
          outputs: node.outputs?.map((o) => ({
            name: o.name,
            type: o.type,
            links: o.links || [],
          })),
        })
      } else {
        setSelectedNode(null)
      }
    }

    // Poll for selection changes (LiteGraph doesn't have a clean selection change event)
    const interval = setInterval(updateSelection, 100)

    // Also listen for canvas events
    const handleEvent = () => updateSelection()
    canvas.canvas.addEventListener("mouseup", handleEvent)
    canvas.canvas.addEventListener("click", handleEvent)

    return () => {
      clearInterval(interval)
      canvas.canvas.removeEventListener("mouseup", handleEvent)
      canvas.canvas.removeEventListener("click", handleEvent)
    }
  }, [canvas])

  if (!selectedNode) {
    return (
      <div className={`flex flex-col h-full bg-background border-l ${className}`}>
        <div className="p-3 border-b flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Properties</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-4">
          Select a node to view its properties
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full bg-background border-l ${className}`}>
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold truncate max-w-[180px]">{selectedNode.title}</h3>
            <p className="text-[10px] text-muted-foreground">{selectedNode.type}</p>
          </div>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            // Deselect all nodes
            if (canvas?.graph) {
              for (const node of canvas.graph.nodes) {
                node.is_selected = false
              }
              canvas.graph.setDirtyCanvas(true, true)
            }
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Position & Size */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transform</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">X</label>
              <input
                type="number"
                value={Math.round(selectedNode.pos[0])}
                readOnly
                className="w-full px-2 py-1 text-xs border rounded bg-muted"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Y</label>
              <input
                type="number"
                value={Math.round(selectedNode.pos[1])}
                readOnly
                className="w-full px-2 py-1 text-xs border rounded bg-muted"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Width</label>
              <input
                type="number"
                value={Math.round(selectedNode.size[0])}
                readOnly
                className="w-full px-2 py-1 text-xs border rounded bg-muted"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Height</label>
              <input
                type="number"
                value={Math.round(selectedNode.size[1])}
                readOnly
                className="w-full px-2 py-1 text-xs border rounded bg-muted"
              />
            </div>
          </div>
        </div>

        {/* Colors */}
        {(selectedNode.color || selectedNode.bgcolor) && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Colors</h4>
            <div className="flex gap-2">
              {selectedNode.color && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: selectedNode.color }}
                  />
                  <span className="text-xs text-muted-foreground">FG</span>
                </div>
              )}
              {selectedNode.bgcolor && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: selectedNode.bgcolor }}
                  />
                  <span className="text-xs text-muted-foreground">BG</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inputs */}
        {selectedNode.inputs && selectedNode.inputs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inputs ({selectedNode.inputs.length})</h4>
            <div className="space-y-1">
              {selectedNode.inputs.map((input, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                  <span>{input.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{input.type}</span>
                    {input.link != null ? (
                      <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-300" title="Disconnected" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outputs */}
        {selectedNode.outputs && selectedNode.outputs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outputs ({selectedNode.outputs.length})</h4>
            <div className="space-y-1">
              {selectedNode.outputs.map((output, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                  <span>{output.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{output.type}</span>
                    <span className="text-[10px] text-muted-foreground">{output.links.length} links</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Widgets */}
        {selectedNode.widgets && selectedNode.widgets.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Widgets ({selectedNode.widgets.length})</h4>
            <div className="space-y-1">
              {selectedNode.widgets.map((widget, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                  <span>{widget.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{String(widget.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
