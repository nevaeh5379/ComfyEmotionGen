/**
 * ComfyUI API Schema 타입
 * ComfyUI_frontend: src/schemas/apiSchema.ts (Zod → plain interface)
 * 커스텀 노드 호환을 위해 필요한 타입 정의
 */

import type { NodeId } from './workflow'

// ── WS message types ──────────────────────────────────────────────

export interface StatusWsMessageStatus {
  exec_info: {
    queue_remaining: number
  }
}

export interface StatusWsMessage {
  status?: StatusWsMessageStatus | null
  sid?: string | null
}

export interface ProgressWsMessage {
  value: number
  max: number
  prompt_id: string
  node: NodeId
}

export interface NodeProgressState {
  value: number
  max: number
  state: 'pending' | 'running' | 'finished' | 'error'
  node_id: NodeId
  prompt_id: string
  display_node_id?: NodeId
  parent_node_id?: NodeId
  real_node_id?: NodeId
}

export interface ProgressStateWsMessage {
  prompt_id: string
  nodes: Record<NodeId, NodeProgressState>
}

export interface ExecutingWsMessage {
  node: NodeId
  display_node: NodeId
  prompt_id: string
}

export interface ResultItem {
  filename?: string
  subfolder?: string
  type?: string
  display_name?: string
}

export interface NodeExecutionOutput {
  audio?: ResultItem[]
  images?: ResultItem[]
  video?: ResultItem[]
  animated?: boolean[]
  text?: string | string[]
  [key: string]: unknown
}

export interface ExecutedWsMessage extends ExecutingWsMessage {
  output: NodeExecutionOutput
  merge?: boolean
}

export interface ExecutionStartWsMessage {
  prompt_id: string
  timestamp: number
}

export interface ExecutionSuccessWsMessage {
  prompt_id: string
  timestamp: number
}

export interface ExecutionCachedWsMessage extends ExecutionStartWsMessage {
  nodes: NodeId[]
}

export interface ExecutionInterruptedWsMessage extends ExecutionStartWsMessage {
  node_id: NodeId
  node_type: string
  executed: NodeId[]
}

export interface ExecutionErrorWsMessage extends ExecutionStartWsMessage {
  node_id: NodeId
  node_type: string
  executed: NodeId[]
  exception_message: string
  exception_type: string
  traceback: string[]
  current_inputs: unknown
  current_outputs: unknown
}

export interface ProgressTextWsMessage {
  nodeId: NodeId
  text: string
  prompt_id?: string
}

export interface NotificationWsMessage {
  value: string
  id?: string
}

export interface TerminalSize {
  cols: number
  row: number
}

export interface LogEntry {
  t: string
  m: string
}

export interface LogsWsMessage {
  size?: TerminalSize
  entries: LogEntry[]
}

export interface LogsRawResponse {
  size: TerminalSize
  entries: LogEntry[]
}

export type FeatureFlagsWsMessage = Record<string, unknown>

export interface AssetDownloadWsMessage {
  task_id: string
  asset_name: string
  bytes_total: number
  bytes_downloaded: number
  progress: number
  status: 'created' | 'running' | 'completed' | 'failed'
  asset_id?: string
  error?: string
}

export interface AssetExportWsMessage {
  task_id: string
  export_name?: string
  assets_total: number
  assets_attempted: number
  assets_failed: number
  bytes_total: number
  bytes_processed: number
  progress: number
  status: 'created' | 'running' | 'completed' | 'failed'
  error?: string
}

// ── Response types ────────────────────────────────────────────────

export type ExtensionsResponse = string[]

export type EmbeddingsResponse = string[]

export interface PromptError {
  type: string
  message: string
  details: string
}

export interface NodeError {
  errors: {
    type: string
    message: string
    details: string
    extra_info?: Record<string, unknown>
  }[]
  class_type: string
  dependent_outputs: unknown[]
}

export interface PromptResponse {
  node_errors?: Record<NodeId, NodeError>
  prompt_id?: string
  exec_info?: {
    queue_remaining?: number
  }
  error?: string | PromptError
}

export interface DeviceStats {
  name: string
  type: string
  index: number
  vram_total: number
  vram_free: number
  torch_vram_total: number
  torch_vram_free: number
}

export interface SystemStats {
  system: {
    os: string
    python_version: string
    embedded_python: boolean
    comfyui_version: string
    deploy_environment?: string
    pytorch_version: string
    required_frontend_version?: string
    argv: string[]
    ram_total: number
    ram_free: number
    cloud_version?: string
    comfyui_frontend_version?: string
    workflow_templates_version?: string
    installed_templates_version?: string
    required_templates_version?: string
    comfy_package_versions?: {
      name: string
      installed: string | null
      required: string | null
    }[]
  }
  devices: DeviceStats[]
}

export interface User {
  storage: 'server'
  migrated?: boolean
  users?: Record<string, string>
}

export interface UserDataFullInfo {
  path: string
  size: number
  modified: number
}

export type Settings = Record<string, unknown>

export type PreviewMethod = 'default' | 'none' | 'auto' | 'latent2rgb' | 'taesd'

export type CustomNodesI18n = Record<string, unknown>

export interface AssetInfo {
  id: string
  name: string
  preview_url: string
  storage_url: string
  model: boolean
  public: boolean
  in_library: boolean
}

export interface ShareableAssetsResponse {
  assets: AssetInfo[]
}

// ── Asset / Model types ───────────────────────────────────────────

export interface ModelFile {
  name: string
  pathIndex: number
}

export interface ModelFolderInfo {
  name: string
  folders: string[]
}
