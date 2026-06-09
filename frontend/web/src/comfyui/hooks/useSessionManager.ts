import { useCallback, useEffect, useMemo, useState } from "react"

import type { JobView } from "@/comfyui/types/Message"
import type { JobStatus } from "@/comfyui/types/Message"
import { useBackend } from "./useBackend"
import {
  type SessionMarkerRaw,
  type ActiveStateRaw,
  initMarkers,
  initActiveState,
  saveMarkers,
  saveActiveState,
  genId,
  jobSessionId,
  makeSessionLabel,
  loadMarkersFromServer,
  loadActiveStateFromServer,
} from "@/comfyui/utils/sessionUtils"

export interface UseSessionManagerReturn {
  /** All session markers (unsorted) */
  markers: SessionMarkerRaw[]
  /** Raw state setter for markers (use persistMarkers for persistence) */
  setMarkersRaw: React.Dispatch<React.SetStateAction<SessionMarkerRaw[]>>
  /** Current active session state */
  activeState: ActiveStateRaw
  /** Raw state setter for activeState (use persistActiveState for persistence) */
  setActiveStateRaw: React.Dispatch<React.SetStateAction<ActiveStateRaw>>
  /** Persist markers to localStorage + server and update React state */
  persistMarkers: (ms: SessionMarkerRaw[]) => void
  /** Persist active state to localStorage + server and update React state */
  persistActiveState: (as: ActiveStateRaw) => void
  /** Markers sorted by startAt descending */
  sortedMarkers: SessionMarkerRaw[]
  /** Currently selected session ID */
  selectedSessionId: string
  /** Setter for selected session ID */
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string>>
  /** Map of sessionId -> job count */
  sessionJobCounts: Map<string, number>
  /** Jobs belonging to the currently selected session */
  sessionJobs: JobView[]
  /** Status counts for the current session */
  sessionCounts: Record<JobStatus | "active", number>
  /** Whether session picker dialog is open */
  sessionPickerOpen: boolean
  /** Setter for session picker open state */
  setSessionPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** Create a new session, cleaning up empty markers */
  createNewSession: () => void
}

export function useSessionManager(): UseSessionManagerReturn {
  const { jobs, jobMetas } = useBackend()

  // ── Initialise from local cache synchronously ──
  const initialMarkers = useMemo(() => initMarkers(), [])
  const [markers, setMarkersRaw] = useState<SessionMarkerRaw[]>(
    () => initialMarkers
  )

  const persistMarkers = useCallback((ms: SessionMarkerRaw[]) => {
    saveMarkers(ms)
    setMarkersRaw(ms)
  }, [])

  const [activeState, setActiveStateRaw] = useState<ActiveStateRaw>(() =>
    initActiveState(initialMarkers)
  )

  const persistActiveState = useCallback((as: ActiveStateRaw) => {
    saveActiveState(as)
    setActiveStateRaw(as)
  }, [])

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => b.startAt - a.startAt),
    [markers]
  )

  // Default: newest marker
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    () =>
      activeState?.activeSessionId ??
      [...initialMarkers].sort((a, b) => b.startAt - a.startAt)[0]!.id
  )

  // ── Load from server on mount ──
  useEffect(() => {
    let aborted = false
    Promise.all([loadMarkersFromServer(), loadActiveStateFromServer()]).then(
      ([serverMarkers, serverActiveState]) => {
        if (aborted) return
        if (serverMarkers.length > 0) {
          setMarkersRaw(serverMarkers)
        }
        if (serverActiveState) {
          setActiveStateRaw(serverActiveState)
          setSelectedSessionId(serverActiveState.activeSessionId)
        }
      }
    ).catch((err) => console.warn("세션 데이터 로드 실패:", err))
    return () => {
      aborted = true
    }
  }, [])

  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)

  // ── Derived state ──
  const sessionJobCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of jobMetas) {
      const sid = jobSessionId(j.createdAt, sortedMarkers, activeState)
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [jobMetas, sortedMarkers, activeState])

  const sessionJobIds = useMemo(() => {
    const ids = new Set<string>()
    for (const j of jobMetas) {
      if (
        jobSessionId(j.createdAt, sortedMarkers, activeState) ===
        selectedSessionId
      ) {
        ids.add(j.id)
      }
    }
    return ids
  }, [jobMetas, sortedMarkers, activeState, selectedSessionId])

  const sessionJobs = useMemo(
    () => jobs.filter((j) => sessionJobIds.has(j.id)),
    [jobs, sessionJobIds]
  )

  const sessionCounts = useMemo(() => {
    const c: Record<JobStatus | "active", number> = {
      pending: 0,
      queued: 0,
      running: 0,
      done: 0,
      error: 0,
      cancelled: 0,
      active: 0,
    }
    for (const j of sessionJobs) {
      c[j.status]++
      if (
        j.status === "pending" ||
        j.status === "queued" ||
        j.status === "running"
      )
        c.active++
    }
    return c
  }, [sessionJobs])

  const createNewSession = useCallback(() => {
    const nonEmpty = markers.filter(
      (m) => (sessionJobCounts.get(m.id) ?? 0) > 0
    )
    if (nonEmpty.length < markers.length) {
      persistMarkers(nonEmpty)
    }
    const newMarker: SessionMarkerRaw = {
      id: genId(),
      startAt: Date.now(),
      label: makeSessionLabel(nonEmpty.length + 1),
    }
    persistMarkers([...nonEmpty, newMarker])
    persistActiveState({
      activeSessionId: newMarker.id,
      activatedAt: Date.now(),
    })
    setSelectedSessionId(newMarker.id)
    setSessionPickerOpen(false)
  }, [markers, sessionJobCounts, persistMarkers, persistActiveState])

  return useMemo(() => ({
    markers,
    setMarkersRaw,
    activeState,
    setActiveStateRaw,
    persistMarkers,
    persistActiveState,
    sortedMarkers,
    selectedSessionId,
    setSelectedSessionId,
    sessionJobCounts,
    sessionJobs,
    sessionCounts,
    sessionPickerOpen,
    setSessionPickerOpen,
    createNewSession,
  }), [
    markers,
    setMarkersRaw,
    activeState,
    setActiveStateRaw,
    persistMarkers,
    persistActiveState,
    sortedMarkers,
    selectedSessionId,
    setSelectedSessionId,
    sessionJobCounts,
    sessionJobs,
    sessionCounts,
    sessionPickerOpen,
    setSessionPickerOpen,
    createNewSession,
  ])
}
