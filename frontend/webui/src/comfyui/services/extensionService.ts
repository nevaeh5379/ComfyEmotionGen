/**
 * Extension Service (React 포팅)
 * ComfyUI_frontend: src/services/extensionService.ts
 * 커스텀 노드 익스텐션 생명주기 관리
 */

import type { ComfyExtension, SidebarTabExt, ExtensionManager, ToastMessageOptions } from "@/comfyui/types/extensionTypes"
import type { ExecutionErrorWsMessage, NodeError } from "@/comfyui/types/apiSchema"
import type { NodeId } from "@/comfyui/types/workflow"
import { useExtensionStore } from "@/comfyui/stores/extensionStore"
import { api } from "@/comfyui/api"
import { toast } from "sonner"

// ── ExtensionManager implementation ──────────────────────────────

let _sidebarTabs: SidebarTabExt[] = []
let _lastNodeErrors: Record<NodeId, NodeError> | null = null
let _lastExecutionError: ExecutionErrorWsMessage | null = null

export const extensionManager: ExtensionManager = {
  registerSidebarTab(tab: SidebarTabExt) {
    if (!_sidebarTabs.some((t) => t.id === tab.id)) {
      _sidebarTabs.push(tab)
    }
  },

  unregisterSidebarTab(id: string) {
    _sidebarTabs = _sidebarTabs.filter((t) => t.id !== id)
  },

  getSidebarTabs() {
    return _sidebarTabs
  },

  toast: {
    add(msg) {
      if (msg.severity === 'error') {
        toast.error(msg.summary ?? msg.detail ?? 'Error')
      } else if (msg.severity === 'warn') {
        toast.warning(msg.summary ?? msg.detail ?? 'Warning')
      } else if (msg.severity === 'success') {
        toast.success(msg.summary ?? msg.detail ?? 'Success')
      } else {
        toast.info(msg.summary ?? msg.detail ?? 'Info')
      }
    },
    remove(_msg: ToastMessageOptions): void {
      // intentional no-op
    },
    removeAll(): void {
      // intentional no-op
    }
  },

  dialog: {},

  command: {
    commands: [],
    execute(command: string, options?: { errorHandler?: (error: unknown) => void }): void {
      const cmd = this.commands.find((c) => c.id === command)
      if (cmd?.function) {
        try {
          cmd.function()
        } catch (error) {
          options?.errorHandler?.(error)
        }
      }
    }
  },

  setting: {
    get<U = unknown>(_id: string, _typeForGeneric?: U): U | undefined {
      return undefined
    },
    set<U = unknown>(_id: string, _value: U, _typeForGeneric?: U): void {
      // intentional no-op
    }
  },

  workflow: {},

  get lastNodeErrors() {
    return _lastNodeErrors
  },
  set lastNodeErrors(val) {
    _lastNodeErrors = val
  },

  get lastExecutionError() {
    return _lastExecutionError
  },
  set lastExecutionError(val) {
    _lastExecutionError = val
  },

  renderMarkdownToHtml(markdown: string, _baseUrl?: string): string {
    return markdown
  }
}

// ── ExtensionService ─────────────────────────────────────────────

export const extensionService = {
  /**
   * Loads all extensions from the API
   */
  async loadExtensions(): Promise<void> {
    const extensionStore = useExtensionStore.getState()
    void extensionStore

    const extensions = await api.getExtensions()

    await Promise.all(
      extensions.map(async (extUrl) => {
        try {
          const fullUrl = extUrl.startsWith('http')
            ? extUrl
            : api.fileURL(extUrl)
          await import(/* @vite-ignore */ fullUrl)
        } catch (error) {
          console.error('Error loading extension', extUrl, error)
        }
      })
    )
  },

  /**
   * Register an extension
   */
  registerExtension(extension: ComfyExtension): void {
    const store = useExtensionStore.getState()
    store.registerExtension(extension)

    // Register commands
    if (extension.commands) {
      extensionManager.command.commands.push(...extension.commands)
    }
  },

  /**
   * Invoke a synchronous extension callback
   */
  invokeExtensions(
    method: keyof ComfyExtension,
    ...args: unknown[]
  ): unknown[] {
    const results: unknown[] = []
    const { enabledExtensions } = useExtensionStore.getState()

    for (const ext of enabledExtensions) {
      if (method in ext) {
        try {
          const fn = ext[method] as (...a: unknown[]) => unknown
          if (typeof fn === 'function') {
            results.push(fn.call(ext, ...args))
          }
        } catch (error) {
          console.error(
            `Error calling extension '${ext.name}' method '${String(method)}'`,
            error
          )
        }
      }
    }
    return results
  },

  /**
   * Invoke an async extension callback
   */
  async invokeExtensionsAsync(
    method: keyof ComfyExtension,
    ...args: unknown[]
  ): Promise<unknown[]> {
    const { enabledExtensions } = useExtensionStore.getState()

    return await Promise.all(
      enabledExtensions.map(async (ext): Promise<unknown> => {
        try {
          if (method in ext) {
            const fn = ext[method] as (...a: unknown[]) => unknown
            if (typeof fn === 'function') {
              return await fn.call(ext, ...args)
            }
          }
        } catch (error) {
          console.error(
            `Error calling extension '${ext.name}' method '${String(method)}'`,
            error
          )
        }
        return undefined
      })
    )
  }
}
