import { STORAGE_KEYS } from "@/lib/storageKeys"
import { MS_PER_SECOND } from "@/lib/constants"
import { fetchSetting, saveSetting } from "@/lib/serverStorage"

export interface SessionMarkerRaw {
  id: string
  startAt: number // ms epoch; 0 = beginning of time (catches all prior jobs)
  label: string
}

export interface ActiveStateRaw {
  activeSessionId: string
  activatedAt: number // ms epoch; jobs created on/after this time go to activeSessionId
}

const SESSIONS_KEY = STORAGE_KEYS.sessions
const ACTIVE_STATE_KEY = STORAGE_KEYS.activeState

// 캐시 (마운트 후 한 번 로드)
let _markersCache: SessionMarkerRaw[] | null = null
let _activeStateCache: ActiveStateRaw | null = null

/** 서버에서 세션 마커 로드 (실패 시 localStorage 폴백) */
export async function loadMarkersFromServer(): Promise<SessionMarkerRaw[]> {
  try {
    const raw = await fetchSetting(SESSIONS_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as SessionMarkerRaw[]
      if (Array.isArray(parsed)) {
        _markersCache = parsed
        return parsed
      }
    }
  } catch {
    // ignore
  }
  // localStorage 폴백
  return loadMarkersLocal()
}

/** 서버에서 액티브 상태 로드 (실패 시 localStorage 폴백) */
export async function loadActiveStateFromServer(): Promise<ActiveStateRaw | null> {
  try {
    const raw = await fetchSetting(ACTIVE_STATE_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as ActiveStateRaw
      _activeStateCache = parsed
      return parsed
    }
  } catch {
    // ignore
  }
  // localStorage 폴백
  return loadActiveStateLocal()
}

/** 로컬 세션 마커 저장 (localStorage 캐시 + 서버 비동기) */
export function saveMarkers(ms: SessionMarkerRaw[]): void {
  _markersCache = ms
  const serialized = JSON.stringify(ms)
  try {
    localStorage.setItem(SESSIONS_KEY, serialized)
  } catch {
    // ignore quota errors
  }
  // 서버 비동기 저장
  saveSetting(SESSIONS_KEY, serialized).catch(() => {})
}

/** 로컬 액티브 상태 저장 (localStorage 캐시 + 서버 비동기) */
export function saveActiveState(state: ActiveStateRaw): void {
  _activeStateCache = state
  const serialized = JSON.stringify(state)
  try {
    localStorage.setItem(ACTIVE_STATE_KEY, serialized)
  } catch {
    // ignore quota errors
  }
  // 서버 비동기 저장
  saveSetting(ACTIVE_STATE_KEY, serialized).catch(() => {})
}

/** localStorage 에서만 읽기 (동기) */
export function loadMarkersLocal(): SessionMarkerRaw[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]")
  } catch {
    return []
  }
}

/** localStorage 에서만 읽기 (동기) */
export function loadActiveStateLocal(): ActiveStateRaw | null {
  try {
    const raw = localStorage.getItem(ACTIVE_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ActiveStateRaw
  } catch {
    return null
  }
}

/** 호환성용: 캐시가 있으면 반환, 없으면 localStorage */
export function loadMarkers(): SessionMarkerRaw[] {
  if (_markersCache !== null) return _markersCache
  return loadMarkersLocal()
}

/** 호환성용: 캐시가 있으면 반환, 없으면 localStorage */
export function loadActiveState(): ActiveStateRaw | null {
  if (_activeStateCache !== null) return _activeStateCache
  return loadActiveStateLocal()
}

/** 캐시 초기화 (데이터 새로고침용) */
export function clearSessionCache(): void {
  _markersCache = null
  _activeStateCache = null
}

export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function initMarkers(): SessionMarkerRaw[] {
  const stored = loadMarkers()
  if (stored.length > 0) return stored
  const init: SessionMarkerRaw = { id: genId(), startAt: 0, label: "세션 1" }
  saveMarkers([init])
  return [init]
}

export function initActiveState(markers: SessionMarkerRaw[]): ActiveStateRaw {
  const stored = loadActiveState()
  if (stored) return stored
  const sorted = [...markers].sort((a, b) => b.startAt - a.startAt)
  const newest = sorted[0]!
  return { activeSessionId: newest.id, activatedAt: newest.startAt }
}

// A job belongs to the active session if createdAt >= activatedAt.
// Otherwise, it belongs to the newest marker whose startAt <= job.createdAt * 1000.
export function jobSessionId(
  createdAtSec: number,
  sortedDesc: SessionMarkerRaw[],
  activeState: ActiveStateRaw | null
): string {
  const t = createdAtSec * MS_PER_SECOND
  if (activeState && t >= activeState.activatedAt) {
    return activeState.activeSessionId
  }
  for (const m of sortedDesc) {
    if (t >= m.startAt) return m.id
  }
  return sortedDesc[sortedDesc.length - 1]?.id ?? ""
}

export function makeSessionLabel(count: number): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `세션 ${count} · ${mm}/${dd} ${hh}:${mi}`
}
