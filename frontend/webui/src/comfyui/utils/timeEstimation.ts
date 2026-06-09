import type { JobView } from "../types/Message"

/**
 * 완료된 작업들의 평균 지속 시간(초)을 계산한다.
 * executionDurationMs 필드를 활용한다.
 */
export function getAverageCompletedDuration(jobs: JobView[], workerId?: string | null): number | null {
  const completed = jobs.filter(
    (j) => j.status === "done" && j.executionDurationMs != null && j.executionDurationMs > 0
  )
  if (completed.length === 0) return null

  if (workerId) {
    const workerCompleted = completed.filter((j) => j.workerId === workerId)
    if (workerCompleted.length > 0) {
      const totalMs = workerCompleted.reduce((sum, j) => sum + (j.executionDurationMs ?? 0), 0)
      return totalMs / workerCompleted.length / 1000
    }
  }

  const totalMs = completed.reduce((sum, j) => sum + (j.executionDurationMs ?? 0), 0)
  return totalMs / completed.length / 1000 // 초 단위로 반환
}

/**
 * 작업의 전체 기준 진행률(0-100)을 계산한다.
 * completedNodeCount, totalNodeCount, progressPercent를 활용한다.
 */
export function getOverallProgress(job: JobView): number {
  if (job.totalNodeCount <= 0) return job.progressPercent
  return (
    ((job.completedNodeCount + job.progressPercent / 100) /
      job.totalNodeCount) *
    100
  )
}

/**
 * 전체 예상 소요 시간(초)을 계산한다.
 *
 * @param overallPercent - 전체 Job 기준 진행률 (0-100)
 * @param jobs - 이전 완료 작업 목록 (평균 계산용)
 * @param workerId - 특정 워커 ID (이 워커의 완료 이력만 필터링하기 위함)
 *
 * 알고리즘:
 * 1. 완료된 작업들의 평균 지속 시간을 기반으로 전체 시간 추정
 * 2. 데이터가 없으면 기존 선형 외삽(linear extrapolation) 방식으로 폴백
 */
export function estimateTotalDuration(
  startedAtSec: number,
  overallPercent: number,
  jobs?: JobView[],
  workerId?: string | null
): number | null {
  if (overallPercent <= 0 || overallPercent >= 100) return null
  const elapsedSec = Date.now() / 1000 - startedAtSec
  if (elapsedSec <= 0) return null

  // 이전 완료 작업 평균을 활용한 예측
  if (jobs && jobs.length > 0) {
    const avgDuration = getAverageCompletedDuration(jobs, workerId)
    if (avgDuration != null) {
      return avgDuration
    }
  }

  // 폴백: 단순 선형 외삽
  return (elapsedSec / overallPercent) * 100
}

/**
 * 남은 예상 시간(초)을 계산한다.
 */
export function estimateRemaining(
  startedAtSec: number,
  overallPercent: number,
  jobs?: JobView[],
  workerId?: string | null
): number | null {
  const total = estimateTotalDuration(startedAtSec, overallPercent, jobs, workerId)
  if (total == null) return null
  const elapsedSec = Date.now() / 1000 - startedAtSec
  return Math.max(0, total - elapsedSec)
}

/**
 * 초 단위 시간을 한국어 포맷 문자열로 변환한다.
 */
export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0초"
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}초`
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)}분`
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  return `${h}시간 ${m}분`
}

/**
 * ETA를 "전체 예상 / 흐른 시간" 형식으로 포맷한다.
 * 예: "1분 30초 / 30초"
 *
 * @param overallPercent - 전체 Job 기준 진행률 (0-100)
 */
export function formatETA(
  startedAtSec: number,
  overallPercent: number,
  jobs?: JobView[],
  workerId?: string | null
): string | null {
  const total = estimateTotalDuration(startedAtSec, overallPercent, jobs, workerId)
  if (total == null) return null
  const elapsedSec = Date.now() / 1000 - startedAtSec
  if (elapsedSec <= 0) return null

  return `${formatTime(total)} / ${formatTime(elapsedSec)}`
}

/**
 * 작업의 실행 지속 시간(ms)을 반환한다.
 */
export function jobDuration(job: JobView): number | null {
  if (job.executionDurationMs != null) return job.executionDurationMs
  if (job.startedAt != null && job.finishedAt != null)
    return (job.finishedAt - job.startedAt) * 1000
  return null
}

/**
 * 밀리초를 사람이 읽을 수 있는 포맷으로 변환한다.
 */
export function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}초`
  const min = Math.floor(sec / 60)
  const remainSec = sec % 60
  if (min < 60) return `${min}분 ${remainSec}초`
  const h = Math.floor(min / 60)
  const remainMin = min % 60
  return `${h}시간 ${remainMin}분`
}

/**
 * Unix epoch 초 기반 상대 시간 문자열을 반환한다.
 */
export function timeAgo(epochSec: number): string {
  const diff = Date.now() / 1000 - epochSec
  if (diff < 60) return "방금"
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

/**
 * 세션 전체 남은 예상 시간을 계산한다.
 * 남은 작업 수 × 평균 지속 시간으로 추정하며, 활성 워커 수로 나누어 병렬성을 보정한다.
 */
export function estimateSessionRemaining(jobs: JobView[], activeWorkersCount: number = 1): number | null {
  const avgDuration = getAverageCompletedDuration(jobs)
  if (avgDuration == null) return null

  // 아직 완료되지 않은 작업 수
  const remainingJobs = jobs.filter(
    (j) => j.status !== "done" && j.status !== "error" && j.status !== "cancelled"
  ).length

  if (remainingJobs === 0) return 0

  const activeCount = Math.max(1, activeWorkersCount)
  return (avgDuration * remainingJobs) / activeCount
}