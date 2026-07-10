import { useEffect, useState } from "react"
import { API } from "../../lib/api"
import { HEALTH_CHECK_INTERVAL_MS } from "../../lib/constants"
import { useBackendUrl } from "./useBackendUrl"
import { isValidHttpUrl } from "../../lib/utils"

/**
 * Periodically checks backend health and fetches object info when alive.
 */
export function useBackendHealth(): {
  isAliveBackend: boolean
  setIsAliveBackend: React.Dispatch<React.SetStateAction<boolean>>
} {
  const backendUrl = useBackendUrl()
  const [isAliveBackend, setIsAliveBackend] = useState(false)

  // ── Backend health check ──
  useEffect((): (() => void) | undefined => {
    let cancelled = false
    let timer: number | null = null
    let controller: AbortController | null = null

    const checkHealth = async (signal: AbortSignal): Promise<boolean> => {
      if (!isValidHttpUrl(backendUrl)) {
        return false
      }
      try {
        const response = await fetch(`${backendUrl}${API.health}`, { signal })
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        const data = (await response.json()) as { backend?: string }
        return data.backend === "ok"
      } catch (error: unknown) {
        if ((error as Error).name === "AbortError") return false
        console.warn("Backend health check failed:", error)
        return false
      }
    }
    const tick = async (): Promise<void> => {
      controller = new AbortController()
      const ok = await checkHealth(controller.signal)
      controller = null
      if (cancelled) return
      setIsAliveBackend(ok)
      timer = window.setTimeout(() => {
        timer = null
        void tick()
      }, HEALTH_CHECK_INTERVAL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      controller?.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [backendUrl])

  return { isAliveBackend, setIsAliveBackend }
}
