/**
 * Subgraph 유틸리티 (순수 TS, litegraph 의존 없음)
 * ComfyUI_frontend: src/lib/litegraph/src/subgraph/subgraphUtils.ts 참고
 *
 * 핵심 로직:
 *  - getBoundaryLinks: 선택 노드 집합의 경계(외부 연결) vs 내부 링크 분할
 *  - mapSubgraphInputsAndLinks: 경계 입력 링크를 IO 노드(-10) 엔드포인트로 재작성 + SubgraphIODto 생성
 *  - mapSubgraphOutputsAndLinks: 경계 출력 링크를 IO 노드(-20) 엔드포인트로 재작성
 *  - findUsedSubgraphIds: 루트에서 참조되는 모든 subgraph ID를 BFS 수집 (직렬화 GC)
 *  - nextUniqueName: 슬롯/위젯 이름 충돌 회피
 */

import type { ComfyWorkflowLink, ComfyWorkflowNode } from "../types/workflow"
import type { SubgraphDefinition, SubgraphIODto } from "../types/subgraph"
import { SUBGRAPH_INPUT_ID, SUBGRAPH_OUTPUT_ID, createSubgraphId } from "../constants"

/** 선택 아이템 분할 결과 (webui는 노드만 취급, reroute/group는 추후) */
export interface FilteredItems {
  nodes: Set<ComfyWorkflowNode>
}

export function splitPositionables(items: Iterable<ComfyWorkflowNode>): FilteredItems {
  const nodes = new Set<ComfyWorkflowNode>()
  for (const item of items) nodes.add(item)
  return { nodes }
}

export interface BoundaryLinks {
  /** 선택 노드 간 내부 링크 */
  internalLinks: ComfyWorkflowLink[]
  /** 외부 → 선택 노드 (입력 경계, 부모 쪽에서 들어옴) */
  boundaryInputLinks: ComfyWorkflowLink[]
  /** 선택 노드 → 외부 (출력 경계, 부모 쪽으로 나감) */
  boundaryOutputLinks: ComfyWorkflowLink[]
}

/**
 * 선택된 노드 집합의 링크를 내부/경계 입력/경계 출력으로 분할.
 * 노드의 inputs.link / outputs.links를 통해 링크를 분류한다.
 */
export function getBoundaryLinks(
  nodes: ComfyWorkflowNode[],
  links: ComfyWorkflowLink[],
  selectedIds: Set<number>
): BoundaryLinks {
  const internalLinks: ComfyWorkflowLink[] = []
  const boundaryInputLinks: ComfyWorkflowLink[] = []
  const boundaryOutputLinks: ComfyWorkflowLink[] = []
  const seen = new Set<number>()

  for (const node of nodes) {
    // Inputs: 링크의 origin(출력측)이 외부인지 확인
    if (node.inputs) {
      for (const input of node.inputs) {
        if (input.link === undefined) continue
        if (seen.has(input.link)) continue
        seen.add(input.link)
        const link = links.find((l) => l.id === input.link)
        if (!link) continue
        // origin이 선택 노드면 내부, 아니면 경계 입력
        if (selectedIds.has(link.origin_id)) {
          internalLinks.push(link)
        } else {
          boundaryInputLinks.push(link)
        }
      }
    }
    // Outputs: 링크의 target(입력측)이 외부인지 확인
    if (node.outputs) {
      for (const output of node.outputs) {
        if (!output.links) continue
        for (const linkId of output.links) {
          if (seen.has(linkId)) continue
          seen.add(linkId)
          const link = links.find((l) => l.id === linkId)
          if (!link) continue
          if (selectedIds.has(link.target_id)) {
            internalLinks.push(link)
          } else {
            boundaryOutputLinks.push(link)
          }
        }
      }
    }
  }

  return { internalLinks, boundaryInputLinks, boundaryOutputLinks }
}

/** 이름 충돌 회피: 기존 이름 집합에서 유일한 이름 생성 */
export function nextUniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let i = 1
  while (existing.includes(`${base}_${String(i)}`)) i++
  return `${base}_${String(i)}`
}

/** 경계 입력 링크를 SubgraphInput(-10) 엔드포인트로 재작성하고 SubgraphIODto 생성.
 *  반환: (1) 재작성된 내부 링크들(서브그래프에 저장), (2) 생성된 SubgraphIODto 목록. */
export function mapSubgraphInputsAndLinks(
  boundaryInputLinks: ComfyWorkflowLink[]
): { rewrittenLinks: ComfyWorkflowLink[]; inputs: SubgraphIODto[] } {
  // 외부 origin 노드별로 그룹화 (같은 출력에서 나온 링크를 하나의 입력 슬롯로)
  const grouped = new Map<number, ComfyWorkflowLink[]>()
  for (const link of boundaryInputLinks) {
    const arr = grouped.get(link.origin_id) ?? []
    arr.push(link)
    grouped.set(link.origin_id, arr)
  }

  const rewrittenLinks: ComfyWorkflowLink[] = []
  const inputs: SubgraphIODto[] = []
  const usedNames: string[] = []

  for (const [, linkGroup] of grouped) {
    const firstLink = linkGroup[0]
    if (!firstLink) continue
    const slotName = `input_${String(inputs.length + 1)}`
    const uniqueName = nextUniqueName(slotName, usedNames)
    usedNames.push(uniqueName)

    const slotId = createSubgraphId()
    const linkIds: number[] = []

    for (const link of linkGroup) {
      const rewritten: ComfyWorkflowLink = {
        ...link,
        origin_id: SUBGRAPH_INPUT_ID,
        origin_slot: inputs.length,
      }
      rewrittenLinks.push(rewritten)
      linkIds.push(rewritten.id)
    }

    inputs.push({
      id: slotId,
      name: uniqueName,
      type: firstLink.type,
      linkIds,
    })
  }

  return { rewrittenLinks, inputs }
}

/** 경계 출력 링크를 SubgraphOutput(-20) 엔드포인트로 재작성하고 SubgraphIODto 생성. */
export function mapSubgraphOutputsAndLinks(
  boundaryOutputLinks: ComfyWorkflowLink[]
): { rewrittenLinks: ComfyWorkflowLink[]; outputs: SubgraphIODto[] } {
  const grouped = new Map<number, ComfyWorkflowLink[]>()
  for (const link of boundaryOutputLinks) {
    const arr = grouped.get(link.target_id) ?? []
    arr.push(link)
    grouped.set(link.target_id, arr)
  }

  const rewrittenLinks: ComfyWorkflowLink[] = []
  const outputs: SubgraphIODto[] = []
  const usedNames: string[] = []

  for (const [, linkGroup] of grouped) {
    const firstLink = linkGroup[0]
    if (!firstLink) continue
    const slotName = `output_${String(outputs.length + 1)}`
    const uniqueName = nextUniqueName(slotName, usedNames)
    usedNames.push(uniqueName)

    const slotId = createSubgraphId()
    const linkIds: number[] = []

    for (const link of linkGroup) {
      const rewritten: ComfyWorkflowLink = {
        ...link,
        target_id: SUBGRAPH_OUTPUT_ID,
        target_slot: outputs.length,
      }
      rewrittenLinks.push(rewritten)
      linkIds.push(rewritten.id)
    }

    outputs.push({
      id: slotId,
      name: uniqueName,
      type: firstLink.type,
      linkIds,
    })
  }

  return { rewrittenLinks, outputs }
}

/** 선택 노드의 bounding box 계산 */
export function createBounds(nodes: ComfyWorkflowNode[]): [number, number, number, number] {
  if (nodes.length === 0) return [0, 0, 0, 0]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.pos[0])
    minY = Math.min(minY, n.pos[1])
    maxX = Math.max(maxX, n.pos[0] + n.size[0])
    maxY = Math.max(maxY, n.pos[1] + n.size[1])
  }
  return [minX, minY, maxX, maxY]
}

/** 루트 그래프에서 참조하는 모든 subgraph ID를 BFS 수집 (직렬화 GC).
 *  SubgraphNode 인스턴스(type=UUID)를 따라 재귀적으로 탐색. */
export function findUsedSubgraphIds(
  rootNodes: ComfyWorkflowNode[],
  subgraphRegistry: Map<string, SubgraphDefinition>
): Set<string> {
  const used = new Set<string>()
  const queue: ComfyWorkflowNode[][] = [rootNodes]

  while (queue.length > 0) {
    const nodes = queue.shift()
    if (!nodes) break
    for (const node of nodes) {
      // SubgraphNode 인스턴스 판별 (type이 UUID)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.type)) continue
      if (used.has(node.type)) continue
      used.add(node.type)
      const def = subgraphRegistry.get(node.type)
      if (def) queue.push(def.nodes)
    }
  }

  return used
}

/** 노드가 SubgraphInputNode(-10)인지 확인 */
export function isSubgraphInputNode(node: ComfyWorkflowNode): boolean {
  return node.id === SUBGRAPH_INPUT_ID
}

/** 노드가 SubgraphOutputNode(-20)인지 확인 */
export function isSubgraphOutputNode(node: ComfyWorkflowNode): boolean {
  return node.id === SUBGRAPH_OUTPUT_ID
}