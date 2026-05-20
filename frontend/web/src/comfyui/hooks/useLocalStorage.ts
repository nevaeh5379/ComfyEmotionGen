import { useEffect, useState } from "react"

const STORAGE_QUOTA_ERROR = "QuotaExceededError"

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "name" in e && e.name === STORAGE_QUOTA_ERROR) {
      console.warn(`localStorage quota exceeded for key "${key}". Storage not updated.`)
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

  useEffect(() => {
    if (isStringDefault) {
      safeSetItem(key, value as string)
    } else {
      const serialized = JSON.stringify(value)
      safeSetItem(key, serialized)
    }
  }, [key, value, isStringDefault])

  return [value, setValue] as const
}
