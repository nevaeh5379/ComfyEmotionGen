import { useEffect, useState } from "react"
import { checkForUpdate, type UpdateInfo } from "@/lib/updateChecker"
import { BUNDLE_VERSION, UPDATE_CHANNEL, IS_LOCAL_DEV } from "@/version"
import type { AppSettings } from "@/comfyui/hooks/useSettings"

export function useUpdateCheck(
  updateChannel: AppSettings["updateChannel"]
): UpdateInfo | null {
  const effectiveChannel =
    updateChannel === "auto" ? UPDATE_CHANNEL : updateChannel

  const [update, setUpdate] = useState<UpdateInfo | null>(() => {
    if (IS_LOCAL_DEV) return null
    const cacheKey = `ceg_update_check_${BUNDLE_VERSION}_${effectiveChannel}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached !== null && cached !== "") {
      return JSON.parse(cached) as UpdateInfo
    }
    return null
  })

  useEffect((): (() => void) | undefined => {
    if (IS_LOCAL_DEV) return

    const cacheKey = `ceg_update_check_${BUNDLE_VERSION}_${effectiveChannel}`
    const cached = sessionStorage.getItem(cacheKey)

    if (cached !== null && cached !== "") {
      const parsed = JSON.parse(cached) as UpdateInfo
      queueMicrotask(() => {
        setUpdate(parsed)
      })
      return
    }

    let active = true
    void checkForUpdate(effectiveChannel)
      .then((info) => {
        if (!active) return
        sessionStorage.setItem(cacheKey, info ? JSON.stringify(info) : "")
        setUpdate(info)
      })
      .catch((err: unknown) => {
        console.warn("업데이트 확인 실패:", err)
      })
    return () => {
      active = false
    }
  }, [effectiveChannel])

  return update
}
