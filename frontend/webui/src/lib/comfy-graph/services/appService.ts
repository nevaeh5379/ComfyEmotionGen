/**
 * ComfyApp Service (React 포팅)
 * ComfyUI_frontend: src/scripts/app.ts 의 핵심 로직 분해
 * 순수 함수 + 클래스로 구성, React 외부 의존성 없음
 */

import {
  LGraph,
  LGraphCanvas,
  LGraphNode,
  LGraphGroup,
  LiteGraph,
  type Vector2,
} from "@comfy-graph/core/litegraph"
import type {
  ComfyWorkflowJSON,
  ComfyApiWorkflow,
  ComfyWorkflowNode,
  ComfyWorkflowLink,
} from "@comfy-graph/types/workflow"
import type { ComfyNodeDef } from "@comfy-graph/types/nodeDef"

export interface ComfyAppConfig {
  canvas: HTMLCanvasElement
  container: HTMLElement
  nodeDefs: Record<string, ComfyNodeDef>
}

/**
 * ComfyUI 노드 타입을 LiteGraph에 등록하기 위한 기본 노드 클래스
 */
class ComfyNode extends LGraphNode {
  comfyClass?: string
  constructor(title: string) {
    super(title)
    this.comfyClass = title
  }
}

/**
 * ComfyApp 핵심 서비스
 * LiteGraph 캔버스 초기화, 워크플로우 로드/저장, 노드 생성 관리
 */
export class ComfyAppService {
  graph: LGraph
  canvas: LGraphCanvas
  nodeDefs: Record<string, ComfyNodeDef> = {}
  /** 그래프 변경 시 호출될 콜백 */
  onGraphChanged?: (workflow: ComfyWorkflowJSON) => void

  constructor(config: ComfyAppConfig) {
    this.nodeDefs = config.nodeDefs
    this.graph = new LGraph()
    this.canvas = new LGraphCanvas(config.canvas, this.graph)

    // Set up canvas (creates bgcanvas, binds events)
    this.canvas.setCanvas(config.canvas)

    // Register node types from nodeDefs
    this.registerNodeDefs(config.nodeDefs)

    // Canvas 스타일 설정
    this.canvas.render_canvas_border = false
    // @ts-ignore LiteGraph fork property
    this.canvas.allow_dragcanvas = true
    // @ts-ignore LiteGraph fork property
    this.canvas.allow_zoom = true

    // 그래프 변경 감지
    // @ts-ignore LiteGraph fork property
    this.graph.onChange = () => {
      this.onGraphChanged?.(this.serializeGraph())
    }

    // Start rendering loop
    this.canvas.startRendering()
  }

  /**
   * Register all node definitions in LiteGraph
   */
  private registerNodeDefs(nodeDefs: Record<string, ComfyNodeDef>): void {
    for (const [type, def] of Object.entries(nodeDefs)) {
      // Create a node class for this type
      const NodeClass = class extends ComfyNode {
        static title = def.display_name || def.name
        static category = def.category || ""
        static type = type

        constructor() {
          super(NodeClass.title)
        }
      }

      LiteGraph.registerNodeType(type, NodeClass)
    }
  }

  /**
   * 워크플로우 JSON 로드
   */
  loadGraphData(workflow: ComfyWorkflowJSON): void {
    this.graph.clear()

    // 노드 생성
    for (const nodeData of workflow.nodes) {
      const node = this.createNode(nodeData.type, nodeData.pos, {
        skipConfigure: true,
      })
      if (!node) continue

      node.id = nodeData.id
      node.pos = nodeData.pos
      node.size = nodeData.size
      if (nodeData.color) node.color = nodeData.color
      if (nodeData.bgcolor) node.bgcolor = nodeData.bgcolor

      // Inputs
      if (nodeData.inputs) {
        for (const input of nodeData.inputs) {
          const slot = node.inputs?.find((s: { name: string }) => s.name === input.name)
          if (slot) {
            // @ts-ignore LiteGraph fork property
            slot.link = input.link ?? null
          }
        }
      }

      // Outputs
      if (nodeData.outputs) {
        for (const output of nodeData.outputs) {
          const slot = node.outputs?.find((s: { name: string }) => s.name === output.name)
          if (slot) {
            // @ts-ignore LiteGraph fork property
            slot.links = output.links ?? []
          }
        }
      }

      // Widget values
      if (nodeData.widgets_values) {
        if (node.widgets) {
          for (let i = 0; i < node.widgets.length; i++) {
            if (i < nodeData.widgets_values.length) {
              // @ts-ignore widget value assignment
              node.widgets[i].value = nodeData.widgets_values[i]
            }
          }
        }
      }

      // @ts-ignore configure may accept ComfyWorkflowNode
      node.configure?.(nodeData)
    }

    // 링크 생성
    for (const linkData of workflow.links) {
      const originNode = this.graph.getNodeById(linkData.origin_id)
      const targetNode = this.graph.getNodeById(linkData.target_id)
      if (!originNode || !targetNode) continue

      // @ts-ignore outputs access
      const originSlot = originNode.outputs?.[linkData.origin_slot]
      // @ts-ignore inputs access
      const targetSlot = targetNode.inputs?.[linkData.target_slot]
      if (!originSlot || !targetSlot) continue

      originNode.connect(linkData.origin_slot, targetNode, linkData.target_slot)
    }

    // 그룹 생성
    if (workflow.groups) {
      for (const groupData of workflow.groups) {
        const group = new LGraphGroup()
        group.title = groupData.title
        group.pos = [groupData.bounding[0], groupData.bounding[1]]
        group.size = [groupData.bounding[2], groupData.bounding[3]]
        if (groupData.color) group.color = groupData.color
        this.graph.add(group)
      }
    }

    this.graph.setDirtyCanvas(true, true)
  }

  /**
   * 현재 그래프를 워크플로우 JSON으로 직렬화
   */
  serializeGraph(): ComfyWorkflowJSON {
    const nodes: ComfyWorkflowNode[] = []
    const links: ComfyWorkflowLink[] = []

    for (const node of this.graph.nodes) {
      const nodeData: ComfyWorkflowNode = {
        id: node.id,
        type: node.type,
        pos: node.pos,
        size: node.size,
      }

      // @ts-ignore inputs access
      if (node.inputs) {
        // @ts-ignore inputs access
        nodeData.inputs = node.inputs.map((input: { name: string; type: string; link: number | null }) => ({
          name: input.name,
          type: input.type,
          link: input.link ?? undefined,
        }))
      }

      // @ts-ignore outputs access
      if (node.outputs) {
        // @ts-ignore outputs access
        nodeData.outputs = node.outputs.map((output: { name: string; type: string; links: number[] | null }, i: number) => ({
          name: output.name,
          type: output.type,
          links: output.links?.length ? output.links : undefined,
          slot_index: i,
        }))
      }

      // @ts-ignore widgets access
      if (node.widgets) {
        // @ts-ignore widgets access
        nodeData.widgets_values = node.widgets.map((w: { value: unknown }) => w.value)
      }

      // @ts-ignore color property
      if (node.color) nodeData.color = node.color
      // @ts-ignore bgcolor property
      if (node.bgcolor) nodeData.bgcolor = node.bgcolor

      nodes.push(nodeData)
    }

    // @ts-ignore links iteration
    for (const [, link] of this.graph.links) {
      links.push({
        id: link.id,
        origin_id: link.origin_id,
        origin_slot: link.origin_slot,
        target_id: link.target_id,
        target_slot: link.target_slot,
        type: link.type as string,
      })
    }

    // @ts-ignore groups access
    const groups = this.graph.groups.map((g: { title: string; pos: [number, number]; size: [number, number]; color?: string }) => ({
      title: g.title,
      bounding: [g.pos[0], g.pos[1], g.size[0], g.size[1]] as [number, number, number, number],
      color: g.color,
    }))

    return {
      last_node_id: Math.max(...nodes.map((n) => n.id), 0),
      last_link_id: Math.max(...links.map((l) => l.id), 0),
      nodes,
      links,
      groups: groups.length > 0 ? groups : undefined,
      version: 0.4,
    }
  }

  /**
   * 그래프를 ComfyUI API 포맷으로 변환 (실행용)
   */
  graphToPrompt(): ComfyApiWorkflow {
    const prompt: ComfyApiWorkflow = {}

    for (const node of this.graph.nodes) {
      const inputs: Record<string, unknown> = {}

      // 위젯 값
      // @ts-ignore widgets access
      if (node.widgets) {
        // @ts-ignore widgets access
        for (const widget of node.widgets) {
          if (widget.name) {
            inputs[widget.name] = widget.value
          }
        }
      }

      // 링크된 입력
      // @ts-ignore inputs access
      if (node.inputs) {
        // @ts-ignore inputs access
        for (const input of node.inputs) {
          if (input.link != null) {
            // @ts-ignore links iteration
            for (const [, link] of this.graph.links) {
              if (link.id === input.link) {
                const originNode = this.graph.getNodeById(link.origin_id)
                if (originNode) {
                  inputs[input.name] = [originNode.id.toString(), link.origin_slot]
                }
                break
              }
            }
          }
        }
      }

      // @ts-ignore title property
      prompt[node.id.toString()] = {
        inputs,
        class_type: node.type,
        _meta: {
          title: node.title || node.type,
        },
      }
    }

    return prompt
  }

  /**
   * 노드 생성
   */
  createNode(
    type: string,
    pos: Vector2 = [0, 0],
    options: { skipConfigure?: boolean } = {}
  ): LGraphNode | null {
    const nodeDef = this.nodeDefs[type]
    if (!nodeDef) {
      console.warn(`[ComfyApp] Unknown node type: ${type}`)
      return null
    }

    const node = LiteGraph.createNode(type)
    if (!node) return null

    node.pos = pos

    // 입력 슬롯
    if (nodeDef.input?.required) {
      for (const [name, spec] of Object.entries(nodeDef.input.required)) {
        const typeStr = Array.isArray(spec[0]) ? "COMBO" : (spec[0] as string)
        node.addInput(name, typeStr)
      }
    }

    if (nodeDef.input?.optional) {
      for (const [name, spec] of Object.entries(nodeDef.input.optional)) {
        const typeStr = Array.isArray(spec[0]) ? "COMBO" : (spec[0] as string)
        node.addInput(name, typeStr)
      }
    }

    // 출력 슬롯
    for (let i = 0; i < nodeDef.output.length; i++) {
      node.addOutput(
        nodeDef.output_name[i] || nodeDef.output[i],
        nodeDef.output[i]
      )
    }

    // 위젯 생성
    this.addNodeWidgets(node, nodeDef)

    this.graph.add(node)

    if (!options.skipConfigure) {
      this.graph.setDirtyCanvas(true, true)
    }

    return node
  }

  /**
   * 노드에 위젯 추가
   */
  private addNodeWidgets(node: LGraphNode, nodeDef: ComfyNodeDef): void {
    if (!nodeDef.input?.required) return

    for (const [name, spec] of Object.entries(nodeDef.input.required)) {
      // @ts-ignore InputSpec tuple destructuring
      const [type, config = {}] = spec as [string | string[], Record<string, unknown>]

      if (Array.isArray(type)) {
        // COMBO 위젯
        node.addWidget("combo", name, type[0], () => {}, {
          values: type,
        })
      } else if (type === "INT" || type === "FLOAT") {
        // 숫자 위젯
        const defaultValue = (config.default as number) ?? (type === "INT" ? 0 : 0.0)
        const min = (config.min as number) ?? (type === "INT" ? 0 : 0.0)
        const max = (config.max as number) ?? (type === "INT" ? 0x7fffffff : 1e38)
        const step = (config.step as number) ?? (type === "INT" ? 1 : 0.1)
        node.addWidget(type === "INT" ? "number" : "number", name, defaultValue, () => {}, {
          min,
          max,
          step,
          precision: type === "INT" ? 0 : 2,
        })
      } else if (type === "STRING") {
        // 텍스트 위젯
        const defaultValue = (config.default as string) ?? ""
        node.addWidget("text", name, defaultValue, () => {})
      } else if (type === "BOOLEAN") {
        // 토글 위젯
        node.addWidget("toggle", name, (config.default as boolean) ?? false, () => {})
      }
    }
  }

  /**
   * 정리
   */
  dispose(): void {
    this.canvas.stopRendering()
    this.graph.stop()
  }
}
