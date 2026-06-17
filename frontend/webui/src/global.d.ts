import type { LiteGraphGlobal } from "./lib/comfy-graph/core/LiteGraphGlobal"
import type { LGraph } from "./lib/comfy-graph/core/LGraph"
import type { LGraphCanvas } from "./lib/comfy-graph/core/LGraphCanvas"
import type { LGraphNode } from "./lib/comfy-graph/core/LGraphNode"
import type { LLink } from "./lib/comfy-graph/core/LLink"
import type { LGraphGroup } from "./lib/comfy-graph/core/LGraphGroup"

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
