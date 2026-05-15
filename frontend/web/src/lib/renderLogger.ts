import { useEffect, useLayoutEffect, useRef, type DependencyList } from "react"

const IS_DEV = import.meta.env.DEV

/**
 * 렌더 횟수, 직전 렌더와의 간격(gap), 실제 렌더 소요 시간(took)을 출력.
 * gap  = 이 렌더가 시작된 시각 - 직전 렌더가 끝난 시각
 * took = 렌더 함수 진입 ~ DOM 커밋 완료까지 (useLayoutEffect 기준)
 */
export function useRenderLog(name: string) {
  const count = useRef(0)
  const renderStart = useRef(performance.now())
  const lastEnd = useRef(performance.now())
  const gap = useRef(0)

  count.current++
  gap.current = performance.now() - lastEnd.current
  renderStart.current = performance.now()

  useLayoutEffect(() => {
    const took = performance.now() - renderStart.current
    lastEnd.current = performance.now()
    if (IS_DEV) {
      const gapStr = gap.current < 1000
        ? `+${gap.current.toFixed(1)}ms`
        : `+${(gap.current / 1000).toFixed(1)}s`
      const tookStr = took >= 16
        ? `\x1b[33m${took.toFixed(1)}ms\x1b[0m` // 노란색 강조 (16ms 이상)
        : `${took.toFixed(1)}ms`
      console.log(`[Render] ${name} #${count.current}  gap:${gapStr}  took:${tookStr}`)
    }
  })
}

/**
 * 렌더 사이에 어떤 값이 바뀌었는지 출력.
 * App처럼 state가 많은 컴포넌트에서 무엇이 렌더를 유발했는지 찾는 데 사용.
 */
export function useWatchValues(label: string, values: Record<string, unknown>) {
  const prev = useRef<Record<string, unknown>>({})
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
}

/** useEffect를 감싸 effect 실행 시점과 내부 소요 시간을 출력 */
export function useEffectLog(
  label: string,
  effect: () => void | (() => void),
  deps?: DependencyList
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!IS_DEV) return effect()
    const tag = `[Effect] ${label}`
    console.time(tag)
    const cleanup = effect()
    console.timeEnd(tag)
    return cleanup
  }, deps)
}
