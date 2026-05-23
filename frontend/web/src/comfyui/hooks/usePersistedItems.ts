import { useCallback, useEffect, useRef, useState } from "react"
import { saveSetting } from "@/lib/serverStorage"
import { clearSyncQueueFor, enqueueSync } from "./useSyncedStorage"

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

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) setItems(loadFn())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = useCallback((next: T[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* ignore quota errors */
    }
    setItems(next)

    effectVersionRef.current++
    const currentVersion = effectVersionRef.current
    if (lastSavedVersionRef.current === currentVersion) return
    lastSavedVersionRef.current = currentVersion

    const serialized = JSON.stringify(next)
    saveSetting(storageKey, serialized).then((ok) => {
      if (lastSavedVersionRef.current !== currentVersion) return
      if (!ok) {
        enqueueSync(storageKey, serialized)
      } else {
        clearSyncQueueFor(storageKey)
      }
    })
  }, [storageKey])

  return { items, persist }
}
