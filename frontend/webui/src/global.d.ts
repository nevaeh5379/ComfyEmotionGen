import type { LiteGraphGlobal, LGraph, LGraphCanvas, LGraphNode, LLink, LGraphGroup } from "comfy-litegraph"

declare global {
  interface Window {
    LiteGraph: LiteGraphGlobal
    LGraph: typeof LGraph
    LGraphNode: typeof LGraphNode
    LGraphCanvas: typeof LGraphCanvas
    LLink: typeof LLink
    LGraphGroup: typeof LGraphGroup
    app: any
    api: any
    comfyExtensions: any[]
  }
}
