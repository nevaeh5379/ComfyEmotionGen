import { useCallback, useEffect, useRef, useState } from "react"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { saveSetting } from "@/lib/serverStorage"
import { clearSyncQueueFor, enqueueSync } from "./useSyncedStorage"

export interface SavedTemplate {
  id: string
  name: string
  template: string
  savedAt: number
}

const STORAGE_KEY = STORAGE_KEYS.savedTemplates

function load(): SavedTemplate[] {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]"
    ) as SavedTemplate[]
  } catch {
    return []
  }
}

export function useSavedTemplates() {
  const [templates, setTemplates] = useState<SavedTemplate[]>(load)
  const lastSavedVersionRef = useRef(0)
  const effectVersionRef = useRef(0)

  // 다른 탭에서 변경 시 동기화
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setTemplates(load())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const persist = useCallback((next: SavedTemplate[]) => {
    // localStorage 캐시 즉시 업데이트
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore quota errors
    }
    setTemplates(next)

    // 버전 추적 (중복 저장 방지)
    effectVersionRef.current++
    const currentVersion = effectVersionRef.current
    if (lastSavedVersionRef.current === currentVersion) return
    lastSavedVersionRef.current = currentVersion

    // 서버에 비동기 저장
    const serialized = JSON.stringify(next)
    saveSetting(STORAGE_KEY, serialized).then((ok) => {
      if (lastSavedVersionRef.current !== currentVersion) return
      if (!ok) {
        enqueueSync(STORAGE_KEY, serialized)
      } else {
        clearSyncQueueFor(STORAGE_KEY)
      }
    })
  }, [])

  const saveTemplate = useCallback(
    (name: string, template: string): SavedTemplate => {
      const trimmed = name.trim()
      const all = load()
      const existing = all.find((t) => t.name === trimmed)
      if (existing) {
        const updated = { ...existing, template, savedAt: Date.now() }
        persist(all.map((t) => (t.id === existing.id ? updated : t)))
        return updated
      } else {
        const next: SavedTemplate = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: trimmed,
          template,
          savedAt: Date.now(),
        }
        persist([...all, next])
        return next
      }
    },
    [persist]
  )

  const deleteTemplate = useCallback(
    (id: string) => {
      persist(load().filter((t) => t.id !== id))
    },
    [persist]
  )

  return { templates, saveTemplate, deleteTemplate }
}
