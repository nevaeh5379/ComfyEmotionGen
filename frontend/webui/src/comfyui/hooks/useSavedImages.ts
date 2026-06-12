/**
 * /saved-images, /asset-groups, /tags 페치 + WS 이벤트로 자동 갱신.
 *
 * 백엔드의 image.saved / image.curation / image.deleted 이벤트는
 * WebSocketProvider가 흡수하지 않고 직접 ws에 한 번 더 붙어서 처리한다.
 * (작업/워커는 Provider, 이미지는 갤러리 hook으로 책임 분리.)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLatestRef } from "./useLatestRef"
import { toast } from "sonner"
import { useEffectLog } from "@/lib/renderLogger"
import { DEFAULT_BACKEND_URL } from "@/lib/runtime"
import { API, HEADERS, DEFAULT_DOWNLOAD_FILENAME } from "@/lib/api"
import type {
  AssetGroup,
  BackendEvent,
  CurationStatus,
  SavedImage,
} from "../types/Message"

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

  // ── Refs for latest values ────────────────────────────────────────
  const groupModeRef = useLatestRef(groupMode)
  const urlToUseRef = useLatestRef(urlToUse)
  const statusRef = useLatestRef(status)
  const filenameRef = useLatestRef(filename)
  const tagRef = useLatestRef(tag)
  const pageRef = useLatestRef(page)
  const pageSizeRef = useLatestRef(pageSize)
  const groupPageRef = useLatestRef(groupPage)
  const groupPageSizeRef = useLatestRef(groupPageSize)
  const groupTotalRef = useLatestRef(groupTotal)

  // ── Async internals (no useCallback) ─────────────────────────────
  const fetchImagesInternal = async (silent = false) => {
    if (groupModeRef.current) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    if (!silent) setLoading(true)
    setError(null)
    try {
      const offset = Math.max(0, (pageRef.current - 1) * pageSizeRef.current)
      const params = new URLSearchParams({
        limit: String(pageSizeRef.current),
        offset: String(offset),
      })
      if (statusRef.current && statusRef.current !== "all") params.set("status", statusRef.current)
      if (filenameRef.current) params.set("filename", filenameRef.current)
      if (tagRef.current) params.set("tag", tagRef.current)
      const res = await fetch(`${urlToUseRef.current}${API.savedImages.root}?${params}`, {
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
      if (!silent) setLoading(false)
    }
  }

  const fetchGroupsInternal = async (silent = false) => {
    if (!groupModeRef.current) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    if (!silent) setLoading(true)
    setError(null)
    try {
      const offset = Math.max(0, (groupPageRef.current - 1) * groupPageSizeRef.current)
      const params = new URLSearchParams({
        limit: String(groupPageSizeRef.current),
        offset: String(offset),
        sort: "latest",
      })
      const res = await fetch(`${urlToUseRef.current}${API.assetGroups.root}?${params}`, {
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
      if (data.groups.length < groupPageSizeRef.current) {
        setGroupTotal(offset + data.groups.length)
      } else {
        // 다음 페이지가 있을 수 있으므로 여유 있게
        setGroupTotal(Math.max(groupTotalRef.current, offset + data.groups.length + 1))
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError((err as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const fetchGroupImagesInternal = async (
    filenames: string[],
    currentStatus: CurationStatus | "all" | undefined
  ) => {
    if (!groupModeRef.current || filenames.length === 0) return
    const newMap = new Map<string, SavedImage[]>()
    const statusParam =
      currentStatus && currentStatus !== "all"
        ? `?status=${currentStatus}`
        : ""
    const fetches = filenames.map(async (fn) => {
      try {
        const res = await fetch(
          `${urlToUseRef.current}${API.assetGroups.detail(fn)}${statusParam}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          filename: string
          items: SavedImage[]
        }
        newMap.set(fn, data.items)
      } catch (err) {
        console.error(`fetch group images failed for ${fn}`, err)
        toast.warning(`그룹 이미지 불러오기 실패: ${fn}`)
        newMap.set(fn, [])
      }
    })
    await Promise.all(fetches)
    setGroupImagesMap(newMap)
  }

  // ── Sync callbacks (call async internals) ────────────────────────
  const fetchImages = useCallback(
    (silent = false) => fetchImagesInternal(silent),
    []
  )

  const fetchGroups = useCallback(
    (silent = false) => fetchGroupsInternal(silent),
    []
  )

  const fetchGroupImages = useCallback(
    (filenames: string[], currentStatus: CurationStatus | "all" | undefined) =>
      fetchGroupImagesInternal(filenames, currentStatus),
    []
  )

  // ──── 메인 effect ────
  useEffectLog(
    "이미지 fetch",
    () => {
      if (groupMode) {
        fetchGroups(false)
      } else {
        fetchImages(false)
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

  // ──── Global WebSocket 이벤트를 ceg-image-event를 통해 수신 → 백그라운드 silent 갱신 ────
  useEffect(() => {
    const handleImageEvent = (e: Event) => {
      const event = (e as CustomEvent).detail as BackendEvent
      if (
        event.type === "image.saved" ||
        event.type === "image.curation" ||
        event.type === "image.deleted"
      ) {
        if (groupMode) {
          fetchGroups(true)
        } else {
          fetchImages(true)
        }
      }
    }
    window.addEventListener("ceg-image-event", handleImageEvent)
    return () => {
      window.removeEventListener("ceg-image-event", handleImageEvent)
    }
  }, [fetchImages, fetchGroups, groupMode])

  return useMemo(
    () => ({
      images,
      groups,
      groupImagesMap,
      total,
      groupTotal,
      loading,
      error,
      reload: () => (groupMode ? fetchGroups(false) : fetchImages(false)),
      reloadGroups: () => fetchGroups(false),
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
    const res = await fetch(`${backendUrl}${API.savedImages.detail(hash)}`, {
      method: "PATCH",
      headers: HEADERS.json,
      body: JSON.stringify({ status }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async patchNote(
    backendUrl: string,
    hash: string,
    note: string
  ): Promise<void> {
    const res = await fetch(`${backendUrl}${API.savedImages.detail(hash)}`, {
      method: "PATCH",
      headers: HEADERS.json,
      body: JSON.stringify({ note }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async addTags(
    backendUrl: string,
    hash: string,
    tags: string[]
  ): Promise<void> {
    const res = await fetch(`${backendUrl}${API.savedImages.tags(hash)}`, {
      method: "POST",
      headers: HEADERS.json,
      body: JSON.stringify({ tags }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async removeTag(
    backendUrl: string,
    hash: string,
    tag: string
  ): Promise<void> {
    const res = await fetch(`${backendUrl}${API.savedImages.tag(hash, tag)}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async restore(backendUrl: string, hash: string): Promise<void> {
    const res = await fetch(`${backendUrl}${API.savedImages.restore(hash)}`, {
      method: "POST",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
  async emptyTrash(backendUrl: string): Promise<number> {
    const res = await fetch(`${backendUrl}${API.trash.empty}`, {
      method: "POST",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { deleted: number }
    return data.deleted
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
    const res = await fetch(`${backendUrl}${API.export}`, {
      method: "POST",
      headers: HEADERS.json,
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = DEFAULT_DOWNLOAD_FILENAME
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  async bulkAutoTags(
    backendUrl: string,
    hashes: string[]
  ): Promise<Record<string, string[]>> {
    const cleanUrl = backendUrl.replace(/\/+$/, "")
    const res = await fetch(`${cleanUrl}/saved-images/auto-tags/bulk`, {
      method: "POST",
      headers: HEADERS.json,
      body: JSON.stringify({ hashes }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { results: Record<string, string[]> }
    return data.results
  },
  async autoTagsAllEmpty(
    backendUrl: string
  ): Promise<Record<string, string[]>> {
    const cleanUrl = backendUrl.replace(/\/+$/, "")
    const res = await fetch(`${cleanUrl}/saved-images/auto-tags/empty`, {
      method: "POST",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { results: Record<string, string[]> }
    return data.results
  },
}
