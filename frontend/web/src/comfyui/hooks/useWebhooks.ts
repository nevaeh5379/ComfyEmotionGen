import { useCallback, useEffect, useRef, useState } from "react"

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
    if (res.ok) {
      const data = await res.json()
      return data.configs ?? []
    }
  } catch {
    // ignore
  }
  return []
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
        if (res.ok) {
          await load()
          return true
        }
      } catch {
        // ignore
      }
      return false
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
        if (res.ok) {
          await load()
          return true
        }
      } catch {
        // ignore
      }
      return false
    },
    [backendUrl, load]
  )

  const deleteConfig = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${backendUrl}${API.webhooks.detail(id)}`, {
          method: "DELETE",
        })
        if (res.ok) {
          await load()
          return true
        }
      } catch {
        // ignore
      }
      return false
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
        return res.ok
      } catch {
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
