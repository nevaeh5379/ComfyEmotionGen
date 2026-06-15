import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';

// 1. Initialize JSDOM to mock browser environment
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head></head>
<body>
  <!-- Essential stub for videoinfo.js and other file input element lookups -->
  <input type="file" id="comfy-file-input" style="display:none;" />
  <canvas id="graph-canvas"></canvas>
</body>
</html>
`, {
  url: "http://127.0.0.1:8000/",
  runScripts: "outside-only",
  resources: "usable"
});

const { window } = dom;

// Export JSDOM globals to the Node.js process environment
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.HTMLInputElement = window.HTMLInputElement;
global.CustomEvent = window.CustomEvent;

window.TextDecoder = global.TextDecoder;
window.TextEncoder = global.TextEncoder;

Object.defineProperty(global, 'navigator', {
  value: window.navigator,
  writable: true,
  configurable: true
});

// Mock requestAnimationFrame and cancelAnimationFrame for script loaders
window.requestAnimationFrame = (callback) => setTimeout(callback, 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);

// 2. Setup LiteGraph Core Mock Classes (Required for easyuse.js and other extensions to not crash immediately)
class LGraph {
  constructor() {
    this._nodes = [];
  }
}
class LGraphNode {
  constructor() {
    this.properties = {};
  }
}
class LGraphCanvas {
  constructor() {
    this.ds = { offset: [0, 0], scale: 1 };
    this.canvas = document.createElement("canvas");
  }
}
class LLink {}
class LGraphGroup {}
class ContextMenu {}

// Basic prototype methods and static arrays to avoid early canvas reference crashes
LGraphCanvas.prototype.getCanvasMenuOptions = () => [];
LGraphCanvas.prototype.getContextMenuOptions = () => [];
LGraphCanvas.prototype.setDirty = () => {};
LGraphCanvas.prototype.addEventListener = () => {};
LGraphCanvas.node_menu_options = [];
LGraphCanvas.canvas_menu_options = [];
LGraphNode.prototype.getMenuOptions = () => [];
LGraphNode.prototype.getContextMenuOptions = () => [];
LGraphNode.prototype.addDOMWidget = function (name, type, element, options = {}) {
  const widget = {
    type,
    name,
    element,
    options: { hideOnZoom: true, ...options },
    _value: options.getValue?.() ?? '',
    value: '',
    callback: null
  };
  Object.defineProperty(widget, 'value', {
    get() {
      return this.options.getValue?.() ?? this._value ?? '';
    },
    set(v) {
      this._value = v;
      if (this.options.setValue) {
        this.options.setValue(v);
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
  this.widgets.push(widget);
  return widget;
};

const LiteGraph = {
  LGraph,
  LGraphNode,
  LGraphCanvas,
  LLink,
  LGraphGroup,
  ContextMenu,
  color_palettes: new Proxy({}, {
    get(target, prop) {
      if (!(prop in target)) {
        target[prop] = {};
      }
      return target[prop];
    }
  }),
  Styles: { obsidian: {} },
  registered_node_types: {},
  registerNodeType: (type, nodeClass) => {
    LiteGraph.registered_node_types[type] = nodeClass;
  },
  getNodeType: (type) => LiteGraph.registered_node_types[type],
  wrapFunction: (obj, name, fn) => {
    if (!obj) return;
    const old = obj[name];
    obj[name] = function(...args) {
      return fn.call(this, old, ...args);
    };
  },
  createNode: (type) => {
    if (type === 'KSampler') {
      return {
        inputs: [
          { name: 'seed', localized_name: 'seed' },
          { name: 'positive', localized_name: 'positive' },
          { name: 'negative', localized_name: 'negative' }
        ]
      };
    }
    const ctor = LiteGraph.registered_node_types[type];
    if (ctor) {
      try { return new ctor(); } catch(e) {}
    }
    return { inputs: [] };
  }
};

window.LiteGraph = LiteGraph;
global.LiteGraph = LiteGraph;

// Expose LiteGraph core classes globally
window.LGraph = LGraph;
window.LGraphNode = LGraphNode;
window.LGraphCanvas = LGraphCanvas;
window.LLink = LLink;
window.LGraphGroup = LGraphGroup;

global.LGraph = LGraph;
global.LGraphNode = LGraphNode;
global.LGraphCanvas = LGraphCanvas;
global.LLink = LLink;
global.LGraphGroup = LGraphGroup;

// 3. Setup ComfyUI Core Front-end Stubs (Required for basic extension registration)
const registeredExtensions = [];

const settingsLookupProxy = new Proxy({
  'Comfy.Locale': {
    onChange: () => {}
  }
}, {
  get(target, prop) {
    if (!(prop in target)) {
      target[prop] = { onChange: () => {} };
    }
    return target[prop];
  }
});

const app = {
  registerExtension: (ext) => {
    console.log(`  -> Registered extension: ${ext.name}`);
    registeredExtensions.push(ext);
  },
  ui: {
    dialogs: {},
    dialog: {
      show: () => {}
    },
    settings: {
      addSetting: () => ({}),
      getSettingValue: () => null,
      setSettingValue: () => {},
      settingsLookup: settingsLookupProxy
    }
  },
  settings: {
    addSetting: () => ({}),
    getSettingValue: () => null,
    setSettingValue: () => {},
    settingsLookup: settingsLookupProxy
  },
  canvas: new LGraphCanvas(),
  graph: new LGraph(),
  extensionManager: {
    command: {
      commands: [
        { id: 'Comfy.ExportWorkflowAPI' }
      ]
    }
  }
};

window.app = app;
global.app = app;

// Global stubs for independent script evaluation inside JSDOM VM context
const mockAppOrJquery = (arg) => {
  const obj = {
    ready: (cb) => cb(),
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
window.j = window.jQuery = window.$ = window.createApp = mockAppOrJquery;
global.j = global.jQuery = global.$ = global.createApp = window.createApp;

window.BaseEditorCanvas = class {};
global.BaseEditorCanvas = window.BaseEditorCanvas;

window.ModelInfoDialog = class {};
global.ModelInfoDialog = window.ModelInfoDialog;

window.ClipspaceDialog = class { static registerButton() {} };
global.ClipspaceDialog = window.ClipspaceDialog;

window.rgthreeConfig = {
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
global.rgthreeConfig = window.rgthreeConfig;

window.RgthreeBaseVirtualNode = class {};
global.RgthreeBaseVirtualNode = window.RgthreeBaseVirtualNode;

window.BaseCollectorNode = class {};
global.BaseCollectorNode = window.BaseCollectorNode;

window.BaseNodeModeChanger = class {};
global.BaseNodeModeChanger = window.BaseNodeModeChanger;

window.BaseFastGroupsModeChanger = class {};
global.BaseFastGroupsModeChanger = window.BaseFastGroupsModeChanger;

window.RgthreeBaseServerNode = class {};
global.RgthreeBaseServerNode = window.RgthreeBaseServerNode;

window.rgthree = {
  addEventListener: () => {},
  removeEventListener: () => {},
  newLogSession: () => ({ end: () => {} }),
  logger: { log: () => {} }
};
global.rgthree = window.rgthree;

window.DynamicContextNodeBase = class {};
global.DynamicContextNodeBase = window.DynamicContextNodeBase;

window.BaseAnyInputConnectedNode = class {};
global.BaseAnyInputConnectedNode = window.BaseAnyInputConnectedNode;

window.BaseContextNode = class {};
global.BaseContextNode = window.BaseContextNode;

window.RgthreeDialog = class {};
global.RgthreeDialog = window.RgthreeDialog;

window.CONFIG_SERVICE = {
  getConfigValue: () => null,
  addEventListener: () => {}
};
global.CONFIG_SERVICE = window.CONFIG_SERVICE;

window.VERSION = "1.0.0";
global.VERSION = window.VERSION;

window.ue_callbacks = {
  register_allnode_callback: () => {},
  register_allgraph_callback: () => {}
};
global.ue_callbacks = window.ue_callbacks;

window.create = (tag, clss, parent, properties) => {
  const nd = document.createElement(tag);
  if (clss) clss.split(" ").forEach((s) => nd.classList.add(s));
  if (parent) parent.appendChild(nd);
  if (properties) Object.assign(nd, properties);
  return nd;
};
global.create = window.create;

window.Pausable = class {};
global.Pausable = window.Pausable;

window.SETTINGS = {};
global.SETTINGS = window.SETTINGS;

window.i18n_functional = (x) => x;
global.i18n_functional = window.i18n_functional;

window.i18ify_settings = (x) => x;
global.i18ify_settings = window.i18ify_settings;

window.settingsCache = {
  getSettingValue: () => null,
  addCallback: () => {}
};
global.settingsCache = window.settingsCache;

window.WILDCARD_COMMANDS = {};
global.WILDCARD_COMMANDS = window.WILDCARD_COMMANDS;

window.TextAreaAutoComplete = class {};
global.TextAreaAutoComplete = window.TextAreaAutoComplete;

window.shared = {};
global.shared = window.shared;

window.NodeTypesString = {};
global.NodeTypesString = window.NodeTypesString;

window.RgthreeBaseWidget = class {};
global.RgthreeBaseWidget = window.RgthreeBaseWidget;

window.LinkRenderController = class {};
global.LinkRenderController = window.LinkRenderController;

window.X = window.X || {};
global.X = window.X;

window.Exposed = () => {};
global.Exposed = window.Exposed;

window.injectCss = () => {};
global.injectCss = window.injectCss;

window.He = {
  use: () => {}
};
global.He = window.He;

window.d = () => {};
global.d = window.d;

window.q = () => ({});
global.q = window.q;

window.LAYOUT_LABEL_TO_DATA = {
  Left: [ 1, [ 0, 0.5 ], [ 0, 0 ] ],
  Right: [ 2, [ 1, 0.5 ], [ -0, 0 ] ],
  Top: [ 3, [ 0.5, 0 ], [ 0, 0 ] ],
  Bottom: [ 4, [ 0.5, 1 ], [ 0, -0 ] ]
};
window.LAYOUT_LABEL_OPPOSITES = {
  Left: "Right",
  Right: "Left",
  Top: "Bottom",
  Bottom: "Top"
};
window.LAYOUT_CLOCKWISE = ["Left", "Top", "Right", "Bottom"];

global.LAYOUT_LABEL_TO_DATA = window.LAYOUT_LABEL_TO_DATA;
global.LAYOUT_LABEL_OPPOSITES = window.LAYOUT_LABEL_OPPOSITES;
global.LAYOUT_CLOCKWISE = window.LAYOUT_CLOCKWISE;

window.IoDirection = {};
window.addConnectionLayoutSupport = () => {};
window.addMenuItem = () => {};
window.getSlotLinks = () => [];
window.isValidConnection = () => true;
window.setConnectionsLayout = () => {};
window.waitForCanvas = () => Promise.resolve();

global.IoDirection = window.IoDirection;
global.addConnectionLayoutSupport = window.addConnectionLayoutSupport;
global.addMenuItem = window.addMenuItem;
global.getSlotLinks = window.getSlotLinks;
global.isValidConnection = window.isValidConnection;
global.setConnectionsLayout = window.setConnectionsLayout;
global.waitForCanvas = window.waitForCanvas;

window.WILDCARD_COMMANDS = {
  command: {}
};
global.WILDCARD_COMMANDS = window.WILDCARD_COMMANDS;

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const api = {
  addEventListener: (type, callback) => {},
  removeEventListener: (type, callback) => {},
  fetchApi: async (url, options) => {
    return {
      ok: true,
      json: async () => ([]),
      text: async () => ""
    };
  },
  getSystemStats: async () => {
    return {
      system: {
        comfyui_version: "1.16.9"
      }
    };
  },
  api_base: BACKEND_URL
};

window.api = api;
global.api = api;

// ComfyUI core UI utilities stubs ($el, addStylesheet, getUrl, etc.)
window.$el = (tag, attrs, children) => {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else {
        el[k] = v;
      }
    }
  }
  return el;
};

window.addStylesheet = (url) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
  return link;
};

window.getUrl = (path, base) => {
  return base ? new URL(path, base).toString() : path;
};

window.ComfyWidgets = {
  STRING: () => ({ widget: { inputEl: {} } }),
  INT: () => ({ widget: { inputEl: {} } }),
  FLOAT: () => ({ widget: { inputEl: {} } }),
  COMBO: () => ({ widget: { inputEl: {} } }),
  BOOLEAN: () => ({ widget: { inputEl: {} } }),
};

window.ComfyApp = class {
  constructor() {}
};

window.ComfyDialog = class {
  constructor() {}
};

window.isBeforeFrontendVersion = () => false;
window.GraphAnalyser = function() {
  this.analyse = () => ({});
};
window.applyContextMenuPatch = () => {};
window.loadCss = () => {};
window.createEditorStylesheet = () => {};

// Add standard browser fetch stub to JSDOM window with HTML fallback protection
const originalFetch = global.fetch;
window.fetch = async (url, options) => {
  const res = await originalFetch(url, options);
  const urlStr = typeof url === 'string' ? url : (url && url.url) ? url.url : '';
  if (res.ok && urlStr && (urlStr.endsWith('.js') || urlStr.endsWith('.css') || urlStr.includes('/extensions/') || urlStr.includes('/rgthree/'))) {
    try {
      const clone = res.clone();
      const text = await clone.text();
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")) {
        // Return simulated 404 response to JSDOM
        return new dom.window.Response("Not Found (HTML SPA Fallback Detected)", {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "text/plain" }
        });
      }
    } catch (e) {}
  }
  return res;
};
global.fetch = window.fetch;

// comfyAPI global helper used by ComfyUI-KJNodes
window.comfyAPI = {
  app: {
    app: app
  },
  api: {
    api: api
  },
  utils: {
    applyTextReplacements: (node, text) => text
  },
  ui: {
    ComfyDialog: class {},
    $el: window.$el,
    ComfyUI: class {}
  },
  widgets: {
    updateControlWidgetLabel() {},
    IS_CONTROL_WIDGET() {},
    addValueControlWidget() {},
    addValueControlWidgets() {},
    ComfyWidgets: window.ComfyWidgets,
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

// BACKEND_URL is used to retrieve the active extensions list.
// FRONTEND_URL represents the actual Vite environment port (5173) which the browser attempts to fetch scripts from.

function transpileESM(code) {
  let cleanCode = code;
  const exportsList = [];

  // Parse export definitions to register them on window
  cleanCode.replace(/\bexport\s+class\s+(\w+)/g, (match, name) => { exportsList.push(name); return match; });
  cleanCode.replace(/\bexport\s+(?:async\s+)?function\s+(\w+)/g, (match, name) => { exportsList.push(name); return match; });
  cleanCode.replace(/\bexport\s+(?:const|let|var)\s+(\w+)/g, (match, name) => { exportsList.push(name); return match; });
  cleanCode.replace(/\bexport\s*\{([\s\S]*?)\}/g, (match, list) => {
    list.split(',').forEach(item => {
      const name = item.trim().split(/\s+as\s+/)[0].trim();
      if (name && /^[a-zA-Z0-9_$]+$/.test(name)) {
        exportsList.push(name);
      }
    });
    return match;
  });

  // 1. Resolve import.meta urls and resolves
  cleanCode = cleanCode.replace(/import\.meta\.resolve\((.*?)\)/g, '$1');
  cleanCode = cleanCode.replace(/import\.meta\.url/g, 'window.location.href');
  cleanCode = cleanCode.replace(/import\.meta/g, '{}');

  // 2. Transpile dynamic import(...) to safe resolved Promise (string arguments only)
  cleanCode = cleanCode.replace(/\bimport\(\s*['"`](.*?)['"`]\s*\)/g, 'Promise.resolve(window)');

  // 3. Strip imports completely
  cleanCode = cleanCode.replace(/\bimport(?:\s+|\{)[^;\n]*?from\s*['"][^'"]+?['"];?/g, '/* import skipped */');
  cleanCode = cleanCode.replace(/\bimport(?:\s+|\{)\s*\{[^}]*\}\s*from\s*['"][^'"]+?['"];?/g, '/* multiline import skipped */');
  cleanCode = cleanCode.replace(/\bimport\s*['"`].*?['"`];?/g, '/* side-effect import skipped */');

  // 4. Strip export keywords and declarations
  cleanCode = cleanCode.replace(/export\b[^;]*?\*\s*from\s*['"][^'"]+?['"];?/g, '/* export * skipped */');
  cleanCode = cleanCode.replace(/export\b[^;]*?from\s*['"][^'"]+?['"];?/g, '/* export from skipped */');
  cleanCode = cleanCode.replace(/export\b\s*\{[^}]*?\};?/g, '/* export braces skipped */');
  cleanCode = cleanCode.replace(/\bexport\s+default\s+/g, '');
  cleanCode = cleanCode.replace(/\bexport\s+(const|let|var|function|class|async\s+function)\b/g, '$1');

  // Build assignments to attach exports to window
  const exportAssignments = exportsList
    .map(name => `try { window.${name} = ${name}; } catch(e) {}`)
    .join('\n');

  // Wrap in async IIFE
  return `(async function() {
    ${cleanCode}
    
    ${exportAssignments}
  }).call(window);`;
}

async function main() {
  console.log(`[Extension Test] Getting extensions from backend: ${BACKEND_URL}`);
  let extensions = [];

  try {
    const res = await fetch(`${BACKEND_URL}/extensions`);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    extensions = await res.json();
    console.log(`[Extension Test] Found ${extensions.length} active extensions from backend.`);
  } catch (err) {
    console.error(`[Extension Test] Failed to fetch extensions from backend: ${err.message}`);
    console.log(`[Extension Test] Please ensure the ComfyUI backend is running at ${BACKEND_URL} or specify BACKEND_URL.`);
    process.exit(1);
  }

  // Filter out core extensions (Vue global context) and Vue/PrimeVue bundled library/assets chunks.
  // We only test actual custom node extension scripts.
  const testExtensions = extensions.filter(url => {
    if (url.includes('/extensions/core/')) return false;
    if (url.includes('/assets/')) return false; // Skip minified chunk files
    if (url.includes('/primevue-')) return false;
    if (url.includes('/vendor-')) return false;
    if (url.includes('/vue-')) return false;
    if (url.includes('/vue.js')) return false;
    return true;
  });
  
  console.log(`[Extension Test] Validating ${testExtensions.length} extensions via frontend port: ${FRONTEND_URL} ...`);

  const results = [];
  const context = dom.getInternalVMContext();

  for (const extUrl of testExtensions) {
    // Attempt to download the script through FRONTEND_URL to mirror browser behavior (Vite port 5173)
    const fullUrl = extUrl.startsWith('http') ? extUrl : `${FRONTEND_URL}${extUrl}`;
    console.log(`\n[Test] Loading extension: ${extUrl} (via ${fullUrl})`);
    try {
      const scriptRes = await fetch(fullUrl);
      if (!scriptRes.ok) {
        throw new Error(`Failed to download script. Status: ${scriptRes.status}`);
      }
      const code = await scriptRes.text();
      if (code.trim().startsWith("<!DOCTYPE") || code.trim().startsWith("<!doctype") || code.trim().startsWith("<html")) {
        throw new Error(`Failed to download script. Server returned HTML instead of Javascript (SPA fallback).`);
      }
      const transpiledCode = transpileESM(code);

      // Run code in JSDOM VM Context
      const result = vm.runInContext(transpiledCode, context, { filename: extUrl });
      if (result && typeof result.then === 'function') {
        await result;
      }
      console.log(`  => Evaluation: PASS`);
      results.push({ url: extUrl, status: "PASS" });
    } catch (err) {
      console.error(`  => Evaluation: FAIL`);
      console.error(`     Error: ${err.message}`);
      if (err.stack) {
        console.error(err.stack.split('\n').slice(0, 5).join('\n'));
      }
      results.push({ url: extUrl, status: "FAIL", error: err.message });
    }
  }

  // 5. Test extension lifecycle hooks (init / setup)
  console.log(`\n[Extension Test] Verifying lifecycle hooks for ${registeredExtensions.length} registered extensions...`);
  for (const ext of registeredExtensions) {
    console.log(`[Lifecycle] Testing: ${ext.name}`);
    if (ext.init) {
      try {
        ext.init(app);
        console.log(`  => init(): PASS`);
      } catch (err) {
        console.error(`  => init(): FAIL`);
        console.error(`     Error: ${err.message}`);
        results.push({ url: `Lifecycle::${ext.name}::init`, status: "FAIL", error: err.message });
      }
    }
    if (ext.setup) {
      try {
        ext.setup(app);
        console.log(`  => setup(): PASS`);
      } catch (err) {
        console.error(`  => setup(): FAIL`);
        console.error(`     Error: ${err.message}`);
        results.push({ url: `Lifecycle::${ext.name}::setup`, status: "FAIL", error: err.message });
      }
    }
  }

  const failed = results.filter(r => r.status === "FAIL");

  console.log("\n==================== TEST SUMMARY ====================");
  console.log(`Total checked items: ${results.length}`);
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFailed items list:");
    failed.forEach(f => {
      console.log(` - [${f.url}]: ${f.error}`);
    });
  }
  console.log("======================================================");

  if (failed.length > 0) {
    console.log("\n[Extension Test] Test failed with errors.");
    process.exit(1);
  } else {
    console.log("\n[Extension Test] All tests passed successfully.");
    process.exit(0);
  }
}

// Global unhandled rejection handler to avoid Node crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
