import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { type ReactNode } from "react"
import { Settings2, X } from "lucide-react"

interface SelectedNode {
  id: number
  title: string
  type: string
  pos: [number, number]
  size: [number, number]
  color?: string
  bgcolor?: string
  widgets?: { name: string; value: unknown; type: string }[]
  inputs?: { name: string; type: string; link: number | null }[]
  outputs?: { name: string; type: string; links: number[] }[]
}

export function NodePropertiesPanel({ className = "" }: { className?: string }): ReactNode {
  const reactNodes = useReactGraphStore((s) => s.nodes)
  const reactSelectedIds = useReactGraphStore((s) => s.selectedNodeIds)
  const reactDeselectAll = useReactGraphStore((s) => s.deselectAll)

  let selectedNode: SelectedNode | null = null

  if (reactSelectedIds.size === 1) {
    const id = Array.from(reactSelectedIds)[0]
    const node = reactNodes.find((n) => n.id === id)
    if (node !== undefined) {
      const nodeDef = useNodeDefStore.getState().getNodeDef(node.type)
      const req = nodeDef?.input?.required ?? {}
      const opt = nodeDef?.input?.optional ?? {}
      const allSpecs = { ...req, ...opt }
      const rawWidgetNames = node.properties?.widget_names
      const widgetNames: string[] = Array.isArray(rawWidgetNames)
        ? rawWidgetNames.filter((n): n is string => typeof n === "string")
        : []

      selectedNode = {
        id: node.id,
        title: nodeDef?.display_name ?? (node.type || "Node"),
        type: node.type || "unknown",
        pos: node.pos,
        size: node.size,
        ...(node.color !== undefined ? { color: node.color } : {}),
        ...(node.bgcolor !== undefined ? { bgcolor: node.bgcolor } : {}),
        widgets: widgetNames.map((name, idx) => {
          const spec = allSpecs[name]
          const typeSpec = spec?.[0]
          const typeStr = Array.isArray(typeSpec) ? "combo" : (typeSpec ?? "string")
          return {
            name,
            value: node.widgets_values?.[idx],
            type: typeStr,
          }
        }),
        ...(node.inputs !== undefined ? {
          inputs: node.inputs.map((i) => ({
            name: i.name,
            type: i.type,
            link: i.link ?? null,
          }))
        } : {}),
        ...(node.outputs !== undefined ? {
          outputs: node.outputs.map((o) => ({
            name: o.name,
            type: o.type,
            links: o.links ?? [],
          }))
        } : {}),
      }
    }
  }

  if (selectedNode === null) {
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
            reactDeselectAll()
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
        {(selectedNode.color !== undefined || selectedNode.bgcolor !== undefined) && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Colors</h4>
            <div className="flex gap-2">
              {selectedNode.color !== undefined && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: selectedNode.color }}
                  />
                  <span className="text-xs text-muted-foreground">FG</span>
                </div>
              )}
              {selectedNode.bgcolor !== undefined && (
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
        {selectedNode.inputs !== undefined && selectedNode.inputs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inputs ({String(selectedNode.inputs.length)})</h4>
            <div className="space-y-1">
              {selectedNode.inputs.map((input, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                  <span>{input.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{input.type}</span>
                    {input.link !== null ? (
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
        {selectedNode.outputs !== undefined && selectedNode.outputs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outputs ({String(selectedNode.outputs.length)})</h4>
            <div className="space-y-1">
              {selectedNode.outputs.map((output, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                  <span>{output.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{output.type}</span>
                    <span className="text-[10px] text-muted-foreground">{String(output.links.length)} links</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Widgets */}
        {selectedNode.widgets !== undefined && selectedNode.widgets.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Widgets ({String(selectedNode.widgets.length)})</h4>
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
