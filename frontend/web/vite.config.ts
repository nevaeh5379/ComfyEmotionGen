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
    },
  },
  optimizeDeps: {
    include: ["litegraph.js"],
  },
  define: {
    __FRONTEND_VERSION__: JSON.stringify(pkg.version),
    __BUNDLE_VERSION__: JSON.stringify(process.env.CEG_BUNDLE_VERSION || "dev"),
    __COMMIT__: JSON.stringify(resolveCommit()),
    __GITHUB_REPO__: JSON.stringify("nevaeh5379/ComfyEmotionGen"),
  },
})
