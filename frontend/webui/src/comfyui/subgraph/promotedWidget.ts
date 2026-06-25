/**
 * 위젯 프로모션 (Subgraph 입력 슬롯에 내부 위젯 바인딩)
 * ComfyUI_frontend: src/lib/litegraph/src/subgraph/SubgraphNode.ts (_resolveInputWidget, _setWidget) 참고
 *
 * 핵심:
 *  - SubgraphInput(부모→내부)에 내부 위젯을 연결하면, SubgraphNode 인스턴스에
 *    호스트 위젯이 노출되어 부모 그래프에서 값을 조작할 수 있다.
 *  - 위젯 호환성 검사(matchesWidget): 타입/min/max/step/precision 일치.
 *  - 프로모션 시 위젯 값은 WidgetValueStore(reactGraphStore의 widgets_values)에 저장.
 */

import type { ComfyWorkflowNode } from "../types/workflow"
import type { SubgraphSlot } from "../types/subgraph"
import type { WidgetValue } from "../stores/widgetStore"

/** 내부 위젯 후보 (서브그래프 내부 노드의 위젯) */
export interface InteriorWidget {
  /** 위젯이 속한 내부 노드 ID */
  nodeId: number
  /** 위젯 이름 */
  name: string
  /** 위젯 타입 (INT, FLOAT, STRING, BOOLEAN 등) */
  type: string
  /** 현재 위젯 값 */
  value: WidgetValue
  /** 위젯 옵션 (min/max/step 등) */
  options?: Record<string, unknown>
}

/** SubgraphInput과 내부 위젯의 타입 호환성 검사. */
export function matchesWidget(
  input: SubgraphSlot,
  widget: InteriorWidget
): boolean {
  if (input.type !== widget.type) return false
  // TODO: min/max/step/precision 세부 검사 (옵션 있을 때)
  return true
}

/**
 * SubgraphInput에 연결된 링크를 따라가 내부 위젯을 추적.
 * 서브그래프 내부에서 SubgraphInput은 output-side(링크 출발)이므로,
 * 링크의 target(내부 노드의 입력)을 찾아 해당 위젯을 식별.
 *
 * webui에서는 links 배열과 nodes 배열로 직접 추적.
 */
export function resolveInputWidget(
  input: SubgraphSlot,
  innerNodes: ComfyWorkflowNode[],
  innerLinks: { id: number; origin_id: number; origin_slot: number; target_id: number; target_slot: number; type: string }[]
): InteriorWidget | null {
  // SubgraphInput의 linkIds에서 링크를 찾아 target 노드의 위젯을 식별
  for (const linkId of input.linkIds) {
    const link = innerLinks.find((l) => l.id === linkId)
    if (!link) continue
    // SubgraphInput 노드(-10)가 origin, 내부 노드가 target
    if (link.origin_id !== -10) continue
    const targetNode = innerNodes.find((n) => n.id === link.target_id)
    if (!targetNode) continue

    // target 노드의 입력 슬롯에 연결된 위젯 찾기
    const targetInput = targetNode.inputs?.[link.target_slot]
    if (!targetInput) continue
    // 위젯인 경우: widget 필드가 있거나 타입이 위젯 타입
    if (targetInput.widget) {
      const widgetName = targetInput.widget.name
      const widgetNames = (targetNode.properties?.widget_names ?? []) as string[]
      const idx = widgetNames.indexOf(widgetName)
      const value = targetNode.widgets_values?.[idx] ?? ""
      const result: InteriorWidget = {
        nodeId: targetNode.id,
        name: widgetName,
        type: targetInput.type,
        value,
      }
      if (targetInput.widget.config !== undefined) {
        result.options = targetInput.widget.config
      }
      return result
    }
  }
  return null
}

/**
 * SubgraphNode 인스턴스에 노출할 호스트 위젯 목록을 계산.
 * Subgraph 정의의 inputs 중 위젯이 바인딩된 것을 찾아,
 * 인스턴스 노드의 widgets_values와 매핑.
 */
export interface PromotedHostWidget {
  /** SubgraphInput 슬롯 이름 */
  name: string
  /** 위젯 타입 */
  type: string
  /** 호스트 위젯 값 (인스턴스 widgets_values에서 가져옴) */
  value: WidgetValue
  /** 원본 내부 위젯 참조 (추적용) */
  interior: InteriorWidget | null
}

export function computePromotedHostWidgets(
  subgraphInputs: SubgraphSlot[],
  instanceNode: ComfyWorkflowNode,
  innerNodes: ComfyWorkflowNode[],
  innerLinks: { id: number; origin_id: number; origin_slot: number; target_id: number; target_slot: number; type: string }[]
): PromotedHostWidget[] {
  const result: PromotedHostWidget[] = []
  for (let i = 0; i < subgraphInputs.length; i++) {
    const input = subgraphInputs[i]
    if (!input) continue
    const interior = resolveInputWidget(input, innerNodes, innerLinks)
    if (!interior) continue
    // 인스턴스 노드의 widgets_values에서 i번째 값
    const value = instanceNode.widgets_values?.[i] ?? interior.value
    result.push({
      name: input.name,
      type: input.type,
      value,
      interior,
    })
  }
  return result
}