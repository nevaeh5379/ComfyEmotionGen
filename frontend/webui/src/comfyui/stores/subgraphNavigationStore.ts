/**
 * Subgraph Navigation Store (Zustand)
 * ComfyUI_frontend: src/stores/subgraphNavigationStore.ts 참고
 *
 * reactGraphStore의 activeGraphId/navigationStack/viewportCache를 단일 출처로 사용.
 * 이 store는 편의 래퍼 + activeSubgraph 모델 참조만 보관.
 */

import { create } from "zustand"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import type { SubgraphId } from "@/comfyui/constants"
import type { SubgraphModelRuntime } from "@/comfyui/subgraph/SubgraphModel"

interface SubgraphNavigationState {
  /** 현재 활성 subgraph 모델 (루트면 null) - reactGraphStore.activeGraphId에서 파생 */
  activeSubgraph: SubgraphModelRuntime | null
  /** 루트부터 현재까지의 subgraph ID 경로 (브레드크럼) - reactGraphStore.navigationStack과 동기화 */
  idStack: SubgraphId[]

  // Actions
  navigateTo: (subgraphId: SubgraphId) => void
  navigateUp: () => void
  navigateToRoot: () => void
  navigateToLevel: (level: number) => void
  restoreStack: (idStack: SubgraphId[]) => void
  exportStack: () => SubgraphId[]
}

/** reactGraphStore에서 현재 activeSubgraph 모델을 조회 */
function resolveActiveSubgraph(): SubgraphModelRuntime | null {
  const { activeGraphId, subgraphs } = useReactGraphStore.getState()
  if (activeGraphId === null) return null
  return subgraphs.get(activeGraphId) ?? null
}

export const useSubgraphNavigationStore = create<SubgraphNavigationState>((set): SubgraphNavigationState => ({
  activeSubgraph: null,
  idStack: [],

  navigateTo: (subgraphId: SubgraphId): void => {
    const graphStore = useReactGraphStore.getState()
    if (!graphStore.subgraphs.has(subgraphId)) return
    // reactGraphStore.enterSubgraph가 activeGraphId/navigationStack/viewport를 한 번에 갱신
    graphStore.enterSubgraph(subgraphId)
    // 이 store를 동기화
    set({
      activeSubgraph: resolveActiveSubgraph(),
      idStack: [...useReactGraphStore.getState().navigationStack],
    })
  },

  navigateUp: (): void => {
    const graphStore = useReactGraphStore.getState()
    if (graphStore.navigationStack.length === 0) return
    graphStore.exitSubgraph()
    set({
      activeSubgraph: resolveActiveSubgraph(),
      idStack: [...useReactGraphStore.getState().navigationStack],
    })
  },

  navigateToRoot: (): void => {
    const graphStore = useReactGraphStore.getState()
    // 루트까지 한 번에 스택 비우기 (무한 루프 방지 - 단일 set)
    // 뷰포트 캐시에 현재 저장
    const cacheKey = graphStore.activeGraphId ?? "__root__"
    const nextViewportCache = new Map(graphStore.viewportCache)
    nextViewportCache.set(cacheKey, { pan: [...graphStore.pan] as [number, number], zoom: graphStore.zoom })
    // 루트 뷰포트 복원
    const restored = nextViewportCache.get("__root__")
    useReactGraphStore.setState({
      activeGraphId: null,
      navigationStack: [],
      viewportCache: nextViewportCache,
      selectedNodeIds: new Set<number>(),
      pan: restored ? restored.pan : [0, 0],
      zoom: restored ? restored.zoom : 1.0,
    })
    set({
      activeSubgraph: null,
      idStack: [],
    })
  },

  navigateToLevel: (level: number): void => {
    // level=0은 루트, level=1은 첫 subgraph, ...
    const graphStore = useReactGraphStore.getState()
    const currentStack = graphStore.navigationStack
    if (level >= currentStack.length) return
    if (level === 0) {
      get().navigateToRoot()
      return
    }
    // level까지 스택을 자르고 해당 subgraph로 진입
    const targetId = currentStack[level - 1]
    if (targetId === undefined) return
    const targetStack = currentStack.slice(0, level)
    // 뷰포트 저장
    const cacheKey = graphStore.activeGraphId ?? "__root__"
    const nextViewportCache = new Map(graphStore.viewportCache)
    nextViewportCache.set(cacheKey, { pan: [...graphStore.pan] as [number, number], zoom: graphStore.zoom })
    const restored = nextViewportCache.get(targetId)
    useReactGraphStore.setState({
      activeGraphId: targetId,
      navigationStack: targetStack,
      viewportCache: nextViewportCache,
      selectedNodeIds: new Set<number>(),
      pan: restored ? restored.pan : [0, 0],
      zoom: restored ? restored.zoom : 1.0,
    })
    set({
      activeSubgraph: resolveActiveSubgraph(),
      idStack: [...targetStack],
    })
  },

  restoreStack: (idStack: SubgraphId[]): void => {
    useReactGraphStore.setState({
      activeGraphId: idStack.length > 0 ? idStack[idStack.length - 1] ?? null : null,
      navigationStack: [...idStack],
    })
    set({
      activeSubgraph: resolveActiveSubgraph(),
      idStack: [...idStack],
    })
  },

  exportStack: (): SubgraphId[] => {
    return [...useSubgraphNavigationStore.getState().idStack]
  },
}))

// 순환 import 방지: get은 클로저 안에서 사용
function get(): SubgraphNavigationState { return useSubgraphNavigationStore.getState() }