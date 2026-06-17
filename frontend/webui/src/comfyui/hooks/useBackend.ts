import { BackendContext } from "../contexts/BackendContext"
import { useContextRequired } from "@/lib/context"

export const useBackend = () => {
  return useContextRequired(BackendContext, "useBackend")
}

export const useWebSocket = useBackend
