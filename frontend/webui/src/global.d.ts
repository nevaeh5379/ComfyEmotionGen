import { LiteGraphGlobal } from "./lib/comfy-graph/core/LiteGraphGlobal"
import { LGraph } from "./lib/comfy-graph/core/LGraph"
import { LGraphCanvas } from "./lib/comfy-graph/core/LGraphCanvas"
import { LGraphNode } from "./lib/comfy-graph/core/LGraphNode"
import { LLink } from "./lib/comfy-graph/core/LLink"
import { LGraphGroup } from "./lib/comfy-graph/core/LGraphGroup"

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
