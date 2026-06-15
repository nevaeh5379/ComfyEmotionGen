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
  }
}
class LLink {}
class LGraphGroup {}
class ContextMenu {}

// Basic prototype methods and static arrays to avoid early canvas reference crashes
LGraphCanvas.prototype.getCanvasMenuOptions = () => [];
LGraphCanvas.prototype.getContextMenuOptions = () => [];
LGraphCanvas.node_menu_options = [];
LGraphCanvas.canvas_menu_options = [];
LGraphNode.prototype.getMenuOptions = () => [];
LGraphNode.prototype.getContextMenuOptions = () => [];

const LiteGraph = {
  LGraph,
  LGraphNode,
  LGraphCanvas,
  LLink,
  LGraphGroup,
  ContextMenu,
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
      addSetting: () => ({})
    }
  },
  settings: {
    addSetting: () => ({})
  },
  canvas: new LGraphCanvas(),
  graph: new LGraph()
};

window.app = app;
global.app = app;

const api = {
  addEventListener: (type, callback) => {},
  removeEventListener: (type, callback) => {},
  fetchApi: async (url, options) => {
    return {
      ok: true,
      json: async () => [],
      text: async () => ""
    };
  },
  api_base: ""
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
  STRING: () => {},
  INT: () => {},
  FLOAT: () => {},
  COMBO: () => {},
  BOOLEAN: () => {},
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

// Add standard browser fetch stub to JSDOM window
window.fetch = global.fetch;

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
  }
};

// 4. Fetch and run extensions
// BACKEND_URL is used to retrieve the active extensions list.
// FRONTEND_URL represents the actual Vite environment port (5173) which the browser attempts to fetch scripts from.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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

  // Strip imports completely because they will fall back to global window inside 'with (window)'
  cleanCode = cleanCode.replace(/import\b[\s\S]*?from\s*['"][^'"]*?['"];?/g, '/* import skipped */');
  cleanCode = cleanCode.replace(/import\s*['"][^'"]*?['"];?/g, '/* side-effect import skipped */');

  // Strip export keywords
  cleanCode = cleanCode.replace(/\bexport\s+default\s+/g, '');
  cleanCode = cleanCode.replace(/\bexport\s+(const|let|var|function|class|async\s+function)\b/g, '$1');
  cleanCode = cleanCode.replace(/\bexport\s*\{([\s\S]*?)\};?/g, '/* exported declaration */');

  // Transpile dynamic import(...) to safe resolved Promise
  cleanCode = cleanCode.replace(/\bimport\((.*?)\)/g, 'Promise.resolve(window)');

  // Resolve import.meta urls and resolves
  cleanCode = cleanCode.replace(/import\.meta\.resolve\((.*?)\)/g, '$1');
  cleanCode = cleanCode.replace(/\bimport\.meta\.url\b/g, 'window.location.href');
  cleanCode = cleanCode.replace(/\bimport\.meta\b/g, '{}');

  // Build assignments to attach exports to window
  const exportAssignments = exportsList
    .map(name => `try { window.${name} = ${name}; } catch(e) {}`)
    .join('\n');

  // Wrap in async IIFE with a 'with (window)' block.
  // 'with (window)' avoids duplicate variable declaration crashes (like const {app} = comfyAPI.app)
  // while fallback-accessing mock globals correctly.
  return `(async function() {
    with (window) {
      ${cleanCode}
    }
    
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
