/**
 * 서버 설정 저장소 클라이언트.
 *
 * 백엔드 /app-settings API 를 통해 설정 데이터를 저장/조회한다.
 * 네트워크 에러 시 null 을 반환하고, 호출자가 localStorage 폴백을 처리한다.
 */

import { STORAGE_KEYS } from "../lib/storageKeys"

const readBackendUrl = (): string => {
  try {
    return (
      localStorage.getItem(STORAGE_KEYS.backendUrl) || "http://127.0.0.1:8000"
    )
  } catch {
    return "http://127.0.0.1:8000"
  }
}

/** 모든 설정을 {key: value}로 반환. 실패 시 null. */
export async function fetchAllSettings(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${readBackendUrl()}/app-settings`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json() as unknown as Record<string, string>
  } catch {
    return null
  }
}

/** 단일 설정 값 반환. 없거나 실패 시 null. */
export async function fetchSetting(key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${readBackendUrl()}/app-settings/${encodeURIComponent(key)}`,
      { cache: "no-store" }
    )
    if (res.status === 404) return null
    if (!res.ok) return null
    const data = (await res.json()) as { value: string }
    return data.value
  } catch {
    return null
  }
}

/** 설정 저장. 성공 시 true, 실패 시 false. */
export async function saveSetting(key: string, value: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${readBackendUrl()}/app-settings/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

/** 설정 삭제. 성공 시 true, 실패 시 false. */
export async function deleteSetting(key: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${readBackendUrl()}/app-settings/${encodeURIComponent(key)}`,
      { method: "DELETE" }
    )
    return res.ok
  } catch {
    return false
  }
}
