import { useEffect, useState } from "react"
import { checkForUpdate, type UpdateInfo } from "@/lib/updateChecker"
import { BUNDLE_VERSION, UPDATE_CHANNEL, IS_LOCAL_DEV } from "@/version"
import type { AppSettings } from "@/comfyui/hooks/useSettings"

export function useUpdateCheck(
  updateChannel: AppSettings["updateChannel"]
): UpdateInfo | null {
  const effectiveChannel =
    updateChannel === "auto" ? UPDATE_CHANNEL : updateChannel

  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    if (IS_LOCAL_DEV) return

    const cacheKey = `ceg_update_check_${BUNDLE_VERSION}_${effectiveChannel}`
    const cached = sessionStorage.getItem(cacheKey)

    if (cached !== null) {
      setUpdate(cached ? (JSON.parse(cached) as UpdateInfo) : null)
      return
    }

    let active = true
    checkForUpdate(effectiveChannel).then((info) => {
      if (!active) return
      sessionStorage.setItem(cacheKey, info ? JSON.stringify(info) : "")
      setUpdate(info)
    })
    return () => {
      active = false
    }
  }, [effectiveChannel])

  return update
}
