/**
 * ComfyUI API Client (React 포팅)
 * ComfyUI_frontend: src/scripts/api.ts 의 핵심만 추출
 * CEG 백엔드 API와 연동
 */

import type { ComfyWorkflowJSON, ComfyApiWorkflow } from "@comfy-graph/types/workflow"
import type { ComfyNodeDef } from "@comfy-graph/types/nodeDef"

const API_BASE = ""

/**
 * CEG 백엔드 API Client
 */
export const comfyApi = {
  /**
   * GET /object_info - ComfyUI 노드 정의 조회
   */
  async getObjectInfo(): Promise<Record<string, ComfyNodeDef>> {
    const res = await fetch(`${API_BASE}/object_info`)
    if (!res.ok) throw new Error(`object_info failed: ${res.status}`)
    return res.json()
  },

  /**
   * GET /extensions - ComfyUI 익스텐션 목록
   * TODO: CEG 백엔드에 추가 필요
   */
  async getExtensions(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/extensions`)
    if (!res.ok) throw new Error(`extensions failed: ${res.status}`)
    return res.json()
  },

  /**
   * POST /jobs - CEG 잡 제출
   * ComfyUI의 /prompt 대신 CEG의 /jobs 사용
   */
  async submitJob(workflow: ComfyApiWorkflow): Promise<{ id: string }> {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow }),
    })
    if (!res.ok) throw new Error(`submit job failed: ${res.status}`)
    return res.json()
  },

  /**
   * GET /jobs - 잡 목록 조회
   */
  async getJobs(params?: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<unknown[]> {
    const query = new URLSearchParams(params as Record<string, string>)
    const res = await fetch(`${API_BASE}/jobs?${query}`)
    if (!res.ok) throw new Error(`get jobs failed: ${res.status}`)
    return res.json()
  },
}

/**
 * WebSocket 이벤트 타입
 */
export interface ComfyWsMessage {
  type: string
  data: unknown
}

/**
 * WebSocket 클라이언트
 * CEG의 /ws/events 연결
 */
export function createComfyWebSocket(
  onMessage: (msg: ComfyWsMessage) => void,
  onError?: (error: Event) => void
): WebSocket {
  const ws = new WebSocket(
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/events`
  )

  ws.onopen = () => {
    console.log("[ComfyGraph] WebSocket connected")
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      onMessage(msg)
    } catch {
      console.warn("[ComfyGraph] Invalid WebSocket message:", event.data)
    }
  }

  ws.onerror = (error) => {
    console.error("[ComfyGraph] WebSocket error:", error)
    onError?.(error)
  }

  ws.onclose = () => {
    console.log("[ComfyGraph] WebSocket closed")
  }

  return ws
}
