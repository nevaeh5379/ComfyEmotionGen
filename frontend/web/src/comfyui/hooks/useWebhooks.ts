import { useCallback, useEffect, useRef, useState } from "react"
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
    const data = await res.json()
    return data.configs ?? []
  } catch (err) {
    console.error("Failed to fetch webhooks:", err)
    toast.error("웹훅 목록 불러오기에 실패했습니다.")
    return []
  }
}

export const useWebhooks = (backendUrl: string) => {
  const [configs, setConfigs] = useState<WebhookConfig[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    fetchWebhooks(backendUrl).then(setConfigs)
  }, [backendUrl])

  const load = useCallback(async () => {
    setConfigs(await fetchWebhooks(backendUrl))
  }, [backendUrl])

  const addConfig = useCallback(
    async (payload: {
      name: string
      channel_type: ChannelType
      url: string
      events: string[]
      enabled: boolean
      include_image: boolean
    }) => {
      try {
        const res = await fetch(`${backendUrl}${API.webhooks.root}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
        await load()
        return true
      } catch (err) {
        console.error("Failed to add webhook config:", err)
        toast.error("웹훅 추가에 실패했습니다.")
        return false
      }
    },
    [backendUrl, load]
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
    ) => {
      try {
        const res = await fetch(`${backendUrl}${API.webhooks.detail(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
        await load()
        return true
      } catch (err) {
        console.error("Failed to update webhook config:", err)
        toast.error("웹훅 수정에 실패했습니다.")
        return false
      }
    },
    [backendUrl, load]
  )

  const deleteConfig = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${backendUrl}${API.webhooks.detail(id)}`, {
          method: "DELETE",
        })
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
        await load()
        return true
      } catch (err) {
        console.error("Failed to delete webhook config:", err)
        toast.error("웹훅 삭제에 실패했습니다.")
        return false
      }
    },
    [backendUrl, load]
  )

  const testConfig = useCallback(
    async (id: string) => {
      setIsLoading(true)
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
      } finally {
        setIsLoading(false)
      }
    },
    [backendUrl]
  )

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
