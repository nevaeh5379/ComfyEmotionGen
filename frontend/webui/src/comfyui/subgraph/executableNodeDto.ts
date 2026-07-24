/**
 * ExecutableNodeDTO - 실행용 계층 ID 생성
 * ComfyUI_frontend: src/lib/litegraph/src/subgraph/ExecutableNodeDTO.ts 참고
 *
 * SubgraphNode 인스턴스를 만나면 내부 노드를 재귀적으로 펼쳐
 * 계층 ID("65:70:63")를 생성. 외부 ComfyUI 서버가 subgraph를 지원할 때 사용.
 *
 * 핵심:
 *  - 루트 노드 ID는 그대로 사용.
 *  - SubgraphNode 내부 노드 ID는 "parentId:innerId" 형태.
 *  - 내부 노드의 입력이 SubgraphInputNode(-10)를 가리키면,
 *    SubgraphNode의 부모 입력 슬롯으로 매핑 (부모의 해당 입력에 연결된 외부 노드 참조).
 *  - 내부 노드의 출력이 SubgraphOutputNode(-20)를 가리키면,
 *    SubgraphNode의 부모 출력 슬롯으로 매핑 (부모에서 이 노드를 참조하는 곳으로 전파).
 */

import type { ComfyWorkflowNode, ComfyWorkflowLink } from "../types/workflow"
import { SUBGRAPH_INPUT_ID, SUBGRAPH_OUTPUT_ID } from "../constants"

/** 계층 ID 생성: "parentId:childId" */
export function makeHierarchicalId(
  parentId: string | number,
  childId: number
): string {
  return `${String(parentId)}:${String(childId)}`
}

/** 노드가 SubgraphNode 인스턴스인지 확인 (type이 UUID) */
export function isSubgraphInstance(node: ComfyWorkflowNode): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    node.type
  )
}

/**
 * SubgraphNode 내부 노드를 펼쳐 계층 ID를 부여.
 * 반환: 펼쳐진 노드 목록 (각 노드에 hierarchicalId 할당).
 */
export interface FlattenedNode {
  /** 계층 ID (예: "65", "65:70", "65:70:63") */
  hierarchicalId: string
  /** 원본 노드 */
  node: ComfyWorkflowNode
  /** 이 노드가 속한 SubgraphNode의 부모 ID (루트면 null) */
  parentSubgraphNodeId: number | null
  /** 이 노드의 SubgraphInput(-10) 매핑: slot index → 부모 입력에 연결된 외부 링크의 origin */
  inputSlotToParentLink: Map<number, ComfyWorkflowLink>
  /** 이 노드의 SubgraphOutput(-20) 매핑: slot index → 부모 출력에서 나가는 링크들 */
  outputSlotToChildLinks: Map<number, ComfyWorkflowLink[]>
}

/**
 * 루트 노드 목록과 링크를 받아 SubgraphNode를 재귀적으로 펼쳐
 * 계층 ID가 부여된 평탄한 노드 목록을 반환.
 *
 * @param rootNodes 루트 그래프 노드
 * @param allLinks 모든 링크 (루트 + 모든 서브그래프 내부)
 * @param subgraphNodes 각 subgraphId별 내부 노드 목록
 */
export function flattenForExecution(
  rootNodes: ComfyWorkflowNode[],
  allLinks: ComfyWorkflowLink[],
  subgraphNodes: Map<string, ComfyWorkflowNode[]>
): FlattenedNode[] {
  const result: FlattenedNode[] = []
  const visited = new Set<string>()

  /**
   * 재귀 펼침.
   * @param nodes 현재 레벨의 노드
   * @param parentId 부모 SubgraphNode의 hierarchicalId (루트면 null)
   * @param parentSubgraphNodeId 부모 SubgraphNode의 루트 ID (루트면 null)
   * @param parentLinks 이 레벨에서 유효한 링크 (SubgraphInput/Output 경계 링크 포함)
   */
  function flatten(
    nodes: ComfyWorkflowNode[],
    parentId: string | null,
    parentSubgraphNodeId: number | null,
    currentLinks: ComfyWorkflowLink[]
  ): void {
    for (const node of nodes) {
      // IO 노드(-10/-20)는 실행 노드가 아님 - 스킵
      if (node.id === SUBGRAPH_INPUT_ID || node.id === SUBGRAPH_OUTPUT_ID)
        continue

      const hierarchicalId =
        parentId !== null
          ? makeHierarchicalId(parentId, node.id)
          : String(node.id)

      // 순환 방지
      if (visited.has(hierarchicalId)) continue
      visited.add(hierarchicalId)

      // SubgraphInput/Output 매핑 계산
      const inputSlotToParentLink = new Map<number, ComfyWorkflowLink>()
      const outputSlotToChildLinks = new Map<number, ComfyWorkflowLink[]>()

      // SubgraphNode 인스턴스인 경우 내부로 재귀
      if (isSubgraphInstance(node)) {
        const innerNodes = subgraphNodes.get(node.type) ?? []
        // 내부 링크: 이 subgraph에 속한 링크 (graphId가 subgraphId이거나 IO 노드 포함)
        const innerLinks = currentLinks.filter(
          (l) =>
            l.origin_id === SUBGRAPH_INPUT_ID ||
            l.target_id === SUBGRAPH_OUTPUT_ID ||
            innerNodes.some((n) => n.id === l.origin_id || n.id === l.target_id)
        )

        // 부모의 입력 슬롯 → 내부 SubgraphInput(-10) 링크 매핑
        // 부모에서 SubgraphNode 인스턴스로 들어오는 링크(target_id = node.id)
        const incomingLinks = currentLinks.filter(
          (l) => l.target_id === node.id
        )
        for (const link of incomingLinks) {
          // 이 링크는 부모 출력 → SubgraphNode 입력 슬롯
          // 내부에서 SubgraphInput(-10)의 동일 슬롯에서 나가는 링크를 찾아 연결
          const innerInputLinks = innerLinks.filter(
            (il) =>
              il.origin_id === SUBGRAPH_INPUT_ID &&
              il.origin_slot === link.target_slot
          )
          for (const il of innerInputLinks) {
            inputSlotToParentLink.set(il.target_slot, link)
          }
        }

        // 부모의 출력 슬롯 → 내부 SubgraphOutput(-20) 링크 매핑
        // 부모에서 SubgraphNode 인스턴스에서 나가는 링크(origin_id = node.id)
        const outgoingLinks = currentLinks.filter(
          (l) => l.origin_id === node.id
        )
        for (const link of outgoingLinks) {
          // 내부에서 SubgraphOutput(-20)로 들어오는 링크를 찾아 연결
          const innerOutputLinks = innerLinks.filter(
            (il) =>
              il.target_id === SUBGRAPH_OUTPUT_ID &&
              il.target_slot === link.origin_slot
          )
          outputSlotToChildLinks.set(link.origin_slot, innerOutputLinks)
        }

        result.push({
          hierarchicalId,
          node,
          parentSubgraphNodeId,
          inputSlotToParentLink,
          outputSlotToChildLinks,
        })

        // 내부 노드 재귀 펼침
        flatten(innerNodes, hierarchicalId, node.id, innerLinks)
      } else {
        // 일반 노드
        result.push({
          hierarchicalId,
          node,
          parentSubgraphNodeId,
          inputSlotToParentLink,
          outputSlotToChildLinks,
        })
      }
    }
  }

  // 루트 링크: IO 노드가 origin/target인 링크 제외 (서브그래프 내부 링크)
  const rootLinks = allLinks.filter(
    (l) =>
      l.origin_id !== SUBGRAPH_INPUT_ID && l.target_id !== SUBGRAPH_OUTPUT_ID
  )
  flatten(rootNodes, null, null, rootLinks)

  return result
}
