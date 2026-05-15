import { useEffect, useRef, type DependencyList } from "react"

const IS_DEV = import.meta.env.DEV

/** 컴포넌트가 렌더될 때마다 횟수와 직전 렌더 이후 경과 ms를 출력 */
export function useRenderLog(name: string) {
  const count = useRef(0)
  const last = useRef(performance.now())
  count.current++
  const elapsed = performance.now() - last.current
  last.current = performance.now()
  if (IS_DEV) {
    console.log(`[Render] ${name} #${count.current}  (+${elapsed.toFixed(1)}ms)`)
  }
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
