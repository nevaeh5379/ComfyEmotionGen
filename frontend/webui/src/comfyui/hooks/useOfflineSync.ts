/**
 * 오프라인 동기화 훅.
 *
 * 실패한 서버 저장 항목을 30초 주기로 재시도한다.
 * App 레벨에서 한 번만 마운트하면 된다.
 */

import { useEffect, useRef } from "react"
import { processSyncQueue } from "./useSyncedStorage"

const SYNC_INTERVAL_MS = 30_000

export function useOfflineSync(): void {
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    // 마운트 시 즉시 한 번 시도
    processSyncQueue().catch((err: unknown) => {
      console.warn("Offline sync error:", err)
    })

    intervalRef.current = window.setInterval(() => {
      processSyncQueue().catch((err: unknown) => {
        console.warn("Offline sync error:", err)
      })
    }, SYNC_INTERVAL_MS)

    return (): void => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])
}
