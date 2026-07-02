/**
 * ComfyUI API Client (React 포팅)
 * ComfyUI_frontend: src/scripts/api.ts
 *
 * 커스텀 노드 호환을 위해 전체 API 표면 유지.
 * - Vue/Pinia/Firebase 의존성 제거
 * - CEG 백엔드 URL 사용
 * - EventTarget 기반 이벤트 시스템
 */

import { get } from "es-toolkit/compat"
import { trimEnd } from "es-toolkit"
import type { ModelFile, ModelFolderInfo } from "@/comfyui/types/apiSchema"
import type {
  AssetDownloadWsMessage,
  AssetExportWsMessage,
  CustomNodesI18n,
  EmbeddingsResponse,
  ExecutedWsMessage,
  ExecutingWsMessage,
  ExecutionCachedWsMessage,
  ExecutionErrorWsMessage,
  ExecutionInterruptedWsMessage,
  ExecutionStartWsMessage,
  ExecutionSuccessWsMessage,
  ExtensionsResponse,
  FeatureFlagsWsMessage,
  LogsRawResponse,
  LogsWsMessage,
  NotificationWsMessage,
  PreviewMethod,
  ProgressStateWsMessage,
  ProgressTextWsMessage,
  ProgressWsMessage,
  PromptResponse,
  Settings,
  StatusWsMessage,
  StatusWsMessageStatus,
  SystemStats,
  User,
  UserDataFullInfo,
  ShareableAssetsResponse,
} from "@/comfyui/types/apiSchema"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"
import type {
  ComfyApiWorkflow,
  ComfyWorkflowJSON,
  NodeId,
} from "@/comfyui/types/workflow"
import { DEFAULT_BACKEND_URL } from "@/lib/runtime"
import { toast } from "sonner"

// ── Feature flags ─────────────────────────────────────────────────

const defaultClientFeatureFlags: Record<string, boolean> = {
  supports_preview_metadata: true,
  supports_manager_v4_ui: true,
  supports_progress_text_metadata: true,
}

// ── Types ─────────────────────────────────────────────────────────

interface QueuePromptRequestBody {
  client_id: string
  prompt: ComfyApiWorkflow
  partial_execution_targets?: string[]
  extra_data: {
    extra_pnginfo: {
      workflow: ComfyWorkflowJSON
    }
    auth_token_comfy_org?: string
    api_key_comfy_org?: string
    comfy_usage_source?: string
    preview_method?: PreviewMethod
  }
  front?: boolean
  number?: number
}

interface QueuePromptOptions {
  partialExecutionTargets?: string[]
  previewMethod?: PreviewMethod
}

/** Dictionary of Frontend-generated API calls */
interface FrontendApiCalls {
  graphChanged: ComfyWorkflowJSON
  promptQueueing: { requestId: number; batchCount: number; number?: number }
  promptQueued: { number: number; batchCount: number; requestId?: number }
  graphCleared: never
  reconnecting: never
  reconnected: never
}

/** Dictionary of calls originating from ComfyUI core */
interface BackendApiCalls {
  progress: ProgressWsMessage
  executing: ExecutingWsMessage
  executed: ExecutedWsMessage
  status: StatusWsMessage
  notification: NotificationWsMessage
  execution_start: ExecutionStartWsMessage
  execution_success: ExecutionSuccessWsMessage
  execution_error: ExecutionErrorWsMessage
  execution_interrupted: ExecutionInterruptedWsMessage
  execution_cached: ExecutionCachedWsMessage
  logs: LogsWsMessage
  /** Binary preview/progress data */
  b_preview: Blob
  /** Binary preview with metadata (node_id, job_id) */
  b_preview_with_metadata: {
    blob: Blob
    nodeId: string
    parentNodeId: string
    displayNodeId: string
    realNodeId: string
    jobId: string
  }
  progress_text: ProgressTextWsMessage
  progress_state: ProgressStateWsMessage
  feature_flags: FeatureFlagsWsMessage
  asset_download: AssetDownloadWsMessage
  asset_export: AssetExportWsMessage
}

interface ApiCalls extends BackendApiCalls, FrontendApiCalls {}

interface ApiMessage<T extends keyof ApiCalls> {
  type: T
  data: ApiCalls[T]
}

type Unionize<T> = T[keyof T]

type ApiMessageUnion = Unionize<{
  [Key in keyof ApiCalls]: ApiMessage<Key>
}>

type AsCustomEvents<T> = {
  readonly [K in keyof T]: CustomEvent<T[K]>
}

type ApiToEventType<T = ApiCalls> = {
  [K in keyof T]: K extends "status"
    ? StatusWsMessageStatus
    : K extends "executing"
      ? NodeId
      : T[K]
}

type ApiEventTypes = ApiToEventType
type ApiEvents = AsCustomEvents<ApiEventTypes>

// ── Errors ─────────────────────────────────────────────────────────

export class UnauthorizedError extends Error {}

export class PromptExecutionError extends Error {
  response: PromptResponse
  status: number | undefined

  constructor(response: PromptResponse, status?: number) {
    super("Prompt execution failed")
    this.response = response
    this.status = status
  }

  override toString(): string {
    let message = ""
    if (typeof this.response.error === "string") {
      message += this.response.error
    } else if (this.response.error) {
      message +=
        this.response.error.message + ": " + this.response.error.details
    }

    for (const [, nodeError] of Object.entries(
      this.response.node_errors ?? {}
    )) {
      message += "\n" + nodeError.class_type + ":"
      for (const errorReason of nodeError.errors) {
        message += "\n    - " + errorReason.message + ": " + errorReason.details
      }
    }

    return message
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function addHeaderEntry(
  headers: HeadersInit,
  key: string,
  value: string
): void {
  if (Array.isArray(headers)) {
    headers.push([key, value])
  } else if (headers instanceof Headers) {
    headers.set(key, value)
  } else {
    headers[key] = value
  }
}

function getDevOverride(_flagKey: string): unknown {
  return undefined
}

async function readJsonOrDefault<T>(
  response: Response,
  fallback: T,
  label: string
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!response.ok || !contentType.includes("application/json")) {
    console.warn(
      `[ComfyApi] ${label} returned ${String(response.status)} ${
        response.statusText || "non-JSON response"
      }`
    )
    return fallback
  }
  try {
    return (await response.json()) as T
  } catch (err) {
    console.warn(`[ComfyApi] Failed to parse JSON from ${label}:`, err)
    return fallback
  }
}

// ── ComfyApi class ────────────────────────────────────────────────

export class ComfyApi extends EventTarget {
  private _registered = new Set<string>()
  api_host: string
  api_base: string
  initialClientId: string | null
  clientId?: string
  user: string
  socket: WebSocket | null = null
  reportedUnknownMessageTypes = new Set<string>()
  serverFeatureFlags: Record<string, unknown> = {}
  authToken?: string
  apiKey?: string

  constructor() {
    super()
    this.user = ""
    this.api_host = location.host
    this.api_base = DEFAULT_BACKEND_URL
    this.initialClientId = sessionStorage.getItem("clientId")
  }

  getClientFeatureFlags(): Record<string, boolean> {
    return { ...defaultClientFeatureFlags }
  }

  internalURL(route: string): string {
    return this.api_base + "/internal" + route
  }

  apiURL(route: string): string {
    return this.api_base + route
  }

  fileURL(route: string): string {
    return this.api_base + route
  }

  async fetchApi(route: string, options?: RequestInit): Promise<Response> {
    const headers: HeadersInit = options?.headers ?? {}
    addHeaderEntry(headers, "Comfy-User", this.user)
    return fetch(this.apiURL(route), {
      cache: "no-cache",
      ...options,
      headers,
    })
  }

  // ── Event system ────────────────────────────────────────────────

  override addEventListener<TEvent extends string>(
    type: TEvent,
    callback:
      | (TEvent extends keyof ApiEvents
          ? (event: ApiEvents[TEvent]) => void
          : EventListenerOrEventListenerObject)
      | null,
    options?: AddEventListenerOptions | boolean
  ): void {
    super.addEventListener(type, callback as EventListener, options)
    this._registered.add(type)
  }

  override removeEventListener<TEvent extends string>(
    type: TEvent,
    callback:
      | (TEvent extends keyof ApiEvents
          ? (event: ApiEvents[TEvent]) => void
          : EventListenerOrEventListenerObject)
      | null,
    options?: EventListenerOptions | boolean
  ): void {
    super.removeEventListener(type, callback as EventListener, options)
  }

  addCustomEventListener(
    type: string,
    callback: ((event: CustomEvent<unknown>) => void) | null,
    options?: AddEventListenerOptions | boolean
  ): void {
    super.addEventListener(type, callback as EventListener, options)
    this._registered.add(type)
  }

  removeCustomEventListener(
    type: string,
    callback: ((event: CustomEvent<unknown>) => void) | null,
    options?: EventListenerOptions | boolean
  ): void {
    super.removeEventListener(type, callback as EventListener, options)
  }

  dispatchCustomEvent<T extends keyof ApiEventTypes>(
    type: T,
    detail?: ApiEventTypes[T]
  ): boolean {
    const event =
      detail === undefined
        ? new CustomEvent(type)
        : new CustomEvent(type, { detail })
    return super.dispatchEvent(event)
  }

  override dispatchEvent(event: never): boolean {
    return super.dispatchEvent(event)
  }

  // ── Polling fallback ────────────────────────────────────────────

  private _pollQueue(): void {
    setInterval(() => {
      void this.fetchApi("/prompt")
        .then(async (resp) => {
          const status = (await resp.json()) as StatusWsMessageStatus
          this.dispatchCustomEvent("status", status)
        })
        .catch(() => {
          this.dispatchCustomEvent("status", undefined)
        })
    }, 1000)
  }

  // ── WebSocket ───────────────────────────────────────────────────

  private createSocket(isReconnect?: boolean): void {
    if (this.socket) return

    let opened = false
    const existingSession = window.name

    const params = new URLSearchParams()
    if (existingSession) {
      params.set("clientId", existingSession)
    }

    const wsBase = this.api_base.startsWith("http")
      ? this.api_base.replace(/^http/, "ws")
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${this.api_host}${this.api_base}`
    const baseUrl = `${wsBase}/ws`
    const query = params.toString()
    const wsUrl = query ? `${baseUrl}?${query}` : baseUrl

    const socketInstance = new WebSocket(wsUrl)
    this.socket = socketInstance
    this.socket.binaryType = "arraybuffer"

    this.socket.addEventListener("open", () => {
      if (this.socket !== socketInstance) return
      opened = true

      this.socket.send(
        JSON.stringify({
          type: "feature_flags",
          data: this.getClientFeatureFlags(),
        })
      )

      if (isReconnect === true) {
        this.dispatchCustomEvent("reconnected")
      }
    })

    this.socket.addEventListener("error", () => {
      if (this.socket !== socketInstance) return
      this.socket.close()
      if (isReconnect !== true && !opened) {
        this._pollQueue()
      }
    })

    this.socket.addEventListener("close", () => {
      if (this.socket !== socketInstance) return
      setTimeout(() => {
        if (this.socket !== socketInstance) return
        this.socket = null
        this.createSocket(true)
      }, 300)
      if (opened) {
        this.dispatchCustomEvent("status", undefined)
        this.dispatchCustomEvent("reconnecting")
      }
    })

    this.socket.addEventListener(
      "message",
      (event: MessageEvent<string | ArrayBuffer>) => {
        if (this.socket !== socketInstance) return
        try {
          if (event.data instanceof ArrayBuffer) {
            this.handleBinaryMessage(event.data)
          } else {
            this.handleTextMessage(event.data)
          }
        } catch {
          // silently ignore
        }
      }
    )
  }

  setApiBase(url: string): void {
    if (this.api_base === url && this.socket) {
      return
    }
    console.log("[ComfyApi] Changing api_base to:", url)
    this.api_base = url
    if (this.socket) {
      const oldSocket = this.socket
      this.socket = null
      try {
        oldSocket.close()
      } catch (err) {
        console.error("Failed to close socket:", err)
      }
    }
    this.createSocket()
  }

  private handleBinaryMessage(data: ArrayBuffer): void {
    const view = new DataView(data)
    const eventType = view.getUint32(0)

    switch (eventType) {
      case 3: {
        // PROGRESS_TEXT
        try {
          const decoder = new TextDecoder()
          const rawData = data.slice(4)
          const rawView = new DataView(rawData)

          let offset = 0
          let promptId: string | undefined

          if (this.serverSupportsFeature("supports_progress_text_metadata")) {
            const promptIdLength = rawView.getUint32(offset)
            offset += 4
            promptId = decoder.decode(
              rawData.slice(offset, offset + promptIdLength)
            )
            offset += promptIdLength
          }

          const nodeIdLength = rawView.getUint32(offset)
          offset += 4
          const nodeId = decoder.decode(
            rawData.slice(offset, offset + nodeIdLength)
          )
          offset += nodeIdLength
          const text = decoder.decode(rawData.slice(offset))

          this.dispatchCustomEvent("progress_text", {
            nodeId,
            text,
            ...(promptId !== undefined && { prompt_id: promptId }),
          })
        } catch {
          // silently ignore
        }
        break
      }
      case 1: {
        // PREVIEW_IMAGE
        const imageType = view.getUint32(4)
        const imageData = data.slice(8)
        const imageMime = imageType === 2 ? "image/png" : "image/jpeg"
        const imageBlob = new Blob([imageData], { type: imageMime })
        this.dispatchCustomEvent("b_preview", imageBlob)
        break
      }
      case 4: {
        // PREVIEW_IMAGE_WITH_METADATA
        const decoder = new TextDecoder()
        const metadataLength = view.getUint32(4)
        const metadataBytes = data.slice(8, 8 + metadataLength)
        const metadata = JSON.parse(decoder.decode(metadataBytes)) as {
          image_type: string
          node_id: string
          display_node_id: string
          parent_node_id: string
          real_node_id: string
          prompt_id: string
        }
        const imageData4 = data.slice(8 + metadataLength)

        const imageBlob4 = new Blob([imageData4], {
          type: metadata.image_type,
        })

        this.dispatchCustomEvent("b_preview_with_metadata", {
          blob: imageBlob4,
          nodeId: metadata.node_id,
          displayNodeId: metadata.display_node_id,
          parentNodeId: metadata.parent_node_id,
          realNodeId: metadata.real_node_id,
          jobId: metadata.prompt_id,
        })

        this.dispatchCustomEvent("b_preview", imageBlob4)
        break
      }
      default:
        throw new Error(
          `Unknown binary websocket message of type ${String(eventType)}`
        )
    }
  }

  private handleTextMessage(data: string): void {
    const msg = JSON.parse(data) as ApiMessageUnion
    switch (msg.type) {
      case "status":
        if (msg.data.sid !== undefined && msg.data.sid !== null) {
          const clientId = msg.data.sid
          this.clientId = clientId
          window.name = clientId
          sessionStorage.setItem("clientId", clientId)
        }
        this.dispatchCustomEvent("status", msg.data.status ?? undefined)
        break
      case "executing":
        this.dispatchCustomEvent(
          "executing",
          msg.data.display_node || msg.data.node
        )
        break
      case "execution_start":
      case "execution_error":
      case "execution_interrupted":
      case "execution_cached":
      case "execution_success":
      case "progress":
      case "progress_state":
      case "executed":
      case "graphChanged":
      case "promptQueued":
      case "logs":
      case "b_preview":
      case "notification":
        this.dispatchCustomEvent(msg.type, msg.data)
        break
      case "feature_flags":
        this.serverFeatureFlags = msg.data
        this.dispatchCustomEvent("feature_flags", msg.data)
        break
      default:
        if (this._registered.has(msg.type)) {
          super.dispatchEvent(new CustomEvent(msg.type, { detail: msg.data }))
        } else if (!this.reportedUnknownMessageTypes.has(msg.type)) {
          this.reportedUnknownMessageTypes.add(msg.type)
          throw new Error(`Unknown message type ${msg.type}`)
        }
    }
  }

  init(): void {
    this.createSocket()
  }

  // ── API methods ─────────────────────────────────────────────────

  async getExtensions(): Promise<ExtensionsResponse> {
    const resp = await this.fetchApi("/extensions", { cache: "no-store" })
    return await readJsonOrDefault<ExtensionsResponse>(resp, [], "/extensions")
  }

  async getWorkflowTemplates(): Promise<Record<string, string[]>> {
    const res = await this.fetchApi("/workflow_templates")
    return await readJsonOrDefault<Record<string, string[]>>(
      res,
      {},
      "/workflow_templates"
    )
  }

  async getCoreWorkflowTemplates(locale?: string): Promise<unknown[]> {
    const fileName =
      locale !== undefined && locale !== "en"
        ? `index.${locale}.json`
        : "index.json"
    try {
      const res = this.fileURL(`/templates/${fileName}`)
      const response = await fetch(res)
      const contentType = response.headers.get("content-type") ?? ""
      if (contentType.includes("application/json")) {
        return (await response.json()) as unknown[]
      }
      return []
    } catch {
      if (locale !== undefined && locale !== "en") {
        return this.getCoreWorkflowTemplates()
      }
      return []
    }
  }

  async getEmbeddings(): Promise<EmbeddingsResponse> {
    const resp = await this.fetchApi("/embeddings", { cache: "no-store" })
    return await readJsonOrDefault<EmbeddingsResponse>(resp, [], "/embeddings")
  }

  async getNodeDefs(): Promise<Record<string, ComfyNodeDef>> {
    const resp = await this.fetchApi("/object_info", { cache: "no-store" })
    return await readJsonOrDefault<Record<string, ComfyNodeDef>>(
      resp,
      {},
      "/object_info"
    )
  }

  async queuePrompt(
    number: number,
    data: { output: ComfyApiWorkflow; workflow: ComfyWorkflowJSON },
    options?: QueuePromptOptions
  ): Promise<PromptResponse> {
    const { output: prompt, workflow } = data

    const body: QueuePromptRequestBody = {
      client_id: this.clientId ?? "",
      prompt,
      ...(options?.partialExecutionTargets !== undefined && {
        partial_execution_targets: options.partialExecutionTargets,
      }),
      extra_data: {
        ...(this.authToken !== undefined
          ? { auth_token_comfy_org: this.authToken }
          : {}),
        ...(this.apiKey !== undefined
          ? { api_key_comfy_org: this.apiKey }
          : {}),
        comfy_usage_source: "comfyui-frontend",
        extra_pnginfo: { workflow },
        ...(options?.previewMethod !== undefined &&
          options.previewMethod !== "default" && {
            preview_method: options.previewMethod,
          }),
      },
    }

    if (number === -1) {
      body.front = true
    } else if (number !== 0) {
      body.number = number
    }

    const res = await this.fetchApi("/prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (res.status !== 200) {
      const text = await res.text()
      let errorResponse: PromptResponse
      try {
        errorResponse = JSON.parse(text) as PromptResponse
      } catch {
        errorResponse = {
          error: {
            type: "server_error",
            message: `${String(res.status)} ${res.statusText}`,
            details: text,
          },
        }
      }
      throw new PromptExecutionError(errorResponse, res.status)
    }

    return (await res.json()) as PromptResponse
  }

  async getShareableAssets(
    prompt: ComfyApiWorkflow,
    options?: { owned?: boolean }
  ): Promise<ShareableAssetsResponse> {
    const body: Record<string, unknown> = { workflow_api_json: prompt }
    if (options?.owned !== undefined) {
      body.owned = options.owned
    }
    const res = await this.fetchApi("/assets/from-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.status !== 200) {
      throw new Error(`Failed to fetch shareable assets: ${String(res.status)}`)
    }
    return (await res.json()) as ShareableAssetsResponse
  }

  async getModelFolders(): Promise<ModelFolderInfo[]> {
    const res = await this.fetchApi("/experiment/models")
    if (res.status === 404) return []
    const folderBlacklist = ["configs", "custom_nodes"]
    const folders = (await res.json()) as ModelFolderInfo[]
    return folders.filter(
      (folder: ModelFolderInfo) => !folderBlacklist.includes(folder.name)
    )
  }

  async getModels(folder: string): Promise<ModelFile[]> {
    const res = await this.fetchApi(`/experiment/models/${folder}`)
    if (res.status === 404) return []
    return await readJsonOrDefault<ModelFile[]>(
      res,
      [],
      `/experiment/models/${folder}`
    )
  }

  async viewMetadata(folder: string, model: string): Promise<unknown> {
    const res = await this.fetchApi(
      `/view_metadata/${folder}?filename=${encodeURIComponent(model)}`
    )
    const rawResponse = await res.text()
    if (rawResponse === "") return null
    try {
      return JSON.parse(rawResponse) as unknown
    } catch {
      return null
    }
  }

  async getItems(type: "queue" | "history"): Promise<
    | {
        Running: unknown[]
        Pending: unknown[]
      }
    | unknown[]
  > {
    if (type === "queue") return this.getQueue()
    return this.getHistory()
  }

  async getQueue(options?: { throwOnError?: boolean }): Promise<{
    Running: unknown[]
    Pending: unknown[]
  }> {
    try {
      const resp = await this.fetchApi("/queue")
      return await readJsonOrDefault<{ Running: unknown[]; Pending: unknown[] }>(
        resp,
        { Running: [], Pending: [] },
        "/queue"
      )
    } catch (error) {
      if (options?.throwOnError === true) throw error
      return { Running: [], Pending: [] }
    }
  }

  async getHistory(
    max_items = 200,
    options?: { offset?: number }
  ): Promise<unknown[]> {
    try {
      const params = new URLSearchParams({
        max_items: String(max_items),
      })
      if (options?.offset !== undefined) {
        params.set("offset", String(options.offset))
      }
      const resp = await this.fetchApi(`/history?${params}`)
      return await readJsonOrDefault<unknown[]>(resp, [], "/history")
    } catch {
      return []
    }
  }

  async getJobDetail(jobId: string): Promise<unknown> {
    try {
      const resp = await this.fetchApi(`/history/${jobId}`)
      if (resp.status === 404) return undefined
      return await readJsonOrDefault<unknown | undefined>(
        resp,
        undefined,
        `/history/${jobId}`
      )
    } catch {
      return undefined
    }
  }

  async getSystemStats(): Promise<SystemStats> {
    const res = await this.fetchApi("/system_stats")
    return await readJsonOrDefault<SystemStats>(
      res,
      { system: {}, devices: [] } as unknown as SystemStats,
      "/system_stats"
    )
  }

  private async _postItem(
    type: string,
    body?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.fetchApi("/" + type, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : null,
      })
    } catch {
      // silently ignore
    }
  }

  async deleteItem(type: string, id: string): Promise<void> {
    await this._postItem(type, { delete: [id] })
  }

  async clearItems(type: string): Promise<void> {
    await this._postItem(type, { clear: true })
  }

  async interrupt(runningJobId: string | null): Promise<void> {
    await this._postItem(
      "interrupt",
      runningJobId !== null ? { prompt_id: runningJobId } : undefined
    )
  }

  async getUserConfig(): Promise<User> {
    const res = await this.fetchApi("/users")
    return await readJsonOrDefault<User>(res, {} as User, "/users")
  }

  createUser(username: string): Promise<Response> {
    return this.fetchApi("/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    })
  }

  async getSettings(): Promise<Settings> {
    const resp = await this.fetchApi("/settings")
    if (resp.status === 401) {
      throw new UnauthorizedError(resp.statusText)
    }
    return await readJsonOrDefault<Settings>(resp, {}, "/settings")
  }

  async getSetting(id: string): Promise<unknown> {
    const resp = await this.fetchApi(`/settings/${encodeURIComponent(id)}`)
    return await readJsonOrDefault<unknown>(
      resp,
      undefined,
      `/settings/${encodeURIComponent(id)}`
    )
  }

  async storeSettings(settings: Partial<Settings>): Promise<Response> {
    return this.fetchApi("/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    })
  }

  async storeSetting(id: string, value: unknown): Promise<Response> {
    return this.fetchApi(`/settings/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify(value),
    })
  }

  async getUserData(file: string, options?: RequestInit): Promise<Response> {
    return this.fetchApi(`/userdata/${encodeURIComponent(file)}`, options)
  }

  async storeUserData(
    file: string,
    data: unknown,
    options: RequestInit & {
      overwrite?: boolean
      stringify?: boolean
      throwOnError?: boolean
      full_info?: boolean
    } = {
      overwrite: true,
      stringify: true,
      throwOnError: true,
      full_info: false,
    }
  ): Promise<Response> {
    const resp = await this.fetchApi(
      `/userdata/${encodeURIComponent(file)}?overwrite=${String(options.overwrite)}&full_info=${String(options.full_info)}`,
      {
        method: "POST",
        body:
          options.stringify === true
            ? JSON.stringify(data)
            : (data as BodyInit),
        ...options,
      }
    )
    if (resp.status !== 200 && options.throwOnError !== false) {
      throw new Error(
        `Error storing user data file '${file}': ${String(resp.status)} ${resp.statusText}`
      )
    }
    return resp
  }

  async deleteUserData(file: string): Promise<Response> {
    return this.fetchApi(`/userdata/${encodeURIComponent(file)}`, {
      method: "DELETE",
    })
  }

  async moveUserData(
    source: string,
    dest: string,
    options = { overwrite: false }
  ): Promise<Response> {
    return this.fetchApi(
      `/userdata/${encodeURIComponent(source)}/move/${encodeURIComponent(dest)}?overwrite=${String(options.overwrite)}`,
      { method: "POST" }
    )
  }

  async listUserDataFullInfo(dir: string): Promise<UserDataFullInfo[]> {
    const trimmedDir = trimEnd(dir, "/")
    const resp = await this.fetchApi(
      `/userdata?dir=${encodeURIComponent(trimmedDir)}&recurse=true&split=false&full_info=true`
    )
    if (resp.status === 404) return []
    if (resp.status !== 200) {
      throw new Error(
        `Error getting user data list '${trimmedDir}': ${String(resp.status)} ${resp.statusText}`
      )
    }
    return await readJsonOrDefault<UserDataFullInfo[]>(
      resp,
      [],
      `/userdata?dir=${encodeURIComponent(trimmedDir)}`
    )
  }

  async freeMemory(options: { freeExecutionCache: boolean }): Promise<void> {
    try {
      const mode = JSON.stringify({
        unload_models: true,
        ...(options.freeExecutionCache ? { free_memory: true } : {}),
      })
      const res = await this.fetchApi("/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: mode,
      })

      if (res.status === 200) {
        if (options.freeExecutionCache) {
          toast.success("Models and Execution Cache have been cleared.")
        } else {
          toast.success("Models have been unloaded.")
        }
      } else {
        toast.error(
          "Unloading of models failed. Installed ComfyUI may be an outdated version."
        )
      }
    } catch {
      toast.error("An error occurred while trying to unload models.")
    }
  }

  async getCustomNodesI18n(): Promise<CustomNodesI18n> {
    const res = await fetch(this.apiURL("/i18n"))
    return await readJsonOrDefault<CustomNodesI18n>(res, {}, "/i18n")
  }

  serverSupportsFeature(featureName: string): boolean {
    const override = getDevOverride(featureName)
    if (override !== undefined) return override as boolean
    return get(this.serverFeatureFlags, featureName) === true
  }

  getServerFeature<T = unknown>(featureName: string, defaultValue?: T): T {
    const override = getDevOverride(featureName) as T | undefined
    if (override !== undefined) return override
    return get(this.serverFeatureFlags, featureName, defaultValue) as T
  }

  getServerFeatures(): Record<string, unknown> {
    return { ...this.serverFeatureFlags }
  }

  async getFuseOptions(): Promise<unknown> {
    try {
      const res = await fetch(this.fileURL("/templates/fuse_options.json"), {
        headers: { "Content-Type": "application/json" },
      })
      const contentType = res.headers.get("content-type") ?? ""
      return contentType.includes("application/json")
        ? ((await res.json()) as unknown)
        : null
    } catch {
      return null
    }
  }

  async getLogs(): Promise<string> {
    const res = await fetch(this.internalURL("/logs"))
    return await res.text()
  }

  async getRawLogs(): Promise<LogsRawResponse> {
    const res = await fetch(this.internalURL("/logs/raw"))
    return await readJsonOrDefault<LogsRawResponse>(
      res,
      [] as unknown as LogsRawResponse,
      "/internal/logs/raw"
    )
  }

  async subscribeLogs(enabled: boolean): Promise<void> {
    await fetch(this.internalURL("/logs/subscribe"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, clientId: this.clientId }),
    })
  }

  async getFolderPaths(): Promise<Record<string, string[]>> {
    try {
      const res = await fetch(this.internalURL("/folder_paths"))
      return await readJsonOrDefault<Record<string, string[]>>(
        res,
        {},
        "/internal/folder_paths"
      )
    } catch {
      return {}
    }
  }
}

export const api = new ComfyApi()

/**
 * Backward-compatible alias for existing consumers.
 * @deprecated Use `api` instead (the ComfyApi class instance).
 */
export const comfyApi = {
  api_base: api.api_base,
  getObjectInfo: api.getNodeDefs.bind(api),
  getExtensions: api.getExtensions.bind(api),
  submitJob: async (workflow: ComfyApiWorkflow): Promise<{ id: string }> => {
    const res = await fetch(`${api.api_base}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow }),
    })
    if (!res.ok) throw new Error(`submit job failed: ${String(res.status)}`)
    return (await res.json()) as { id: string }
  },
  getJobs: async (params?: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<unknown[]> => {
    const query = new URLSearchParams(params as Record<string, string>)
    const res = await fetch(`${api.api_base}/jobs?${query}`)
    if (!res.ok) throw new Error(`get jobs failed: ${String(res.status)}`)
    return (await res.json()) as unknown[]
  },
}
