/**
 * Subgraph 런타임 모델 관리 (순수 TS, litegraph 의존 없음)
 * ComfyUI_frontend: src/lib/litegraph/src/LGraph.ts (Subgraph class L2751-3100) 참고
 *
 * SubgraphModel은 블루프린트(정의)의 런타임 표현.
 *  - inputs/outputs 슬롯 배열 관리
 *  - 이벤트 디스패치 (removing-* 는 취소 가능)
 *  - 직렬화/역직렬화 (asSerialisable / fromDefinition)
 *
 * 핵심: SubgraphModel 자체는 내부 nodes/links를 직접 보관하지 않는다.
 *       webui에서는 nodes/links가 reactGraphStore에 flat하게 저장되며 graphId로 소속을 표시.
 *       여기서는 슬롯/IO노드/메타데이터만 관리.
 */

import type {
  SubgraphDefinition,
  SubgraphIODto,
  SubgraphSlot,
  SubgraphEventMap,
  ExposedWidget,
} from "../types/subgraph"
import { createSubgraphId, type SubgraphId } from "../constants"

type SubgraphEventType = keyof SubgraphEventMap
type EventListener<E> = (event: CustomEvent<E>) => boolean | undefined

/**
 * Subgraph 이벤트 디스패처.
 * removing-* 이벤트는 취소 가능: 리스너가 false를 반환하면 중단.
 */
export class SubgraphEventDispatcher {
  private listeners = new Map<SubgraphEventType, Set<EventListener<unknown>>>()

  addEventListener<T extends SubgraphEventType>(
    type: T,
    listener: EventListener<SubgraphEventMap[T]>
  ): void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener as EventListener<unknown>)
  }

  removeEventListener<T extends SubgraphEventType>(
    type: T,
    listener: EventListener<SubgraphEventMap[T]>
  ): void {
    this.listeners.get(type)?.delete(listener as EventListener<unknown>)
  }

  /** 이벤트 디스패치. removing-* 이벤트에서 리스너가 false 반환 시 false 리턴(취소). */
  dispatch<T extends SubgraphEventType>(
    type: T,
    detail: SubgraphEventMap[T]
  ): boolean {
    const set = this.listeners.get(type)
    if (!set) return true
    for (const listener of set) {
      const result = listener(new CustomEvent(type, { detail }))
      if (result === false) return false
    }
    return true
  }
}

/** SubgraphSlot을 DTO로 변환 */
export function slotToDto(slot: SubgraphSlot): SubgraphIODto {
  const dto: SubgraphIODto = {
    id: slot.id,
    name: slot.name,
    type: slot.type,
  }
  if (slot.linkIds.length > 0) dto.linkIds = slot.linkIds
  if (slot.shape !== undefined) dto.shape = slot.shape
  if (slot.label !== undefined) dto.label = slot.label
  return dto
}

/** DTO를 SubgraphSlot으로 변환 */
export function dtoToSlot(dto: SubgraphIODto): SubgraphSlot {
  const slot: SubgraphSlot = {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    linkIds: dto.linkIds ? [...dto.linkIds] : [],
  }
  if (dto.shape !== undefined) slot.shape = dto.shape
  if (dto.label !== undefined) slot.label = dto.label
  return slot
}

/** SubgraphModel 생성 팩토리: 정의로부터 런타임 모델 구성 */
export function createSubgraphModel(
  def: SubgraphDefinition
): SubgraphModelRuntime {
  return new SubgraphModelRuntime(def)
}

/**
 * Subgraph 런타임 모델. 슬롯 추가/제거/이름변경 + 이벤트 디스패치.
 * 내부 nodes/links는 reactGraphStore가 관리(graphId로 소속 표시).
 */
export class SubgraphModelRuntime {
  readonly id: SubgraphId
  name: string
  category?: string
  description?: string
  inputNode: {
    id: number
    bounding: [number, number, number, number]
    pinned: boolean
  }
  outputNode: {
    id: number
    bounding: [number, number, number, number]
    pinned: boolean
  }
  inputs: SubgraphSlot[]
  outputs: SubgraphSlot[]
  widgets: ExposedWidget[]
  readonly events = new SubgraphEventDispatcher()

  constructor(def: SubgraphDefinition) {
    this.id = def.id
    this.name = def.name
    if (def.category !== undefined) this.category = def.category
    if (def.description !== undefined) this.description = def.description
    this.inputNode = {
      id: def.inputNode.id,
      bounding: [...def.inputNode.bounding] as [number, number, number, number],
      pinned: def.inputNode.pinned ?? false,
    }
    this.outputNode = {
      id: def.outputNode.id,
      bounding: [...def.outputNode.bounding] as [
        number,
        number,
        number,
        number,
      ],
      pinned: def.outputNode.pinned ?? false,
    }
    this.inputs = (def.inputs ?? []).map(dtoToSlot)
    this.outputs = (def.outputs ?? []).map(dtoToSlot)
    this.widgets = def.widgets ? structuredClone(def.widgets) : []
  }

  /** 입력 슬롯 추가. adding-input(취소 가능) → input-added 이벤트. */
  addInput(name: string, type: string): SubgraphSlot | null {
    const allowed: boolean = this.events.dispatch("adding-input", {
      subgraph: this,
      name,
    })
    if (!allowed) return null
    const slot: SubgraphSlot = {
      id: createSubgraphId(),
      name,
      type,
      linkIds: [],
    }
    this.inputs.push(slot)
    this.events.dispatch("input-added", { subgraph: this, input: slot })
    return slot
  }

  /** 출력 슬롯 추가. */
  addOutput(name: string, type: string): SubgraphSlot | null {
    const allowed: boolean = this.events.dispatch("adding-output", {
      subgraph: this,
      name,
    })
    if (!allowed) return null
    const slot: SubgraphSlot = {
      id: createSubgraphId(),
      name,
      type,
      linkIds: [],
    }
    this.outputs.push(slot)
    this.events.dispatch("output-added", { subgraph: this, output: slot })
    return slot
  }

  /** 입력 슬롯 제거. removing-input(취소 가능). 연결된 링크 ID 반환(호출자가 store에서 제거). */
  removeInput(input: SubgraphSlot): number[] | null {
    const allowed: boolean = this.events.dispatch("removing-input", {
      subgraph: this,
      input,
    })
    if (!allowed) return null
    const idx = this.inputs.indexOf(input)
    if (idx === -1) return null
    const linkIds = [...input.linkIds]
    this.inputs.splice(idx, 1)
    // 후속 슬롯 인덱스 감소 (origin_slot/target_slot 패치는 store/어댑터에서 처리)
    return linkIds
  }

  /** 출력 슬롯 제거. */
  removeOutput(output: SubgraphSlot): number[] | null {
    const allowed: boolean = this.events.dispatch("removing-output", {
      subgraph: this,
      output,
    })
    if (!allowed) return null
    const idx = this.outputs.indexOf(output)
    if (idx === -1) return null
    const linkIds = [...output.linkIds]
    this.outputs.splice(idx, 1)
    return linkIds
  }

  /** 입력 슬롯 이름 변경. renaming-input 이벤트. */
  renameInput(input: SubgraphSlot, name: string): void {
    this.events.dispatch("renaming-input", { subgraph: this, input, name })
    input.name = name
  }

  /** 출력 슬롯 이름 변경. */
  renameOutput(output: SubgraphSlot, name: string): void {
    this.events.dispatch("renaming-output", { subgraph: this, output, name })
    output.name = name
  }

  /** 직렬화 (DTO 생성). 내부 nodes/links는 별도 전달. */
  asSerialisable(
    nodes: ComfyWorkflowNodeLite[],
    links: ComfyWorkflowLinkLite[],
    groups?: any[]
  ): SubgraphDefinition {
    const def: SubgraphDefinition = {
      id: this.id,
      name: this.name,
      inputNode: {
        id: this.inputNode.id,
        bounding: [...this.inputNode.bounding] as [
          number,
          number,
          number,
          number,
        ],
        pinned: this.inputNode.pinned,
      },
      outputNode: {
        id: this.outputNode.id,
        bounding: [...this.outputNode.bounding] as [
          number,
          number,
          number,
          number,
        ],
        pinned: this.outputNode.pinned,
      },
      nodes,
      links,
    }
    if (groups && groups.length > 0) {
      def.groups = groups.map((g) => ({
        id: g.id,
        title: g.title,
        bounding: g.bounding,
        color: g.color,
        fontSize: g.fontSize,
        locked: g.locked,
      }))
    }
    if (this.category !== undefined) def.category = this.category
    if (this.description !== undefined) def.description = this.description
    const inputs = this.inputs.map(slotToDto)
    if (inputs.length > 0) def.inputs = inputs
    const outputs = this.outputs.map(slotToDto)
    if (outputs.length > 0) def.outputs = outputs
    if (this.widgets.length > 0) def.widgets = structuredClone(this.widgets)
    return def
  }
}

// 내부 직렬화용 타입 별칭 (순환 import 방지)
import type { ComfyWorkflowNode as ComfyWorkflowNodeLite } from "../types/workflow"
import type { ComfyWorkflowLink as ComfyWorkflowLinkLite } from "../types/workflow"
