import { useEffect, useState } from "react"
import { API } from "../../lib/api"
import { HEALTH_CHECK_INTERVAL_MS } from "../../lib/constants"
import { useBackendUrl } from "./useBackendUrl"
import { isValidHttpUrl } from "../../lib/utils"

/**
 * Periodically checks backend health and fetches object info when alive.
 */
export function useBackendHealth(): { isAliveBackend: boolean; setIsAliveBackend: React.Dispatch<React.SetStateAction<boolean>> } {
  const backendUrl = useBackendUrl()
  const [isAliveBackend, setIsAliveBackend] = useState(false)

  // ── Backend health check ──
  useEffect((): (() => void) | undefined => {
    let cancelled = false
    const checkHealth = async (): Promise<boolean> => {
      if (!isValidHttpUrl(backendUrl)) {
        return false
      }
      try {
        const response = await fetch(`${backendUrl}${API.health}`)
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        const data = (await response.json()) as { backend?: string }
        return data.backend === "ok"
      } catch (error: unknown) {
        console.warn("Backend health check failed:", error)
        return false
      }
    }
    const tick = async (): Promise<void> => {
      const ok = await checkHealth()
      if (!cancelled) setIsAliveBackend(ok)
    }
    void tick()
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const timer = setInterval(tick, HEALTH_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [backendUrl])

  return { isAliveBackend, setIsAliveBackend }
}
