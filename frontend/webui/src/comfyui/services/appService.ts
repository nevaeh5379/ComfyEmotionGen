/**
 * ComfyApp Service (React 포팅)
 * ComfyUI_frontend: src/scripts/app.ts 의 핵심 로직 분해
 * 순수 함수 + 클래스로 구성, React 외부 의존성 없음
 *
 * Zustand store를 single source of truth로 사용하며,
 * LGraphAdapter를 통해 커스텀 노드 호환 API를 제공합니다.
 */

import type {
  ComfyWorkflowJSON,
  ComfyApiWorkflow,
  ComfyWorkflowNode,
  ComfyWorkflowLink,
} from "@/comfyui/types/workflow"
import type { ComfyNodeDef, InputSpec } from "@/comfyui/types/nodeDef"
import type { NodeExecutionOutput } from "@/comfyui/types/apiSchema"
import type { ComfyExtension, ExtensionManager } from "@/comfyui/types/extensionTypes"
import type { ComfyApi } from "@/comfyui/api"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"
import { useExtensionStore } from "@/comfyui/stores/extensionStore"
import { extensionManager } from "@/comfyui/services/extensionService"
import { api } from "@/comfyui/api"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { widgetStore, type CustomWidget } from "@/comfyui/stores/widgetStore"
import { LGraphAdapter } from "@/comfyui/services/lgraphAdapter"
import type { LGraphNode, LGraphAdapterRef } from "@/comfyui/types/lgraphAdapterNode"

type Point = [number, number]

interface AppWithExtensions {
  extensions?: ComfyExtension[]
}

function getWindowApp(): AppWithExtensions | undefined {
  return (window as unknown as { app: AppWithExtensions | undefined }).app
}

/**
 * ComfyUI 노드 타입을 LiteGraph에 등록하기 위한 기본 노드 클래스
 */
class ComfyNode {
  static readonly isStandardComfyNode = true
  comfyClass?: string
  id = 0
  type?: string
  color?: string
  bgcolor?: string
  pos: [number, number] = [0, 0]
  size: [number, number] = [0, 0]
  inputs: LGraphNodeInput[] = []
  outputs: LGraphNodeOutput[] = []
  widgets?: WidgetType[] = []
  order?: number
  mode?: number
  properties?: Record<string, unknown>
  graph?: LGraphAdapterRef | null
  onConfigure?: (data: Partial<ComfyWorkflowNode>) => void

  constructor(title: string) {
    this.type = title
    this.comfyClass = title
  }

  addInput(name: string, type: string): void {
    this.inputs.push({ name, type, link: null })
  }

  addOutput(name: string, type: string): void {
    this.outputs.push({ name, type, links: null })
  }

  connect(_slot: number, _targetNode: LGraphNode, _targetSlot: number | string): boolean | null {
    return true
  }

  disconnectInput(slot: number): void {
    const input = this.inputs[slot]
    if (input && input.link !== null) {
      useReactGraphStore.getState().disconnect(input.link)
      input.link = null
    }
  }

  disconnectOutput(slot: number): void {
    const output = this.outputs[slot]
    if (output && output.links && output.links.length > 0) {
      const linksCopy = [...output.links]
      for (const linkId of linksCopy) {
        useReactGraphStore.getState().disconnect(linkId)
      }
      output.links = null
    }
  }
  configure(data?: Partial<ComfyWorkflowNode> | null): void {
    if (data === undefined || data === null) return
    if (window.LiteGraph?.LGraphNode?.prototype?.configure) {
      window.LiteGraph.LGraphNode.prototype.configure.call(this, data)
    }
    if (data.properties !== undefined) {
      this.properties = { ...this.properties, ...data.properties }
    }
    if (data.widgets_values !== undefined && this.widgets !== undefined) {
      for (let i = 0; i < data.widgets_values.length; i++) {
        const w = this.widgets[i]
        if (w !== undefined) {
          w.value = data.widgets_values[i]
          if (w.callback && typeof w.callback === "function") {
            try {
              w.callback(data.widgets_values[i])
            } catch {
              // ignore
            }
          }
        }
      }
    }
    if (this.onConfigure !== undefined) {
      try {
        this.onConfigure(data)
      } catch (err) {
        console.error("onConfigure failed:", err)
      }
    }
  }
  setDirtyCanvas(): void { /* noop */ }

  addWidget(
    type: string,
    name: string,
    value: string | number | boolean,
    callback: (v: string | number | boolean) => void,
    options?: Record<string, unknown>
  ): WidgetType {
    const w: WidgetType = {
      type,
      name,
      options: { hideOnZoom: false, ...(options ?? {}) },
      _value: String(value),
      value: value,
      callback: callback as WidgetType["callback"],
    }
    this.widgets ??= []
    this.widgets.push(w)
    return w
  }

  addDOMWidget(
    name: string,
    type: string,
    element: HTMLElement,
    options?: {
      getValue?: () => unknown
      setValue?: (v: unknown) => void
      hideOnZoom?: boolean
      selectOn?: string[]
      [key: string]: unknown
    }
  ): WidgetType {
    const opts = options ?? {}
    const w: WidgetType = {
      type,
      name,
      element,
      options: { hideOnZoom: false, ...opts },
      value: opts.getValue ? opts.getValue() : "",
      callback: null,
    }
    let _value: unknown = w.value
    Object.defineProperty(w, "value", {
      get(): unknown {
        return typeof opts.getValue === "function" ? opts.getValue() : _value
      },
      set(v: unknown): void {
        _value = v
        if (typeof opts.setValue === "function") {
          opts.setValue(v)
        }
      },
      configurable: true,
      enumerable: true,
    })
    this.widgets ??= []
    this.widgets.push(w)
    return w
  }
}

/**
 * 그래프를 ComfyUI API 포맷으로 변환하는 순수 함수
 */
export function convertGraphToPrompt(
  nodes: ComfyWorkflowNode[],
  links: ComfyWorkflowLink[]
): ComfyApiWorkflow {
  const prompt: ComfyApiWorkflow = {}
  const nodeDefs = useNodeDefStore.getState().nodeDefs

  for (const node of nodes) {
    const inputs: Record<string, unknown> = {}

    // 위젯 값
    if (node.widgets_values !== undefined) {
      let widgetNames = (node.properties?.widget_names ?? []) as string[]

      // 가져온 워크플로우 등 widget_names가 없거나 길이가 안 맞는 경우
      // nodeDef에서 위젯 순서 복원 (control_after_generate, optional 위젯 포함)
      if (widgetNames.length === 0 || widgetNames.length !== node.widgets_values.length) {
        const def = nodeDefs[node.type]
        if (def !== undefined) {
          const inferredNames: string[] = []
          const req = def.input?.required ?? {}
          const opt = def.input?.optional ?? {}
          const collect = (entries: Record<string, InputSpec>): void => {
            for (const [name, spec] of Object.entries(entries)) {
              if (widgetStore.isWidgetType(spec[0])) {
                inferredNames.push(name)
                // seed 이름의 INT/FLOAT 위젯 또는 control_after_generate config가
                // true인 INT/FLOAT 위젯 뒤에 combo 위젯이 뒤따름
                const cfg = spec[1] ?? {}
                if (name === "seed" || cfg.control_after_generate === true) {
                  inferredNames.push("control_after_generate")
                }
              }
            }
          }
          collect(req)
          collect(opt)
          if (inferredNames.length === node.widgets_values.length) {
            widgetNames = inferredNames
          }
        }
      }

      for (let i = 0; i < widgetNames.length; i++) {
        const name = widgetNames[i]
        if (name !== undefined && i < node.widgets_values.length) {
          inputs[name] = node.widgets_values[i]
        }
      }
    }

    // 링크된 입력
    if (node.inputs !== undefined) {
      for (const input of node.inputs) {
        if (input.link !== undefined) {
          const link = links.find((l) => l.id === input.link)
          if (link !== undefined) {
            // 위젯 입력이 링크된 경우 widget 값을 링크 참조로 덮어쓰기
            inputs[input.name] = [link.origin_id.toString(), link.origin_slot]
          }
        }
      }
    }

    const nodeObj: { inputs: Record<string, unknown>; class_type: string; _meta?: { title?: string } } = {
      inputs,
      class_type: node.type,
    }
    const title = (node.properties?.node_name ?? node.type) as string
    if (typeof title === "string" && title !== node.type) {
      nodeObj._meta = { title }
    }
    prompt[node.id.toString()] = nodeObj
  }

  return prompt
}

// ── ComfyAppService ───────────────────────────────────────────────

export interface ComfyAppConfig {
  canvas: HTMLCanvasElement
  container: HTMLElement
  nodeDefs: Record<string, ComfyNodeDef>
}

/**
 * ComfyApp 핵심 서비스
 * Zustand store를 backing store로 사용하여 워크플로우를 관리합니다.
 */
export class ComfyAppService {
  graph: LGraphAdapter
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
    this.graph = new LGraphAdapter()
    this.canvas = {
      state: { readOnly: false },
      ds: { scale: 1, offset: [0, 0] },
      resize(_w?: number, _h?: number): void { /* noop */ },
      setDirty(_canvas?: boolean, _history?: boolean): void { /* noop */ },
      stopRendering(): void { /* noop */ },
      startRendering(): void { /* noop */ },
      setCanvas(_c: HTMLCanvasElement): void { /* noop */ },
      render_canvas_border: false,
      canvas: config.canvas,
    } as unknown as LGraphCanvas

    // Set up canvas (creates bgcanvas, binds events)
    this.canvas.setCanvas(config.canvas)

    // Register node types from nodeDefs
    this.registerNodeDefs(config.nodeDefs)

    // Canvas 스타일 설정
    this.canvas.render_canvas_border = false
    ;(this.canvas as unknown as Record<string, boolean>).allow_dragcanvas = true
    ;(this.canvas as unknown as Record<string, boolean>).allow_zoom = true

    // 그래프 변경 감지 (LGraphAdapter onAfterChange 콜백)
    this.graph.onAfterChange = (): void => {
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
    const extensions = this.extensions

    const loraExt = extensions.find(e => e.name.includes("LoraManager") || e.name.includes("Lora"))
    console.log(`[CEG] registerNodeDefs: registering ${String(Object.keys(nodeDefs).length)} types, ${String(extensions.length)} extensions available. loraExt=${loraExt?.name ?? "NONE"}. allNames=${extensions.map(e => e.name).join(",")}`)

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

      // Run beforeRegisterNodeDef hooks (from Zustand extension store)
      let patchedByCount = 0
      for (const ext of extensions) {
        if (ext.beforeRegisterNodeDef) {
          const hadBefore = typeof (NodeClass.prototype as { onNodeCreated?: unknown }).onNodeCreated === "function"
          try {
            void Promise.resolve(ext.beforeRegisterNodeDef(NodeClass as unknown as typeof LGraphNode, def, app))
            const hasAfter = typeof (NodeClass.prototype as { onNodeCreated?: unknown }).onNodeCreated === "function"
            if (!hadBefore && hasAfter) patchedByCount++
          } catch (err) {
            console.error(`Extension beforeRegisterNodeDef failed for ${ext.name}:`, err)
          }
        }
      }
      // LoraManager 관련 노드거나 onNodeCreated가 패치된 경우만 로그
      if (patchedByCount > 0 || type.includes("LoraManager")) {
        console.log(`[CEG] registerNodeDefs: type="${type}" comfyClass="${NodeClass.comfyClass}" onNodeCreatedPatchedBy=${String(patchedByCount)} extCount=${String(extensions.length)}`)
      }
      if (patchedByCount === 0 && type.includes("LoraManager")) {
        console.warn(`[CEG] registerNodeDefs: NO extension patched onNodeCreated for "${type}". extensions=${extensions.map(e => e.name).join(",")}`)
      }

      window.LiteGraph.registerNodeType(type, NodeClass as unknown as new () => LGraphNode)
    }
  }

  /**
   * 워크플로우 JSON 로드 (Zustand store 및 백그라운드 LiteGraph 노드 인스턴스 복원)
   */
  loadGraphData(workflow: ComfyWorkflowJSON): void {
    // 1. 기존 라이브 노드 및 Zustand 스토어 초기화
    this.graph.clear()

    // 2. Zustand 스토어에 새 워크플로우 반영 (pos, size, widgets_values 등이 보존됨)
    const store = useReactGraphStore.getState()
    store.setGraph(workflow)

    // 3. 백그라운드 LiteGraph 노드들 동적 복원 (이를 통해 익스텐션 훅이 동작하고 widget element 및 html 주입이 이루어짐)
    for (const node of workflow.nodes) {
      try {
        const liveNode = this.createNode(node.type, node.pos, { id: node.id, skipConfigure: true })
        if (liveNode && typeof liveNode.configure === "function") {
          liveNode.configure(node)
        }
        // 라이브 노드의 widgets 배열(확장이 추가한 control_after_generate 등 포함)에서
        // 위젯 이름 순서를 추출해 store 노드의 properties.widget_names 에 동기화.
        // 가져온 워크플로우는 widget_names 가 없는 경우가 많아 convertGraphToPrompt 가
        // widgets_values 를 이름에 매핑하지 못하는 문제를 해결.
        const liveWidgets = (liveNode as { widgets?: { name: string }[] | undefined }).widgets
        if (liveWidgets !== undefined && liveWidgets.length > 0) {
          const widgetNames = liveWidgets.map((w) => w.name)
          const currentNodes = useReactGraphStore.getState().nodes
          useReactGraphStore.setState({
            nodes: currentNodes.map((n: ComfyWorkflowNode): ComfyWorkflowNode =>
              n.id === node.id
                ? {
                    ...n,
                    properties: {
                      ...(n.properties ?? {}),
                      widget_names: widgetNames,
                    },
                  }
                : n
            ),
          })
        }
      } catch (err) {
        console.error(`Failed to restore live node ${String(node.id)} (${node.type}):`, err)
      }
    }
  }

  /**
   * 현재 그래프를 워크플로우 JSON으로 직렬화 (Zustand store 사용)
   */
  serializeGraph(): ComfyWorkflowJSON {
    const state = useReactGraphStore.getState()
    return {
      last_node_id: state.nodes.reduce((max, n) => Math.max(max, n.id), 0),
      last_link_id: state.links.reduce((max, l) => Math.max(max, l.id), 0),
      nodes: state.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        pos: n.pos,
        size: n.size,
        inputs: n.inputs,
        outputs: n.outputs,
        widgets_values: n.widgets_values,
        properties: n.properties,
        mode: n.mode,
        flags: n.flags,
        order: n.order,
        color: n.color,
        bgcolor: n.bgcolor,
      })),
      links: state.links.map((l) => ({
        id: l.id,
        origin_id: l.origin_id,
        origin_slot: l.origin_slot,
        target_id: l.target_id,
        target_slot: l.target_slot,
        type: l.type,
      })),
      version: 0.4,
    }
  }

  /**
   * 그래프를 ComfyUI API 포맷으로 변환 (실행용)
   */
  graphToPrompt(): ComfyApiWorkflow {
    const state = useReactGraphStore.getState()
    return convertGraphToPrompt(state.nodes, state.links)
  }

  /**
   * 노드 생성 (Zustand store 사용)
   */
  createNode(
    type: string,
    pos: Point = [0, 0],
    options: { skipConfigure?: boolean; id?: number } = {}
  ): LGraphNode | null {
    // 진단: 확장 store 상태
    const exts = this.extensions
    const loraExt = exts.find(e => e.name.includes("LoraManager") || e.name.includes("Lora"))
    console.log(`[CEG] createNode: type="${type}" nodeDefInThis=${String(this.nodeDefs[type] !== undefined)} extCount=${String(exts.length)} loraExt=${loraExt?.name ?? "NONE"}`)

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
        const node = new ComfyNode(type)
        node.pos = pos
        this.graph.add(node as unknown as LGraphNode)
        return node as unknown as LGraphNode
      }
    }

    const node = window.LiteGraph.createNode(actualType) as LGraphNode | null
    if (node === null) {
      console.warn(`[CEG] createNode: LiteGraph.createNode returned null for "${actualType}"`)
      return null
    }

    if (typeof node.addInput !== "function") return null

    // 진단: 생성된 노드의 클래스 정보
    const nodeProto = Object.getPrototypeOf(node) as Record<string, unknown> | null
    const protoOnCreated = typeof (nodeProto as { onNodeCreated?: unknown } | null)?.onNodeCreated
    const ctorName = (nodeProto?.constructor as { name?: string } | undefined)?.name ?? "?"
    console.log(`[CEG] createNode: created node ctor=${ctorName} proto.onNodeCreated=${protoOnCreated} own.onNodeCreated=${typeof (node as { onNodeCreated?: unknown }).onNodeCreated}`)

    node.pos = pos
    if (options.id !== undefined) {
      node.id = options.id
    }

    // 입력 슬롯
    if (nodeDef.input?.required !== undefined) {
      for (const [name, spec] of Object.entries(nodeDef.input.required)) {
        if (node.inputs?.some((inp) => inp.name === name)) {
          continue
        }
        const inputType = spec[0]
        if (widgetStore.isWidgetType(inputType)) {
          continue
        }
        const typeStr = Array.isArray(inputType) ? "COMBO" : inputType
        node.addInput(name, typeStr)
      }
    }

    if (nodeDef.input?.optional !== undefined) {
      for (const [name, spec] of Object.entries(nodeDef.input.optional)) {
        if (node.inputs?.some((inp) => inp.name === name)) {
          continue
        }
        const inputType = spec[0]
        if (widgetStore.isWidgetType(inputType)) {
          continue
        }
        const typeStr = Array.isArray(inputType) ? "COMBO" : inputType
        node.addInput(name, typeStr)
      }
    }

    // 출력 슬롯
    if (!node.outputs || node.outputs.length === 0) {
      for (let i = 0; i < nodeDef.output.length; i++) {
        const outType = nodeDef.output[i] ?? ""
        const outName = nodeDef.output_name[i] ?? outType
        node.addOutput(outName, outType)
      }
    }

    // 위젯 생성
    this.addNodeWidgets(node, nodeDef)

    // ComfyUI 원본 순서: graph.add(node) 먼저 → onNodeCreated → nodeCreated 확장 훅
    // 확장이 nodeCreated에서 app.canvas / node DOM 컨테이너를 기대하고 widget element를 채우므로
    // graph에 먼저 등록해야 함
    this.graph.add(node)

    // Call prototype's onNodeCreated (patched by beforeRegisterNodeDef hooks)
    node.onNodeCreated?.()

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
   *
   * ComfyUI 확장이 getCustomWidgets로 등록한 커스텀 위젯 팩토리를 우선 사용한다.
   * 커스텀 팩토리가 있으면 호출해서 widget(element 포함)을 만들고 node.widgets에 추가.
   * 없으면 기본 LiteGraph 위젯(combo/number/text/toggle)을 만든다.
   */
  private addNodeWidgets(node: LGraphNode, nodeDef: ComfyNodeDef): void {
    if (nodeDef.input?.required === undefined) return

    const app = getWindowApp()

    const addSingleWidget = (name: string, spec: InputSpec): void => {
      if (node.widgets?.some((w: any) => w.name === name)) {
        return
      }
      const inputType = spec[0]
      const inputConfig = spec[1] ?? {}

      // 1) 커스텀 위젯 팩토리가 있으면 우선 사용 (확장이 만든 DOM element 포함)
      // 팩토리는 내부에서 node.addDOMWidget()을 호출하여 위젯을 등록하므로
      // 반환값을 node.widgets에 다시 push하지 않는다 (중복 등록 방지).
      const typeName = Array.isArray(inputType) ? "COMBO" : inputType
      const factory = widgetStore.getCustomWidgetFactory(typeName)
      if (factory) {
        try {
          const result = factory(node, name, [inputType, inputConfig], app)
          if (result) {
            const widget = ((result as Record<string, unknown>).widget !== undefined
              ? (result as Record<string, unknown>).widget
              : result) as CustomWidget
            console.log(`[CEG] addNodeWidgets: custom widget "${name}" (type=${typeName}) created by factory, hasElement=${String(widget.element !== undefined)}`)
            return
          }
        } catch (err) {
          console.error(`[CEG] addNodeWidgets: custom widget factory failed for "${name}" (type=${typeName}):`, err)
        }
      }

      // 2) 커스텀 팩토리가 없거나 실패 → 기본 LiteGraph 위젯
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
        // ComfyUI 원본 동작: seed 이름의 INT/FLOAT 위젯 또는
        // control_after_generate config가 true인 INT/FLOAT 위젯 뒤에
        // "control_after_generate" combo 위젯을 자동 추가한다.
        // (KSampler/FaceDetailer/SpectrumKSampler 등의 seed 뒤 "randomize" combo)
        if (name === "seed" || inputConfig.control_after_generate === true) {
          node.addWidget(
            "combo",
            "control_after_generate",
            "randomize",
            (): void => undefined,
            { values: ["randomize", "fixed", "increment", "decrement"] }
          )
        }
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

    // required 위젯 추가 (원본 ComfyUI와 동일한 순서 보장)
    for (const [name, spec] of Object.entries(nodeDef.input.required)) {
      addSingleWidget(name, spec)
    }

    // optional 위젯 추가 (FaceDetailer의 cycle 이후 optional 위젯 등)
    if (nodeDef.input.optional !== undefined) {
      for (const [name, spec] of Object.entries(nodeDef.input.optional)) {
        addSingleWidget(name, spec)
      }
    }
  }

  /**
   * 정리
   */
  dispose(): void {
    this.canvas.stopRendering()
  }
}
