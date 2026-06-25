import { useContext } from "react"
import { BackendUrlContext } from "@/comfyui/contexts/BackendUrlContext"
import { DEFAULT_BACKEND_URL } from "@/lib/runtime"

/**
 * WebSocketProvider가 제공하는 BackendUrlContext에서 backendUrl을 읽는다.
 * jobs/workers/workerPreviews와 분리되어 있으므로 불필요한 리렌더링이 없다.
 */
export function useBackendUrl(): string {
  const url = useContext(BackendUrlContext)
  return url ?? DEFAULT_BACKEND_URL
}
