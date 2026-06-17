import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8")
) as { version: string }

function resolveCommit(): string {
  if (process.env.CEG_COMMIT) return process.env.CEG_COMMIT
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname })
      .toString()
      .trim()
  } catch {
    return ""
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    entries: [
      "./index.html"
    ]
  },
  resolve: {
    alias: [
      { find: "@/renderer/core/layout/operations/layoutMutations", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/layout.ts") },
      { find: "@/renderer/core/layout/types", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/layout.ts") },
      { find: "@/stores/previewExposureStore", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/stores.ts") },
      { find: "@/stores/widgetValueStore", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/stores.ts") },
      { find: "@/utils/graphTraversalUtil", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/utils.ts") },
      { find: "@/utils/uuid", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/utils.ts") },
      { find: "@/utils/colorUtil", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/utils.ts") },
      { find: "@/types/widgetId", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/types.ts") },
      { find: "@/types/widgetState", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/types.ts") },
      { find: "@/core/schemas/promotionSchema", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/types.ts") },
      { find: "@/renderer/core/canvas/litegraph/litegraphLinkAdapter", replacement: path.resolve(__dirname, "./packages/litegraph/src/renderer/core/canvas/litegraph/litegraphLinkAdapter.ts") },
      { find: "@/renderer/core/canvas/pathRenderer", replacement: path.resolve(__dirname, "./packages/litegraph/src/renderer/core/canvas/pathRenderer.ts") },
      { find: "@/renderer/core/canvas/litegraph/slotCalculations", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/slotCalculations.ts") },
      { find: /.*subgraphUtils.*/, replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/subgraphUtils.ts") },
      { find: "@/lib/litegraph/src", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src") },
      { find: "@/i18n", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/i18n.ts") },
      { find: "@/renderer/core/canvas/useAutoPan", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/useAutoPan.ts") },
      { find: "@/base", replacement: path.resolve(__dirname, "./packages/litegraph/src/base") },
      { find: "@/renderer/core/layout/store/layoutStore", replacement: path.resolve(__dirname, "./packages/litegraph/src/lib/litegraph/src/mocks/layout.ts") },
      { find: "@/core", replacement: path.resolve(__dirname, "./packages/litegraph/src/core") },
      { find: "@/types", replacement: path.resolve(__dirname, "./packages/litegraph/src/types") },
      { find: "@/constants", replacement: path.resolve(__dirname, "./packages/litegraph/src/constants") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
  define: {
    __FRONTEND_VERSION__: JSON.stringify(pkg.version),
    __BUNDLE_VERSION__: JSON.stringify(process.env.CEG_BUNDLE_VERSION || "dev"),
    __COMMIT__: JSON.stringify(resolveCommit()),
    __GITHUB_REPO__: JSON.stringify("nevaeh5379/ComfyEmotionGen"),
    // Default backend port — overridden at build time via VITE_BACKEND_PORT=8080 npm run build
    __DEFAULT_BACKEND_PORT__: JSON.stringify(process.env.VITE_BACKEND_PORT || "8000"),
  },
  server: {
    proxy: {
      "/object_info": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/extensions": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/kjweb_async": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
})
