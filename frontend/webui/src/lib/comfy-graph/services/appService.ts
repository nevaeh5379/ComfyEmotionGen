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
import { useNodeDefStore } from "@comfy-graph/stores/nodeDefStore"

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
    this.canvas.allow_dragcanvas = true
    this.canvas.allow_zoom = true

    // 그래프 변경 감지
    this.graph.onChange = () => {
      this.onGraphChanged?.(this.serializeGraph())
    }

    // Start rendering loop
    this.canvas.startRendering()
  }

  /**
   * Register all node definitions in LiteGraph
   */
  registerNodeDefs(nodeDefs: Record<string, ComfyNodeDef>): void {
    const app = window.app

    for (const [type, def] of Object.entries(nodeDefs)) {
      // Create a node class for this type
      const NodeClass = class extends ComfyNode {
        static title = def.display_name || def.name
        static category = def.category || ""
        static type = type
        static comfyClass = def.name

        constructor() {
          super(NodeClass.title)
        }
      }

      // Run beforeRegisterNodeDef hooks
      if (app?.extensions) {
        for (const ext of app.extensions) {
          if (ext.beforeRegisterNodeDef) {
            try {
              ext.beforeRegisterNodeDef(NodeClass, def as never, app)
            } catch (err) {
              console.error(`Extension beforeRegisterNodeDef failed for ${ext.name}:`, err)
            }
          }
        }
      }

      LiteGraph.registerNodeType(type, NodeClass)
    }
  }

  /**
   * 워크플로우 JSON 로드
   */
  loadGraphData(workflow: ComfyWorkflowJSON): void {
    console.log(`[CEG] loadGraphData: ${workflow.nodes?.length || 0} nodes, ${workflow.links?.length || 0} links`)
    this.graph.clear()

    // 노드 생성
    for (const nodeData of workflow.nodes) {
      console.log(`[CEG] loadGraphData creating node: type="${nodeData.type}" id=${nodeData.id}`)
      let node: LGraphNode | null = null
      try {
        node = this.createNode(nodeData.type, nodeData.pos, {
          skipConfigure: true,
          nodeId: nodeData.id,
        })
      } catch (err) {
        console.warn(`[CEG] createNode failed for ${nodeData.type}:`, err)
        continue
      }
      if (!node) {
        console.warn(`[CEG] createNode returned null for ${nodeData.type}, forcing generic fallback`)
        node = new LGraphNode(nodeData.type || "Unknown")
        node.pos = nodeData.pos
        node.id = nodeData.id
        this.graph.add(node)
      }
      node.pos = nodeData.pos
      node.size = nodeData.size
      if (nodeData.color) node.color = nodeData.color
      if (nodeData.bgcolor) node.bgcolor = nodeData.bgcolor

      // Inputs
      if (nodeData.inputs) {
        for (const input of nodeData.inputs) {
          const slot = node.inputs?.find((s: { name: string }) => s.name === input.name)
          if (slot) {
            slot.link = input.link ?? null
          }
        }
      }

      // Outputs
      if (nodeData.outputs) {
        for (const output of nodeData.outputs) {
          const slot = node.outputs?.find((s: { name: string }) => s.name === output.name)
          if (slot) {
            slot.links = output.links ?? []
          }
        }
      }

      try {
        node.configure?.(nodeData as never)
      } catch (err) {
        console.warn(`[loadGraphData] configure failed for ${nodeData.type}:`, err)
      }

      // Run loadedGraphNode hooks (before widget value restoration, so DOM widgets
      // like LoraManager's loras widget are initialized and can accept values)
      const app = window.app
      if (app?.extensions) {
        for (const ext of app.extensions) {
          if (ext.loadedGraphNode) {
            try {
              ext.loadedGraphNode(node, app)
            } catch (err) {
              console.error(`Extension loadedGraphNode failed for ${ext.name}:`, err)
            }
          }
        }
      }

      // Restore widget values AFTER configure + loadedGraphNode hooks, because
      // configureWidgets skips serialize:false widgets (misaligning indices),
      // and some DOM widgets need their hook-initialized DOM to accept values.
      if (nodeData.widgets_values && node.widgets) {
        for (let i = 0; i < Math.min(node.widgets.length, nodeData.widgets_values.length); i++) {
          try {
            node.widgets[i].value = nodeData.widgets_values[i] as string | number | boolean
          } catch (err) {
            console.warn(`[loadGraphData] failed to set widget[${i}] for ${nodeData.type}:`, err)
          }
        }
      }
    }

    // 링크 생성
    for (const linkData of workflow.links) {
      const originNode = this.graph.getNodeById(linkData.origin_id)
      const targetNode = this.graph.getNodeById(linkData.target_id)
      if (!originNode || !targetNode) {
        console.warn(`[CEG] connectSkipped: link=${linkData.id} origin=${linkData.origin_id} target=${linkData.target_id}`)
        continue
      }

      const originSlot = originNode.outputs?.[linkData.origin_slot]
      const targetSlot = targetNode.inputs?.[linkData.target_slot]
      if (!originSlot || !targetSlot) continue

      const result = originNode.connect(linkData.origin_slot, targetNode, linkData.target_slot)
      if (result === null || (result as unknown) === false) {
        console.warn(`[CEG] connectFailed: link=${linkData.id} type=${originNode.type}.out[${linkData.origin_slot}] -> ${targetNode.type}.in[${linkData.target_slot}]`)
      }
    }

    // 연결에 실패한 슬롯(phantom link) 정리: connect 실패 후에도 workflow JSON에서 설정된
    // stale slot.link / slot.links 가 남아있으면 핀이 녹색으로 표시되지만 실제 SVG 경로는 없음
    for (const node of this.graph.nodes) {
      if (node.inputs) {
        for (const input of node.inputs) {
          if (input.link != null && !this.graph.links.has(input.link)) {
            input.link = null
          }
        }
      }
      if (node.outputs) {
        for (const output of node.outputs) {
          if (output.links && Array.isArray(output.links)) {
            output.links = output.links.filter((linkId: number) => this.graph.links.has(linkId))
            if (output.links.length === 0) output.links = null
          }
        }
      }
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
        id: Number(node.id),
        type: node.type,
        pos: node.pos,
        size: node.size,
      }

      if (node.inputs) {
        nodeData.inputs = node.inputs.map((input) => ({
          name: input.name,
          type: String(input.type),
          link: input.link ?? undefined,
        }))
      }

      if (node.outputs) {
        nodeData.outputs = node.outputs.map((output, i) => ({
          name: output.name,
          type: String(output.type),
          links: output.links?.length ? output.links : undefined,
          slot_index: i,
        }))
      }

      if (node.widgets) {
        nodeData.widgets_values = node.widgets.map((w) => w.value)
      }

      if (node.color) nodeData.color = node.color
      if (node.bgcolor) nodeData.bgcolor = node.bgcolor

      nodes.push(nodeData)
    }

    for (const [, link] of this.graph.links) {
      links.push({
        id: link.id,
        origin_id: Number(link.origin_id),
        origin_slot: link.origin_slot,
        target_id: Number(link.target_id),
        target_slot: link.target_slot,
        type: link.type as string,
      })
    }

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
      if (node.widgets) {
        for (const widget of node.widgets) {
          if (widget.name) {
            inputs[widget.name] = widget.value
          }
        }
      }

      // 링크된 입력
      if (node.inputs) {
        for (const input of node.inputs) {
          if (input.link != null) {
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
    options: { skipConfigure?: boolean; nodeId?: number } = {}
  ): LGraphNode | null {
    let nodeDef = this.nodeDefs[type]
    let actualType = type
    if (!nodeDef) {
      const storeDef = useNodeDefStore.getState().getNodeDef(type)
      if (storeDef) {
        console.log(`[CEG] createNode: fuzzy match for "${type}" via store.getNodeDef`)
        nodeDef = storeDef
        for (const key of Object.keys(this.nodeDefs)) {
          if (key.toLowerCase() === type.toLowerCase()) {
            actualType = key
            break
          }
        }
        if (actualType === type) {
          const store = useNodeDefStore.getState()
          for (const key of Object.keys(store.nodeDefs)) {
            if (key.toLowerCase() === type.toLowerCase()) {
              actualType = key
              break
            }
          }
          console.log(`[CEG] createNode: registering "${actualType}" dynamically in LiteGraph`)
          this.registerNodeDefs({ [actualType]: nodeDef })
          this.nodeDefs[actualType] = nodeDef
        }
      } else {
        console.warn(`[ComfyApp] Unknown node type: ${type}, creating generic node`)
        const node = new LGraphNode(type)
        node.pos = pos
        if (options.nodeId != null) node.id = options.nodeId
        this.graph.add(node)
        return node
      }
    }

    const node = LiteGraph.createNode(actualType)
    if (!node) return null

    if (typeof node.addInput !== 'function') return null

    node.pos = pos
    if (options.nodeId != null) node.id = options.nodeId

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

    for (let i = 0; i < nodeDef.output.length; i++) {
      node.addOutput(
        nodeDef.output_name[i] || nodeDef.output[i],
        nodeDef.output[i]
      )
    }

    this.addNodeWidgets(node, nodeDef)

    node.onNodeCreated?.()

    this.graph.add(node)

    // Run nodeCreated hooks
    const app = window.app
    if (app?.extensions) {
      for (const ext of app.extensions) {
        if (ext.nodeCreated) {
          try {
            ext.nodeCreated(node, app)
          } catch (err) {
            console.error(`Extension nodeCreated failed for ${ext.name}:`, err)
          }
        }
      }
    }

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
      } else if (type === "STRING" || type.startsWith("AUTOCOMPLETE_")) {
        // 텍스트 위젯 (STRING, AUTOCOMPLETE_TEXT, AUTOCOMPLETE_TEXT_LORAS, etc.)
        const defaultValue = (config.default as string) ?? ""
        node.addWidget("text", name, defaultValue, () => {}, config)
      } else if (type === "BOOLEAN") {
        // 토글 위젯
        node.addWidget("toggle", name, (config.default as boolean) ?? false, () => {})
      } else if (nodeDef.input?.required) {
        // Skip non-widget types (MODEL, CLIP, LATENT, IMAGE, etc.)
        // They are connection-only slots and should never get a text widget.
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
