import { useEffect, useRef } from "react"

/**
 * 항상 최신 값을 추적하는 ref를 반환합니다.
 *
 * `useCallback`의 의존성 배열을 비우면서도 콜백 내부에서
 * 항상 최신 state/props에 접근해야 할 때 사용합니다.
 *
 * @example
 * ```ts
 * const backendUrlRef = useLatestRef(backendUrl)
 *
 * const doSomething = useCallback(async () => {
 *   await fetch(backendUrlRef.current)
 * }, [])
 * ```
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}
