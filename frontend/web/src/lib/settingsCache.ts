/**
 * 앱 설정 캐시.
 *
 * WebSocketProvider가 서버에서 설정을 로드하면 여기에 반영하고,
 * useSyncedStorage 인스턴스들이 window 이벤트로 통보받아 상태를 갱신한다.
 * localStorage를 함께 업데이트해 늦게 마운트되는 컴포넌트도 최신 값을 읽을 수 있게 한다.
 */

export const SETTINGS_READY_EVENT = "__ceg_settings_ready"
export const SETTINGS_UPDATED_EVENT = "__ceg_settings_updated"

export interface SettingsUpdatedDetail {
  key: string
  value: string | null
}

/** WS 연결/재연결 시 서버 전체 설정을 한 번에 반영. */
export function populateSettingsCache(settings: Record<string, string>): void {
  for (const [k, v] of Object.entries(settings)) {
    try {
      localStorage.setItem(k, v)
    } catch {
      // ignore quota errors
    }
  }
  window.dispatchEvent(
    new CustomEvent<Record<string, string>>(SETTINGS_READY_EVENT, {
      detail: settings,
    })
  )
}

/** 단일 설정 변경(다른 기기의 PUT/DELETE) 시 반영. */
export function applySettingUpdate(
  key: string,
  value: string | null
): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // ignore quota errors
  }
  window.dispatchEvent(
    new CustomEvent<SettingsUpdatedDetail>(SETTINGS_UPDATED_EVENT, {
      detail: { key, value },
    })
  )
}
