/**
 * 서버 동기화 스토리지 훅.
 *
 * 동작:
 *   - 마운트: localStorage 캐시에서 즉시 읽기
 *   - WS 연결/재연결: WebSocketProvider가 fetchAllSettings 후 populateSettingsCache 호출
 *     → __ceg_settings_ready 이벤트 → 마운트된 모든 인스턴스가 최신 값으로 갱신
 *   - 다른 기기 변경: 서버가 settings.updated 브로드캐스트 → WebSocketProvider가
 *     applySettingUpdate 호출 → __ceg_settings_updated 이벤트 → 해당 키 인스턴스 갱신
 *   - setValue: 로컬 상태 즉시 업데이트 + localStorage 캐시 + 서버 비동기 PUT
 *   - 서버 저장 실패: pendingSyncQueue 에 enqueue → useOfflineSync 가 재시도
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { saveSetting, deleteSetting } from "../../lib/serverStorage"
import {
  SETTINGS_READY_EVENT,
  SETTINGS_UPDATED_EVENT,
  type SettingsUpdatedDetail,
} from "../../lib/settingsCache"

const SYNC_QUEUE_KEY = "__ceg_sync_queue"

interface PendingSyncItem {
  key: string
  value: string | null // null = delete
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
  const lastSavedVersionRef = useRef(0)
  const effectVersionRef = useRef(0)
  // defaultValue를 ref로 안정화 — 호출자가 [] 등 리터럴을 넘겨도 재생성 방지
  const defaultValueRef = useRef(defaultValue)
  // 서버/WS에서 수신한 값 적용 시 save effect 스킵 플래그
  const skipNextSaveRef = useRef(false)

  const [value, setValue] = useState<T>(() => {
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
    [isStringDefault]
  )

  // WS 연결/재연결 시 전체 설정 로드 이벤트 처리
  useEffect(() => {
    const onReady = (e: Event) => {
      const all = (e as CustomEvent<Record<string, string>>).detail
      const raw = all[key]
      if (raw === undefined) return
      // 로컬에 pending sync가 있으면 로컬 값이 더 최신 — 서버 값 무시
      // populateSettingsCache가 이미 localStorage를 덮어썼을 수 있으므로 복원
      if (getSyncQueue().some((item) => item.key === key)) {
        try {
          localStorage.setItem(key, serialize(value))
        } catch {
          // ignore quota errors
        }
        return
      }
      skipNextSaveRef.current = true
      setValue(deserialize(raw))
    }
    window.addEventListener(SETTINGS_READY_EVENT, onReady)
    return () => window.removeEventListener(SETTINGS_READY_EVENT, onReady)
  }, [key, deserialize, serialize, value])

  // 다른 기기의 settings.updated 이벤트 처리
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const { key: updatedKey, value: raw } = (
        e as CustomEvent<SettingsUpdatedDetail>
      ).detail
      if (updatedKey !== key) return
      // pending sync가 있으면 로컬 값 우선
      if (getSyncQueue().some((item) => item.key === key)) {
        try {
          localStorage.setItem(key, serialize(value))
        } catch {
          // ignore quota errors
        }
        return
      }
      skipNextSaveRef.current = true
      setValue(raw === null ? defaultValueRef.current : deserialize(raw))
    }
    window.addEventListener(SETTINGS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, onUpdated)
  }, [key, deserialize, serialize, value])

  // 값 변경 시 localStorage 캐시 업데이트 + 서버 비동기 저장
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      return
    }
    // 서버/WS에서 수신한 값이면 다시 PUT하지 않음
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    effectVersionRef.current++
    const currentVersion = effectVersionRef.current

    try {
      const serialized = serialize(value)
      localStorage.setItem(key, serialized)
    } catch {
      // ignore quota errors
    }

    if (lastSavedVersionRef.current === currentVersion) return

    lastSavedVersionRef.current = currentVersion
    const serialized = serialize(value)

    saveSetting(key, serialized).then((ok) => {
      if (lastSavedVersionRef.current !== currentVersion) return
      if (!ok) {
        enqueueSync(key, serialized)
      } else {
        clearSyncQueueFor(key)
      }
    })
  }, [key, value, serialize])

  return [value, setValue] as const
}
