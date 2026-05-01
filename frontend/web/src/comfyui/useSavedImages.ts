/**
 * /saved-images, /asset-groups, /tags 페치 + WS 이벤트로 자동 갱신.
 *
 * 백엔드의 image.saved / image.curation / image.deleted 이벤트는
 * WebSocketProvider가 흡수하지 않고 직접 ws에 한 번 더 붙어서 처리한다.
 * (잡/워커는 Provider, 이미지는 갤러리 hook으로 책임 분리.)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AssetGroup, BackendEvent, CurationStatus, SavedImage } from "./Message"

const httpToWs = (url: string): string =>
  url.replace(/^http:/, "ws:").replace(/^https:/, "wss:")

interface UseSavedImagesOptions {
  backendUrl: string
  status?: CurationStatus | "all"
  filename?: string
  tag?: string
}

interface SavedImagesState {
  images: SavedImage[]
  groups: AssetGroup[]
  loading: boolean
  error: string | null
  reload: () => void
  reloadGroups: () => void
}

export const useSavedImages = (
  options: UseSavedImagesOptions
): SavedImagesState => {
  const { backendUrl, status, filename, tag } = options
  const [images, setImages] = useState<SavedImage[]>([])
  const [groups, setGroups] = useState<AssetGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const fetchImages = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: "500" })
      if (status && status !== "all") params.set("status", status)
      if (filename) params.set("filename", filename)
      if (tag) params.set("tag", tag)
      const res = await fetch(`${backendUrl}/saved-images?${params}`, {
        signal: ac.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { items: SavedImage[] }
      setImages(data.items)
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backendUrl, status, filename, tag])

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/asset-groups?limit=500`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { groups: AssetGroup[] }
      setGroups(data.groups)
    } catch (err) {
      console.error("fetch asset-groups failed", err)
    }
  }, [backendUrl])

  useEffect(() => {
    fetchImages()
    fetchGroups()
  }, [fetchImages, fetchGroups])

  // WebSocket으로 image.* 이벤트 수신 → 자동 갱신
  useEffect(() => {
    const wsUrl = `${httpToWs(backendUrl)}/ws/events`
    let socket: WebSocket | null = null
    let cancelled = false

    const connect = () => {
      socket = new WebSocket(wsUrl)
      socket.onmessage = (e) => {
        if (typeof e.data !== "string") return
        try {
          const event = JSON.parse(e.data) as BackendEvent
          if (
            event.type === "image.saved" ||
            event.type === "image.curation" ||
            event.type === "image.deleted"
          ) {
            // 가벼운 갱신: 현재 필터 조건 그대로 다시 페치
            fetchImages()
            fetchGroups()
          }
        } catch {
          /* ignore */
        }
      }
      socket.onclose = () => {
        if (cancelled) return
        // WebSocketProvider가 별도로 재연결을 처리하므로 여기서는 단순 재시도
        setTimeout(connect, 2000)
      }
    }
    connect()
    return () => {
      cancelled = true
      socket?.close()
    }
  }, [backendUrl, fetchImages, fetchGroups])

  return useMemo(
    () => ({
      images,
      groups,
      loading,
      error,
      reload: fetchImages,
      reloadGroups: fetchGroups,
    }),
    [images, groups, loading, error, fetchImages, fetchGroups]
  )
}

// ---------- 액션 ----------

export const curationApi = {
  async patchStatus(
    backendUrl: string,
    hash: string,
    status: CurationStatus
  ): Promise<void> {
    const res = await fetch(`${backendUrl}/saved-images/${hash}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async patchNote(
    backendUrl: string,
    hash: string,
    note: string
  ): Promise<void> {
    const res = await fetch(`${backendUrl}/saved-images/${hash}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async addTags(
    backendUrl: string,
    hash: string,
    tags: string[]
  ): Promise<void> {
    const res = await fetch(`${backendUrl}/saved-images/${hash}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async removeTag(
    backendUrl: string,
    hash: string,
    tag: string
  ): Promise<void> {
    const res = await fetch(
      `${backendUrl}/saved-images/${hash}/tags/${encodeURIComponent(tag)}`,
      { method: "DELETE" }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async restore(backendUrl: string, hash: string): Promise<void> {
    const res = await fetch(`${backendUrl}/saved-images/${hash}/restore`, {
      method: "POST",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async emptyTrash(backendUrl: string): Promise<number> {
    const res = await fetch(`${backendUrl}/trash/empty`, { method: "POST" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { deleted: number }
    return data.deleted
  },
  async regenerate(
    backendUrl: string,
    filename: string,
    count: number,
    seedStrategy: "random" | "increment" = "random"
  ): Promise<string[]> {
    const res = await fetch(
      `${backendUrl}/asset-groups/${encodeURIComponent(filename)}/regenerate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, seedStrategy }),
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { jobIds: string[] }
    return data.jobIds
  },
  async exportDataset(
    backendUrl: string,
    body: { status?: CurationStatus; filenames?: string[]; tags?: string[] }
  ): Promise<void> {
    const res = await fetch(`${backendUrl}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "dataset.zip"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
