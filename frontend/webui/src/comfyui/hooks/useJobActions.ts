import { useCallback, useMemo } from "react"
import { API, HEADERS } from "@/lib/api"
import { toast } from "sonner"
import { useBackend } from "./useBackend"
import { useSessionManager } from "./useSessionManager"
import { useBackendUrl } from "./useBackendUrl"
import { useConfirm } from "./useConfirm"

export function useJobActions() {
  const backendUrl = useBackendUrl()
  const { paused } = useBackend()
  const { sessionJobs } = useSessionManager()
  const confirm = useConfirm()

  const handleTogglePause = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}${paused ? API.jobs.resume : API.jobs.pause}`, {
        method: "POST",
      })
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    } catch {
      toast.error("일시중지/재개 요청에 실패했습니다.")
    }
  }, [backendUrl, paused])

  const handleCancelAll = useCallback(async () => {
    if (
      !(await confirm({
        title: "작업 취소",
        description: "진행 중인 모든 작업을 취소하시겠습니까?",
        variant: "destructive",
        confirmText: "모두 취소",
      }))
    )
      return
    try {
      const res = await fetch(`${backendUrl}${API.jobs.cancelAll}`, {
        method: "POST",
      })
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    } catch {
      toast.error("전체 취소 요청에 실패했습니다.")
    }
  }, [backendUrl, confirm])

  const handleRetryAllFailed = useCallback(async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    for (const j of failed) {
      try {
        const res = await fetch(`${backendUrl}${API.jobs.retry(j.id)}`, {
          method: "POST",
        })
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
      } catch {
        toast.error(`작업 재시도에 실패했습니다: ${j.id.slice(0, 8)}`)
      }
    }
  }, [backendUrl, sessionJobs])

  const handleDeleteAllFailed = useCallback(async () => {
    const failed = sessionJobs.filter(
      (j) => j.status === "error" || j.status === "cancelled"
    )
    if (failed.length === 0) return
    if (
      !(await confirm({
        title: "실패 작업 삭제",
        description: `실패/취소된 작업 ${failed.length}개를 모두 영구 삭제하시겠습니까?`,
        variant: "destructive",
        confirmText: "모두 삭제",
      }))
    )
      return
    try {
      const res = await fetch(`${backendUrl}${API.jobs.delete}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ job_ids: failed.map((j) => j.id) }),
      })
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    } catch {
      toast.error("실패 작업 삭제 요청에 실패했습니다.")
    }
  }, [backendUrl, sessionJobs, confirm])

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
