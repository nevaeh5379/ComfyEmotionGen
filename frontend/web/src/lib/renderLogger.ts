import { useEffect, useLayoutEffect, useRef, type DependencyList } from "react"

const IS_DEV = import.meta.env.DEV

export function useRenderLog(name: string) {
  const count = useRef(0)
  const lastEnd = useRef<number | null>(null)

  useLayoutEffect(() => {
    count.current++
    const now = performance.now()
    const gap = lastEnd.current !== null ? now - lastEnd.current : 0
    if (IS_DEV) {
      const gapStr =
        gap < 1000 ? `+${gap.toFixed(1)}ms` : `+${(gap / 1000).toFixed(1)}s`
      console.log(`[Render] ${name} #${count.current}  gap:${gapStr}`)
    }
    lastEnd.current = performance.now()
  })
}

export function useWatchValues(label: string, values: Record<string, unknown>) {
  const prev = useRef<Record<string, unknown>>({})

  useLayoutEffect(() => {
    if (!IS_DEV) return
    const changed = Object.entries(values)
      .filter(([k, v]) => !Object.is(prev.current[k], v))
      .map(([k, v]) => {
        const p = prev.current[k]
        const isArray = Array.isArray(v)
        if (isArray && Array.isArray(p)) {
          return `${k}(arr:${p.length}→${(v as unknown[]).length})`
        }
        return k
      })
    if (changed.length > 0) {
      console.log(`[Change] ${label}: ${changed.join(", ")}`)
    }
    prev.current = values
  })
}

export function useEffectLog(
  label: string,
  effect: () => void | (() => void),
  deps?: DependencyList
) {
  useEffect(() => {
    if (!IS_DEV) return effect()
    const tag = `[Effect] ${label}`
    console.time(tag)
    const cleanup = effect()
    console.timeEnd(tag)
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
