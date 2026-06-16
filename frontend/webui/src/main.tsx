import "@/lib/logger"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { LiteGraph, LGraph, LGraphNode, LGraphCanvas, LLink, LGraphGroup } from "@/lib/comfy-graph/core/litegraph"
import type { Size } from "@/lib/comfy-graph/core/interfaces"
import type { IBaseWidget } from "@/lib/comfy-graph/core/types/widgets"

// Re-declare DOMWidget to match global.d.ts for type compatibility
interface DOMWidget {
  type: string
  name: string
  element: HTMLElement
  options: Record<string, unknown> & { hideOnZoom?: boolean }
  _value?: string | undefined
  value: string | undefined
  callback?: ((v: string) => void) | undefined
  y: number
  [key: symbol]: boolean
}

window.LiteGraph = LiteGraph
window.LGraph = LGraph
window.LGraphNode = LGraphNode
window.LGraphCanvas = LGraphCanvas
window.LLink = LLink
window.LGraphGroup = LGraphGroup
if (typeof window.comfyExtensions === "undefined") {
  window.comfyExtensions = [];
}

// LocalStorage 오염 복구 가드 및 런타임 후킹
try {
  const key = 'Comfy.Settings.Comfy.CustomColorPalettes';

  // 1. 네이티브 로컬 스토리지에 저장되어 있는 값을 즉시 파싱 및 강제 클렌징 (import 완료 전 최초 1회 즉시 보정)
  const raw = window.localStorage.getItem(key);
  if (raw === null || raw === 'undefined' || raw === 'null') {
    window.localStorage.setItem(key, '{}');
  } else {
    try {
      let parsed: unknown = JSON.parse(raw);
      while (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      if (typeof parsed !== 'object' || parsed === null) {
        window.localStorage.setItem(key, '{}');
      } else {
        window.localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch {
      window.localStorage.setItem(key, '{}');
    }
  }

  // 2. 런타임 동적 후킹: 다른 라이브러리나 런타임 동적 쓰기로 인한 오염 방지
  const originalGetItem = localStorage.getItem.bind(localStorage);
  const originalSetItem = localStorage.setItem.bind(localStorage);

  localStorage.getItem = function(k: string): string | null {
    const val = originalGetItem(k);
    if (k === key) {
      try {
        if (val === null || val === 'undefined' || val === 'null') {
          return '{}';
        }
        let parsed: unknown = JSON.parse(val);
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        if (typeof parsed !== 'object' || parsed === null) {
          return '{}';
        }
        return JSON.stringify(parsed);
      } catch {
        return '{}';
      }
    }
    return val;
  };

  localStorage.setItem = function(k: string, val: string | null): void {
    if (k === key) {
      try {
        if (val === null || val === 'undefined' || val === 'null') {
          originalSetItem(key, '{}');
          return;
        }
        let parsed: unknown = JSON.parse(val);
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        if (typeof parsed !== 'object' || parsed === null) {
          originalSetItem(key, '{}');
          return;
        }
        originalSetItem(key, JSON.stringify(parsed));
        return;
      } catch {
        originalSetItem(key, '{}');
        return;
      }
    }
    originalSetItem(k, val);
  };
} catch (e: unknown) {
  console.error("Failed to install localStorage hooks", e);
}

window.LiteGraph.LGraph = LGraph
window.LiteGraph.LGraphNode = LGraphNode
window.LiteGraph.LGraphCanvas = LGraphCanvas
window.LiteGraph.LLink = LLink
window.LiteGraph.LGraphGroup = LGraphGroup

// Polyfill LGraphNode.prototype.addDOMWidget to support custom HTML/Vue widgets (e.g. LoRA Manager loader UI)
LGraphNode.prototype.addDOMWidget = function(
  this: LGraphNode,
  name: string,
  type: string,
  element: HTMLElement,
  options: DOMWidgetOptions = {}
): DOMWidget {
  const tagName: string = element.tagName;
  const stack: string = new Error().stack?.split("\n").slice(2, 5).join(" <- ") ?? "";
  console.log("[CEG:DEBUG addDOMWidget]", "nodeId=" + String(this.id), "name=" + name, "type=" + type, "hasElement=true", "elementTag=" + tagName, "stack=" + stack);

  const widget: DOMWidget = {
    type: type,
    name: name,
    element: element,
    options: { hideOnZoom: true, ...options },
    _value: options.getValue?.() ?? '',
    value: '',
    callback(): void { return; },
    y: 0
  };

  Object.defineProperty(widget, 'value', {
    get(this: DOMWidget): string | undefined {
      const opts = this.options as DOMWidgetOptions & { hideOnZoom?: boolean };
      const getValue = opts.getValue;
      if (getValue) {
        return getValue();
      }
      return this._value ?? '';
    },
    set(this: DOMWidget, v: string | undefined): void {
      this._value = v;
      const opts = this.options as DOMWidgetOptions & { hideOnZoom?: boolean };
      const setValue = opts.setValue;
      if (setValue) {
        try {
          setValue(v);
        } catch (err: unknown) {
          console.warn(`[addDOMWidget] setValue failed for widget "${this.name}":`, err);
        }
      }
      const callback = this.callback;
      if (callback) {
        callback(v);
      }
    },
    configurable: true
  });

  this.widgets ??= [];
  this.widgets.push(widget as IBaseWidget);

  if (options.beforeResize || options.afterResize) {
    const oldResize: ((this: LGraphNode, size: Size) => void) | undefined = (this.onResize as (() => void)).bind(this);
    this.onResize = function(this: LGraphNode, size: Size): void {
      if (typeof oldResize !== "undefined") oldResize.call(this, size);
      if (options.beforeResize) options.beforeResize.call(widget, this);
      if (options.afterResize) options.afterResize.call(widget, this);
    };
  }

  const app = window.app as ComfyApp | undefined;
  if (app?.syncGraph) {
    app.syncGraph();
  }

  return widget;
};

// LiteGraph color palettes and Styles stub to avoid theme setting crashes (e.g. obsidian theme setting)
window.LiteGraph.color_palettes = new Proxy((typeof window.LiteGraph.color_palettes === "undefined" ? {} : window.LiteGraph.color_palettes), {
  get(target: Record<string, unknown>, prop: string | symbol): unknown {
    if (typeof prop === 'symbol') {
      return undefined;
    }
    if (!(prop in target)) {
      target[prop] = {};
    }
    return target[prop];
  }
});
window.LiteGraph.Styles = typeof window.LiteGraph.Styles === "undefined" ? {
  obsidian: {}
} : window.LiteGraph.Styles;

import { DEFAULT_BACKEND_URL } from "@/lib/runtime"

// Initialize window.api as a persistent EventTarget instance
window.api = typeof window.api === "undefined" ? (new EventTarget() as ComfyApi) : window.api;
const apiObj = window.api;
apiObj.api_base = apiObj.api_base || DEFAULT_BACKEND_URL;
apiObj.getExtensions = typeof apiObj.getExtensions === "undefined" ? (async (): Promise<Record<string, unknown>> => {
  const { comfyApi } = await import("@/lib/comfy-graph/api");
  return comfyApi.getExtensions();
}) : apiObj.getExtensions;
apiObj.getObjectInfo = typeof apiObj.getObjectInfo === "undefined" ? (async (): Promise<Record<string, unknown>> => {
  const { comfyApi } = await import("@/lib/comfy-graph/api");
  return comfyApi.getObjectInfo();
}) : apiObj.getObjectInfo;
const _fetchApiMocks: Record<string, () => Promise<Response>> = {
  "/system_stats": async (): Promise<Response> => {
    const stats = await apiObj.getSystemStats();
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};

apiObj.fetchApi = typeof apiObj.fetchApi === "undefined" ? ((async (url: string, options?: RequestInit): Promise<Response> => {
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  const fullUrl = cleanUrl.startsWith("/api/") ? cleanUrl : `/api${cleanUrl}`;
  const route = fullUrl.replace(/^\/api/, "");
  const mock = _fetchApiMocks[route];
  if (mock) {
    return mock();
  }
  return fetch(`${apiObj.api_base}${fullUrl}`, options);
})) : apiObj.fetchApi;
apiObj.getSystemStats = typeof apiObj.getSystemStats === "undefined" ? (() => {
  return {
    system: {
      os: "linux",
      ram_total: 32 * 1024 * 1024 * 1024,
      ram_free: 16 * 1024 * 1024 * 1024,
      comfyui_version: "1.16.9",
      required_frontend_version: "",
      installed_templates_version: "",
      required_templates_version: "",
      python_version: "3.11",
      pytorch_version: "2.0",
      embedded_python: false,
      argv: [],
      comfy_package_versions: [],
    },
    devices: [],
  };
}) as () => Promise<Record<string, unknown>> : apiObj.getSystemStats;
apiObj.addEventListener = typeof apiObj.addEventListener === "undefined" ? (((): void => { return; })) : (apiObj.addEventListener.bind(apiObj));
apiObj.removeEventListener = typeof apiObj.removeEventListener === "undefined" ? (((): void => { return; })) : (apiObj.removeEventListener.bind(apiObj));

// Proxy for settingsLookup to dynamically handle any settings access without crashing
const settingsLookupProxy = new Proxy({
  'Comfy.Locale': { onChange(): void { return; } }
}, {
  get(target: Record<string, unknown>, prop: string | symbol): unknown {
    if (typeof prop === "string" && !(prop in target)) {
      target[prop] = { onChange(): void { return; } };
    }
    return target[prop as keyof typeof target];
  }
});

// Initialize window.app as a persistent object
window.app = typeof window.app === "undefined" ? {
  extensions: [] as ComfyExtension[],
  registerExtension(ext: ComfyExtension): void {
    this.extensions.push(ext);
  }
} : window.app;
const appObj = window.app;
appObj.extensions = typeof appObj.extensions === "undefined" ? [] : appObj.extensions;
appObj.registerExtension = typeof appObj.registerExtension === "undefined" ? function (ext: ComfyExtension): void {
  appObj.extensions.push(ext);
} : appObj.registerExtension;

// app.ui.settings 및 app.settings 의 getSettingValue 안전 후킹 유틸
const installSettingValueHook = (settingsObj: ComfySettings | undefined): void => {
  if (!settingsObj) return;
  const originalGet = settingsObj.getSettingValue;
  settingsObj.getSettingValue = function(this: ComfySettings, id: string): unknown {
    const val = originalGet ? originalGet.call(this, id) : null;
    if (id === 'Comfy.CustomColorPalettes') {
      if (val === null || val === 'undefined' || val === 'null') {
        return {};
      }
      if (typeof val === 'string') {
        try {
          let parsed: unknown = JSON.parse(val);
          while (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          if (typeof parsed !== 'object' || parsed === null) {
            return {};
          }
          return parsed;
        } catch {
          return {};
        }
      }
    }
    return val;
  };
};

let _installingHook = false;

// api.getSettings 후킹 유틸
const installApiSettingsHook = (apiInstance: ComfyApi): void => {
  if (typeof apiInstance === "undefined" || _installingHook) return;
  _installingHook = true;
  const originalGetSettings = apiInstance.getSettings;
  apiInstance.getSettings = async function(this: ComfyApi): Promise<Record<string, unknown>> {
    const settings = originalGetSettings ? await originalGetSettings.call(this) : {};
    const palettes: unknown = settings['Comfy.CustomColorPalettes'];
    if (typeof palettes !== "undefined") {
      const val = settings['Comfy.CustomColorPalettes'];
      if (typeof val === 'string') {
        try {
          let parsed: unknown = JSON.parse(val);
          while (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          if (typeof parsed === 'object' && parsed !== null) {
            settings['Comfy.CustomColorPalettes'] = parsed;
          } else {
            settings['Comfy.CustomColorPalettes'] = {};
          }
        } catch {
          settings['Comfy.CustomColorPalettes'] = {};
        }
      }
    }
    return settings;
  };
  _installingHook = false;
};

// window.api.getSettings 동적 바인딩 가드
let _getSettings: ComfyApi['getSettings'] = apiObj.getSettings;
Object.defineProperty(apiObj, 'getSettings', {
  get(this: typeof apiObj) {
    return _getSettings;
  },
  set(this: typeof apiObj, newGetSettings: ComfyApi['getSettings']) {
    _getSettings = newGetSettings;
    installApiSettingsHook(apiObj);
  },
  configurable: true
});
installApiSettingsHook(apiObj);

// window.app 객체 속성 가드 설치
let _appUi: NonNullable<ComfyApp['ui']> = typeof appObj.ui === "undefined" ? {} : appObj.ui;
let _appSettings: ComfySettings = typeof appObj.settings === "undefined" ? {} : appObj.settings;

// 초기 셋업
_appUi.dialogs = typeof _appUi.dialogs === "undefined" ? {} : _appUi.dialogs;
_appUi.dialog = typeof _appUi.dialog === "undefined" ? { show(): void { return; } } : _appUi.dialog;
_appUi.settings = typeof _appUi.settings === "undefined" ? {
  addSetting(): Record<string, unknown> { return {}; },
  getSettingValue(): unknown { return null; },
  setSettingValue(): void { return; },
  settingsLookup: settingsLookupProxy
} : _appUi.settings;
_appSettings.addSetting = typeof _appSettings.addSetting === "undefined" ? (((): Record<string, unknown> => ({}))) : _appSettings.addSetting;
_appSettings.getSettingValue = typeof _appSettings.getSettingValue === "undefined" ? (((): unknown => null)) : _appSettings.getSettingValue;
_appSettings.setSettingValue = typeof _appSettings.setSettingValue === "undefined" ? (((): void => { return; })) : _appSettings.setSettingValue;
_appSettings.settingsLookup = typeof _appSettings.settingsLookup === "undefined" ? settingsLookupProxy : _appSettings.settingsLookup;

installSettingValueHook(_appUi.settings);
installSettingValueHook(_appSettings);

Object.defineProperty(appObj, 'ui', {
  get(this: typeof appObj) {
    return _appUi;
  },
  set(this: typeof appObj, newUi: NonNullable<ComfyApp['ui']>) {
    _appUi = newUi;
    const settings = newUi.settings;
    if (typeof settings !== "undefined") {
      installSettingValueHook(settings);
    } else {
      let _uiSettings: ComfySettings | null = null;
      Object.defineProperty(newUi, 'settings', {
        get(this: ComfyApp['ui']) { return _uiSettings; },
        set(this: ComfyApp['ui'], ns: ComfySettings) {
          _uiSettings = ns;
          installSettingValueHook(ns);
        },
        configurable: true
      });
    }
  },
  configurable: true
});

Object.defineProperty(appObj, 'settings', {
  get(this: typeof appObj) {
    return _appSettings;
  },
  set(this: typeof appObj, newSettings: ComfySettings) {
    _appSettings = newSettings;
    installSettingValueHook(newSettings);
  },
  configurable: true
});

appObj.graph = typeof appObj.graph === "undefined" ? new LGraph() : appObj.graph;
appObj.canvas = typeof appObj.canvas === "undefined" ? new LGraphCanvas(document.createElement("canvas"), appObj.graph) : appObj.canvas;
appObj.syncGraph = typeof appObj.syncGraph === "undefined" ? (async function (): Promise<void> {
  const { useReactGraphStore } = await import("@/lib/comfy-graph/stores/reactGraphStore");
  useReactGraphStore.getState().syncGraphFromLive();
}) : appObj.syncGraph;

// 필수 브라우저 글로벌 스텁 설정 (ComfyUI 커스텀 노드가 참조하는 글로벌 변수들)
const w = window
if (typeof w.$el === "undefined") {
  w.$el = (tag: string, attrs?: Record<string, unknown> | null, _children?: unknown): HTMLElement => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style' && typeof v === 'object' && v !== null) {
          Object.assign(el.style, v);
        } else {
          (el as HTMLElement & Record<string, unknown>)[k] = v;
        }
      }
    }
    return el;
  };
}

if (typeof w.addStylesheet === "undefined") {
  w.addStylesheet = (url: string): HTMLLinkElement => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
    return link;
  };
}

if (typeof w.getUrl === "undefined") {
  w.getUrl = (path: string, base?: string | URL): string => {
    if (typeof base !== "undefined") {
      return new URL(path, base).toString();
    }
    return path;
  };
}

if (typeof w.ComfyWidgets === "undefined") {
  w.ComfyWidgets = {
    STRING: (): { widget: { inputEl: HTMLElement } } => ({ widget: { inputEl: {} as HTMLElement } }),
    INT: (): { widget: { inputEl: HTMLElement } } => ({ widget: { inputEl: {} as HTMLElement } }),
    FLOAT: (): { widget: { inputEl: HTMLElement } } => ({ widget: { inputEl: {} as HTMLElement } }),
    COMBO: (): { widget: { inputEl: HTMLElement } } => ({ widget: { inputEl: {} as HTMLElement } }),
    BOOLEAN: (): { widget: { inputEl: HTMLElement } } => ({ widget: { inputEl: {} as HTMLElement } }),
  };
}

if (typeof w.ComfyApp === "undefined") {
  w.ComfyApp = class ComfyApp {
    name = '';
  };
}

if (typeof w.ComfyDialog === "undefined") {
  w.ComfyDialog = class ComfyDialog {
    name = '';
  };
}

if (typeof w.ClipspaceDialog === "undefined") {
  w.ClipspaceDialog = class ClipspaceDialog {
    name = '';
    static registerButton(_name: string, _cb: () => void): void { return; }
  };
}

if (typeof w.isBeforeFrontendVersion === "undefined") {
  w.isBeforeFrontendVersion = (): boolean => false;
}

if (typeof w.comfyAPI === "undefined") {
  w.comfyAPI = {
    app: {
      app: window.app
    },
    api: {
      api: typeof window.api === "undefined" ? {} : window.api
    },
    utils: {
      applyTextReplacements: (_node: LGraphNode | null, text: string): string => text
    },
    ui: {
      ComfyDialog: class ComfyDialogStub { name = ''; },
      $el: w.$el,
      ComfyUI: class ComfyUIStub { name = ''; }
    },
    widgets: {
      updateControlWidgetLabel(): void { return; },
      IS_CONTROL_WIDGET(): boolean { return false; },
      addValueControlWidget(): void { return; },
      addValueControlWidgets(): void { return; },
      ComfyWidgets: typeof w.ComfyWidgets === "undefined" ? {} : w.ComfyWidgets,
      isValidWidgetType(): boolean { return false; }
    },
    widgetInputs: {
      PrimitiveNode: class PrimitiveNodeStub { name = ''; },
      getWidgetConfig: (): Record<string, unknown> => ({}),
      convertToInput(): void { return; },
      setWidgetConfig(): void { return; },
      mergeIfValid(): void { return; }
    },
    groupNode: {
      GroupNodeConfig: class GroupNodeConfigStub {
        name = '';
        static registerFromWorkflow(): Promise<void> { return Promise.resolve(); }
      },
      GroupNodeHandler: class GroupNodeHandlerStub { name = ''; }
    },
    pnginfo: {
      getPngMetadata: (): Promise<Record<string, unknown>> => Promise.resolve({}),
      getWebpMetadata: (): Promise<Record<string, unknown>> => Promise.resolve({})
    }
  };
}

if (typeof w.ClipspaceDialog === "undefined") {
  w.ClipspaceDialog = class ClipspaceDialogStub {
    name = '';
    static registerButton(): void { return; }
  };
} else {
  w.ClipspaceDialog.registerButton = typeof w.ClipspaceDialog.registerButton === "undefined" ? function(): void { return; } : w.ClipspaceDialog.registerButton;
}

if (typeof w.LGraphCanvas !== "undefined") {
  w.LGraphCanvas.prototype.setDirty = typeof w.LGraphCanvas.prototype.setDirty === "undefined" ? (((): void => { return; })) : (w.LGraphCanvas.prototype.setDirty.bind(w.LGraphCanvas.prototype));
  w.LGraphCanvas.prototype.addEventListener = typeof w.LGraphCanvas.prototype.addEventListener === "undefined" ? (((): void => { return; })) : (w.LGraphCanvas.prototype.addEventListener.bind(w.LGraphCanvas.prototype));
}

if (typeof w.rgthree === "undefined") {
  w.rgthree = {
    addEventListener(): void { return; },
    removeEventListener(): void { return; },
    newLogSession(): { end: () => void } { return { end(): void { return; } }; },
    logger: { log(): void { return; } }
  };
} else {
  w.rgthree.newLogSession = typeof w.rgthree.newLogSession === "undefined" ? function(): { end: () => void } { return { end(): void { return; } }; } : w.rgthree.newLogSession;
}

if (typeof w.NodeTypesString === "undefined") {
  w.NodeTypesString = {};
}

// Initialize window.app extensionManager commands
appObj.extensionManager = typeof appObj.extensionManager === "undefined" ? {
  command: {
    commands: [
      { id: 'Comfy.ExportWorkflowAPI' }
    ]
  }
} : appObj.extensionManager;

if (typeof w.rgthreeConfig === "undefined") {
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
  };
}

if (typeof w.Exposed === "undefined") {
  w.Exposed = (): void => { return; };
}

if (typeof w.CONFIG_SERVICE === "undefined") {
  w.CONFIG_SERVICE = {
    getConfigValue: (): null => null,
    addEventListener: (): void => { return; }
  };
}

if (typeof w.ue_callbacks === "undefined") {
  w.ue_callbacks = {
    register_allnode_callback: (): void => { return; },
    register_allgraph_callback: (): void => { return; }
  };
}

if (typeof w.create === "undefined") {
  w.create = (tag: string, clss: string, parent: HTMLElement | undefined, properties?: Record<string, unknown>): HTMLElement => {
    const nd = document.createElement(tag);
    if (clss) clss.split(" ").forEach((s) => { nd.classList.add(s); });
    if (parent) parent.appendChild(nd);
    if (properties) Object.assign(nd, properties);
    return nd;
  };
}

if (typeof w.createApp === "undefined") {
  interface MockJquery {
    ready: (cb: () => void) => void;
    on: () => void;
    click: () => void;
    val: () => string;
    hide: () => void;
    show: () => void;
    use: () => MockJquery;
    mount: () => MockJquery;
  }
  const mockAppOrJquery = (_arg: unknown): MockJquery => {
    const obj: MockJquery = {
      ready: (cb: () => void): void => { cb(); },
      on(): void { return; },
      click(): void { return; },
      val(): string { return ""; },
      hide(): void { return; },
      show(): void { return; },
      use(): MockJquery { return obj; },
      mount(): MockJquery { return obj; }
    };
    return obj;
  };
  w.createApp = mockAppOrJquery;
  w.j = typeof w.j === "undefined" ? mockAppOrJquery : w.j;
}

if (typeof w.LAYOUT_LABEL_TO_DATA === "undefined") {
  w.LAYOUT_LABEL_TO_DATA = {
    Left: [ 1, [ 0, 0.5 ], [ 0, 0 ] ],
    Right: [ 2, [ 1, 0.5 ], [ -0, 0 ] ],
    Top: [ 3, [ 0.5, 0 ], [ 0, 0 ] ],
    Bottom: [ 4, [ 0.5, 1 ], [ 0, -0 ] ]
  };
}
if (typeof w.LAYOUT_LABEL_OPPOSITES === "undefined") {
  w.LAYOUT_LABEL_OPPOSITES = {
    Left: "Right",
    Right: "Left",
    Top: "Bottom",
    Bottom: "Top"
  };
}
if (typeof w.LAYOUT_CLOCKWISE === "undefined") {
  w.LAYOUT_CLOCKWISE = ["Left", "Top", "Right", "Bottom"];
}

// File upload input auto-mount to prevent null reference on document.getElementById
if (!document.getElementById('comfy-file-input')) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'comfy-file-input';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
}



w.IoDirection = typeof w.IoDirection === "undefined" ? {} : w.IoDirection;
w.addConnectionLayoutSupport = typeof w.addConnectionLayoutSupport === "undefined" ? (((): void => { return; })) : w.addConnectionLayoutSupport;
w.addMenuItem = typeof w.addMenuItem === "undefined" ? (((): void => { return; })) : w.addMenuItem;
w.getSlotLinks = typeof w.getSlotLinks === "undefined" ? (((): unknown[] => [])) : w.getSlotLinks;
w.isValidConnection = typeof w.isValidConnection === "undefined" ? (((): boolean => true)) : w.isValidConnection;
w.setConnectionsLayout = typeof w.setConnectionsLayout === "undefined" ? (((): void => { return; })) : w.setConnectionsLayout;
w.waitForCanvas = typeof w.waitForCanvas === "undefined" ? (((): Promise<void> => Promise.resolve())) : w.waitForCanvas;

import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { WebSocketProvider } from "./comfyui/contexts/WebSocketProvider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { Toaster } from "@/components/ui/sonner"
import { ConfirmProvider } from "./comfyui/contexts/ConfirmContext.tsx"

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found");
}
createRoot(rootEl).render(
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
