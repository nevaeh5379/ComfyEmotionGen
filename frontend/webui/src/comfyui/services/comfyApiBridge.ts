import type { BackendEvent, JobView } from "../types/Message"

function dispatch(type: string, detail?: unknown): void {
  const w = window as unknown as Record<string, unknown>
  const api = w.api
  if (api !== undefined && typeof api === 'object' && api !== null && 'dispatchCustomEvent' in api && typeof (api as Record<string, unknown>).dispatchCustomEvent === 'function') {
    if (detail !== undefined) {
      ;(api as Record<string, unknown>).dispatchCustomEvent(type, detail)
    } else {
      ;(api as Record<string, unknown>).dispatchCustomEvent(type)
    }
  }
}

function dispatchStatusFromJobs(jobs: JobView[]): void {
  const running = jobs.filter((j): boolean => j.status === 'running').length
  const queued = jobs.filter((j): boolean => j.status === 'queued').length
  const queueRemaining = running + queued
  dispatch('status', {
    status: {
      exec_info: { queue_remaining: queueRemaining },
    },
  })
}

export function applyComfyApiBridge(event: BackendEvent): void {
  switch (event.type) {
    case 'snapshot': {
      dispatchStatusFromJobs(event.jobs)
      break
    }

    case 'job.created': {
      dispatchStatusFromJobs([event.job])
      break
    }

    case 'job.updated': {
      const job = event.job

      switch (job.status) {
        case 'running':
          dispatch('executing', {
            node: job.currentNodeName || null,
            prompt_id: job.id,
          })
          break

        case 'done':
          dispatch('execution_success', { prompt_id: job.id })
          dispatch('executing', { node: null })
          break

        case 'error':
          dispatch('execution_error', {
            prompt_id: job.id,
            node_id: '',
            node_type: '',
            exception_message: job.error ?? 'Unknown error',
          })
          dispatch('executing', { node: null })
          break

        case 'cancelled':
          dispatch('execution_interrupted', {
            prompt_id: job.id,
            node_id: '',
            node_type: '',
          })
          dispatch('executing', { node: null })
          break
      }

      if (job.progressPercent > 0 && job.status === 'running' || job.status === 'queued') {
        dispatch('progress', {
          value: Math.round(job.completedNodeCount),
          max: Math.max(job.totalNodeCount, 1),
        })
      }

      dispatchStatusFromJobs([job])
      break
    }

    case 'job.deleted':
    case 'control.updated':
    case 'worker.added':
    case 'worker.removed':
    case 'worker.updated':
    case 'worker.preview':
    case 'settings.updated':
    case 'image.saved':
    case 'image.curation':
    case 'image.deleted':
      break
  }
}
