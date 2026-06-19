/**
 * ComfyApp Service (React 포팅)
 * ComfyUI_frontend: src/scripts/app.ts 의 핵심 로직 분해
 * 순수 함수 + 클래스로 구성, React 외부 의존성 없음
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */

/*
import {
  LGraph,
  LGraphCanvas,
  LGraphNode,
  LGraphGroup,
  LiteGraph,
  type Point,
  type ISerialisedNode,
} from "comfy-litegraph"
*/
const LGraph = (window as any).LGraph
const LGraphCanvas = (window as any).LGraphCanvas
const LGraphNode = (window as any).LGraphNode
const LGraphGroup = (window as any).LGraphGroup
const LiteGraph = (window as any).LiteGraph
type LGraph = any
type LGraphCanvas = any
type LGraphNode = any
type LGraphGroup = any
type LiteGraph = any
type Point = [number, number]
type ISerialisedNode = any

import type {
  ComfyWorkflowJSON,
  ComfyApiWorkflow,
  ComfyWorkflowNode,
  ComfyWorkflowLink,
} from "@/comfyui/types/workflow"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"
import type { NodeExecutionOutput } from "@/comfyui/types/apiSchema"
import type { ComfyExtension, ExtensionManager } from "@/comfyui/types/extensionTypes"
import type { ComfyApi } from "@/comfyui/api"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { useExtensionStore } from "@/comfyui/stores/extensionStore"
import { extensionManager } from "@/comfyui/services/extensionService"
import { api } from "@/comfyui/api"

export interface ComfyAppConfig {
  canvas: HTMLCanvasElement
  container: HTMLElement
  nodeDefs: Record<string, ComfyNodeDef>
}

interface AppWithExtensions {
  extensions?: ComfyExtension[]
}

function getWindowApp(): AppWithExtensions | undefined {
  return (window as unknown as { app: AppWithExtensions | undefined }).app
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

  // ── ComfyApp 호환 속성 ─────────────────────────────────────────
  /** 커스텀 노드 extensionManager */
  extensionManager: ExtensionManager = extensionManager
  /** ComfyApi 인스턴스 */
  api: ComfyApi = api
  /** 노드 실행 출력 데이터 */
  nodeOutputs: Record<string, NodeExecutionOutput> = {}
  /** 노드 프리뷰 이미지 데이터 */
  nodePreviewImages: Record<string, string[]> = {}

  /** 등록된 익스텐션 목록 (extensionStore 위임) */
  get extensions(): ComfyExtension[] {
    return useExtensionStore.getState().extensions
  }

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
    ;(this.canvas as unknown as Record<string, boolean>).allow_dragcanvas = true
    ;(this.canvas as unknown as Record<string, boolean>).allow_zoom = true

    // 그래프 변경 감지
    ;(this.graph as unknown as Record<string, unknown>).onChange = (): void => {
      this.onGraphChanged?.(this.serializeGraph())
    }

    // Start rendering loop
    this.canvas.startRendering()
  }

  /**
   * Register all node definitions in LiteGraph
   */
  registerNodeDefs(nodeDefs: Record<string, ComfyNodeDef>): void {
    const app = getWindowApp()
    const _app = app

    for (const [type, def] of Object.entries(nodeDefs)) {
      // Create a node class for this type
      const NodeClass = class extends ComfyNode {
        static title = def.display_name ?? def.name
        static category = def.category
        static type = type
        static comfyClass = def.name

        constructor() {
          super(NodeClass.title)
        }
      }

      // Run beforeRegisterNodeDef hooks
      if (_app?.extensions !== undefined) {
        for (const ext of _app.extensions) {
          if (ext.beforeRegisterNodeDef) {
            try {
              void Promise.resolve(ext.beforeRegisterNodeDef(NodeClass, def, _app))
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
    this.graph.clear()

    // 노드 생성
    for (const nodeData of workflow.nodes) {
      // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      let node: LGraphNode | null = null
      try {
        node = this.createNode(nodeData.type, nodeData.pos, {
          skipConfigure: true,
        })
      } catch (err) {
        console.warn(`[CEG] createNode failed for ${nodeData.type}:`, err)
        continue
      }
      if (node === null) {
        // Absolute fallback: generic node so graph has all nodes for linking
        console.warn(`[CEG] createNode returned null for ${nodeData.type}, forcing generic fallback`)
      node = new LGraphNode(nodeData.type)
        node.pos = nodeData.pos
        this.graph.add(node)
      }

      // graph.add(node)에서 할당된 자동 ID를 JSON의 ID로 교체하고 _nodes_by_id 갱신
      const oldId = node.id
      if (oldId !== nodeData.id) {
        this.graph._nodes_by_id[oldId] = undefined as never
        node.id = nodeData.id
        this.graph._nodes_by_id[node.id] = node
      }
      node.pos = nodeData.pos
      node.size = nodeData.size
      if (nodeData.color !== undefined) node.color = nodeData.color
      if (nodeData.bgcolor !== undefined) node.bgcolor = nodeData.bgcolor

      // Inputs
      if (nodeData.inputs !== undefined) {
        for (const input of nodeData.inputs) {
          const slot = node.inputs.find((s: any) => s.name === input.name)
          if (slot !== undefined) {
            slot.link = input.link ?? null
          }
        }
      }

      // Outputs
      if (nodeData.outputs !== undefined) {
        for (const output of nodeData.outputs) {
          const slot = node.outputs.find((s: any) => s.name === output.name)
          if (slot !== undefined) {
            slot.links = output.links ?? null
          }
        }
      }

      try {
        node.configure(nodeData as ISerialisedNode)
      } catch (err) {
        console.warn(`[loadGraphData] configure failed for ${nodeData.type}:`, err)
      }

      // Run loadedGraphNode hooks (before widget value restoration, so DOM widgets
      // like LoraManager's loras widget are initialized and can accept values)
      const app = getWindowApp()
      if (app?.extensions !== undefined) {
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
      if (nodeData.widgets_values !== undefined && node.widgets !== undefined) {
        for (let i = 0; i < Math.min(node.widgets.length, nodeData.widgets_values.length); i++) {
          const widget = node.widgets[i]
          if (widget !== undefined) {
            try {
              widget.value = nodeData.widgets_values[i] as string | number | boolean
            } catch (err) {
              console.warn(`[loadGraphData] failed to set widget[${String(i)}] for ${nodeData.type}:`, err)
            }
          }
        }
      }
    }

    // 링크 생성
    for (const linkData of workflow.links) {
      const originNode = this.graph.getNodeById(linkData.origin_id)
      const targetNode = this.graph.getNodeById(linkData.target_id)
      if (originNode === null || targetNode === null) {
        console.warn(`[CEG] connectSkipped: link=${String(linkData.id)} origin=${String(linkData.origin_id)} target=${String(linkData.target_id)}`)
        continue
      }

      const originSlot = originNode.outputs[linkData.origin_slot]
      const targetSlot = targetNode.inputs[linkData.target_slot]
      if (originSlot === undefined || targetSlot === undefined) continue

      const result = originNode.connect(linkData.origin_slot, targetNode, linkData.target_slot)
      if (result === null) {
        const originType: string = originNode.type as string
        const targetType: string = targetNode.type as string
        console.warn(`[CEG] connectFailed: link=${String(linkData.id)} type=${originType}.out[${String(linkData.origin_slot)}] -> ${targetType}.in[${String(linkData.target_slot)}]`)
      }
    }

    // 연결에 실패한 슬롯(phantom link) 정리: connect 실패 후에도 workflow JSON에서 설정된
    // stale slot.link / slot.links 가 남아있으면 핀이 녹색으로 표시되지만 실제 SVG 경로는 없음
    for (const node of this.graph.nodes) {
      for (const input of node.inputs) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if ((input.link !== null && input.link !== 0) && !this.graph.links.has(input.link)) {
          input.link = null
        }
      }
      for (const output of node.outputs) {
        if (output.links !== null && output.links.length !== 0) {
          output.links = output.links.filter((linkId: number): boolean => this.graph.links.has(linkId))
          if (output.links.length === 0) output.links = null
        }
      }
    }

    // 그룹 생성
    if (workflow.groups !== undefined) {
      for (const groupData of workflow.groups) {
        const group = new LGraphGroup()
        group.title = groupData.title
        group.pos = [groupData.bounding[0], groupData.bounding[1]]
        group.size = [groupData.bounding[2], groupData.bounding[3]]
        if (groupData.color !== undefined) group.color = groupData.color
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

    for (const n of this.graph.nodes) {
      const nodeData: ComfyWorkflowNode = {
        id: Number(n.id),
        type: n.type as string,
        pos: n.pos,
        size: n.size,
      }

      if (n.inputs.length > 0) {
        nodeData.inputs = n.inputs.map((input: any) => ({
          name: input.name,
          type: input.type as string,
          link: input.link ?? undefined,
        }))
      }

      if (n.outputs.length > 0) {
        nodeData.outputs = n.outputs.map((output: any, i: number) => ({
          name: output.name,
          type: output.type as string,
          links: (output.links !== null && output.links.length > 0) ? output.links : undefined,
          slot_index: i,
        }))
      }

      if (n.widgets !== undefined) {
        nodeData.widgets_values = n.widgets.map((w: any) => w.value)
      }

      if (n.color !== undefined) nodeData.color = n.color
      if (n.bgcolor !== undefined) nodeData.bgcolor = n.bgcolor

      nodes.push(nodeData)
    }

    for (const [, link] of this.graph.links) {
      links.push({
        id: link.id,
        origin_id: Number(link.origin_id),
        origin_slot: link.origin_slot,
        target_id: Number(link.target_id),
        target_slot: link.target_slot,
        type: String(link.type),
      })
    }

    const groups = this.graph.groups.map((g: any) => ({
      title: g.title,
      bounding: [g.pos[0], g.pos[1], g.size[0], g.size[1]] as [number, number, number, number],
      color: g.color,
    }))

    return {
      last_node_id: Math.max(...nodes.map((node) => node.id), 0),
      last_link_id: Math.max(...links.map((link) => link.id), 0),
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

    for (const n of this.graph.nodes) {
      const inputs: Record<string, unknown> = {}

      // 위젯 값
      if (n.widgets !== undefined) {
        for (const widget of n.widgets) {
          inputs[widget.name] = widget.value
        }
      }

      // 링크된 입력
      if (n.inputs.length > 0) {
        for (const input of n.inputs) {
          if (input.link !== null) {
            for (const [, link] of this.graph.links) {
              if (link.id === input.link) {
                const originNode = this.graph.getNodeById(link.origin_id)
                if (originNode !== null) {
                  inputs[input.name] = [originNode.id.toString(), link.origin_slot]
                }
                break
              }
            }
          }
        }
      }

      prompt[n.id.toString()] = {
        inputs,
        class_type: n.type as string,
        _meta: {
          title: n.title,
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
      pos: Point = [0, 0],
      options: { skipConfigure?: boolean } = {}
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    ): LGraphNode | null {
    let nodeDef = this.nodeDefs[type]
    let actualType = type
    if (nodeDef === undefined) {
      const storeDef = useNodeDefStore.getState().getNodeDef(type)
      if (storeDef !== undefined) {
        console.debug(`[CEG] createNode: fuzzy match for "${type}" via store.getNodeDef`)
        nodeDef = storeDef
        // Find the actually registered key in this.nodeDefs (case-insensitive match)
        for (const key of Object.keys(this.nodeDefs)) {
          if (key.toLowerCase() === type.toLowerCase()) {
            actualType = key
            break
          }
        }
        // If still not found in this.nodeDefs, register dynamically from store
        if (actualType === type) {
          const store = useNodeDefStore.getState()
          for (const key of Object.keys(store.nodeDefs)) {
            if (key.toLowerCase() === type.toLowerCase()) {
              actualType = key
              break
            }
          }
          console.debug(`[CEG] createNode: registering "${actualType}" dynamically in LiteGraph`)
          // Register in LiteGraph on-the-fly so createNode works
          this.registerNodeDefs({ [actualType]: nodeDef })
          this.nodeDefs[actualType] = nodeDef
        }
      } else {
        console.warn(`[ComfyApp] Unknown node type: ${type}, creating generic node`)
        const node = new LGraphNode(type)
        node.pos = pos
        this.graph.add(node)
        return node
      }
    }

    const node = LiteGraph.createNode(actualType)
    if (node === null) return null

    if (typeof node.addInput !== "function") return null

    node.pos = pos

    // 입력 슬롯
    if (nodeDef.input?.required !== undefined) {
      for (const [name, spec] of Object.entries(nodeDef.input.required)) {
        const inputType = spec[0]
        const typeStr = Array.isArray(inputType) ? "COMBO" : inputType
        node.addInput(name, typeStr)
      }
    }

    if (nodeDef.input?.optional !== undefined) {
      for (const [name, spec] of Object.entries(nodeDef.input.optional)) {
        const inputType = spec[0]
        const typeStr = Array.isArray(inputType) ? "COMBO" : inputType
        node.addInput(name, typeStr)
      }
    }

    // 출력 슬롯
    for (let i = 0; i < nodeDef.output.length; i++) {
      const outType = nodeDef.output[i] ?? ""
      const outName = nodeDef.output_name[i] ?? outType
      node.addOutput(outName, outType)
    }

    // 위젯 생성
    this.addNodeWidgets(node, nodeDef)

    // Call prototype's onNodeCreated (patched by beforeRegisterNodeDef hooks)
    node.onNodeCreated?.()

    this.graph.add(node)

    // Run nodeCreated hooks
    const app = getWindowApp()
    if (app?.extensions !== undefined) {
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

    if (options.skipConfigure !== true) {
      this.graph.setDirtyCanvas(true, true)
    }

    return node
  }

  /**
   * 노드에 위젯 추가
   */
  private addNodeWidgets(node: LGraphNode, nodeDef: ComfyNodeDef): void {
    if (nodeDef.input?.required === undefined) return

    for (const [name, spec] of Object.entries(nodeDef.input.required)) {
      const inputType = spec[0]
      const inputConfig = spec[1] ?? {}

      if (Array.isArray(inputType)) {
        // COMBO 위젯
        node.addWidget("combo", name, inputType[0] ?? "", (): void => undefined, {
          values: inputType,
        })
      } else if (inputType === "INT" || inputType === "FLOAT") {
        // 숫자 위젯
        const defaultValue = (inputConfig.default as number | undefined) ?? (inputType === "INT" ? 0 : 0.0)
        const min = (inputConfig.min as number | undefined) ?? (inputType === "INT" ? 0 : 0.0)
        const max = (inputConfig.max as number | undefined) ?? (inputType === "INT" ? 0x7fffffff : 1e38)
        const step = (inputConfig.step as number | undefined) ?? (inputType === "INT" ? 1 : 0.1)
        node.addWidget("number", name, defaultValue, (): void => undefined, {
          min,
          max,
          step,
          precision: inputType === "INT" ? 0 : 2,
        })
      } else if (inputType === "STRING" || inputType.startsWith("AUTOCOMPLETE_")) {
        // 텍스트 위젯 (STRING, AUTOCOMPLETE_TEXT, AUTOCOMPLETE_TEXT_LORAS, etc.)
        const defaultValue = (inputConfig.default as string | undefined) ?? ""
        node.addWidget("text", name, defaultValue, (): void => undefined, inputConfig)
      } else if (inputType === "BOOLEAN") {
        // 토글 위젯
        node.addWidget("toggle", name, (inputConfig.default as boolean | undefined) ?? false, (): void => undefined)
      }
      // else: Skip non-widget types (MODEL, CLIP, LATENT, IMAGE, etc.)
      // They are connection-only slots and should never get a text widget.
    }
  }

  /**
   * 정리
   */
  dispose(): void {
    this.canvas.stopRendering()
  }
}
