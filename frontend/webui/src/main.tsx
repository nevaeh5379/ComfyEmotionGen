import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { LiteGraph, LGraph, LGraphNode, LGraphCanvas, LLink, LGraphGroup } from "comfy-litegraph"

;(window as unknown as Record<string, unknown>).LiteGraph = LiteGraph
;(window as unknown as Record<string, unknown>).LGraph = LGraph
;(window as unknown as Record<string, unknown>).LGraphNode = LGraphNode
;(window as unknown as Record<string, unknown>).LGraphCanvas = LGraphCanvas
;(window as unknown as Record<string, unknown>).LLink = LLink
;(window as unknown as Record<string, unknown>).LGraphGroup = LGraphGroup
;(window as unknown as Record<string, unknown>).comfyExtensions ??= []

// LocalStorage 오염 복구 가드 및 런타임 후킹
try {
  const key = 'Comfy.Settings.Comfy.CustomColorPalettes'

  const raw: string | null = window.localStorage.getItem(key)
  if (raw === null || raw === '' || raw === 'undefined' || raw === 'null') {
    window.localStorage.setItem(key, '{}')
  } else {
    try {
      let parsed: unknown = JSON.parse(raw)
      while (typeof parsed === 'string') {
        parsed = JSON.parse(parsed)
      }
      if (typeof parsed !== 'object' || parsed === null) {
        window.localStorage.setItem(key, '{}')
      } else {
        window.localStorage.setItem(key, JSON.stringify(parsed))
      }
    } catch {
      window.localStorage.setItem(key, '{}')
    }
  }

  const originalGetItem: (key: string) => string | null = localStorage.getItem.bind(localStorage)
  const originalSetItem: (key: string, value: string) => void = localStorage.setItem.bind(localStorage)

  localStorage.getItem = function (k: string): string | null {
    const val: string | null = originalGetItem(k)
    if (k === key) {
      try {
        if (val === null || val === '' || val === 'undefined' || val === 'null') {
          return '{}'
        }
        let parsed: unknown = JSON.parse(val)
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed)
        }
        if (typeof parsed !== 'object' || parsed === null) {
          return '{}'
        }
        return JSON.stringify(parsed)
      } catch {
        return '{}'
      }
    }
    return val
  }

  localStorage.setItem = function (k: string, val: string): void {
    if (k === key) {
      try {
        if (val === 'undefined' || val === 'null') {
          originalSetItem(key, '{}')
          return
        }
        let parsed: unknown = JSON.parse(val)
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed)
        }
        if (typeof parsed !== 'object' || parsed === null) {
          originalSetItem(key, '{}')
          return
        }
        originalSetItem(key, JSON.stringify(parsed))
        return
      } catch {
        originalSetItem(key, '{}')
        return
      }
    }
    originalSetItem(k, val)
  }
} catch {
  console.error("Failed to install localStorage hooks")
}

// addDOMWidget polyfill
const addDOMWidgetFn = function (
  this: LGraphNode,
  name: string,
  type: string,
  element: HTMLElement,
  options: AddDOMWidgetOptions = {}
): WidgetType {
  const errStack: string | undefined = new Error().stack
  const stackStr: string = errStack?.split("\n").slice(2, 5).join(" <- ") ?? "N/A"
  console.log("[CEG:DEBUG addDOMWidget]", "nodeId=" + String((this as unknown as Record<string, unknown>).id), "name=" + name, "type=" + type, "hasElement=true", "elementTag=" + element.tagName, "stack=" + stackStr)

  const widget: WidgetType = {
    type,
    name,
    element,
    options: { hideOnZoom: true, ...options },
    _value: options.getValue?.() ?? '',
    value: '',
    callback: null
  }

  Object.defineProperty<WidgetType>(widget, 'value', {
    get(this: WidgetType): string {
      return this.options.getValue?.() ?? this._value
    },
    set(this: WidgetType, v: string): void {
      this._value = v
      if (this.options.setValue !== undefined) {
        try {
          this.options.setValue(v)
        } catch (err: unknown) {
          console.warn(`[addDOMWidget] setValue failed for widget "${this.name}":`, err)
        }
      }
      if (this.callback !== null) {
        this.callback(v)
      }
    },
    configurable: true
  })

  const node = this as unknown as { widgets?: unknown[] }
  node.widgets ??= []
  node.widgets.push(widget)

  if (options.beforeResize !== undefined || options.afterResize !== undefined) {
    const oldResize: unknown = (this as unknown as Record<string, unknown>).onResize
    ;(this as unknown as Record<string, unknown>).onResize = (__this: LGraphNode, ...args: unknown[]): void => {
      if (oldResize !== undefined && typeof oldResize === 'function') {
        (oldResize as (...args: unknown[]) => void).apply(__this, args)
      }
      if (options.beforeResize !== undefined) {
        options.beforeResize(widget, __this)
      }
      if (options.afterResize !== undefined) {
        options.afterResize(widget, __this)
      }
    }
  }

  void window.app.syncGraph()

  return widget
}

;(LGraphNode as unknown as Record<string, unknown>).prototype ??= {}
;(LGraphNode as unknown as Record<string, unknown>).prototype.addDOMWidget = addDOMWidgetFn

// LiteGraph color palettes stub
const liteGraph = window.LiteGraph as unknown as Record<string, unknown>
const palettesTarget: Record<string, Record<string, unknown>> = (liteGraph.color_palettes ?? {}) as Record<string, Record<string, unknown>>
liteGraph.color_palettes = new Proxy<Record<string, Record<string, unknown>>>(palettesTarget, {
  get(target: Record<string, Record<string, unknown>>, prop: string | symbol): Record<string, unknown> {
    const key: string = typeof prop === 'symbol' ? String(prop) : prop
    const existing: Record<string, unknown> | undefined = target[key]
    if (existing !== undefined) {
      return existing
    }
    const fresh: Record<string, unknown> = {}
    target[key] = fresh
    return fresh
  }
})
if (liteGraph.Styles === undefined) {
  liteGraph.Styles = { obsidian: {} as Record<string, unknown> }
}

import { DEFAULT_BACKEND_URL } from "@/lib/runtime"
import { api as comfyApiInstance } from "@/comfyui/api"
import type { ComfyApi } from "@/comfyui/api"

// Initialize window.api
{
  const w = window as unknown as { api?: ComfyApi }
  w.api ??= comfyApiInstance
}
const apiObj: ComfyApi = window.api
;(apiObj as unknown as Record<string, unknown>).api_base ??= DEFAULT_BACKEND_URL

// Proxy for settingsLookup
const settingsLookupTarget: SettingsLookup = {
  'Comfy.Locale': { onChange(): void { /* noop */ } }
}
const settingsLookupProxy = new Proxy<SettingsLookup>(settingsLookupTarget, {
  get(target: SettingsLookup, prop: string | symbol): SettingEntry {
    const key: string = typeof prop === 'symbol' ? String(prop) : prop
    const existing: SettingEntry | undefined = target[key]
    if (existing !== undefined) {
      return existing
    }
    const fresh: SettingEntry = { onChange(): void { /* noop */ } }
    target[key] = fresh
    return fresh
  }
})

// Initialize window.app
function createDefaultApp(): ComfyApp {
  const defaultSettings: AppSettings = {
    addSetting(_setting: unknown): unknown {
      return {}
    },
    getSettingValue(_id: string): unknown {
      return null
    },
    setSettingValue(_id: string, _value: unknown): void {
      /* noop */
    },
    settingsLookup: settingsLookupProxy
  }

  const app: ComfyApp = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion
    graph: new (LGraph as unknown as new () => Record<string, unknown>)() as unknown as LGraph,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion
    canvas: new (LGraphCanvas as unknown as new (canvas: HTMLCanvasElement, graph: Record<string, unknown>) => Record<string, unknown>)(document.createElement("canvas"), new (LGraph as unknown as new () => Record<string, unknown>)()) as unknown as LGraphCanvas,
    async syncGraph(): Promise<void> {
      const { useReactGraphStore } = await import("@/comfyui/stores/reactGraphStore")
      useReactGraphStore.getState().syncGraphFromLive()
    },
    ui: {
      dialogs: {},
      dialog: { show(): void { /* noop */ } },
      settings: defaultSettings
    },
    settings: defaultSettings,
    extensions: [],
    registerExtension(ext: unknown): void {
      if (app.extensionManager.registerExtension !== undefined) {
        app.extensionManager.registerExtension(ext)
      } else {
        app.extensions.push(ext)
      }
    },
    extensionManager: {
      command: {
        commands: []
      }
    }
  }

  return app
}
{ const w = window as unknown as { app?: ComfyApp }; w.app ??= createDefaultApp() }
const appObj: ComfyApp = window.app

// installSettingValueHook
const installSettingValueHook = (settingsObj: AppSettings): void => {
  const originalGet: (id: string) => unknown = settingsObj.getSettingValue.bind(settingsObj)
  settingsObj.getSettingValue = function (this: AppSettings, id: string): unknown {
    const val: unknown = originalGet(id)
    if (id === 'Comfy.CustomColorPalettes') {
      if (val === null || val === undefined || val === 'undefined' || val === 'null') {
        return {}
      }
      if (typeof val === 'string') {
        try {
          let parsed: unknown = JSON.parse(val)
          while (typeof parsed === 'string') {
            parsed = JSON.parse(parsed)
          }
          if (typeof parsed !== 'object' || parsed === null) {
            return {}
          }
          return parsed
        } catch {
          return {}
        }
      }
    }
    return val
  }
}

let _installingHook = false

const installApiSettingsHook = (apiInstance: unknown): void => {
  if (_installingHook) return
  _installingHook = true
  const inst = apiInstance as Record<string, unknown>
  const originalGetSettings = inst.getSettings as (() => Promise<Record<string, unknown>>) | undefined
  const wrappedGetSettings = async (): Promise<Record<string, unknown>> => {
    const settings: Record<string, unknown> =
      originalGetSettings !== undefined ? await originalGetSettings() : {}
    const paletteVal: unknown = settings['Comfy.CustomColorPalettes']
    if (typeof paletteVal === 'string') {
      try {
        let parsed: unknown = JSON.parse(paletteVal)
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed)
        }
        if (typeof parsed === 'object' && parsed !== null) {
          settings['Comfy.CustomColorPalettes'] = parsed
        } else {
          settings['Comfy.CustomColorPalettes'] = {}
        }
      } catch {
        settings['Comfy.CustomColorPalettes'] = {}
      }
    }
    return settings
  }
  inst.getSettings = wrappedGetSettings
  _installingHook = false
}

// getSettings dynamic binding
let _getSettings: unknown = (apiObj as unknown as Record<string, unknown>).getSettings
Object.defineProperty(apiObj, 'getSettings', {
  get(): unknown {
    return _getSettings
  },
  set(newGetSettings: unknown): void {
    _getSettings = newGetSettings
    installApiSettingsHook(apiObj)
  },
  configurable: true
})
installApiSettingsHook(apiObj)

// app.ui and app.settings property guards
let _appUi: ComfyAppUI = appObj.ui
let _appSettings: AppSettings = appObj.settings

_appUi.dialogs = {}
_appUi.dialog = { show(): void { /* noop */ } }
_appUi.settings = {
  addSetting(_setting: unknown): unknown { return {} },
  getSettingValue(_id: string): unknown { return null },
  setSettingValue(_id: string, _value: unknown): void { /* noop */ },
  settingsLookup: settingsLookupProxy
}
_appSettings.addSetting = (_setting: unknown): unknown => ({})
_appSettings.getSettingValue = (_id: string): unknown => null
_appSettings.setSettingValue = (_id: string, _value: unknown): void => {
  /* noop */
}
_appSettings.settingsLookup = settingsLookupProxy

installSettingValueHook(_appUi.settings)
installSettingValueHook(_appSettings)

Object.defineProperty(appObj, 'ui', {
  get(): ComfyAppUI {
    return _appUi
  },
  set(newUi: ComfyAppUI): void {
    _appUi = newUi
    const newUiR = newUi as unknown as Record<string, unknown>
    if (newUiR.settings === undefined) {
      let _uiSettings: AppSettings | undefined
      Object.defineProperty(newUi, 'settings', {
        get(): AppSettings | undefined { return _uiSettings },
        set(ns: AppSettings): void {
          _uiSettings = ns
          installSettingValueHook(ns)
        },
        configurable: true
      })
    } else {
      installSettingValueHook(newUi.settings)
    }
  },
  configurable: true
})

Object.defineProperty(appObj, 'settings', {
  get(): AppSettings {
    return _appSettings
  },
  set(newSettings: AppSettings): void {
    _appSettings = newSettings
    installSettingValueHook(newSettings)
  },
  configurable: true
})

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion
appObj.graph = new (LGraph as unknown as new () => Record<string, unknown>)() as unknown as LGraph
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion
appObj.canvas = new (LGraphCanvas as unknown as new (canvas: HTMLCanvasElement, graph: Record<string, unknown>) => Record<string, unknown>)(document.createElement("canvas"), appObj.graph as unknown as Record<string, unknown>) as unknown as LGraphCanvas
appObj.syncGraph = async (): Promise<void> => {
  const { useReactGraphStore } = await import("@/comfyui/stores/reactGraphStore")
  useReactGraphStore.getState().syncGraphFromLive()
}

// 필수 브라우저 글로벌 스텁 설정
{
  const w = window as unknown as Record<string, unknown>

  if (w.$el === undefined) {
    w.$el = (tag: string, attrs: Record<string, unknown> | null, _children?: unknown): HTMLElement => {
      const el: HTMLElement = document.createElement(tag)
      if (attrs !== null) {
        for (const [k, v] of Object.entries(attrs)) {
          if (k === 'style' && typeof v === 'object' && v !== null) {
            Object.assign(el.style, v)
          } else {
            ;(el as unknown as Record<string, unknown>)[k] = v
          }
        }
      }
      return el
    }
  }

  if (w.addStylesheet === undefined) {
    w.addStylesheet = (url: string): HTMLLinkElement => {
      const link: HTMLLinkElement = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      document.head.appendChild(link)
      return link
    }
  }

  if (w.getUrl === undefined) {
    w.getUrl = (path: string, base?: string | URL): string => {
      return base !== undefined ? new URL(path, base).toString() : path
    }
  }

  if (w.ComfyWidgets === undefined) {
    w.ComfyWidgets = {
      STRING: (): { widget: { inputEl: Record<string, unknown> } } => ({ widget: { inputEl: {} } }),
      INT: (): { widget: { inputEl: Record<string, unknown> } } => ({ widget: { inputEl: {} } }),
      FLOAT: (): { widget: { inputEl: Record<string, unknown> } } => ({ widget: { inputEl: {} } }),
      COMBO: (): { widget: { inputEl: Record<string, unknown> } } => ({ widget: { inputEl: {} } }),
      BOOLEAN: (): { widget: { inputEl: Record<string, unknown> } } => ({ widget: { inputEl: {} } })
    }
  }

  // Mock constructors with dummy properties to avoid no-extraneous-class
  if (w.ComfyApp === undefined) {
    w.ComfyApp = class {
      readonly __ceg = true
    }
  }

  if (w.ComfyDialog === undefined) {
    w.ComfyDialog = class {
      readonly __ceg = true
    }
  }

  if (w.ClipspaceDialog === undefined) {
    w.ClipspaceDialog = class {
      readonly __ceg = true
    }
  }

  if (w.isBeforeFrontendVersion === undefined) {
    w.isBeforeFrontendVersion = (): boolean => false
  }

  if (w.comfyAPI === undefined) {
    w.comfyAPI = {
      app: {
        app: window.app
      },
      api: {
        api: window.api
      },
      utils: {
        applyTextReplacements: (_node: unknown, text: string): string => text
      },
      ui: {
        ComfyDialog: class {
          readonly __ceg = true
        },
        $el: window.$el,
        ComfyUI: class {
          readonly __ceg = true
        }
      },
      widgets: {
        updateControlWidgetLabel(): void { /* noop */ },
        IS_CONTROL_WIDGET(): void { /* noop */ },
        addValueControlWidget(): void { /* noop */ },
        addValueControlWidgets(): void { /* noop */ },
        ComfyWidgets: window.ComfyWidgets,
        isValidWidgetType(): void { /* noop */ }
      },
      widgetInputs: {
        PrimitiveNode: class {
          readonly __ceg = true
        },
        getWidgetConfig: (): Record<string, unknown> => ({}),
        convertToInput: (): void => { /* noop */ },
        setWidgetConfig: (): void => { /* noop */ },
        mergeIfValid: (): void => { /* noop */ }
      },
      groupNode: {
        GroupNodeConfig: class {
          static registerFromWorkflow(): Promise<void> {
            return Promise.resolve()
          }
          readonly __ceg = true
        },
        GroupNodeHandler: class {
          readonly __ceg = true
        }
      },
      pnginfo: {
        getPngMetadata: (): Promise<Record<string, unknown>> => Promise.resolve({}),
        getWebpMetadata: (): Promise<Record<string, unknown>> => Promise.resolve({})
      }
    }
  }

  // Second ClipspaceDialog check
  if (w.ClipspaceDialog === undefined) {
    w.ClipspaceDialog = class {
      static registerButton(): void { /* noop */ }
      readonly __ceg = true
    }
  } else {
    const cdClass = w.ClipspaceDialog as { registerButton?: () => void }
    cdClass.registerButton ??= (): void => { /* noop */ }
  }

  // LGraphCanvas prototype stubs
  if (w.LGraphCanvas !== undefined) {
    const canvasProto = w.LGraphCanvas as { prototype: Record<string, unknown> }
    canvasProto.prototype.setDirty ??= (): void => { /* noop */ }
    canvasProto.prototype.addEventListener ??= (): void => { /* noop */ }
  }

  if (w.rgthree === undefined) {
    w.rgthree = {
      addEventListener(): void { /* noop */ },
      removeEventListener(): void { /* noop */ },
      newLogSession(): { end(): void } {
        return { end(): void { /* noop */ } }
      },
      logger: { log(..._args: unknown[]): void { /* noop */ } }
    }
  } else {
    const rgt = w.rgthree as { newLogSession?: () => { end(): void } }
    rgt.newLogSession ??= (): { end(): void } => ({ end(): void { /* noop */ } })
  }

  if (w.NodeTypesString === undefined) {
    w.NodeTypesString = {}
  }

  if (w.rgthreeConfig === undefined) {
    w.rgthreeConfig = {
      enabled: true,
      tweaks: { enabled: true },
      features: { enabled: true },
      nodes: {
        reroute: {
          fast_reroute: {
            enabled: true
          }
        }
      }
    }
  }

  if (w.Exposed === undefined) {
    w.Exposed = (): void => { /* noop */ }
  }

  if (w.CONFIG_SERVICE === undefined) {
    w.CONFIG_SERVICE = {
      getConfigValue: (): unknown => null,
      addEventListener: (): void => { /* noop */ }
    }
  }

  if (w.ue_callbacks === undefined) {
    w.ue_callbacks = {
      register_allnode_callback: (): void => { /* noop */ },
      register_allgraph_callback: (): void => { /* noop */ }
    }
  }

  if (w.create === undefined) {
    w.create = (
      tag: string,
      clss: string,
      parent: HTMLElement | null,
      properties?: Record<string, unknown>
    ): HTMLElement => {
      const nd: HTMLElement = document.createElement(tag)
      if (clss !== '') {
        clss.split(" ").forEach((s: string): void => {
          nd.classList.add(s)
        })
      }
      if (parent !== null) {
        parent.appendChild(nd)
      }
      if (properties !== undefined) {
        Object.assign(nd, properties)
      }
      return nd
    }
  }

  if (w.createApp === undefined) {
    const mockApp = (_arg: unknown): Record<string, unknown> => {
      return {
        ready: (cb: () => void): Record<string, unknown> => {
          cb()
          return mockApp(_arg)
        },
        on: (): Record<string, unknown> => mockApp(_arg),
        click: (): Record<string, unknown> => mockApp(_arg),
        val: (): string => '',
        hide: (): Record<string, unknown> => mockApp(_arg),
        show: (): Record<string, unknown> => mockApp(_arg),
        use: (): Record<string, unknown> => mockApp(_arg),
        mount: (): Record<string, unknown> => mockApp(_arg)
      }
    }
    w.createApp = mockApp
    if (w.j === undefined) {
      w.j = mockApp
    }
  }
}

// Layout constants
const winRec = window as unknown as Record<string, unknown>
winRec.LAYOUT_LABEL_TO_DATA ??= {
  Left: [1, [0, 0.5], [0, 0]],
  Right: [2, [1, 0.5], [-0, 0]],
  Top: [3, [0.5, 0], [0, 0]],
  Bottom: [4, [0.5, 1], [0, -0]]
}
winRec.LAYOUT_LABEL_OPPOSITES ??= {
  Left: "Right",
  Right: "Left",
  Top: "Bottom",
  Bottom: "Top"
}
winRec.LAYOUT_CLOCKWISE ??= ["Left", "Top", "Right", "Bottom"]

// extensionManager fallback
const appExtRec = appObj as unknown as Record<string, unknown>
appExtRec.extensionManager ??= {
  command: {
    commands: [
      { id: 'Comfy.ExportWorkflowAPI' }
    ]
  }
}

// File upload input
if (document.getElementById('comfy-file-input') === null) {
  const fileInput: HTMLInputElement = document.createElement('input')
  fileInput.type = 'file'
  fileInput.id = 'comfy-file-input'
  fileInput.style.display = 'none'
  document.body.appendChild(fileInput)
}

// Various global stubs
;(window as unknown as Record<string, unknown>).IoDirection ??= {}
;(window as unknown as Record<string, unknown>).addConnectionLayoutSupport ??= (): void => { /* noop */ }
;(window as unknown as Record<string, unknown>).addMenuItem ??= (): void => { /* noop */ }
;(window as unknown as Record<string, unknown>).getSlotLinks ??= (): unknown[] => []
;(window as unknown as Record<string, unknown>).isValidConnection ??= (): boolean => true
;(window as unknown as Record<string, unknown>).setConnectionsLayout ??= (): void => { /* noop */ }
;(window as unknown as Record<string, unknown>).waitForCanvas ??= (): Promise<unknown> => Promise.resolve()

import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { WebSocketProvider } from "./comfyui/contexts/WebSocketProvider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { Toaster } from "@/components/ui/sonner"
import { ConfirmProvider } from "./comfyui/contexts/ConfirmContext.tsx"

const rootElement: HTMLElement | null = document.getElementById("root")
if (rootElement === null) {
  throw new Error("Root element not found")
}
createRoot(rootElement).render(
  <StrictMode>
    <WebSocketProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={400}>
          <ConfirmProvider>
            <App />
            <Toaster />
          </ConfirmProvider>
        </TooltipProvider>
      </ThemeProvider>
    </WebSocketProvider>
  </StrictMode>
)
