/**
 * Extension system 타입
 * ComfyUI_frontend: src/types/extensionTypes.ts + src/types/comfy.ts
 * 커스텀 노드 extensionManager 호환을 위한 타입 정의
 */

import type { LGraphCanvas, LGraphNode } from 'comfy-litegraph'
import type { ComfyNodeDef } from './nodeDef'
import type { ComfyWorkflowJSON, NodeId } from './workflow'
import type {
  ExecutionErrorWsMessage,
  NodeError
} from './apiSchema'

// ── Extension Manager ─────────────────────────────────────────────

export interface ToastMessageOptions {
  severity?: 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast'
  summary?: string
  detail?: string
  closable?: boolean
  life?: number
  group?: string
  styleClass?: string | string[] | Record<string, boolean>
  contentStyleClass?: string | string[] | Record<string, boolean>
}

export interface ToastManager {
  add(message: ToastMessageOptions): void
  remove(message: ToastMessageOptions): void
  removeAll(): void
}

export interface ComfyCommand {
  id: string
  label?: string
  icon?: string
  function?: (...args: unknown[]) => void
  [key: string]: unknown
}

export interface CommandManager {
  commands: ComfyCommand[]
  execute(
    command: string,
    options?: {
      errorHandler?: (error: unknown) => void
      metadata?: Record<string, unknown>
    }
  ): void
}

export interface SidebarTabExtension {
  id: string
  title: string
  icon?: string
  iconBadge?: string | (() => string | null)
  tooltip?: string
  label?: string
}

export interface BottomPanelExtension {
  id: string
  title?: string
  titleKey?: string
  targetPanel?: 'terminal' | 'shortcuts'
}

export interface VueExtension {
  id: string
  type: 'vue'
  component: unknown
}

export interface CustomExtension {
  id: string
  type: 'custom'
  render: (container: HTMLElement) => void
  destroy?: () => void
}

export type SidebarTabExt = SidebarTabExtension &
  (VueExtension | CustomExtension)
export type BottomPanelExt = BottomPanelExtension &
  (VueExtension | CustomExtension)

export interface ExtensionManager {
  registerSidebarTab(tab: SidebarTabExt): void
  unregisterSidebarTab(id: string): void
  getSidebarTabs(): SidebarTabExt[]

  toast: ToastManager
  dialog: {
    showErrorDialog?: (error: unknown, options?: Record<string, unknown>) => void
    [key: string]: unknown
  }
  command: CommandManager
  setting: {
    get: <T = unknown>(id: string) => T | undefined
    set: <T = unknown>(id: string, value: T) => void
  }
  workflow: {
    activeWorkflow?: unknown
    [key: string]: unknown
  }

  lastNodeErrors: Record<NodeId, NodeError> | null
  lastExecutionError: ExecutionErrorWsMessage | null

  renderMarkdownToHtml(markdown: string, baseUrl?: string): string
}

// ── ComfyExtension (커스텀 노드 Extension 인터페이스) ────────────

export interface AboutPageBadge {
  label: string
  url: string
  icon: string
  severity?: 'danger' | 'warn'
}

export interface TopbarBadge {
  text: string
  label?: string
  variant?: 'info' | 'warning' | 'error'
  icon?: string
  tooltip?: string
}

export interface ActionBarButton {
  icon: string
  label?: string
  tooltip?: string
  class?: string
  onClick: () => void
}

export type MissingNodeType =
  | string
  | {
      type: string
      nodeId?: string | number
      cnrId?: string
      hint?: string
      action?: {
        text: string
        callback: () => void
      }
      isReplaceable?: boolean
      replacement?: unknown
    }

export interface ComfyExtension {
  name: string
  commands?: ComfyCommand[]
  keybindings?: unknown[]
  menuCommands?: Array<{ path: string[]; commands: string[] }>
  settings?: unknown[]
  bottomPanelTabs?: BottomPanelExt[]
  aboutPageBadges?: AboutPageBadge[]
  topbarBadges?: TopbarBadge[]
  actionBarButtons?: ActionBarButton[]

  init?(app: unknown): Promise<void> | void
  setup?(app: unknown): Promise<void> | void

  addCustomNodeDefs?(
    defs: Record<string, ComfyNodeDef>,
    app: unknown
  ): Promise<void> | void

  getCustomWidgets?(
    app: unknown
  ): Promise<Record<string, unknown>> | Record<string, unknown>

  getSelectionToolboxCommands?(selectedItem: unknown): string[]
  getCanvasMenuItems?(canvas: LGraphCanvas): (unknown | null)[]
  getNodeMenuItems?(node: LGraphNode): (unknown | null)[]

  beforeRegisterNodeDef?(
    nodeType: typeof LGraphNode,
    nodeData: ComfyNodeDef,
    app: unknown
  ): Promise<void> | void

  beforeRegisterVueAppNodeDefs?(defs: ComfyNodeDef[], app: unknown): void

  registerCustomNodes?(app: unknown): Promise<void> | void
  loadedGraphNode?(node: LGraphNode, app: unknown): void
  nodeCreated?(node: LGraphNode, app: unknown): void

  beforeConfigureGraph?(
    graphData: ComfyWorkflowJSON,
    missingNodeTypes: MissingNodeType[],
    app: unknown
  ): Promise<void> | void

  afterConfigureGraph?(
    missingNodeTypes: MissingNodeType[],
    app: unknown
  ): Promise<void> | void

  onAuthUserResolved?(user: { id: string }, app: unknown): Promise<void> | void
  onAuthTokenRefreshed?(): Promise<void> | void
  onAuthUserLogout?(): Promise<void> | void

  [key: string]: unknown
}
