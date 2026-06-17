import { useCallback, useEffect, useRef, useState } from "react"

export interface AsyncActionHandle {
  isLoading: boolean
  message: string | null
  execute: <T>(
    fn: () => Promise<T>,
    getSuccessMessage: (result: T) => string,
    errorMessage?: string,
    duration?: number
  ) => Promise<T | null>
  showMessage: (msg: string, duration?: number) => void
  clearMessage: () => void
}

export function useAsyncAction(defaultDuration = 3000): AsyncActionHandle {
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const showMessage = useCallback(
    (msg: string, duration?: number) => {
      clearTimer()
      setMessage(msg)
      timerRef.current = setTimeout(() => {
        setMessage(null)
        timerRef.current = null
      }, duration ?? defaultDuration)
    },
    [defaultDuration, clearTimer]
  )

  const clearMessage = useCallback(() => {
    clearTimer()
    setMessage(null)
  }, [clearTimer])

  const execute = useCallback(
    async <T>(
      fn: () => Promise<T>,
      getSuccessMessage: (result: T) => string,
      errorMessage = "오류가 발생했습니다",
      duration?: number
    ): Promise<T | null> => {
      setIsLoading(true)
      setMessage(null)
      try {
        const result = await fn()
        showMessage(getSuccessMessage(result), duration)
        return result
      } catch {
        showMessage(errorMessage, duration)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [showMessage]
  )

  useEffect(() => {
    return () => clearTimer()
  }, [clearTimer])

  return { isLoading, message, execute, showMessage, clearMessage }
}
