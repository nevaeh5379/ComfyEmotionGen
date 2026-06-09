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
  /** Jobs belonging to the currently selected session (now returned as empty since managed via paginated API) */
  sessionJobs: JobView[]
  /** Status counts for the current session */
  sessionCounts: Record<JobStatus | "active", number>
  /** Whether session picker dialog is open */
  sessionPickerOpen: boolean
  /** Setter for session picker open state */
  setSessionPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** Create a new session, cleaning up empty markers */
  createNewSession: () => void
  /** Trigger a manual refetch of stats */
  refetchStats: () => void
}

export function useSessionManager(): UseSessionManagerReturn {
  const { jobs } = useBackend()
  const backendUrl = useMemo(() => {
    // 런타임 backendUrl을 BackendContext 등에서 읽어오거나 
    // WebSocketProvider와 동일하게 로컬스토리지 등에서 파싱할 수 있으나,
    // 일반적으로 useBackend에서 backendUrl 설정 정보가 제공되지 않으므로 
    // localStorage의 backendUrl 키를 직접 파싱하거나 useBackend()의 다른 파츠를 볼 수 있다.
    // fetch에 사용할 백엔드 주소를 가져오기 위해 basic fallback을 적용한다.
    try {
      return localStorage.getItem("ceg_backend_url") || "http://127.0.0.1:8188"
    } catch {
      return "http://127.0.0.1:8188"
    }
  }, [])

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

  // ── Async Stats State ──
  const [sessionJobCounts, setSessionJobCounts] = useState<Map<string, number>>(new Map())
  const [sessionCounts, setSessionCounts] = useState<Record<JobStatus | "active", number>>({
    pending: 0,
    queued: 0,
    running: 0,
    done: 0,
    error: 0,
    cancelled: 0,
    active: 0,
  })
  const [statsTick, setStatsTick] = useState(0)
  const refetchStats = useCallback(() => setStatsTick((t) => t + 1), [])

  // 활성 잡들의 상태 변화가 생기면 실시간 카운트 리프레시
  const activeJobsKey = useMemo(() => jobs.map((j) => `${j.id}:${j.status}`).join(","), [jobs])

  useEffect(() => {
    let aborted = false
    if (markers.length === 0) return

    const fetchStats = async () => {
      try {
        const res = await fetch(`${backendUrl}/jobs/session-stats`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            markers,
            activeState,
            selectedSessionId,
          }),
        })
        if (!res.ok) throw new Error("Stats load failed")
        const data = await res.json()
        if (aborted) return

        const map = new Map<string, number>()
        if (data.sessionJobCounts) {
          for (const [k, v] of Object.entries(data.sessionJobCounts)) {
            map.set(k, v as number)
          }
        }
        setSessionJobCounts(map)
        if (data.selectedSessionCounts) {
          setSessionCounts(data.selectedSessionCounts)
        }
      } catch (err) {
        console.warn("세션 통계 로드 실패:", err)
      }
    }

    fetchStats()

    return () => {
      aborted = true
    }
  }, [markers, activeState, selectedSessionId, backendUrl, activeJobsKey, statsTick])

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

  const sessionJobs = useMemo<JobView[]>(() => [], [])

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
    refetchStats,
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
    refetchStats,
  ])
}
