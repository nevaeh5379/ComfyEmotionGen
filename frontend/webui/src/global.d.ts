// import type { LiteGraphGlobal, LGraph, LGraphNode, LGraphCanvas, LLink, LGraphGroup } from "comfy-litegraph"
export type LiteGraphGlobal = any
export type LGraph = any
export type LGraphNode = any
export type LGraphCanvas = any
export type LLink = any
export type LGraphGroup = any
export type LGraphEventMode = any

export declare const LiteGraphGlobal: any
export declare const LGraph: any
export declare const LGraphNode: any
export declare const LGraphCanvas: any
export declare const LLink: any
export declare const LGraphGroup: any
export declare const LGraphEventMode: any

import type { ComfyApi } from "@/comfyui/api"
import type { ComfyAppService } from "@/comfyui/services/appService"

/*
declare module "comfy-litegraph" {
  interface LGraphNode {
    addDOMWidget?(
      name: string,
      type: string,
      element: HTMLElement,
      options?: AddDOMWidgetOptions
    ): WidgetType
  }
}
*/

declare global {
  namespace JSX {
    type Element = import("react").JSX.Element
  }

  interface AddDOMWidgetOptions {
    getValue?(): string
    setValue?(v: string): void
    beforeResize?(widget: WidgetType, node: LGraphNode): void
    afterResize?(widget: WidgetType, node: LGraphNode): void
    hideOnZoom?: boolean
  }

  interface WidgetType {
    type: string
    name: string
    element: HTMLElement
    options: AddDOMWidgetOptions & { hideOnZoom: boolean }
    _value: string
    value: string
    callback: ((v: string) => void) | null
  }

  interface SettingEntry {
    onChange(): void
  }

  type SettingsLookup = Record<string, SettingEntry>

  interface AppSettings {
    addSetting(setting: unknown): unknown
    getSettingValue(id: string): unknown
    setSettingValue(id: string, value: unknown): void
    settingsLookup: SettingsLookup
  }

  interface ComfyAppUI {
    dialogs: Record<string, unknown>
    dialog: { show(): void }
    settings: AppSettings
  }

  interface ExtensionManager {
    command: {
      commands: { id: string }[]
    }
    registerExtension?(ext: unknown): void
  }

  interface ComfyApp {
    graph: LGraph
    canvas: LGraphCanvas
    syncGraph(): Promise<void>
    ui: ComfyAppUI
    settings: AppSettings
    extensions: unknown[]
    registerExtension(ext: unknown): void
    extensionManager: ExtensionManager
    extensionsLoaded?: boolean
    api?: ComfyApi
  }

  interface ComfyWidgetsAPI {
    STRING(): { widget: { inputEl: Record<string, unknown> } }
    INT(): { widget: { inputEl: Record<string, unknown> } }
    FLOAT(): { widget: { inputEl: Record<string, unknown> } }
    COMBO(): { widget: { inputEl: Record<string, unknown> } }
    BOOLEAN(): { widget: { inputEl: Record<string, unknown> } }
  }

  interface RgthreeAPI {
    addEventListener(): void
    removeEventListener(): void
    newLogSession(): { end(): void }
    logger: { log(...args: unknown[]): void }
  }

  interface RgthreeConfig {
    enabled: boolean
    tweaks: { enabled: boolean }
    features: { enabled: boolean }
    nodes: {
      reroute: {
        fast_reroute: {
          enabled: boolean
        }
      }
    }
  }

  interface UECallbacks {
    register_allnode_callback(): void
    register_allgraph_callback(): void
  }

  interface ComfyAPIObject {
    app: {
      app: ComfyApp
    }
    api: {
      api: ComfyApi
    }
    utils: {
      applyTextReplacements(node: unknown, text: string): string
    }
    ui: {
      ComfyDialog: new () => Record<string, never>
      $el: (tag: string, attrs: Record<string, unknown> | null, children?: unknown) => HTMLElement
      ComfyUI: new () => Record<string, never>
    }
    widgets: {
      updateControlWidgetLabel(): void
      IS_CONTROL_WIDGET(): void
      addValueControlWidget(): void
      addValueControlWidgets(): void
      ComfyWidgets: ComfyWidgetsAPI
      isValidWidgetType(): void
    }
    widgetInputs: {
      PrimitiveNode: new () => Record<string, never>
      getWidgetConfig(): Record<string, unknown>
      convertToInput(): void
      setWidgetConfig(): void
      mergeIfValid(): void
    }
    groupNode: {
        GroupNodeConfig: new () => Record<string, never> & { registerFromWorkflow(): Promise<void> }
        GroupNodeHandler: new () => Record<string, never>
    }
    pnginfo: {
      getPngMetadata(): Promise<Record<string, unknown>>
      getWebpMetadata(): Promise<Record<string, unknown>>
    }
  }

  interface Window {
    LiteGraph: LiteGraphGlobal
    LGraph: typeof LGraph
    LGraphNode: typeof LGraphNode
    LGraphCanvas: typeof LGraphCanvas
    LLink: typeof LLink
    LGraphGroup: typeof LGraphGroup
    app: ComfyApp
    api: ComfyApi
    comfyExtensions: unknown[]

    $el: (tag: string, attrs: Record<string, unknown> | null, children?: unknown) => HTMLElement
    addStylesheet: (url: string) => HTMLLinkElement
    getUrl: (path: string, base?: string | URL) => string
    ComfyWidgets: ComfyWidgetsAPI
    ComfyApp: new () => Record<string, never>
    ComfyDialog: new () => Record<string, never>
    ClipspaceDialog: new () => Record<string, never> & { registerButton?: () => void }
    isBeforeFrontendVersion: () => boolean
    comfyAPI: ComfyAPIObject
    rgthree: RgthreeAPI
    NodeTypesString: Record<string, unknown>
    rgthreeConfig: RgthreeConfig
    Exposed: () => void
    CONFIG_SERVICE: { getConfigValue(): unknown; addEventListener(): void }
    ue_callbacks: UECallbacks
    create: (tag: string, clss: string, parent: HTMLElement | null, properties?: Record<string, unknown>) => HTMLElement
    createApp: (arg: unknown) => Record<string, unknown>
    j: (arg: unknown) => Record<string, unknown>
    LAYOUT_LABEL_TO_DATA: Record<string, [number, [number, number], [number, number]]>
    LAYOUT_LABEL_OPPOSITES: Record<string, string>
    LAYOUT_CLOCKWISE: string[]
    IoDirection: Record<string, unknown>
    addConnectionLayoutSupport: (...args: unknown[]) => void
    addMenuItem: (...args: unknown[]) => void
    getSlotLinks: (...args: unknown[]) => unknown[]
    isValidConnection: (...args: unknown[]) => boolean
    setConnectionsLayout: (...args: unknown[]) => void
    waitForCanvas: (...args: unknown[]) => Promise<unknown>
    __comfyAppService?: ComfyAppService
  }
}
