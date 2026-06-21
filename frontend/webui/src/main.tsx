import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
// import { LiteGraph, LGraph, LGraphNode, LGraphCanvas, LLink, LGraphGroup } from "comfy-litegraph"
const _registeredNodeTypes: Record<string, new (...args: unknown[]) => LGraphNode> = {}
window.LiteGraph ??= {
  registerNodeType: (type: string, nodeClass: new (...args: unknown[]) => LGraphNode): void => {
    _registeredNodeTypes[type] = nodeClass
  },
  NODE_DEFAULT_WIDTH: 200,
  NODE_DEFAULT_HEIGHT: 80,
  ALWAYS: 0,
  NEVER: 1,
  BYPASS: 2,
  createNode: (type: string): LGraphNode | null => {
    const nodeClass = _registeredNodeTypes[type]
    if (nodeClass !== undefined) {
      const node = new nodeClass()
      ;(node as unknown as Record<string, unknown>).type = type
      return node
    }
    return new LGraphNode(type)
  },
}
window.LGraph ??= class DummyLGraph {
  readonly __dummy = true
  _nodes_by_id: Record<string, LGraphNode | undefined> = {}
  links: Map<number, LLink> | Record<number, LLink> = {}
  groups: LGraphGroup[] = []
  nodes: LGraphNode[] = []

  add(node: LGraphNode): void {
    if (!this.nodes.includes(node)) {
      this.nodes.push(node)
    }
    if (node.id) {
      this._nodes_by_id[String(node.id)] = node
    }
  }

  remove(node: LGraphNode): void {
    const idx = this.nodes.indexOf(node)
    if (idx !== -1) {
      this.nodes.splice(idx, 1)
    }
    if (node.id) {
      this._nodes_by_id[String(node.id)] = undefined
    }
  }

  clear(): void {
    this.nodes = []
    this._nodes_by_id = {}
    this.links = {}
    this.groups = []
  }

  getNodeById(id: number | string): LGraphNode | undefined {
    return this._nodes_by_id[String(id)]
  }

  setDirtyCanvas(_flag: boolean, _history?: boolean): void {
    /* noop */
  }
} as unknown as LGraphConstructor
const LGraph = window.LGraph

let _nextNodeId = 1

window.LGraphNode ??= class DummyLGraphNode {
  readonly __dummy = true
  id = _nextNodeId++
  type?: string
  color?: string
  bgcolor?: string
  pos: [number, number] = [0, 0]
  size: [number, number] = [0, 0]
  inputs: LGraphNodeInput[] = []
  outputs: LGraphNodeOutput[] = []
  widgets?: WidgetType[] = []

  constructor(type?: string) {
    if (type !== undefined) {
      this.type = type
    }
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

  disconnectInput(_slot: number): void {
    /* noop */
  }

  disconnectOutput(_slot: number): void {
    /* noop */
  }

  configure(_data: unknown): void {
    /* noop */
  }

  setDirtyCanvas(): void {
    /* noop */
  }

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
      element: document.createElement("div"),
      options: { hideOnZoom: false, ...(options ?? {}) },
      _value: String(value),
      value: value,
      callback,
    }
    this.widgets ??= []
    this.widgets.push(w)
    return w
  }
}
window.LGraphCanvas ??= class DummyLGraphCanvas {
  readonly __dummy = true
  state = { readOnly: false }
  resize(): void { /* noop */ }
  ds = { scale: 1, offset: [0, 0] as [number, number] }
  setDirty(): void { /* noop */ }
  stopRendering(): void { /* noop */ }
  startRendering(): void { /* noop */ }
  canvas: HTMLCanvasElement | null = null
  setCanvas(canvas: HTMLCanvasElement | string | null | undefined, _skip_events?: boolean): void {
    if (canvas !== null && canvas !== undefined && typeof canvas !== "string") {
      this.canvas = canvas
    }
  }
} as unknown as LGraphCanvasConstructor
const LGraphCanvas = window.LGraphCanvas
window.LLink ??= class DummyLLink {
  readonly __dummy = true
  id = 0
  origin_id = 0
  origin_slot = 0
  target_id = 0
  target_slot = 0
  type = ""
}
window.LGraphGroup ??= class DummyLGraphGroup {
  readonly __dummy = true
  id = 0
  title = ""
  pos: [number, number] = [0, 0]
  size: [number, number] = [0, 0]
  color?: string
}

window.comfyExtensions ??= []

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
const _addDOMWidgetFn = function (
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
;(LGraphNode as any).prototype.addDOMWidget = _addDOMWidgetFn
console.log("[CEG] addDOMWidget polyfill installed on LGraphNode.prototype")

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
    graph: new LGraph(),
    canvas: new LGraphCanvas(document.createElement("canvas"), new LGraph()),
    syncGraph(): void {
      // No-op: Zustand store가 single source of truth이므로 sync 필요 없음
    },
    ui: {
      dialogs: {},
      dialog: { show(): void { /* noop */ } },
      settings: defaultSettings
    },
    settings: defaultSettings,
    extensions: [],
    registerExtension(ext: ComfyExtension): void {
      if (app.extensionManager.registerExtension !== undefined) {
        console.log(`[CEG] registerExtension: "${ext.name}" -> extensionManager.registerExtension (has onNodeCreated=${String(typeof ext.nodeCreated)} has beforeRegisterNodeDef=${String(typeof ext.beforeRegisterNodeDef)})`)
        app.extensionManager.registerExtension(ext)
      } else {
        console.log(`[CEG] registerExtension: "${ext.name}" -> app.extensions.push (extManager has no registerExtension)`)
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
if ((window as { app?: ComfyApp }).app === undefined) { window.app = createDefaultApp() }
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

appObj.graph = new (LGraph as unknown as new () => Record<string, unknown>)() as unknown as LGraph
appObj.canvas = new (LGraphCanvas as unknown as new (canvas: HTMLCanvasElement, graph: Record<string, unknown>) => Record<string, unknown>)(document.createElement("canvas"), appObj.graph as unknown as Record<string, unknown>) as unknown as LGraphCanvas
appObj.syncGraph = (): void => {
  // No-op: Zustand store가 single source of truth이므로 sync 필요 없음
}

// 필수 브라우저 글로벌 스텁 설정
{
  const w = window as unknown as Record<string, unknown>

  if (w.$el === undefined) {
    w.$el = (tag: string, attrs: Record<string, object | string | number | boolean | null> | null | undefined, _children?: object): HTMLElement => {
      const el: HTMLElement = document.createElement(tag)
      if (attrs !== null && attrs !== undefined) {
        for (const [k, v] of Object.entries(attrs)) {
          if (k === 'style' && typeof v === 'object' && v !== null) {
            Object.assign(el.style, v)
          } else {
            const elRec = el as object as Record<string, object | string | number | boolean | null | undefined>
            elRec[k] = v
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

  window.comfyAPI ??= {} as ComfyAPIObject
  const comfyAPI = window.comfyAPI
  comfyAPI.app ??= { app: window.app }
  comfyAPI.api ??= { api: window.api }
  comfyAPI.utils ??= { applyTextReplacements: (_node: object, text: string): string => text }
  comfyAPI.ui ??= {
    ComfyDialog: class {
      __ceg = true
    },
    $el: window.$el,
    ComfyUI: class {
      __ceg = true
    }
  }
  comfyAPI.widgets ??= {
    updateControlWidgetLabel(): void { /* noop */ },
    IS_CONTROL_WIDGET(): void { /* noop */ },
    addValueControlWidget(): void { /* noop */ },
    addValueControlWidgets(): void { /* noop */ },
    ComfyWidgets: window.ComfyWidgets,
    isValidWidgetType(): void { /* noop */ }
  }
  comfyAPI.widgetInputs ??= {
    PrimitiveNode: class {
      __ceg = true
    },
    getWidgetConfig: (): Record<string, unknown> => ({}),
    convertToInput: (): void => { /* noop */ },
    setWidgetConfig: (): void => { /* noop */ },
    mergeIfValid: (): void => { /* noop */ }
  }
  comfyAPI.groupNode ??= {
    GroupNodeConfig: class {
      static registerFromWorkflow(): Promise<void> {
        return Promise.resolve()
      }
      __ceg = true
    },
    GroupNodeHandler: class {
      __ceg = true
    }
  }
  comfyAPI.pnginfo ??= {
    getPngMetadata: (): Promise<Record<string, unknown>> => Promise.resolve({}),
    getWebpMetadata: (): Promise<Record<string, unknown>> => Promise.resolve({})
  }
  comfyAPI.editAttention ??= {
    incrementWeight(weight: string, delta: number): string {
      const floatWeight = parseFloat(weight)
      if (isNaN(floatWeight)) return weight
      const newWeight = floatWeight + delta
      return String(Number(newWeight.toFixed(10)))
    },
    findNearestEnclosure(text: string, cursorPos: number): { start: number; end: number } | null {
      let start = cursorPos
      let end = cursorPos
      let openCount = 0
      let closeCount = 0

      if (text[cursorPos] === '(') {
        end = cursorPos + 1
      } else {
        while (start >= 0) {
          start--
          if (text[start] === '(' && openCount === closeCount) break
          if (text[start] === '(') openCount++
          if (text[start] === ')') closeCount++
        }
        if (start < 0) return null
        openCount = 0
        closeCount = 0
      }

      while (end < text.length) {
        if (text[end] === ')' && openCount === closeCount) break
        if (text[end] === '(') openCount++
        if (text[end] === ')') closeCount++
        end++
      }
      if (end === text.length) return null

      return { start: start + 1, end }
    },
    addWeightToParentheses(text: string): string {
      const regex = /^\((.*)\)$/
      const parenMatch = regex.exec(text)
      if (parenMatch === null) return text
      const innerText = parenMatch[1]
      if (innerText === undefined) return text
      const looksLikeTime = /(?:^|\s)\d{1,2}:\d{2}$/.test(innerText)
      const hasTrailingWeight =
        !looksLikeTime && /:[+-]?(?:\d*\.)?\d+(?:[eE][+-]?\d+)?$/.test(innerText)
      return hasTrailingWeight ? text : `(${innerText}:1.0)`
    }
  }
  comfyAPI.widgetValuePropagation ??= {
    applyFirstWidgetValueToGraph(
      node: LGraphNode | null | undefined,
      extraLinks: LLink[] = [],
      transformValue?: (value: string | number | boolean) => string | number | boolean
    ): void {
      if (node === null || node === undefined) return
      if (
        node.outputs.length === 0 ||
        node.graph === null ||
        node.graph === undefined
      ) {
        return
      }

      const output = node.outputs[0]
      if (output === undefined) return

      const links = output.links
      if (links === null || links.length === 0) {
        return
      }

      const sourceWidget = node.widgets?.[0]
      if (sourceWidget === undefined) return

      let value = sourceWidget.value
      if (transformValue !== undefined) {
        value = transformValue(value)
      }

      const graphMouse: [number, number] = window.app.canvas.graph_mouse ?? [0, 0]

      const graphLinks = node.graph.links
      const resolvedLinks: LLink[] = []

      if (Array.isArray(links)) {
        for (const linkId of links) {
          let link: LLink | undefined
          if (graphLinks instanceof Map) {
            link = graphLinks.get(linkId)
          } else {
            link = (graphLinks as Record<number, LLink | undefined>)[linkId]
          }
          if (link !== undefined) {
            resolvedLinks.push(link)
          }
        }
      }

      const allLinks = [
        ...resolvedLinks,
        ...extraLinks
      ]

      for (const link of allLinks) {
        const linkInfo = link

        const targetNode = node.graph.getNodeById(linkInfo.target_id)
        if (targetNode === undefined) {
          continue
        }

        const input = targetNode.inputs[linkInfo.target_slot]
        if (input === undefined) continue

        const widgetName = input.widget?.name
        if (widgetName === undefined || widgetName === "") continue

        const targetWidget = targetNode.widgets?.find((w) => w.name === widgetName)
        if (targetWidget === undefined) continue

        targetWidget.value = value
        if (targetWidget.callback !== null) {
          targetWidget.callback(
            targetWidget.value,
            window.app.canvas,
            targetNode,
            graphMouse,
            {}
          )
        }
      }
    }
  }

  comfyAPI.groupNodeManage ??= {
    ManageGroupDialog: class {
      __ceg = true
      show(_e?: object): void { /* noop */ }
    }
  }

  const SUPPORTED_EXTENSIONS = new Set([
    '.gltf', '.glb', '.obj', '.fbx', '.stl', '.spz', '.splat', '.ply', '.ksplat'
  ])
  const SUPPORTED_HDRI_EXTENSIONS = new Set(['.hdr', '.exr'])

  comfyAPI.constants ??= {
    iconsHtml: {
      'pen': `
        <svg viewBox="0 0 44 44">
          <path class="cls-1" d="M10.97,15.98v14.04c0,.825.675,1.5,1.5,1.5h23.07c.825,0,1.5-.675,1.5-1.5V15.98c0-.825-.675-1.5-1.5-1.5H12.47c-.825,0-1.5.675-1.5,1.5ZM25.79,28.16c-4.365,1.41-8.355-2.58-6.945-6.945.51-1.575,1.785-2.85,3.36-3.36,4.365-1.41,8.355,2.58,6.945,6.945-.51,1.575-1.785,2.85-3.36,3.36Z"/>
        </svg>
      `,
      'eraser': `
        <svg viewBox="0 0 44 44">
          <g>
            <rect class="cls-2" x="16.68" y="10" width="10.63" height="24" rx="1.16" ry="1.16" transform="translate(22 -9.11) rotate(45)"/>
            <path class="cls-1" d="M17.27,34.27c-.42,0-.85-.16-1.17-.48l-5.88-5.88c-.31-.31-.48-.73-.48-1.17s.17-.86.48-1.17l15.34-15.34c.62-.62,1.72-.62,2.34,0l5.88,5.88c.65.65.65,1.7,0,2.34l-15.34,15.34c-.32.32-.75.48-1.17.48ZM26.73,10.73c-.18,0-.34.07-.46.19l-15.34,15.34c-.12.12-.19.29-.19.46s.07.34.19.46l5.88,5.88c.26.26.67.26.93,0l15.34-15.34c.26-.26.26-.67,0-.93l-5.88-5.88c-.12-.12-.29-.19-.46-.19Z"/>
          </g>
          <path class="cls-3" d="M20.33,11.03h8.32c.64,0,1.16.52,1.16,1.16v15.79h-10.63v-15.79c0-.64.52-1.16,1.16-1.16Z" transform="translate(20.97 -11.61) rotate(45)"/>
        </svg>
      `,
      'paintBucket': `
        <svg viewBox="0 0 44 44">
          <path class="cls-1" d="M33.4,21.76l-11.42,11.41-.04.05c-.61.61-1.6.61-2.21,0l-8.91-8.91c-.61-.61-.61-1.6,0-2.21l.04-.05.3-.29h22.24Z"/>
          <path class="cls-1" d="M20.83,34.17c-.55,0-1.07-.21-1.46-.6l-8.91-8.91c-.8-.8-.8-2.11,0-2.92l11.31-11.31c.8-.8,2.11-.8,2.92,0l8.91,8.91c.39.39.6.91.6,1.46s-.21,1.07-.6,1.46l-11.31,11.31c-.39.39-.91.6-1.46.6ZM23.24,10.83c-.27,0-.54.1-.75.31l-11.31,11.31c-.41.41-.41,1.09,0,1.5l8.91,8.91c.4.4,1.1.4,1.5,0l11.31-11.31c.2-.2.31-.47.31-.75s-.11-.55-.31-.75l-8.91-8.91c-.21-.21-.48-.31-.75-.31Z"/><path class="cls-1" d="M34.28,26.85c0,.84-.68,1.52-1.52,1.52s-1.52-.68-1.52-1.52,1.52-2.86,1.52-2.86c0,0,1.52,2.02,1.52,2.86Z"/>
        </svg>
      `,
      'colorSelect': `
        <svg viewBox="0 0 44 44">
          <path class="cls-1" d="M30.29,13.72c-1.09-1.1-2.85-1.09-3.94,0l-2.88,2.88-.75-.75c-.2-.19-.51-.19-.71,0-.19.2-.19.51,0,.71l1.4,1.4-9.59,9.59c-.35.36-.54.82-.54,1.32,0,.14,0,.28.05.41-.05.04-.1.08-.15.13-.39.39-.39,1.01,0,1.4.38.39,1.01.39,1.4,0,.04-.04.08-.09.11-.13.14.04.3.06.45.06.5,0,.97-.19,1.32-.55l9.59-9.59,1.38,1.38c.1.09.22.14.35.14s.26-.05.35-.14c.2-.2.2-.52,0-.71l-.71-.72,2.88-2.89c1.08-1.08,1.08-2.85-.01-3.94ZM19.43,25.82h-2.46l7.15-7.15,1.23,1.23-5.92,5.92Z"/>
        </svg>
      `,
      'rgbPaint': `
        <svg viewBox="0 0 44 44">
          <path class="cls-1" d="M34,13.93c0,.47-.19.94-.55,1.31l-13.02,13.04c-.09.07-.18.15-.27.22-.07-1.39-1.21-2.48-2.61-2.49.07-.12.16-.24.27-.34l13.04-13.04c.72-.72,1.89-.72,2.6,0,.35.35.55.83.55,1.3Z"/>
          <path class="cls-1" d="M19.64,29.03c0,4.46-6.46,3.18-9.64,0,3.3-.47,4.75-2.58,7.06-2.58,1.43,0,2.58,1.16,2.58,2.58Z"/>
        </svg>
      `
    },
    SUPPORTED_EXTENSIONS,
    SUPPORTED_EXTENSIONS_ACCEPT: [...SUPPORTED_EXTENSIONS].join(','),
    SUPPORTED_HDRI_EXTENSIONS,
    SUPPORTED_HDRI_EXTENSIONS_ACCEPT: [...SUPPORTED_HDRI_EXTENSIONS].join(','),
    LOAD3D_NONE_MODEL: 'none'
  }

  comfyAPI.types ??= {
    BrushShape: {
      Arc: 'arc',
      Rect: 'rect'
    },
    Tools: {
      MaskPen: 'pen',
      PaintPen: 'rgbPaint',
      Eraser: 'eraser',
      MaskBucket: 'paintBucket',
      MaskColorFill: 'colorSelect'
    },
    allTools: ['pen', 'rgbPaint', 'eraser', 'paintBucket', 'colorSelect'],
    CompositionOperation: {
      SourceOver: 'source-over',
      DestinationOut: 'destination-out'
    },
    MaskBlendMode: {
      Black: 'black',
      White: 'white',
      Negative: 'negative'
    },
    ColorComparisonMethod: {
      Simple: 'simple',
      HSL: 'hsl',
      LAB: 'lab'
    }
  }

  const createRecursiveProxy = (name: string): object => {
    const fn = (): void => { /* noop */ }
    const handler: ProxyHandler<() => void> = {
      get(target, prop, receiver): object {
        if (prop === 'prototype') {
          const val = Reflect.get(target, prop, receiver) as object | undefined
          return val ?? {}
        }
        if (prop === name) {
          return createRecursiveProxy(name)
        }
        return createRecursiveProxy(String(prop))
      }
    }
    return new Proxy(fn, handler)
  }

  const comfyAPIHandler: ProxyHandler<ComfyAPIObject> = {
    get(target, prop, receiver): object {
      if (prop in target) {
        const val = Reflect.get(target, prop, receiver) as object | undefined
        return val ?? {}
      }
      if (typeof prop === 'string') {
        return createRecursiveProxy(prop)
      }
      const val = Reflect.get(target, prop, receiver) as object | undefined
      return val ?? {}
    }
  }

  window.comfyAPI = new Proxy(comfyAPI, comfyAPIHandler)

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
    const canvasProto = w.LGraphCanvas as LGraphCanvasConstructor
    const proto = canvasProto.prototype as Partial<LGraphCanvas>
    if (!("setDirty" in proto)) {
      proto.setDirty = (): void => { /* noop */ }
    }
    if (!("addEventListener" in proto)) {
      proto.addEventListener = (_type: string, _listener: (e: Event) => void): void => { /* noop */ }
    }
    if (!("setCanvas" in proto)) {
      proto.setCanvas = function (this: LGraphCanvas, canvas: HTMLCanvasElement): void {
        this.canvas = canvas
      }
    }
    if (!("startRendering" in proto)) {
      proto.startRendering = (): void => { /* noop */ }
    }
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
