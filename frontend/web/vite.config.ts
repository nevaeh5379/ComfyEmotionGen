import fs from "node:fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
) as { version: string }

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
    __COMMIT__: JSON.stringify(process.env.CEG_COMMIT || ""),
  },
})
