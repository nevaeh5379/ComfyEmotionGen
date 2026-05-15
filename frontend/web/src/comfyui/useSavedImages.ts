/**
 * /saved-images, /asset-groups, /tags 페치 + WS 이벤트로 자동 갱신.
 *
 * 백엔드의 image.saved / image.curation / image.deleted 이벤트는
 * WebSocketProvider가 흡수하지 않고 직접 ws에 한 번 더 붙어서 처리한다.
 * (잡/워커는 Provider, 이미지는 갤러리 hook으로 책임 분리.)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEffectLog } from "@/lib/renderLogger"
import type {
  AssetGroup,
  BackendEvent,
  CurationStatus,
  SavedImage,
} from "./Message"

const globalConfigUrl = (
  window as Window & { COMFY_EMOTION_GEN_BACKEND_URL?: string }
).COMFY_EMOTION_GEN_BACKEND_URL
const DEFAULT_BACKEND_URL = globalConfigUrl || "http://localhost:8000"

const httpToWs = (url: string): string =>
  url.replace(/^http:/, "ws:").replace(/^https:/, "wss:")

// const DEFAULT_GROUP_IMG_LIMIT = 10_000 << WTF

interface UseSavedImagesOptions {
  backendUrl?: string
  status?: CurationStatus | "all" | undefined
  filename?: string | undefined
  tag?: string | undefined
  /** 1-based page index. Default 1. */
  page?: number
  /** 페이지당 항목 수. Default 48. */
  pageSize?: number
  /** 그룹 모드 여부. true면 /asset-groups 기반으로 동작. */
  groupMode?: boolean
  /** 그룹 모드 전용: 그룹 목록 1-based page. Default 1. */
  groupPage?: number
  /** 그룹 모드 전용: 페이지당 그룹 수. Default 20. */
  groupPageSize?: number
}

export interface SavedImagesState {
  images: SavedImage[]
  groups: AssetGroup[]
  groupImagesMap: Map<string, SavedImage[]>
  total: number
  groupTotal: number
  loading: boolean
  error: string | null
  reload: () => void
  reloadGroups: () => void
}

export const useSavedImages = (
  options: UseSavedImagesOptions
): SavedImagesState => {
  const {
    backendUrl,
    status,
    filename,
    tag,
    page = 1,
    pageSize = 48,
    groupMode = false,
    groupPage = 1,
    groupPageSize = 20,
  } = options
  const [images, setImages] = useState<SavedImage[]>([])
  const [groups, setGroups] = useState<AssetGroup[]>([])
  const [groupImagesMap, setGroupImagesMap] = useState<
    Map<string, SavedImage[]>
  >(new Map())
  const [total, setTotal] = useState(0)
  const [groupTotal, setGroupTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const urlToUse = backendUrl || DEFAULT_BACKEND_URL

  // ──── 그리드 모드: 이미지 fetch ────
  const fetchImages = useCallback(async () => {
    if (groupMode) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    try {
      const offset = Math.max(0, (page - 1) * pageSize)
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      })
      if (status && status !== "all") params.set("status", status)
      if (filename) params.set("filename", filename)
      if (tag) params.set("tag", tag)
      const res = await fetch(`${urlToUse}/saved-images?${params}`, {
        signal: ac.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        items: SavedImage[]
        total?: number
      }
      setImages(data.items)
      setTotal(typeof data.total === "number" ? data.total : data.items.length)
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [groupMode, urlToUse, status, filename, tag, page, pageSize])

  // ──── 그룹 모드: 그룹 목록 fetch (페이징) ────
  const fetchGroups = useCallback(async () => {
    if (!groupMode) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    try {
      const offset = Math.max(0, (groupPage - 1) * groupPageSize)
      const params = new URLSearchParams({
        limit: String(groupPageSize),
        offset: String(offset),
        sort: "latest",
      })
      const res = await fetch(`${urlToUse}/asset-groups?${params}`, {
        signal: ac.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        groups: AssetGroup[]
        limit: number
        offset: number
      }
      setGroups(data.groups)

      // 전체 그룹 수 추정: 현재 페이지가 마지막이 아니면 대략적인 total 사용
      // 마지막 페이지면 offset + 받은 개수
      if (data.groups.length < groupPageSize) {
        setGroupTotal(offset + data.groups.length)
      } else {
        // 다음 페이지가 있을 수 있으므로 여유 있게
        setGroupTotal(Math.max(groupTotal, offset + data.groups.length + 1))
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [groupMode, urlToUse, groupPage, groupPageSize, groupTotal])

  // ──── 그룹 모드: 각 그룹의 이미지 fetch ────
  const fetchGroupImages = useCallback(
    async (
      filenames: string[],
      currentStatus: CurationStatus | "all" | undefined
    ) => {
      if (!groupMode || filenames.length === 0) return
      const newMap = new Map<string, SavedImage[]>()
      const statusParam =
        currentStatus && currentStatus !== "all"
          ? `?status=${currentStatus}`
          : ""
      const fetches = filenames.map(async (fn) => {
        try {
          const res = await fetch(
            `${urlToUse}/asset-groups/${encodeURIComponent(fn)}${statusParam}`
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = (await res.json()) as {
            filename: string
            items: SavedImage[]
          }
          newMap.set(fn, data.items)
        } catch (err) {
          console.error(`fetch group images failed for ${fn}`, err)
          newMap.set(fn, [])
        }
      })
      await Promise.all(fetches)
      setGroupImagesMap(newMap)
    },
    [groupMode, urlToUse]
  )

  // ──── 메인 effect ────
  useEffectLog(
    "이미지 fetch",
    () => {
      if (groupMode) {
        fetchGroups()
      } else {
        fetchImages()
      }
    },
    [fetchImages, fetchGroups, groupMode]
  )

  // 그룹 목록이 바뀌면 이미지 fetch
  // (fetchGroupImages는 내부적으로 setState를 호출하는 비동기 함수)
  useEffect(() => {
    if (groupMode && groups.length > 0) {
      const filenames = groups.map((g) => g.filename)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchGroupImages(filenames, status)
    } else if (groups.length === 0) {
      setGroupImagesMap(new Map())
    }
  }, [groups, groupMode, fetchGroupImages, status])

  // ──── WebSocket으로 image.* 이벤트 수신 → 자동 갱신 ────
  useEffect(() => {
    const wsUrl = `${httpToWs(urlToUse)}/ws/events`
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
            if (groupMode) {
              fetchGroups()
            } else {
              fetchImages()
            }
          }
        } catch {
          /* ignore */
        }
      }
      socket.onclose = () => {
        if (cancelled) return
        setTimeout(connect, 2000)
      }
    }
    connect()
    return () => {
      cancelled = true
      socket?.close()
    }
  }, [urlToUse, fetchImages, fetchGroups, groupMode])

  return useMemo(
    () => ({
      images,
      groups,
      groupImagesMap,
      total,
      groupTotal,
      loading,
      error,
      reload: groupMode ? fetchGroups : fetchImages,
      reloadGroups: fetchGroups,
    }),
    [
      images,
      groups,
      groupImagesMap,
      total,
      groupTotal,
      loading,
      error,
      fetchImages,
      fetchGroups,
      groupMode,
    ]
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
    seedStrategy: "random" | "increment" = "random",
    template?: string,
    workflow?: string
  ): Promise<string[]> {
    const res = await fetch(
      `${backendUrl}/asset-groups/${encodeURIComponent(filename)}/regenerate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, seedStrategy, template, workflow }),
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { jobIds: string[] }
    return data.jobIds
  },
  async exportDataset(
    backendUrl: string,
    body: {
      status?: CurationStatus
      filenames?: string[]
      tags?: string[]
      duplicateStrategy?: "hash" | "number"
    }
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
