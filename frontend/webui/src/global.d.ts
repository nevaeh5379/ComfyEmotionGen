import { LiteGraphGlobal } from "./lib/comfy-graph/core/LiteGraphGlobal"
import { LGraph } from "./lib/comfy-graph/core/LGraph"
import { LGraphCanvas } from "./lib/comfy-graph/core/LGraphCanvas"
import { LGraphNode } from "./lib/comfy-graph/core/LGraphNode"
import { LLink } from "./lib/comfy-graph/core/LLink"
import { LGraphGroup } from "./lib/comfy-graph/core/LGraphGroup"
import { IWidgetOptions } from "./lib/comfy-graph/core/types/widgets"

declare global {
  interface ComfyExtension {
    name: string
    init?: (app: ComfyApp) => void | Promise<void>
    beforeRegisterNodeDef?: (nodeType: typeof LGraphNode, nodeData: NodeData, app: ComfyApp) => void
    nodeCreated?: (node: LGraphNode, app: ComfyApp) => void
    loadedGraphNode?: (node: LGraphNode, app: ComfyApp) => void
  }

  interface NodeData {
    name: string
    display_name?: string
    description?: string
    category?: string
    input?: {
      required?: Record<string, [string, Record<string, string | number | boolean | string[]>]>
      optional?: Record<string, [string, Record<string, string | number | boolean | string[]>]>
    }
    output?: string[]
    output_name?: string[]
  }

  interface SystemStats {
    system: {
      os: string
      ram_total: number
      ram_free: number
      comfyui_version: string
      required_frontend_version: string
      installed_templates_version: string
      required_templates_version: string
      python_version: string
      pytorch_version: string
      embedded_python: boolean
      argv: string[]
      comfy_package_versions: string[]
    }
    devices: {
      id: number
      name: string
      type: string
      index: number
      vram_total: number
      vram_free: number
      torch_device: string
    }[]
  }

  interface DOMWidgetOptions extends IWidgetOptions {
    getValue?: () => string
    setValue?: (v: string) => void
    beforeResize?: (this: DOMWidget, node: LGraphNode) => void
    afterResize?: (this: DOMWidget, node: LGraphNode) => void
    [key: string]: unknown
  }

  interface DOMWidget {
    type: string
    name: string
    element: HTMLElement
    options: DOMWidgetOptions & { hideOnZoom?: boolean }
    _value?: string
    value?: string
    callback?: ((v: string) => void)
    y: number
    [symbol: symbol]: boolean
  }

  interface ComfySettings {
    addSetting?: (name: string, type: string, value: unknown) => unknown
    getSettingValue?: (id: string) => string | Record<string, unknown> | null
    setSettingValue?: (id: string, value: unknown) => void
    settingsLookup?: Record<string, { onChange?: () => void }>
  }

  interface ComfyApp {
    extensions: ComfyExtension[]
    registerExtension: (ext: ComfyExtension) => void
    extensionsLoaded?: boolean
    graph?: LGraph | null
    canvas?: LGraphCanvas | null
    syncGraph?: () => void
    syncGraphNode?: (id: number) => void
    loadGraphData?: (workflow: ComfyWorkflowJSON) => void
    ui?: {
      dialogs?: Record<string, unknown>
      dialog?: { show: () => void }
      settings?: ComfySettings
    }
    settings?: ComfySettings
    extensionManager?: {
      command: {
        commands: { id: string }[]
      }
    }
  }

  interface ComfyApi extends EventTarget {
    api_base: string
    getExtensions: () => Promise<string[]>
    getObjectInfo: () => Promise<Record<string, NodeData>>
    fetchApi: (url: string, options?: RequestInit) => Promise<Response>
    getSystemStats: () => Promise<SystemStats>
    getSettings?: () => Promise<Record<string, unknown>>
  }
}

declare module "./lib/comfy-graph/core/LiteGraphGlobal" {
  interface LiteGraphGlobal {
    color_palettes?: Record<string, Record<string, unknown>>
    Styles?: Record<string, Record<string, unknown>>
  }
}

declare module "./lib/comfy-graph/core/interfaces" {
  interface INodeInputSlot {
    link?: number | null
  }
  interface INodeOutputSlot {
    links?: number[] | null
  }
}

declare module "./lib/comfy-graph/core/LGraph" {
  interface LGraph {
    onChange?: () => void
  }
}

declare module "./lib/comfy-graph/core/LGraphNode" {
  interface LGraphNode {
    addDOMWidget: (
      name: string,
      type: string,
      element: HTMLElement,
      options?: DOMWidgetOptions
    ) => DOMWidget
    widgets?: {
      type: string
      name: string
      value: StrictJSONValue
      callback?: ((v: StrictJSONValue) => void) | null
      options?: Record<string, unknown>
      [key: string]: unknown
    }[]
    onResize?: (this: LGraphNode) => void
    configure?: (info: ComfyWorkflowNode) => void
  }
}

declare module "./lib/comfy-graph/core/LGraphCanvas" {
  interface LGraphCanvas {
    addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void
    _canvas?: { app?: { loadGraphData?: (workflow: ComfyWorkflowJSON) => void } }
    app?: ComfyApp
    allow_zoom?: boolean
    prompt_box?: { close: () => void } | null
    search_box?: { close: () => void; querySelector?: <T extends HTMLElement = HTMLElement>(s: string) => T | null } | null
  }
}

declare global {
  interface Window {
    LiteGraph: LiteGraphGlobal
    LGraph: typeof LGraph
    LGraphNode: typeof LGraphNode
    LGraphCanvas: typeof LGraphCanvas
    LLink: typeof LLink
    LGraphGroup: typeof LGraphGroup
    app: ComfyApp
    api: ComfyApi
    comfyExtensions: ComfyExtension[]
    __comfyAppService?: { loadGraphData: (workflow: ComfyWorkflowJSON) => void }
    $el: (tag: string, attrs?: Record<string, unknown> | null, children?: unknown) => HTMLElement
    addStylesheet: (url: string) => HTMLLinkElement
    getUrl: (path: string, base?: string | URL) => string
    ComfyWidgets: Record<string, () => { widget: { inputEl: Record<string, unknown> } }>
    ComfyApp: new () => void
    ComfyDialog: new () => void
    ClipspaceDialog: {
      new (): void
      registerButton: (name: string, cb: () => void) => void
    }
    isBeforeFrontendVersion: (ver: string) => boolean
    comfyAPI: {
      app: {
        app: ComfyApp
      }
      api: {
        api: ComfyApi
      }
      utils: {
        applyTextReplacements: (node: LGraphNode | null, text: string) => string
      }
      ui: {
        ComfyDialog: new () => void
        $el: Window["$el"]
        ComfyUI: new () => void
      }
      widgets: {
        updateControlWidgetLabel: () => void
        IS_CONTROL_WIDGET: () => void
        addValueControlWidget: () => void
        addValueControlWidgets: () => void
        ComfyWidgets: Window["ComfyWidgets"]
        isValidWidgetType: () => void
      }
      widgetInputs: {
        PrimitiveNode: new () => void
        getWidgetConfig: () => Record<string, unknown>
        convertToInput: () => void
        setWidgetConfig: () => void
        mergeIfValid: () => void
      }
      groupNode: {
        GroupNodeConfig: {
          registerFromWorkflow: () => Promise<void>
        }
        GroupNodeHandler: new () => void
      }
      pnginfo: {
        getPngMetadata: () => Promise<Record<string, unknown>>
        getWebpMetadata: () => Promise<Record<string, unknown>>
      }
    }
    rgthree: {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
      newLogSession: () => { end: () => void }
      logger: { log: (...args: unknown[]) => void }
    }
    NodeTypesString: Record<string, unknown>
    rgthreeConfig: Record<string, unknown>
    Exposed: () => void
    CONFIG_SERVICE: {
      getConfigValue: (key: string) => unknown
      addEventListener: (type: string, cb: () => void) => void
    }
    ue_callbacks: {
      register_allnode_callback: (cb: () => void) => void
      register_allgraph_callback: (cb: () => void) => void
    }
    create: (tag: string, clss: string, parent: HTMLElement, properties?: Record<string, unknown>) => HTMLElement
    createApp: (arg: unknown) => {
      ready: (cb: () => void) => void
      on: () => void
      click: () => void
      val: () => string
      hide: () => void
      show: () => void
      use: () => unknown
      mount: () => unknown
    }
    j: (arg: unknown) => {
      ready: (cb: () => void) => void
      on: () => void
      click: () => void
      val: () => string
      hide: () => void
      show: () => void
      use: () => unknown
      mount: () => unknown
    }
    LAYOUT_LABEL_TO_DATA: Record<string, [number, [number, number], [number, number]]>
    LAYOUT_LABEL_OPPOSITES: Record<string, string>
    LAYOUT_CLOCKWISE: string[]
    IoDirection: Record<string, unknown>
    addConnectionLayoutSupport: () => void
    addMenuItem: () => void
    getSlotLinks: () => unknown[]
    isValidConnection: () => boolean
    setConnectionsLayout: () => void
    waitForCanvas: () => Promise<void>
  }

  type StrictJSONValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | StrictJSONValue[]
    | { [key: string]: StrictJSONValue }
}

