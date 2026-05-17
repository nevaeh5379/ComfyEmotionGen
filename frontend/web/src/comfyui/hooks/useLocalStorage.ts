import { useEffect, useState } from "react"

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
      localStorage.setItem(key, value as string)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }, [key, value, isStringDefault])

  return [value, setValue] as const
}
