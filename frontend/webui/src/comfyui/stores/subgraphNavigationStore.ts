/**
 * Subgraph Navigation Store (Zustand)
 * ComfyUI_frontend: src/stores/subgraphNavigationStore.ts 참고
 *
 * 현재 편집 중인 subgraph 레벨과 브레드크럼 경로, 뷰포트 캐시 관리.
 * reactGraphStore의 activeGraphId/navigationStack/viewportCache를 래핑하여
 * 편리한 네비게이션 API 제공.
 */

import { create } from "zustand"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import type { SubgraphId } from "@/comfyui/constants"
import type { SubgraphModelRuntime } from "@/comfyui/subgraph/SubgraphModel"

interface SubgraphNavigationState {
  /** 현재 활성 subgraph (루트면 null) */
  activeSubgraph: SubgraphModelRuntime | null
  /** 루트부터 현재까지의 subgraph ID 경로 (브레드크럼) */
  idStack: SubgraphId[]
  /** 레벨별 뷰포트(pan/zoom) 캐시 - 진입/이탈 시 복원 */

  // Actions
  /** 특정 subgraph로 진입 */
  navigateTo: (subgraphId: SubgraphId) => void
  /** 한 레벨 위로(루트 방향) */
  navigateUp: () => void
  /** 루트로 이동 */
  navigateToRoot: () => void
  /** 네비게이션 스택을 주어진 ID 경로로 복원 (undo/redo용) */
  restoreStack: (idStack: SubgraphId[]) => void
  /** 현재 네비게이션 상태를 내보냄 (undo/redo 스냅샷용) */
  exportStack: () => SubgraphId[]
}

export const useSubgraphNavigationStore = create<SubgraphNavigationState>((set, get): SubgraphNavigationState => ({
  activeSubgraph: null,
  idStack: [],

  navigateTo: (subgraphId: SubgraphId): void => {
    const graphStore = useReactGraphStore.getState()
    const model = graphStore.subgraphs.get(subgraphId)
    if (!model) return

    // 현재 뷰포트 캐시에 저장 (reactGraphStore.enterSubgraph가 처리)
    const prevActive = graphStore.activeGraphId
    const prevStack = get().idStack

    graphStore.enterSubgraph(subgraphId)

    const nextStack = prevActive !== null ? [...prevStack, prevActive] : [...prevStack]
    set({
      activeSubgraph: model,
      idStack: nextStack,
    })
  },

  navigateUp: (): void => {
    const { idStack } = get()
    if (idStack.length === 0) return

    const graphStore = useReactGraphStore.getState()
    graphStore.exitSubgraph()

    const nextStack = idStack.slice(0, -1)
    const nextActiveId = nextStack.length > 0 ? nextStack[nextStack.length - 1] ?? null : null
    const nextActive = nextActiveId !== null ? graphStore.subgraphs.get(nextActiveId) ?? null : null
    set({
      activeSubgraph: nextActive,
      idStack: nextStack,
    })
  },

  navigateToRoot: (): void => {
    const graphStore = useReactGraphStore.getState()
    // 모든 레벨에서 루트로
    while (get().idStack.length > 0) {
      graphStore.exitSubgraph()
    }
    set({
      activeSubgraph: null,
      idStack: [],
    })
  },

  restoreStack: (idStack: SubgraphId[]): void => {
    const graphStore = useReactGraphStore.getState()
    // 단순 구현: 스택을 따라 진입
    // 먼저 루트로 리셋
    useReactGraphStore.setState({
      activeGraphId: null,
      navigationStack: [],
    })

    for (const id of idStack) {
      const model = graphStore.subgraphs.get(id)
      if (!model) break
      graphStore.enterSubgraph(id)
    }

    const lastId = idStack.length > 0 ? idStack[idStack.length - 1] ?? null : null
    const lastModel = lastId !== null ? graphStore.subgraphs.get(lastId) ?? null : null
    set({
      activeSubgraph: lastModel,
      idStack: [...idStack],
    })
  },

  exportStack: (): SubgraphId[] => {
    return [...get().idStack]
  },
}))