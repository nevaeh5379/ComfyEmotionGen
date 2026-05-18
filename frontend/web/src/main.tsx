import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
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
