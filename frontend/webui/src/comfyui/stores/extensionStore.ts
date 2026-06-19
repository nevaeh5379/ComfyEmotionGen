/**
 * Extension Store (Zustand)
 * ComfyUI_frontend: src/stores/extensionStore.ts
 * 커스텀 노드 익스텐션 등록/관리
 */

import { create } from "zustand"
import type { ComfyExtension } from "@/comfyui/types/extensionTypes"

interface ExtensionState {
  extensions: ComfyExtension[]
  enabledExtensions: ComfyExtension[]
  disabledExtensionNames: string[]

  registerExtension: (ext: ComfyExtension) => void
  loadDisabledExtensionNames: (names: string[]) => void
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  extensions: [],
  enabledExtensions: [],
  disabledExtensionNames: [],

  registerExtension: (ext): void => {
    const { extensions, disabledExtensionNames } = get()
    if (extensions.some((e) => e.name === ext.name)) return

    const updatedExtensions = [...extensions, ext]
    const updatedEnabled = disabledExtensionNames.includes(ext.name)
      ? [...get().enabledExtensions]
      : [...get().enabledExtensions, ext]

    set({
      extensions: updatedExtensions,
      enabledExtensions: updatedEnabled
    })
  },

  loadDisabledExtensionNames: (names): void => {
    const { extensions } = get()
    const disabledSet = new Set(names)
    set({
      disabledExtensionNames: names,
      enabledExtensions: extensions.filter((e) => !disabledSet.has(e.name))
    })
  }
}))
