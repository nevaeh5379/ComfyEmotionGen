/**
 * Subgraph 타입 정의 (직렬화 DTO + 런타임 모델)
 * ComfyUI_frontend 참고:
 *   - src/lib/litegraph/src/types/serialisation.ts (ExportedSubgraph, SubgraphIO, ExportedSubgraphIONode, ExposedWidget)
 *   - src/platform/workflow/validation/schemas/workflowSchema.ts (zSubgraphDefinition, zSubgraphInstance)
 *
 * 핵심 개념:
 *  - Subgraph(블루프린트/정의): 자체 nodes/links/inputs/outputs/inputNode/outputNode를 가진 재귀 그래프.
 *  - SubgraphNode(인스턴스): 부모 그래프에 배치되는 노드. type === SubgraphId(UUID).
 *  - SubgraphInput: 부모→서브그래프로 들어오는 슬롯. 서브그래프 내부에서는 output-side(링크 출발).
 *  - SubgraphOutput: 서브그래프→부모로 나가는 슬롯. 서브그래프 내부에서는 input-side(링크 도착).
 *  - IO 노드: sentinel ID -10(inputNode) / -20(outputNode). 서브그래프 내부 경계 링크의 엔드포인트.
 */

import type { ComfyWorkflowLink, ComfyWorkflowNode } from "./workflow"
import type { SubgraphId } from "../constants"

// ── 직렬화 DTO ──────────────────────────────────────────────────────

/** Subgraph IO 노드(inputNode/outputNode)의 직렬화 형태 */
export interface ExportedSubgraphIONode {
  id: number
  bounding: [number, number, number, number]
  pinned?: boolean
}

/** Subgraph 입력/출력 슬롯의 직렬화 형태 */
export interface SubgraphIODto {
  /** 슬롯 ID (UUID, 한 번 정해지면 불변) */
  id: SubgraphId
  /** 표시명 */
  name: string
  /** 데이터 타입 */
  type: string
  /** 연결된 링크 ID 목록 (미연결 시 생략 가능) */
  linkIds?: number[]
  /** 슬롯 모양 (-1=기본, 0=직사각, 1=원형, 2=화살표, 3=그리드) */
  shape?: number
  /** 로컬라이즈된 표시명 */
  localized_name?: string
  label?: string
}

/** 부모 그래프에 노출되는 승격 위젯 참조 */
export interface ExposedWidget {
  /** 서브그래프 내부 위젯이 속한 노드 ID */
  id: number
  /** 위젯 이름 */
  name: string
}

/** Subgraph 정의(블루프린트). 재귀적으로 하위 subgraph 정의를 포함. */
export interface SubgraphDefinition {
  /** UUID 형식의 고유 ID */
  id: SubgraphId
  /** 표시명 */
  name: string
  /** 노드 라이브러리 분류 (옵션) */
  category?: string
  /** 툴팁 설명 (옵션) */
  description?: string
  /** 입력 경계 노드 (sentinel id = -10) */
  inputNode: ExportedSubgraphIONode
  /** 출력 경계 노드 (sentinel id = -20) */
  outputNode: ExportedSubgraphIONode
  /** 서브그래프 입력 슬롯 목록 (부모→내부) */
  inputs?: SubgraphIODto[]
  /** 서브그래프 출력 슬롯 목록 (내부→부모) */
  outputs?: SubgraphIODto[]
  /** 부모 그래프에 노출되는 위젯 목록 */
  widgets?: ExposedWidget[]
  /** 서브그래프 내부 노드 */
  nodes: ComfyWorkflowNode[]
  /** 서브그래프 내부 링크 */
  links: ComfyWorkflowLink[]
  /** 서브그래프 내부 그룹 (옵션) */
  groups?: unknown[]
  /** 재귀: 하위 서브그래프 정의 */
  definitions?: {
    subgraphs: SubgraphDefinition[]
  }
  /** 마지막 노드/링크 ID (루트 state와 공유되므로 직렬화에만 기록) */
  last_node_id?: number
  last_link_id?: number
}

/** 부모 그래프 상의 SubgraphNode 인스턴스 직렬화 데이터.
 *  ComfyWorkflowNode의 type 필드가 SubgraphId(UUID)인 경우 subgraph 인스턴스.
 *  inputs/outputs는 일반 ComfyNodeInput/Output 형태로 정의 슬롯을 미러링하여
 *  ComfyWorkflowNode.inputs/outputs에 저장된다. 여기서는 인스턴스별 부가 데이터만. */
export interface SubgraphInstanceData {
  /** 인스턴스 위젯 값 (승격 위젯) - ComfyWorkflowNode.widgets_values와 공유 */
  widgets_values?: (string | number | boolean)[]
  /** 인스턴스 속성 - ComfyWorkflowNode.properties와 공유 */
  properties?: Record<string, unknown>
}

// ── 런타임 모델 ─────────────────────────────────────────────────────

/** 그래프 ID (루트 = null, 서브그래프 = SubgraphId) */
export type GraphId = SubgraphId | null

/** 그래프 상태 - 루트와 모든 서브그래프가 공유 (ID 충돌 방지) */
export interface GraphSharedState {
  lastNodeId: number
  lastLinkId: number
  lastGroupId: number
}

/** Subgraph 런타임 모델 (블루프린트). Zustand store 내에 Map<SubgraphId, SubgraphModel>로 보관. */
export interface SubgraphModel {
  readonly id: SubgraphId
  name: string
  category?: string
  description?: string
  /** 입력 경계 노드 bounding (서브그래프 좌측) */
  inputNode: {
    id: number
    bounding: [number, number, number, number]
    pinned: boolean
  }
  /** 출력 경계 노드 bounding (서브그래프 우측) */
  outputNode: {
    id: number
    bounding: [number, number, number, number]
    pinned: boolean
  }
  /** 입력 슬롯 (부모→내부). 내부에서는 output-side. */
  inputs: SubgraphSlot[]
  /** 출력 슬롯 (내부→부모). 내부에서는 input-side. */
  outputs: SubgraphSlot[]
  /** 승격 위젯 참조 */
  widgets: ExposedWidget[]
}

/** Subgraph 슬롯 (런타임) - 입력 또는 출력. */
export interface SubgraphSlot {
  /** 슬롯 ID (UUID, 불변) */
  id: SubgraphId
  /** 표시명 */
  name: string
  /** 데이터 타입 */
  type: string
  /** 연결된 링크 ID 목록 */
  linkIds: number[]
  /** 슬롯 모양 */
  shape?: number
  label?: string
}

// ── 이벤트 맵 ────────────────────────────────────────────────────────

/** Subgraph 블루프린트에서 발생하는 이벤트.
 *  removing-* 이벤트는 취소 가능(dispatch가 false 반환 시 중단). */
export interface SubgraphEventMap {
  "adding-input": { subgraph: SubgraphModel; name: string }
  "input-added": { subgraph: SubgraphModel; input: SubgraphSlot }
  "removing-input": { subgraph: SubgraphModel; input: SubgraphSlot }
  "adding-output": { subgraph: SubgraphModel; name: string }
  "output-added": { subgraph: SubgraphModel; output: SubgraphSlot }
  "removing-output": { subgraph: SubgraphModel; output: SubgraphSlot }
  "renaming-input": {
    subgraph: SubgraphModel
    input: SubgraphSlot
    name: string
  }
  "renaming-output": {
    subgraph: SubgraphModel
    output: SubgraphSlot
    name: string
  }
  "inputs-reordered": { subgraph: SubgraphModel; indices: number[] }
  "widget-promoted": { subgraph: SubgraphModel; widget: ExposedWidget }
  "widget-demoted": { subgraph: SubgraphModel; widget: ExposedWidget }
}

/** Subgraph 슬롯 자체 이벤트 (연결/해제) */
export interface SubgraphSlotEventMap {
  "input-connected": { slot: SubgraphSlot; linkId: number }
  "input-disconnected": { slot: SubgraphSlot; linkId: number }
}
