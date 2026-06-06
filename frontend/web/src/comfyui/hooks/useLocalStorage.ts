import { useCallback, useEffect, useState } from "react"

const STORAGE_QUOTA_ERROR = "QuotaExceededError"

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "name" in e &&
      e.name === STORAGE_QUOTA_ERROR
    ) {
      console.warn(
        `localStorage quota exceeded for key "${key}". Storage not updated.`
      )
      return false
    }
    throw e
  }
}

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const isStringDefault = typeof defaultValue === "string"

  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue
    if (isStringDefault) return stored as T
    try {
      return JSON.parse(stored) as T
    } catch {
      return defaultValue
    }
  })

  // storage 이벤트 구독: 다른 탭의 변경 + 같은 탭 내 커스텀 dispatch 모두 감지
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== key) return
      const newValue = e.newValue
      if (newValue === null) {
        setValue(defaultValue)
      } else if (isStringDefault) {
        setValue(newValue as T)
      } else {
        try {
          setValue(JSON.parse(newValue) as T)
        } catch {
          setValue(defaultValue)
        }
      }
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [key, defaultValue, isStringDefault])

  // 래핑된 setter: localStorage 저장 + 같은 탭 내 동기화를 위해 storage 이벤트 dispatch
  const setStoredValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next =
          typeof newValue === "function"
            ? (newValue as (prev: T) => T)(prev)
            : newValue
        const serialized = isStringDefault
          ? (next as string)
          : JSON.stringify(next)
        safeSetItem(key, serialized)
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: serialized,
            oldValue: isStringDefault
              ? (prev as string)
              : JSON.stringify(prev),
            url: window.location.href,
          })
        )
        return next
      })
    },
    [key, isStringDefault]
  )

  return [value, setStoredValue] as const
}
