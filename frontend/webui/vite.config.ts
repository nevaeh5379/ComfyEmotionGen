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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@comfy-graph": path.resolve(__dirname, "./src/lib/comfy-graph"),
      "@/lib/litegraph/src": path.resolve(__dirname, "./src/lib/comfy-graph/core"),
      "@/renderer": path.resolve(__dirname, "./src/lib/comfy-graph/core"),
      "@/utils": path.resolve(__dirname, "./src/lib/comfy-graph/core/utils"),
    },
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
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
})
