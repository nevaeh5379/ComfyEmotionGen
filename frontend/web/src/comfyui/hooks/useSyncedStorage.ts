import { useCallback, useEffect, useRef, useState } from "react"
import { saveSetting, deleteSetting } from "../../lib/serverStorage"
import {
  SETTINGS_READY_EVENT,
  SETTINGS_UPDATED_EVENT,
  type SettingsUpdatedDetail,
} from "../../lib/settingsCache"
import { toast } from "sonner"

const SYNC_QUEUE_KEY = "__ceg_sync_queue"

interface PendingSyncItem {
  key: string
  value: string | null
  createdAt: number
}

export function getSyncQueue(): PendingSyncItem[] {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) ?? "[]")
  } catch {
    return []
  }
}

function setSyncQueue(queue: PendingSyncItem[]): void {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // ignore quota errors
  }
}

export function enqueueSync(key: string, value: string | null): void {
  const queue = getSyncQueue().filter((i) => i.key !== key)
  queue.push({ key, value, createdAt: Date.now() })
  setSyncQueue(queue)
}

export async function processSyncQueue(): Promise<number> {
  const queue = getSyncQueue()
  if (queue.length === 0) return 0

  const successIds = new Set<number>()
  for (const item of queue) {
    const ok =
      item.value === null
        ? await deleteSetting(item.key)
        : await saveSetting(item.key, item.value)
    if (ok) successIds.add(item.createdAt)
  }

  const remaining = queue.filter((i) => !successIds.has(i.createdAt))
  setSyncQueue(remaining)
  return successIds.size
}

export function clearSyncQueueFor(key: string): void {
  setSyncQueue(getSyncQueue().filter((i) => i.key !== key))
}

export function useSyncedStorage<T>(
  key: string,
  defaultValue: T,
  options?: { manual?: boolean }
) {
  const isStringDefault = typeof defaultValue === "string"
  const initializedRef = useRef(false)
  const saveIdRef = useRef(0)
  const defaultValueRef = useRef(defaultValue)
  const lastServerValueRef = useRef<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  // [수정 1] 렌더링 단계인 useState 초기화 함수 내부에서는 Ref 접근 금지.
  // 이미 스코프에 존재하는 defaultValue 파라미터를 직접 사용합니다.
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === null) return defaultValue
      return isStringDefault ? (stored as T) : (JSON.parse(stored) as T)
    } catch {
      return defaultValue
    }
  })

  const serialize = useCallback(
    (v: T): string =>
      isStringDefault ? (v as unknown as string) : JSON.stringify(v),
    [isStringDefault]
  )

  const deserialize = useCallback(
    (raw: string): T => {
      if (isStringDefault) return raw as unknown as T
      try {
        return JSON.parse(raw) as T
      } catch {
        // ✅ useCallback 내부(나중에 실행됨)에서는 Ref 접근이 안전합니다.
        return defaultValueRef.current
      }
    },
    [isStringDefault]
  )

  const valueRef = useRef<T>(value)

  // [수정 2] 컴포넌트 본문(렌더링 단계)에서 ref.current에 값을 할당하면 안 됩니다.
  // 반드시 useEffect 내부에서 동기화해야 린트 오류가 발생하지 않습니다.
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const handlePendingConflict = useCallback(() => {
    if (getSyncQueue().some((i) => i.key === key)) {
      try {
        localStorage.setItem(key, serialize(valueRef.current))
      } catch {
        // ignore
      }
      return true
    }
    return false
  }, [key, serialize])

  useEffect(() => {
    const onReady = (e: Event) => {
      const all = (e as CustomEvent<Record<string, string>>).detail
      const raw = all[key]
      if (raw === undefined || handlePendingConflict()) return

      const nextValue = deserialize(raw)
      lastServerValueRef.current = serialize(nextValue)
      setIsDirty(false)
      setValue(nextValue)
    }
    window.addEventListener(SETTINGS_READY_EVENT, onReady)
    return () => window.removeEventListener(SETTINGS_READY_EVENT, onReady)
  }, [key, deserialize, handlePendingConflict, serialize])

  useEffect(() => {
    const onUpdated = (e: Event) => {
      const { key: updatedKey, value: raw } = (
        e as CustomEvent<SettingsUpdatedDetail>
      ).detail
      if (updatedKey !== key || handlePendingConflict()) return

      const nextValue =
        raw === null ? defaultValueRef.current : deserialize(raw)
      lastServerValueRef.current = serialize(nextValue)
      setIsDirty(false)
      setValue(nextValue)
    }
    window.addEventListener(SETTINGS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, onUpdated)
  }, [key, deserialize, handlePendingConflict, serialize])

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      return
    }

    const serialized = serialize(value)
    try {
      localStorage.setItem(key, serialized)
    } catch {
      // ignore
    }

    const isCurrentDirty = serialized !== lastServerValueRef.current
    setIsDirty(isCurrentDirty)

    if (options?.manual) {
      return
    }

    if (!isCurrentDirty) {
      clearSyncQueueFor(key)
      return
    }

    const currentId = ++saveIdRef.current
    saveSetting(key, serialized).then((ok) => {
      if (saveIdRef.current !== currentId) return
      if (!ok) enqueueSync(key, serialized)
      else {
        clearSyncQueueFor(key)
        lastServerValueRef.current = serialized
        setIsDirty(false)
      }
    })
  }, [key, value, serialize, options?.manual])

  const saveToServer = useCallback(() => {
    const serialized = serialize(valueRef.current)
    const currentId = ++saveIdRef.current
    return saveSetting(key, serialized).then((ok) => {
      if (saveIdRef.current !== currentId) return false
      if (!ok) {
        enqueueSync(key, serialized)
        toast.error("서버 저장에 실패했습니다. (오프라인 상태)")
      } else {
        clearSyncQueueFor(key)
        lastServerValueRef.current = serialized
        setIsDirty(false)
      }
      return ok
    })
  }, [key, serialize])

  const revert = useCallback(() => {
    if (lastServerValueRef.current !== null) {
      const serverValue = deserialize(lastServerValueRef.current)
      setValue(serverValue)
      setIsDirty(false)
    }
  }, [deserialize])

  return [value, setValue, { isDirty, saveToServer, revert }] as const
}
