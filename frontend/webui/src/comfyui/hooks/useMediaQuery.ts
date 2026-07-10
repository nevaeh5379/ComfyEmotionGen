import { useCallback, useMemo, useSyncExternalStore } from "react"

/** Render only the responsive branch that can actually be seen. */
export function useMediaQuery(query: string): boolean {
  const mediaQuery = useMemo(
    () => (typeof window === "undefined" ? null : window.matchMedia(query)),
    [query]
  )

  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      if (mediaQuery === null) return () => undefined
      mediaQuery.addEventListener("change", onChange)
      return () => {
        mediaQuery.removeEventListener("change", onChange)
      }
    },
    [mediaQuery]
  )

  const getSnapshot = useCallback(
    () => mediaQuery?.matches ?? false,
    [mediaQuery]
  )
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
