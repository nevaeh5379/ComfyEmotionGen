/**
 * 서버 동기화 스토리지 훅.
 *
 * 데이터를 서버(/app-settings)에 저장하고, 서버 연결 실패 시 localStorage 캐시로 폴백한다.
 * useLocalStorage 와 동일한 [value, setValue] 인터페이스를 제공한다.
 *
 * 동작:
 *   - 마운트: 서버에서 로드 → 실패 시 localStorage → 둘 다 없으면 defaultValue
 *   - setValue: 로컬 상태 즉시 업데이트 + localStorage 캐시 + 서버 비동기 저장
 *   - 서버 저장 실패: pendingSyncQueue 에 enqueue → useOfflineSync 가 재시도
 *   - 다른 탭에서 변경 시 storage 이벤트로 동기화
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  fetchSetting,
  saveSetting,
  deleteSetting,
} from "../../lib/serverStorage"

const SYNC_QUEUE_KEY = "__ceg_sync_queue"

interface PendingSyncItem {
  key: string
  value: string | null // null = delete
  createdAt: number
}

function getSyncQueue(): PendingSyncItem[] {
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
  const queue = getSyncQueue()
  // 같은 키의 기존 항목 제거 (최신 값만 유지)
  const filtered = queue.filter((i) => i.key !== key)
  filtered.push({ key, value, createdAt: Date.now() })
  setSyncQueue(filtered)
}

/** 백그라운드에서 pending queue 처리 (useOfflineSync 에서 호출) */
export async function processSyncQueue(): Promise<number> {
  const queue = getSyncQueue()
  if (queue.length === 0) return 0
  const processed: number[] = []
  for (const item of queue) {
    if (item.value === null) {
      const ok = await deleteSetting(item.key)
      if (ok) processed.push(item.createdAt)
    } else {
      const ok = await saveSetting(item.key, item.value)
      if (ok) processed.push(item.createdAt)
    }
  }
  const remaining = queue.filter((i) => !processed.includes(i.createdAt))
  setSyncQueue(remaining)
  return processed.length
}

/** pending queue 에서 특정 키의 항목 제거 */
export function clearSyncQueueFor(key: string): void {
  const queue = getSyncQueue()
  setSyncQueue(queue.filter((i) => i.key !== key))
}

export function useSyncedStorage<T>(key: string, defaultValue: T) {
  const isStringDefault = typeof defaultValue === "string"
  const initializedRef = useRef(false)
  // 마지막으로 저장한 값의 시계 추적 (중복 저장 방지)
  const lastSavedVersionRef = useRef(0)
  const effectVersionRef = useRef(0)
  // defaultValue를 ref로 안정화 — 호출자가 [] 등 리터럴을 넘겨도 재생성 방지
  const defaultValueRef = useRef(defaultValue)
  // 서버에서 로드된 값 설정 시 save effect 스킵 플래그
  const skipNextSaveRef = useRef(false)

  const [value, setValue] = useState<T>(() => {
    // 초기 렌더에서는 localStorage 캐시만 읽음 (서버는 useEffect 에서 비동기 로드)
    try {
      const stored = localStorage.getItem(key)
      if (stored === null) return defaultValue
      if (isStringDefault) return stored as T
      return JSON.parse(stored) as T
    } catch {
      return defaultValue
    }
  })

  const serialize = useCallback(
    (v: T): string => {
      if (isStringDefault) return v as unknown as string
      return JSON.stringify(v)
    },
    [isStringDefault]
  )

  const deserialize = useCallback(
    (raw: string): T => {
      if (isStringDefault) return raw as unknown as T
      try {
        return JSON.parse(raw) as T
      } catch {
        return defaultValueRef.current
      }
    },
    [isStringDefault] // defaultValue 제거 — ref로 참조하므로 deps 불필요
  )

  // 서버에서 데이터 로드
  useEffect(() => {
    let aborted = false
    const loadFromServer = async () => {
      const raw = await fetchSetting(key)
      if (aborted) return
      if (raw !== null) {
        // 서버 데이터가 있으면 사용 — save effect가 다시 PUT하지 않도록 플래그
        skipNextSaveRef.current = true
        const parsed = deserialize(raw)
        setValue(parsed)
        localStorage.setItem(key, raw)
      }
      // 서버 데이터가 없으면 localStorage 에 이미 있음 (초기 렌더에서 로드됨)
    }
    loadFromServer()
    return () => {
      aborted = true
    }
  }, [key, deserialize])

  // 다른 탭에서 변경 시 동기화
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          const parsed = deserialize(e.newValue)
          setValue(parsed)
        } catch {
          // ignore parse errors
        }
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [key, deserialize])

  // 값 변경 시 localStorage 캐시 업데이트 + 서버 비동기 저장
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      return
    }
    // 서버 로드로 인한 setValue는 서버에 다시 PUT하지 않음
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    effectVersionRef.current++
    const currentVersion = effectVersionRef.current

    // localStorage 캐시 즉시 업데이트
    try {
      const serialized = serialize(value)
      localStorage.setItem(key, serialized)
    } catch {
      // ignore quota errors
    }

    // 이미 동일한 버전이 저장 중이면 스킵
    if (lastSavedVersionRef.current === currentVersion) return

    lastSavedVersionRef.current = currentVersion
    const serialized = serialize(value)

    // 항상 최신 값 저장 (이전 저장과 병렬 실행 가능)
    saveSetting(key, serialized).then((ok) => {
      // 현재 버전과 다르면 더 새로운 값이 저장됨 중이므로 무시
      if (lastSavedVersionRef.current !== currentVersion) return
      if (!ok) {
        enqueueSync(key, serialized)
      } else {
        clearSyncQueueFor(key)
      }
    })
  }, [key, value, serialize, initializedRef])

  return [value, setValue] as const
}
