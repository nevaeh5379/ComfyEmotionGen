import { useCallback, useEffect, useRef, useState } from "react"

import { useLatestRef } from "./useLatestRef"
import { toast } from "sonner"

import { API } from "@/lib/api"

export type ChannelType = "discord" | "telegram" | "generic"

export interface WebhookConfig {
  id: string
  name: string
  channel_type: ChannelType
  url: string
  events: string[]
  enabled: boolean
  include_image: boolean
}

const ALL_EVENTS = ["job_done", "job_error", "batch_completed"] as const

async function fetchWebhooks(backendUrl: string): Promise<WebhookConfig[]> {
  try {
    const res = await fetch(`${backendUrl}${API.webhooks.root}`)
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    const data = await res.json() as { configs?: WebhookConfig[] }
    return data.configs ?? []
  } catch (err: unknown) {
    console.error("Failed to fetch webhooks:", err)
    toast.error("웹훅 목록 불러오기에 실패했습니다.")
    return []
  }
}

// ── Async internals (no useCallback) ──────────────────────────────

async function addConfigInternal(
  backendUrl: string,
  payload: {
    name: string
    channel_type: ChannelType
    url: string
    events: string[]
    enabled: boolean
    include_image: boolean
  }
): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}${API.webhooks.root}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    return true
  } catch (err) {
    console.error("Failed to add webhook config:", err)
    toast.error("웹훅 추가에 실패했습니다.")
    return false
  }
}

async function updateConfigInternal(
  backendUrl: string,
  id: string,
  payload: {
    name?: string
    channel_type?: ChannelType
    url?: string
    events?: string[]
    enabled?: boolean
    include_image?: boolean
  }
): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}${API.webhooks.detail(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    return true
  } catch (err) {
    console.error("Failed to update webhook config:", err)
    toast.error("웹훅 수정에 실패했습니다.")
    return false
  }
}

async function deleteConfigInternal(
  backendUrl: string,
  id: string
): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}${API.webhooks.detail(id)}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    return true
  } catch (err) {
    console.error("Failed to delete webhook config:", err)
    toast.error("웹훅 삭제에 실패했습니다.")
    return false
  }
}

async function testConfigInternal(
  backendUrl: string,
  id: string
): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}${API.webhooks.test(id)}`, {
      method: "POST",
    })
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    return true
  } catch (err) {
    console.error("Failed to test webhook config:", err)
    toast.error("웹훅 테스트에 실패했습니다.")
    return false
  }
}

// ── Sync callbacks (useCallback + async internal) ────────────────

export const useWebhooks = (backendUrl: string): {
  configs: WebhookConfig[]
  isLoading: boolean
  addConfig: (payload: {
    name: string
    channel_type: ChannelType
    url: string
    events: string[]
    enabled: boolean
    include_image: boolean
  }) => Promise<boolean>
  updateConfig: (
    id: string,
    payload: {
      name?: string
      channel_type?: ChannelType
      url?: string
      events?: string[]
      enabled?: boolean
      include_image?: boolean
    }
  ) => Promise<boolean>
  deleteConfig: (id: string) => Promise<boolean>
  testConfig: (id: string) => Promise<boolean>
  load: () => Promise<void>
  allEvents: readonly string[]
} => {
  const [configs, setConfigs] = useState<WebhookConfig[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const initialized = useRef(false)

  useEffect((): void => {
    if (initialized.current) return
    initialized.current = true
    void fetchWebhooks(backendUrl).then(setConfigs)
  }, [backendUrl])

  const backendUrlRef = useLatestRef(backendUrl)

  const load = useCallback(async (): Promise<void> => {
    setConfigs(await fetchWebhooks(backendUrlRef.current))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addConfig = useCallback(
    async (payload: {
      name: string
      channel_type: ChannelType
      url: string
      events: string[]
      enabled: boolean
      include_image: boolean
    }): Promise<boolean> => {
      const ok = await addConfigInternal(backendUrlRef.current, payload)
      if (ok) await load()
      return ok
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load]
  )

  const updateConfig = useCallback(
    async (
      id: string,
      payload: {
        name?: string
        channel_type?: ChannelType
        url?: string
        events?: string[]
        enabled?: boolean
        include_image?: boolean
      }
    ): Promise<boolean> => {
      const ok = await updateConfigInternal(backendUrlRef.current, id, payload)
      if (ok) await load()
      return ok
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load]
  )

  const deleteConfig = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await deleteConfigInternal(backendUrlRef.current, id)
      if (ok) await load()
      return ok
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load]
  )

  const testConfig = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const ok = await testConfigInternal(backendUrlRef.current, id)
      return ok
    } catch {
      return false
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    configs,
    isLoading,
    addConfig,
    updateConfig,
    deleteConfig,
    testConfig,
    load,
    allEvents: ALL_EVENTS,
  }
}
