/**
 * 서버 설정 저장소 클라이언트.
 *
 * 백엔드 /app-settings API 를 통해 설정 데이터를 저장/조회한다
 * 네트워크 에러 시 null 을 반환하고, 호출자가 localStorage 폴백을 처리한다.
 */

import { STORAGE_KEYS } from "../lib/storageKeys"
import { DEFAULT_BACKEND_URL } from "../lib/runtime"
import { toast } from "sonner"

export const CLIENT_ID = Math.random().toString(36).substring(2) + Date.now().toString(36);

const readBackendUrl = (): string => {
  try {
    return (
      localStorage.getItem(STORAGE_KEYS.backendUrl) || DEFAULT_BACKEND_URL
    )
  } catch {
    return DEFAULT_BACKEND_URL
  }
}

/** 모든 설정을 {key: value}로 반환. 실패 시 null. */
export async function fetchAllSettings(): Promise<Record<
  string,
  string
> | null> {
  try {
    const res = await fetch(`${readBackendUrl()}/app-settings`, {
      cache: "no-store",
    })
    if (!res.ok) {
      toast.error(`설정 로드 실패: HTTP ${res.status}`)
      return null
    }
    return res.json() as unknown as Record<string, string>
  } catch {
    toast.error("설정 로드 실패: 서버에 연결할 수 없습니다.")
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
    if (!res.ok) {
      toast.error(`설정 로드 실패: HTTP ${res.status}`)
      return null
    }
    const data = (await res.json()) as { value: string }
    return data.value
  } catch {
    toast.error("설정 로드 실패: 서버에 연결할 수 없습니다.")
    return null
  }
}

/** 설정 저장. 성공 시 true, 실패 시 false. */
export async function saveSetting(
  key: string,
  value: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${readBackendUrl()}/app-settings/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": CLIENT_ID
        },
        body: JSON.stringify({ value }),
      }
    )
    if (!res.ok) {
      toast.error(`설정 저장 실패: HTTP ${res.status}`)
      return false
    }
    return res.ok
  } catch {
    toast.error("설정 저장 실패: 서버에 연결할 수 없습니다.")
    return false
  }
}

/** 설정 삭제. 성공 시 true, 실패 시 false. */
export async function deleteSetting(key: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${readBackendUrl()}/app-settings/${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: {
          "X-Client-Id": CLIENT_ID
        }
      }
    )
    if (!res.ok) {
      toast.error(`설정 삭제 실패: HTTP ${res.status}`)
      return false
    }
    return res.ok
  } catch {
    toast.error("설정 삭제 실패: 서버에 연결할 수 없습니다.")
    return false
  }
}