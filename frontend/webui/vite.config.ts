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
    alias: [
      {
        find: /^@\/(.*)$/,
        replacement: "$1",
        async customResolver(source, importer, options) {
          if (importer && importer.includes("packages/litegraph")) {
            if (source === "stores/widgetValueStore" || source === "stores/previewExposureStore") {
              return path.resolve(__dirname, "src/comfyui/mocks/stores.ts");
            }
            if (source === "renderer/core/layout/operations/layoutMutations" || source === "renderer/core/layout/types") {
              return path.resolve(__dirname, "src/comfyui/mocks/layout.ts");
            }
            if (source === "renderer/core/canvas/litegraph/litegraphLinkAdapter" || source === "renderer/core/canvas/litegraph/slotCalculations") {
              return path.resolve(__dirname, "src/comfyui/mocks/types.ts");
            }
            if (source === "i18n") {
              return path.resolve(__dirname, "src/comfyui/mocks/i18n.ts");
            }
            if (source.startsWith("lib/litegraph/src/")) {
              const subPath = source.substring("lib/litegraph/src/".length);
              const isDistImporter = importer.includes("packages/litegraph/src/lib/litegraph/dist");
              const targetPath = path.resolve(
                __dirname,
                isDistImporter
                  ? "packages/litegraph/src/lib/litegraph/dist"
                  : "packages/litegraph/src/lib/litegraph/src",
                subPath
              );
              const resolved = await this.resolve(targetPath, importer, {
                skipSelf: true,
                ...options,
              });
              return resolved || targetPath;
            }
            if (source === "utils/formatUtil") {
              return path.resolve(
                __dirname,
                "packages/litegraph/packages/shared-frontend-utils/src/formatUtil.ts"
              );
            }
            if (source === "utils/networkUtil") {
              return path.resolve(
                __dirname,
                "packages/litegraph/packages/shared-frontend-utils/src/networkUtil.ts"
              );
            }
            const resolvedPath = path.resolve(
              __dirname,
              "packages/litegraph/src",
              source
            );
            const resolved = await this.resolve(resolvedPath, importer, {
              skipSelf: true,
              ...options,
            });
            return resolved || resolvedPath;
          }
          
          // Default: map to webui's src/...
          const resolvedPath = path.resolve(__dirname, "./src", source);
          const resolved = await this.resolve(resolvedPath, importer, {
            skipSelf: true,
            ...options,
          });
          return resolved || resolvedPath;
        }
      }
    ]
  },
  optimizeDeps: {
    entries: [
      "./index.html"
    ]
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
