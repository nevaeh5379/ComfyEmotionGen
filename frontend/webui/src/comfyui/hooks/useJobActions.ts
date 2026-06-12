import { useCallback, useMemo } from "react"
import { API, HEADERS } from "@/lib/api"
import { toast } from "sonner"
import { useBackend } from "./useBackend"
import { useSessionManager } from "./useSessionManager"
import { useBackendUrl } from "./useBackendUrl"
import { useConfirm } from "./useConfirm"
import { useLatestRef } from "./useLatestRef"

export function useJobActions() {
  const backendUrl = useBackendUrl()
  const { paused } = useBackend()
  const {
    sortedMarkers,
    selectedSessionId,
    activeState,
    refetchStats,
  } = useSessionManager()
  const confirm = useConfirm()

  const sessionRange = useMemo(() => {
    if (sortedMarkers.length === 0 || !selectedSessionId) return { from: null, to: null }
    const targetIdx = sortedMarkers.findIndex((m) => m.id === selectedSessionId)
    if (targetIdx === -1) return { from: null, to: null }

    const target = sortedMarkers[targetIdx]
    if (!target) return { from: null, to: null }

    const isCurrentActive = activeState && selectedSessionId === activeState.activeSessionId

    if (isCurrentActive) {
      return {
        from: activeState.activatedAt / 1000,
        to: null,
      }
    }

    const from = target.startAt / 1000
    let to: number | null = null

    if (targetIdx > 0) {
      const prevMarker = sortedMarkers[targetIdx - 1]
      if (prevMarker) {
        to = prevMarker.startAt / 1000
      }
    } else if (activeState && selectedSessionId !== activeState.activeSessionId) {
      to = activeState.activatedAt / 1000
    }

    return { from, to }
  }, [sortedMarkers, selectedSessionId, activeState])

  // ── Refs for latest values ────────────────────────────────────────
  const backendUrlRef = useLatestRef(backendUrl)
  const pausedRef = useLatestRef(paused)
  const sessionRangeRef = useLatestRef(sessionRange)
  const confirmRef = useLatestRef(confirm)
  const refetchStatsRef = useLatestRef(refetchStats)

  // ── Async internals (no useCallback) ─────────────────────────────
  const getFailedJobIdsInternal = async (): Promise<string[]> => {
    const params = new URLSearchParams()
    params.append("status", "error")
    params.append("status", "cancelled")

    if (sessionRangeRef.current.from !== null) {
      params.append("created_at_from", String(sessionRangeRef.current.from))
    }
    if (sessionRangeRef.current.to !== null) {
      params.append("created_at_to", String(sessionRangeRef.current.to))
    }
    params.append("limit", "999999")

    try {
      const res = await fetch(`${backendUrlRef.current}/jobs?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch failed jobs")
      const data = await res.json()
      return (data.items || []).map((j: unknown) => (j as { id: string }).id)
    } catch (err) {
      console.warn("Failed to fetch failed job IDs:", err)
      return []
    }
  }

  // ── Sync callbacks (call async internals) ────────────────────────
  const handleTogglePause = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrlRef.current}${pausedRef.current ? API.jobs.resume : API.jobs.pause}`, {
        method: "POST",
      })
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    } catch {
      toast.error("일시중지/재개 요청에 실패했습니다.")
    }
  }, [])

  const handleCancelAll = useCallback(async () => {
    if (!(await confirmRef.current({
      title: "작업 취소",
      description: "진행 중인 모든 작업을 취소하시겠습니까?",
      variant: "destructive",
      confirmText: "모두 취소",
    })))
      return
    try {
      const res = await fetch(`${backendUrlRef.current}${API.jobs.cancelAll}`, {
        method: "POST",
      })
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    } catch {
      toast.error("전체 취소 요청에 실패했습니다.")
    }
  }, [])

  const handleRetryAllFailed = useCallback(async () => {
    const failedIds = await getFailedJobIdsInternal()
    if (failedIds.length === 0) {
      toast.info("재시도할 실패/취소된 작업이 없습니다.")
      return
    }
    if (!(await confirmRef.current({
      title: "실패 작업 재시도",
      description: `실패/취소된 작업 ${failedIds.length}개를 모두 재시도하시겠습니까?`,
      confirmText: "모두 재시도",
    })))
      return
    try {
      const promises = failedIds.map((id) =>
        fetch(`${backendUrlRef.current}${API.jobs.retry(id)}`, { method: "POST" })
      )
      const results = await Promise.all(promises)
      const successCount = results.filter((r) => r.ok).length
      if (successCount === failedIds.length) {
        toast.success(`실패/취소된 작업 ${successCount}개를 재시도했습니다.`)
      } else {
        toast.warning(`작업 일부 재시도 실패 (${successCount}/${failedIds.length} 성공)`)
      }
      refetchStatsRef.current?.()
      window.dispatchEvent(new CustomEvent("ceg-refetch-jobs"))
    } catch {
      toast.error("작업 재시도 요청에 실패했습니다.")
    }
  }, [])

  const handleDeleteAllFailed = useCallback(async () => {
    const failedIds = await getFailedJobIdsInternal()
    if (failedIds.length === 0) {
      toast.info("삭제할 실패/취소된 작업이 없습니다.")
      return
    }
    if (!(await confirmRef.current({
      title: "실패 작업 삭제",
      description: `실패/취소된 작업 ${failedIds.length}개를 모두 영구 삭제하시겠습니까?`,
      variant: "destructive",
      confirmText: "모두 삭제",
    })))
      return
    try {
      const res = await fetch(`${backendUrlRef.current}${API.jobs.delete}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ job_ids: failedIds }),
      })
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
      toast.success("실패/취소된 작업을 모두 삭제했습니다.")
      refetchStatsRef.current?.()
      window.dispatchEvent(new CustomEvent("ceg-refetch-jobs"))
    } catch {
      toast.error("실패 작업 삭제 요청에 실패했습니다.")
    }
  }, [])

  return useMemo(() => ({
    handleTogglePause,
    handleCancelAll,
    handleRetryAllFailed,
    handleDeleteAllFailed,
  }), [
    handleTogglePause,
    handleCancelAll,
    handleRetryAllFailed,
    handleDeleteAllFailed,
  ])
}
