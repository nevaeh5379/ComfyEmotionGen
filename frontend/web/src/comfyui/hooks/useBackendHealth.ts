import { useEffect, useState } from "react"
import { API } from "../../lib/api"
import { HEALTH_CHECK_INTERVAL_MS } from "../../lib/constants"
import { useBackendUrl } from "./useBackendUrl"

/**
 * Periodically checks backend health and fetches object info when alive.
 */
export function useBackendHealth() {
  const backendUrl = useBackendUrl()
  const [isAliveBackend, setIsAliveBackend] = useState(false)

  // ── Backend health check ──
  useEffect(() => {
    let cancelled = false
    const checkHealth = async () => {
      try {
        const response = await fetch(`${backendUrl}${API.health}`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        return data["backend"] === "ok"
      } catch (error) {
        console.error("Error occurred during backend health check:", error)
        return false
      }
    }
    const tick = async () => {
      const ok = await checkHealth()
      if (!cancelled) setIsAliveBackend(ok)
    }
    tick()
    const timer = setInterval(tick, HEALTH_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [backendUrl])

  return { isAliveBackend, setIsAliveBackend }
}
