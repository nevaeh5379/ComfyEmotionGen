
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { LiteGraph, LGraph, LGraphNode, LGraphCanvas, LLink, LGraphGroup } from "comfy-litegraph"

window.LiteGraph = LiteGraph
window.LGraph = LGraph
window.LGraphNode = LGraphNode
window.LGraphCanvas = LGraphCanvas
window.LLink = LLink
window.LGraphGroup = LGraphGroup
window.comfyExtensions = window.comfyExtensions || []

// LocalStorage 오염 복구 가드 및 런타임 후킹
try {
  const key = 'Comfy.Settings.Comfy.CustomColorPalettes';
  
  // 1. 네이티브 로컬 스토리지에 저장되어 있는 값을 즉시 파싱 및 강제 클렌징 (import 완료 전 최초 1회 즉시 보정)
  const raw = window.localStorage.getItem(key);
  if (!raw || raw === 'undefined' || raw === 'null') {
    window.localStorage.setItem(key, '{}');
  } else {
    try {
      let parsed = JSON.parse(raw);
      while (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      if (typeof parsed !== 'object' || parsed === null) {
        window.localStorage.setItem(key, '{}');
      } else {
        window.localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch (e) {
      window.localStorage.setItem(key, '{}');
    }
  }

  // 2. 런타임 동적 후킹: 다른 라이브러리나 런타임 동적 쓰기로 인한 오염 방지
  const originalGetItem = localStorage.getItem.bind(localStorage);
  const originalSetItem = localStorage.setItem.bind(localStorage);

  localStorage.getItem = function(k) {
    const val = originalGetItem(k);
    if (k === key) {
      try {
        if (!val || val === 'undefined' || val === 'null') {
          return '{}';
        }
        let parsed = JSON.parse(val);
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        if (typeof parsed !== 'object' || parsed === null) {
          return '{}';
        }
        return JSON.stringify(parsed);
      } catch (e) {
        return '{}';
      }
    }
    return val;
  };

  localStorage.setItem = function(k, val) {
    if (k === key) {
      try {
        if (!val || val === 'undefined' || val === 'null') {
          originalSetItem(key, '{}');
          return;
        }
        let parsed = JSON.parse(val);
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        if (typeof parsed !== 'object' || parsed === null) {
          originalSetItem(key, '{}');
          return;
        }
        originalSetItem(key, JSON.stringify(parsed));
        return;
      } catch (e) {
        originalSetItem(key, '{}');
        return;
      }
    }
    originalSetItem(k, val);
  };
} catch (e) {
  console.error("Failed to install localStorage hooks", e);
}

;(window.LiteGraph as any).LGraph = LGraph
;(window.LiteGraph as any).LGraphNode = LGraphNode
;(window.LiteGraph as any).LGraphCanvas = LGraphCanvas
;(window.LiteGraph as any).LLink = LLink
;(window.LiteGraph as any).LGraphGroup = LGraphGroup

// Polyfill LGraphNode.prototype.addDOMWidget to support custom HTML/Vue widgets (e.g. LoRA Manager loader UI)
;(LGraphNode.prototype as any).addDOMWidget = function (name: string, type: string, element: HTMLElement, options: any = {}) {
  console.log("[CEG:DEBUG addDOMWidget]", "nodeId=" + this.id, "name=" + name, "type=" + type, "hasElement=" + !!element, "elementTag=" + (element?.tagName || "N/A"), "stack=" + new Error().stack?.split("\n").slice(2, 5).join(" <- "));

  const widget = {
    type: type,
    name: name,
    element: element,
    options: { hideOnZoom: true, ...options },
    _value: options.getValue?.() ?? '',
    value: '',
    callback: null as any
  };

  Object.defineProperty(widget, 'value', {
    get() {
      return this.options.getValue?.() ?? this._value ?? '';
    },
    set(v) {
      this._value = v;
      if (this.options.setValue) {
        try {
          this.options.setValue(v);
        } catch (err) {
          console.warn(`[addDOMWidget] setValue failed for widget "${this.name}":`, err);
        }
      }
      if (this.callback) {
        this.callback(v);
      }
    },
    configurable: true
  });

  if (!this.widgets) {
    this.widgets = [];
  }
  this.widgets.push(widget as any);

  if (options.beforeResize || options.afterResize) {
    const oldResize = this.onResize;
    this.onResize = function(this: any) {
      if (oldResize) (oldResize).apply(this, arguments as any);
      if (options.beforeResize) options.beforeResize.call(widget, this);
      if (options.afterResize) options.afterResize.call(widget, this);
    };
  }

  if (window.app?.syncGraph) {
    window.app.syncGraph();
  }

  return widget as any;
};

// LiteGraph color palettes and Styles stub to avoid theme setting crashes (e.g. obsidian theme setting)
;(window.LiteGraph as any).color_palettes = new Proxy((window.LiteGraph as any).color_palettes || {}, {
  get(target, prop) {
    if (!(prop in target)) {
      target[prop] = {};
    }
    return target[prop];
  }
});
;(window.LiteGraph as any).Styles = (window.LiteGraph as any).Styles || {
  obsidian: {}
};

import { DEFAULT_BACKEND_URL } from "@/lib/runtime"

// Initialize window.api as a persistent EventTarget instance
window.api = window.api || (new EventTarget() as any);
const apiObj = window.api;
apiObj.api_base = apiObj.api_base || DEFAULT_BACKEND_URL;
apiObj.getExtensions = apiObj.getExtensions || (async () => {
  const { comfyApi } = await import("@/comfyui/api");
  return comfyApi.getExtensions();
});
apiObj.getObjectInfo = apiObj.getObjectInfo || (async () => {
  const { comfyApi } = await import("@/comfyui/api");
  return comfyApi.getObjectInfo();
});
const _fetchApiMocks: Record<string, () => Promise<Response>> = {
  "/system_stats": async () => {
    const stats = await apiObj.getSystemStats();
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};

apiObj.fetchApi = apiObj.fetchApi || (async (url: string, options: any) => {
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  const fullUrl = cleanUrl.startsWith("/api/") ? cleanUrl : `/api${cleanUrl}`;
  const route = fullUrl.replace(/^\/api/, "");
  if (_fetchApiMocks[route]) {
    return _fetchApiMocks[route]();
  }
  return fetch(`${apiObj.api_base}${fullUrl}`, options);
});
apiObj.getSystemStats = apiObj.getSystemStats || (async () => {
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
});
apiObj.addEventListener = apiObj.addEventListener || apiObj.addEventListener?.bind(apiObj) || (() => {});
apiObj.removeEventListener = apiObj.removeEventListener || apiObj.removeEventListener?.bind(apiObj) || (() => {});

// Proxy for settingsLookup to dynamically handle any settings access without crashing
const settingsLookupProxy = new Proxy({
  'Comfy.Locale': { onChange() {} }
} as any, {
  get(target, prop) {
    if (!(prop in target)) {
      target[prop] = { onChange() {} };
    }
    return target[prop];
  }
});

// Initialize window.app as a persistent object
window.app = window.app || {} as any
const appObj = window.app
appObj.extensions = appObj.extensions || []
appObj.registerExtension = appObj.registerExtension || function (ext: any) {
  appObj.extensions.push(ext)
}

// app.ui.settings 및 app.settings 의 getSettingValue 안전 후킹 유틸
const installSettingValueHook = (settingsObj: any) => {
  if (!settingsObj) return;
  const originalGet = settingsObj.getSettingValue;
  settingsObj.getSettingValue = function(this: any, id: string) {
    const val = originalGet ? originalGet.call(this, id) : null;
    if (id === 'Comfy.CustomColorPalettes') {
      if (!val || val === 'undefined' || val === 'null') {
        return {};
      }
      if (typeof val === 'string') {
        try {
          let parsed = JSON.parse(val);
          while (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          if (typeof parsed !== 'object' || parsed === null) {
            return {};
          }
          return parsed;
        } catch (e) {
          return {};
        }
      }
    }
    return val;
  };
};

let _installingHook = false;

// api.getSettings 후킹 유틸
const installApiSettingsHook = (apiInstance: any) => {
  if (!apiInstance || _installingHook) return;
  _installingHook = true;
  const originalGetSettings = apiInstance.getSettings;
  apiInstance.getSettings = async function(this: any) {
    const settings = originalGetSettings ? await originalGetSettings.call(this) : {};
    if (settings?.['Comfy.CustomColorPalettes']) {
      const val = settings['Comfy.CustomColorPalettes'];
      if (typeof val === 'string') {
        try {
          let parsed = JSON.parse(val);
          while (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          if (typeof parsed === 'object' && parsed !== null) {
            settings['Comfy.CustomColorPalettes'] = parsed;
          } else {
            settings['Comfy.CustomColorPalettes'] = {};
          }
        } catch (e) {
          settings['Comfy.CustomColorPalettes'] = {};
        }
      }
    }
    return settings;
  };
  _installingHook = false;
};

// window.api.getSettings 동적 바인딩 가드
let _getSettings = apiObj.getSettings;
Object.defineProperty(apiObj, 'getSettings', {
  get() {
    return _getSettings;
  },
  set(newGetSettings) {
    _getSettings = newGetSettings;
    installApiSettingsHook(apiObj);
  },
  configurable: true
});
installApiSettingsHook(apiObj);

// window.app 객체 속성 가드 설치
let _appUi = appObj.ui || {};
let _appSettings = appObj.settings || {};

// 초기 셋업
_appUi.dialogs = _appUi.dialogs || {}
_appUi.dialog = _appUi.dialog || { show() {} }
_appUi.settings = _appUi.settings || {
  addSetting() { return {} },
  getSettingValue() { return null },
  setSettingValue() {},
  settingsLookup: settingsLookupProxy
}
_appSettings.addSetting = _appSettings.addSetting || (() => ({}));
_appSettings.getSettingValue = _appSettings.getSettingValue || (() => null);
_appSettings.setSettingValue = _appSettings.setSettingValue || (() => {});
_appSettings.settingsLookup = _appSettings.settingsLookup || settingsLookupProxy;

installSettingValueHook(_appUi.settings);
installSettingValueHook(_appSettings);

Object.defineProperty(appObj, 'ui', {
  get() {
    return _appUi;
  },
  set(newUi) {
    _appUi = newUi;
    if (newUi) {
      if (newUi.settings) {
        installSettingValueHook(newUi.settings);
      } else {
        let _uiSettings: any = null;
        Object.defineProperty(newUi, 'settings', {
          get() { return _uiSettings; },
          set(ns) {
            _uiSettings = ns;
            installSettingValueHook(ns);
          },
          configurable: true
        });
      }
    }
  },
  configurable: true
});

Object.defineProperty(appObj, 'settings', {
  get() {
    return _appSettings;
  },
  set(newSettings) {
    _appSettings = newSettings;
    installSettingValueHook(newSettings);
  },
  configurable: true
});

appObj.graph = appObj.graph || new LGraph()
appObj.canvas = appObj.canvas || new LGraphCanvas(document.createElement("canvas"), appObj.graph)
appObj.syncGraph = appObj.syncGraph || async function () {
  const { useReactGraphStore } = await import("@/comfyui/stores/reactGraphStore")
  useReactGraphStore.getState().syncGraphFromLive()
}

// 필수 브라우저 글로벌 스텁 설정 (ComfyUI 커스텀 노드가 참조하는 글로벌 변수들)
const w = window as any
if (!w.$el) {
  w.$el = (tag: string, attrs: any, children: any) => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style' && typeof v === 'object') {
          Object.assign(el.style, v);
        } else {
          (el as any)[k] = v;
        }
      }
    }
    return el;
  };
}

if (!w.addStylesheet) {
  w.addStylesheet = (url: string) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
    return link;
  };
}

if (!w.getUrl) {
  w.getUrl = (path: string, base: any) => {
    return base ? new URL(path, base).toString() : path;
  };
}

if (!w.ComfyWidgets) {
  w.ComfyWidgets = {
    STRING: () => ({ widget: { inputEl: {} } }),
    INT: () => ({ widget: { inputEl: {} } }),
    FLOAT: () => ({ widget: { inputEl: {} } }),
    COMBO: () => ({ widget: { inputEl: {} } }),
    BOOLEAN: () => ({ widget: { inputEl: {} } }),
  };
}

if (!w.ComfyApp) {
  w.ComfyApp = class {
    constructor() {}
  };
}

if (!w.ComfyDialog) {
  w.ComfyDialog = class {
    constructor() {}
  };
}

if (!w.ClipspaceDialog) {
  w.ClipspaceDialog = class {
    constructor() {}
  };
}

if (!w.isBeforeFrontendVersion) {
  w.isBeforeFrontendVersion = () => false;
}

if (!w.comfyAPI) {
  w.comfyAPI = {
    app: {
      app: window.app
    },
    api: {
      api: window.api || {}
    },
    utils: {
      applyTextReplacements: (node: any, text: string) => text
    },
    ui: {
      ComfyDialog: class {},
      $el: w.$el,
      ComfyUI: class {}
    },
    widgets: {
      updateControlWidgetLabel() {},
      IS_CONTROL_WIDGET() {},
      addValueControlWidget() {},
      addValueControlWidgets() {},
      ComfyWidgets: w.ComfyWidgets || {},
      isValidWidgetType() {}
    },
    widgetInputs: {
      PrimitiveNode: class {},
      getWidgetConfig: () => ({}),
      convertToInput: () => {},
      setWidgetConfig: () => {},
      mergeIfValid: () => {}
    },
    groupNode: {
      GroupNodeConfig: class {
        static registerFromWorkflow() { return Promise.resolve(); }
      },
      GroupNodeHandler: class {}
    },
    pnginfo: {
      getPngMetadata: () => Promise.resolve({}),
      getWebpMetadata: () => Promise.resolve({})
    }
  };
}

if (!w.ClipspaceDialog) {
  w.ClipspaceDialog = class {
    static registerButton() {}
  };
} else {
  ;(w.ClipspaceDialog).registerButton = (w.ClipspaceDialog).registerButton || function() {}
}

if (w.LGraphCanvas) {
  w.LGraphCanvas.prototype.setDirty = w.LGraphCanvas.prototype.setDirty || function() {}
  w.LGraphCanvas.prototype.addEventListener = w.LGraphCanvas.prototype.addEventListener || function() {}
}

if (!w.rgthree) {
  w.rgthree = {
    addEventListener() {},
    removeEventListener() {},
    newLogSession() { return { end() {} }; },
    logger: { log() {} }
  };
} else {
  w.rgthree.newLogSession = w.rgthree.newLogSession || function() { return { end() {} }; }
}

if (!w.NodeTypesString) {
  w.NodeTypesString = {};
}

// Initialize window.app extensionManager commands
appObj.extensionManager = appObj.extensionManager || {
  command: {
    commands: [
      { id: 'Comfy.ExportWorkflowAPI' }
    ]
  }
}

if (!w.rgthreeConfig) {
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

if (!w.Exposed) {
  w.Exposed = () => {}
}

if (!w.CONFIG_SERVICE) {
  w.CONFIG_SERVICE = {
    getConfigValue: () => null,
    addEventListener: () => {}
  }
}

if (!w.ue_callbacks) {
  w.ue_callbacks = {
    register_allnode_callback: () => {},
    register_allgraph_callback: () => {}
  }
}

if (!w.create) {
  w.create = (tag: string, clss: string, parent: HTMLElement, properties: any) => {
    const nd = document.createElement(tag);
    if (clss) clss.split(" ").forEach((s) => { nd.classList.add(s); });
    if (parent) parent.appendChild(nd);
    if (properties) Object.assign(nd, properties);
    return nd;
  }
}

if (!w.createApp) {
  const mockAppOrJquery = (arg: any) => {
    const obj: any = {
      ready: (cb: any) => cb(),
      on: () => {},
      click: () => {},
      val: () => "",
      hide: () => {},
      show: () => {},
      use: () => obj,
      mount: () => obj
    };
    return obj;
  };
  w.createApp = mockAppOrJquery;
  w.j = w.j || mockAppOrJquery;
}

if (!w.LAYOUT_LABEL_TO_DATA) {
  w.LAYOUT_LABEL_TO_DATA = {
    Left: [ 1, [ 0, 0.5 ], [ 0, 0 ] ],
    Right: [ 2, [ 1, 0.5 ], [ -0, 0 ] ],
    Top: [ 3, [ 0.5, 0 ], [ 0, 0 ] ],
    Bottom: [ 4, [ 0.5, 1 ], [ 0, -0 ] ]
  };
}
if (!w.LAYOUT_LABEL_OPPOSITES) {
  w.LAYOUT_LABEL_OPPOSITES = {
    Left: "Right",
    Right: "Left",
    Top: "Bottom",
    Bottom: "Top"
  };
}
if (!w.LAYOUT_CLOCKWISE) {
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



w.IoDirection = w.IoDirection || {};
w.addConnectionLayoutSupport = w.addConnectionLayoutSupport || (() => {});
w.addMenuItem = w.addMenuItem || (() => {});
w.getSlotLinks = w.getSlotLinks || (() => []);
w.isValidConnection = w.isValidConnection || (() => true);
w.setConnectionsLayout = w.setConnectionsLayout || (() => {});
w.waitForCanvas = w.waitForCanvas || (() => Promise.resolve());

import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { WebSocketProvider } from "./comfyui/contexts/WebSocketProvider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { Toaster } from "@/components/ui/sonner"
import { ConfirmProvider } from "./comfyui/contexts/ConfirmContext.tsx"

createRoot(document.getElementById("root")!).render(
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
