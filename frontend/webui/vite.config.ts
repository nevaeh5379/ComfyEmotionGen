/* eslint-disable @typescript-eslint/no-unused-vars */
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
    entries: ["./index.html"],
  },
  define: {
    __FRONTEND_VERSION__: JSON.stringify(pkg.version),
    __BUNDLE_VERSION__: JSON.stringify(process.env.CEG_BUNDLE_VERSION || "dev"),
    __COMMIT__: JSON.stringify(resolveCommit()),
    __GITHUB_REPO__: JSON.stringify("nevaeh5379/ComfyEmotionGen"),
    __DEFAULT_BACKEND_PORT__: JSON.stringify(
      process.env.VITE_BACKEND_PORT || "5882"
    ),
  },
  server: {
    proxy: {
      "/ws": {
        target: `ws://localhost:${process.env.VITE_BACKEND_PORT || "5882"}`,
        ws: true,
      },
      // Avoid hardcoding specific custom nodes by proxying everything except Vite/public static assets to the backend
      "^/(?!ws$)": {
        target: `http://localhost:${process.env.VITE_BACKEND_PORT || "5882"}`,
        changeOrigin: true,
        bypass: (req) => {
          const url = req.url || ""
          const cleanUrl = url.split("?")[0].split("#")[0]
          if (
            cleanUrl === "/" ||
            cleanUrl.startsWith("/src/") ||
            cleanUrl.startsWith("/node_modules/") ||
            cleanUrl.startsWith("/@") ||
            cleanUrl.startsWith("/assets/") ||
            cleanUrl.includes("index.html")
          ) {
            return url
          }
          const publicFilePath = path.join(__dirname, "public", cleanUrl)
          if (
            fs.existsSync(publicFilePath) &&
            fs.statSync(publicFilePath).isFile()
          ) {
            return url
          }
          return undefined
        },
      },
    },
  },
})
