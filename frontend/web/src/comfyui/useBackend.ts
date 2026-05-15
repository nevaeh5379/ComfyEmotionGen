import { useContext } from "react"
import { BackendContext } from "./BackendContext"

export const useBackend = () => {
  const ctx = useContext(BackendContext)
  if (!ctx) {
    throw new Error("useBackend must be used within a WebSocketProvider")
  }
  return ctx
}

export const useWebSocket = useBackend
