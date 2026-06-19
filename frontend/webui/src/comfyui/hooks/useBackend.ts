import { BackendContext, type BackendContextValue } from "../contexts/BackendContext"
import { useContextRequired } from "@/lib/context"

export const useBackend = (): BackendContextValue => {
  return useContextRequired(BackendContext, "useBackend")
}

export const useWebSocket = useBackend
