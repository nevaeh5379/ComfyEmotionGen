import "@/lib/logger"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { LiteGraph, LGraph, LGraphNode, LGraphCanvas, LLink, LGraphGroup } from "@/lib/comfy-graph/core/litegraph"

window.LiteGraph = LiteGraph
window.LGraph = LGraph
window.LGraphNode = LGraphNode
window.LGraphCanvas = LGraphCanvas
window.LLink = LLink
window.LGraphGroup = LGraphGroup
window.comfyExtensions = window.comfyExtensions || []

;(window.LiteGraph as any).LGraph = LGraph
;(window.LiteGraph as any).LGraphNode = LGraphNode
;(window.LiteGraph as any).LGraphCanvas = LGraphCanvas
;(window.LiteGraph as any).LLink = LLink
;(window.LiteGraph as any).LGraphGroup = LGraphGroup

// Initialize window.api as a persistent EventTarget instance
if (!window.api) {
  const apiObj = new EventTarget() as any
  apiObj.api_base = ""
  apiObj.getExtensions = async () => {
    const { comfyApi } = await import("@/lib/comfy-graph/api")
    return comfyApi.getExtensions()
  }
  apiObj.getObjectInfo = async () => {
    const { comfyApi } = await import("@/lib/comfy-graph/api")
    return comfyApi.getObjectInfo()
  }
  window.api = apiObj
}

// Initialize window.app as a persistent object
if (!window.app) {
  const extensions: any[] = []
  window.app = {
    extensions,
    registerExtension(ext: any) {
      extensions.push(ext)
    },
    graph: null,
    canvas: null,
    async syncGraph() {
      const { useReactGraphStore } = await import("@/lib/comfy-graph/stores/reactGraphStore")
      useReactGraphStore.getState().syncGraphFromLive()
    }
  }
}

import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { WebSocketProvider } from "./comfyui/contexts/WebSocketProvider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { Toaster } from "@/components/ui/sonner"
import { ConfirmProvider } from "./comfyui/contexts/ConfirmContext.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WebSocketProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={400}>
          <ConfirmProvider>
            <App />
            <Toaster />
          </ConfirmProvider>
        </TooltipProvider>
      </ThemeProvider>
    </WebSocketProvider>
  </StrictMode>
)
