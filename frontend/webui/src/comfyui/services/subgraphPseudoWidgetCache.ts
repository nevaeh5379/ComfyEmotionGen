/**
 * Subgraph 의사위젯(pseudo widget) 캐시
 * ComfyUI_frontend: src/services/subgraphPseudoWidgetCache.ts 참고
 *
 * `$$` 접두사를 가진 미리보기용 의사위젯을 식별/캐싱.
 * 실제 렌더링에서 위젯이 "preview"인지 판별할 때 사용.
 */

import type { SubgraphModelRuntime } from "@/comfyui/subgraph/SubgraphModel"

const PSEUDO_WIDGET_PREFIX = "$$"

/** 위젯 이름이 의사위젯(preview)인지 확인 */
export function isPreviewPseudoWidget(widgetName: string): boolean {
  return widgetName.startsWith(PSEUDO_WIDGET_PREFIX)
}

/** 캐시 키 생성 (subgraphId + 위젯 이름) */
function cacheKey(subgraphId: string, widgetName: string): string {
  return `${subgraphId}:${widgetName}`
}

/**
 * SubgraphNode별 의사위젯 캐시.
 * WeakMap으로 SubgraphModelRuntime이 GC될 때 함께 해제.
 */
const pseudoWidgetCache = new WeakMap<
  SubgraphModelRuntime,
  Map<string, boolean>
>()

/**
 * Subgraph의 위젯 중 의사위젯(preview)을 식별하여 캐싱.
 * 재계산을 방지하기 위해 한 번 계산하면 Map에 저장.
 */
export function resolveSubgraphPseudoWidgetCache(
  subgraph: SubgraphModelRuntime
): Map<string, boolean> {
  const existing = pseudoWidgetCache.get(subgraph)
  if (existing) return existing

  const cache = new Map<string, boolean>()
  for (const widget of subgraph.widgets) {
    const isPseudo = isPreviewPseudoWidget(widget.name)
    cache.set(cacheKey(subgraph.id, widget.name), isPseudo)
  }
  pseudoWidgetCache.set(subgraph, cache)
  return cache
}

/** 캐시 무효화 (위젯 프로모션/해제 시 호출) */
export function invalidateSubgraphPseudoWidgetCache(
  subgraph: SubgraphModelRuntime
): void {
  pseudoWidgetCache.delete(subgraph)
}

/**
 * 특정 위젯이 의사위젯인지 캐시에서 조회.
 * 캐시 미스 시 false (안전 기본값).
 */
export function isPseudoWidget(
  subgraph: SubgraphModelRuntime,
  widgetName: string
): boolean {
  const cache = resolveSubgraphPseudoWidgetCache(subgraph)
  return cache.get(cacheKey(subgraph.id, widgetName)) ?? false
}
