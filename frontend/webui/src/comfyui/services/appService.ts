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
} from "@/comfyui/types/workflow"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"
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
import type { LGraphNode } from "@/comfyui/types/lgraphAdapterNode"

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
  graph?: import("@/comfyui/types/lgraphAdapterNode").LGraphAdapterRef | null

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

  disconnectInput(_slot: number): void { /* noop */ }
  disconnectOutput(_slot: number): void { /* noop */ }
  configure(_data: unknown): void { /* noop */ }
  setDirtyCanvas(): void { /* noop */ }

  addWidget(
    type: string,
    name: string,
    value: string | number | boolean,
    callback: (v: string | number | boolean) => void,
    options?: Record<string, unknown>
  ): WidgetType {
    const element = type === "text" ? undefined as unknown as HTMLElement : document.createElement("div")
    const w: WidgetType = {
      type,
      name,
      element,
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
      resize(_w?: number, _h?: number): void {},
      setDirty(_canvas?: boolean, _history?: boolean): void {},
      stopRendering(): void {},
      startRendering(): void {},
      setCanvas(_c: HTMLCanvasElement): void {},
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

    const loraExt = extensions.find(e => e.name?.includes("LoraManager") || e.name?.includes("Lora"))
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.LiteGraph!.registerNodeType(type, NodeClass as any)
    }
  }

  /**
   * 워크플로우 JSON 로드 (Zustand store 사용)
   */
  loadGraphData(workflow: ComfyWorkflowJSON): void {
    const store = useReactGraphStore.getState()
    store.setGraph(workflow)
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
    const prompt: ComfyApiWorkflow = {}
    const state = useReactGraphStore.getState()

    for (const node of state.nodes) {
      const inputs: Record<string, unknown> = {}

      // 위젯 값
      if (node.widgets_values !== undefined) {
        const widgetNames = (node.properties?.widget_names ?? []) as string[]
        for (let i = 0; i < widgetNames.length; i++) {
          const name = widgetNames[i]
          if (name !== undefined) {
            inputs[name] = node.widgets_values[i]
          }
        }
      }

      // 링크된 입력
      if (node.inputs !== undefined) {
        for (const input of node.inputs) {
          if (input.link !== undefined) {
            const link = state.links.find((l) => l.id === input.link)
            if (link !== undefined) {
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
    const loraExt = exts.find(e => e.name?.includes("LoraManager") || e.name?.includes("Lora"))
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
        this.graph.add(node as unknown as import("@/comfyui/types/lgraphAdapterNode").LGraphNode)
        return node as unknown as import("@/comfyui/types/lgraphAdapterNode").LGraphNode
      }
    }

    const node = window.LiteGraph!.createNode(actualType) as LGraphNode | null
    if (node === null) {
      console.warn(`[CEG] createNode: LiteGraph.createNode returned null for "${actualType}"`)
      return null
    }

    if (typeof node.addInput !== "function") return null

    // 진단: 생성된 노드의 클래스 정보
    const nodeProto = Object.getPrototypeOf(node)
    const protoOnCreated = typeof (nodeProto as { onNodeCreated?: unknown }).onNodeCreated
    const ctorName = nodeProto?.constructor?.name ?? "?"
    console.log(`[CEG] createNode: created node ctor=${ctorName} proto.onNodeCreated=${protoOnCreated} own.onNodeCreated=${typeof (node as { onNodeCreated?: unknown }).onNodeCreated}`)

    node.pos = pos
    if (options.id !== undefined) {
      node.id = options.id
    }

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

    // ComfyUI 원본 순서: graph.add(node) 먼저 → onNodeCreated → nodeCreated 확장 훅
    // 확장이 nodeCreated에서 app.canvas / node DOM 컨테이너를 기대하고 widget element를 채우므로
    // graph에 먼저 등록해야 함
    this.graph.add(node as unknown as import("@/comfyui/types/lgraphAdapterNode").LGraphNode)

    // Call prototype's onNodeCreated (patched by beforeRegisterNodeDef hooks)
    node.onNodeCreated?.()

    // Run nodeCreated hooks
    const app = getWindowApp()
    if (app?.extensions !== undefined) {
      for (const ext of app.extensions) {
        if (ext.nodeCreated) {
          try {
            ext.nodeCreated(node as unknown as LGraphNode, app)
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

    for (const [name, spec] of Object.entries(nodeDef.input.required)) {
      const inputType = spec[0]
      const inputConfig = spec[1] ?? {}

      // 1) 커스텀 위젯 팩토리가 있으면 우선 사용 (확장이 만든 DOM element 포함)
      // 팩토리는 내부에서 node.addDOMWidget()을 호출하여 위젯을 등록하므로
      // 반환값을 node.widgets에 다시 push하지 않는다 (중복 등록 방지).
      const typeName = Array.isArray(inputType) ? "COMBO" : String(inputType)
      const factory = widgetStore.getCustomWidgetFactory(typeName)
      if (factory) {
        try {
          const result = factory(node as unknown as Parameters<typeof factory>[0], name, [inputType, inputConfig], app)
          if (result) {
            const widget = (result as Record<string, unknown>).widget !== undefined
              ? (result as Record<string, unknown>).widget as CustomWidget
              : result as CustomWidget
            console.log(`[CEG] addNodeWidgets: custom widget "${name}" (type=${typeName}) created by factory, hasElement=${String(widget.element !== null && widget.element !== undefined)}`)
            continue
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
