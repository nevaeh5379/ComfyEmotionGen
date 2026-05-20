import { STORAGE_KEYS } from "@/lib/storageKeys"
import { MS_PER_SECOND } from "@/lib/constants"

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

export function loadMarkers(): SessionMarkerRaw[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]")
  } catch {
    return []
  }
}

export function saveMarkers(ms: SessionMarkerRaw[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(ms))
}

export function loadActiveState(): ActiveStateRaw | null {
  try {
    const raw = localStorage.getItem(ACTIVE_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ActiveStateRaw
  } catch {
    return null
  }
}

export function saveActiveState(state: ActiveStateRaw): void {
  localStorage.setItem(ACTIVE_STATE_KEY, JSON.stringify(state))
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
