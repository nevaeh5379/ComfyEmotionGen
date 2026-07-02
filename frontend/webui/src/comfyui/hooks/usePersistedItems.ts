import { useCallback, useEffect, useRef, useState } from "react"
import { useLatestRef } from "./useLatestRef"
import { saveSetting } from "@/lib/serverStorage"
import { clearSyncQueueFor, enqueueSync } from "./useSyncedStorage"
import {
  SETTINGS_READY_EVENT,
  SETTINGS_UPDATED_EVENT,
  type SettingsUpdatedDetail,
} from "@/lib/settingsCache"

export interface UsePersistedItemsReturn<T> {
  items: T[]
  persist: (next: T[]) => void
}

export function usePersistedItems<T>(
  storageKey: string,
  loadFn: () => T[]
): UsePersistedItemsReturn<T> {
  const [items, setItems] = useState<T[]>(loadFn)
  const lastSavedVersionRef = useRef(0)
  const effectVersionRef = useRef(0)

  const loadFnRef = useLatestRef(loadFn)

  useEffect((): (() => void) | undefined => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === storageKey) setItems(loadFnRef.current())
    }
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
    }
  }, [storageKey, loadFnRef])

  useEffect((): (() => void) | undefined => {
    const onReady = (e: Event): void => {
      const all = (e as CustomEvent<Record<string, string>>).detail
      const raw = all[storageKey]
      if (raw === undefined) return
      try {
        setItems(JSON.parse(raw) as T[])
      } catch (err: unknown) {
        console.warn(`usePersistedItems: ${storageKey} 파싱 실패:`, err)
      }
    }
    window.addEventListener(SETTINGS_READY_EVENT, onReady)
    return () => {
      window.removeEventListener(SETTINGS_READY_EVENT, onReady)
    }
  }, [storageKey])

  useEffect((): (() => void) | undefined => {
    const onUpdated = (e: Event): void => {
      const { key: updatedKey, value: raw } = (
        e as CustomEvent<SettingsUpdatedDetail>
      ).detail
      if (updatedKey !== storageKey) return
      try {
        const nextValue = raw === null ? [] : (JSON.parse(raw) as T[])
        setItems(nextValue)
      } catch (err: unknown) {
        console.warn(
          `usePersistedItems: ${storageKey} 업데이트 파싱 실패:`,
          err
        )
      }
    }
    window.addEventListener(SETTINGS_UPDATED_EVENT, onUpdated)
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, onUpdated)
    }
  }, [storageKey])

  const persist = useCallback(
    (next: T[]) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch (err) {
        console.warn(
          `usePersistedItems: ${storageKey} localStorage 저장 실패:`,
          err
        )
      }
      setItems(next)

      effectVersionRef.current++
      const currentVersion = effectVersionRef.current
      if (lastSavedVersionRef.current === currentVersion) return
      lastSavedVersionRef.current = currentVersion

      const serialized = JSON.stringify(next)
      saveSetting(storageKey, serialized)
        .then((ok) => {
          if (lastSavedVersionRef.current !== currentVersion) return
          if (!ok) {
            enqueueSync(storageKey, serialized)
          } else {
            clearSyncQueueFor(storageKey)
          }
        })
        .catch((err: unknown) => {
          console.warn(`usePersistedItems: ${storageKey} 서버 저장 실패:`, err)
        })
    },
    [storageKey]
  )

  return { items, persist }
}
