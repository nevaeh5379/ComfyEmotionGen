import { BackendContext } from "../contexts/BackendContext"
import { useContextRequired } from "@/lib/context"

export const useBackend = (): ReturnType<typeof useContextRequired<BackendContext>> => {
  return useContextRequired(BackendContext, "useBackend")
}

export const useWebSocket = useBackend
