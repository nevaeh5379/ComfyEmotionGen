import { useState, useCallback, useMemo } from "react"
import { curationApi } from "../../hooks/useSavedImages"
import { hasApproved } from "../../types/Message"
import type { SavedImage } from "../../types/Message"
import type { RenderItem } from "./CombinationPickerComponents"
import {
  groupSavedImagesAsRenderItems,
  buildImagesByGroupKey,
  type FreeGroupBy,
} from "./freeCurationGroupers"

interface UseCombinationDataProps {
  backendUrl: string
  activeTemplate: string
  freeGroupMode: FreeGroupBy | null
  hideEmptyCurationFolders?: boolean
}

export function useCombinationData({
  backendUrl,
  activeTemplate,
  freeGroupMode,
  hideEmptyCurationFolders = false,
}: UseCombinationDataProps) {
  const [rawRenderItems, setRawRenderItems] = useState<RenderItem[]>([])
  const [allImages, setAllImages] = useState<SavedImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters state
  const [statusFilter, setStatusFilter] = useState<"all" | "done" | "pending">(
    "all"
  )
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState("")

  const fetchData = useCallback(async () => {
    if (freeGroupMode !== null) {
      setLoading(true)
      setError(null)
      try {
        const imagesRes = await fetch(`${backendUrl}/saved-images?limit=5000`)
        if (!imagesRes.ok)
          throw new Error(`이미지 로드 실패: HTTP ${imagesRes.status}`)
        const imagesData = (await imagesRes.json()) as { items: SavedImage[] }
        setAllImages(imagesData.items)
        setRawRenderItems(
          groupSavedImagesAsRenderItems(imagesData.items, freeGroupMode)
        )
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (!activeTemplate.trim()) {
      setError("CEG 템플릿을 먼저 작성해주세요.")
      setRawRenderItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [renderRes, imagesRes] = await Promise.all([
        fetch(`${backendUrl}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: activeTemplate }),
        }),
        fetch(`${backendUrl}/saved-images?limit=5000`),
      ])
      if (!renderRes.ok) throw new Error(`렌더 실패: HTTP ${renderRes.status}`)
      if (!imagesRes.ok)
        throw new Error(`이미지 로드 실패: HTTP ${imagesRes.status}`)
      const renderData = (await renderRes.json()) as { items: RenderItem[] }
      const imagesData = (await imagesRes.json()) as { items: SavedImage[] }
      setRawRenderItems(renderData.items)
      setAllImages(imagesData.items)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backendUrl, activeTemplate, freeGroupMode])

  const imagesByFilename = useMemo(() => {
    if (freeGroupMode !== null) {
      return buildImagesByGroupKey(allImages, freeGroupMode)
    }
    const map = new Map<string, SavedImage[]>()
    for (const img of allImages) {
      if (img.status === "trashed") continue
      if (!map.has(img.originalFilename)) map.set(img.originalFilename, [])
      map.get(img.originalFilename)!.push(img)
    }
    return map
  }, [allImages, freeGroupMode])

  const renderItems = useMemo(() => {
    if (!hideEmptyCurationFolders) return rawRenderItems
    return rawRenderItems.filter((ri) => {
      const imgs = imagesByFilename.get(ri.filename) ?? []
      return imgs.length > 0
    })
  }, [rawRenderItems, imagesByFilename, hideEmptyCurationFolders])

  const doneCount = useMemo(
    () =>
      renderItems.filter((ri) =>
        hasApproved(imagesByFilename.get(ri.filename) ?? [])
      ).length,
    [renderItems, imagesByFilename]
  )

  // 추출된 검색 태그 자동완성 후보군 생성
  const candidates = useMemo(() => {
    const list: { value: string; type: "filename" | "metadata" }[] = []
    const filenamesSeen = new Set<string>()
    const metaValuesSeen = new Set<string>()

    for (const ri of rawRenderItems) {
      if (!filenamesSeen.has(ri.filename)) {
        filenamesSeen.add(ri.filename)
        list.push({ value: `@${ri.filename}`, type: "filename" })
      }
      for (const v of Object.values(ri.meta)) {
        const cleanV = String(v).trim()
        if (cleanV && !metaValuesSeen.has(cleanV)) {
          metaValuesSeen.add(cleanV)
          list.push({ value: `$${cleanV}`, type: "metadata" })
        }
      }
    }
    return list
  }, [rawRenderItems])

  const filteredRenderItems = useMemo(() => {
    return renderItems.filter((ri) => {
      const imgs = imagesByFilename.get(ri.filename) ?? []
      const isDone = hasApproved(imgs)

      if (statusFilter === "done" && !isDone) return false
      if (statusFilter === "pending" && isDone) return false

      const metaValues = Object.values(ri.meta).map((v) => v.toLowerCase())

      // 1. 파일명 태그 매칭 (@) - AND 방식
      const filenameFiltersList = searchTags
        .filter((t) => t.startsWith("@"))
        .map((t) => t.slice(1).toLowerCase().trim())
        .filter(Boolean)
      for (const filter of filenameFiltersList) {
        if (!ri.filename.toLowerCase().includes(filter)) return false
      }

      // 2. 메타데이터 태그 매칭 ($) - AND 방식
      const metadataFiltersList = searchTags
        .filter((t) => t.startsWith("$"))
        .map((t) => t.slice(1).toLowerCase().trim())
        .filter(Boolean)
      for (const filter of metadataFiltersList) {
        const match = metaValues.some((v) => v.includes(filter))
        if (!match) return false
      }

      // 3. 일반 검색어 매칭 - AND 방식 (각 단어가 파일명 또는 메타데이터 중 하나에는 포함되어야 함)
      const generalFiltersList = searchTags
        .filter((t) => !t.startsWith("@") && !t.startsWith("$"))
        .map((t) => t.toLowerCase().trim())
        .filter(Boolean)
      for (const filter of generalFiltersList) {
        const inFilename = ri.filename.toLowerCase().includes(filter)
        const inMetadata = metaValues.some((v) => v.includes(filter))
        if (!inFilename && !inMetadata) return false
      }

      // 4. 입력 중인 임시 검색어 필터링
      if (searchInput.trim()) {
        const cleanSearch = searchInput.replace(/^[@$]/, "").toLowerCase().trim()
        if (cleanSearch) {
          const inFilename = ri.filename.toLowerCase().includes(cleanSearch)
          const inMetadata = metaValues.some((v) => v.includes(cleanSearch))
          if (!inFilename && !inMetadata) return false
        }
      }

      return true
    })
  }, [
    renderItems,
    imagesByFilename,
    statusFilter,
    searchTags,
    searchInput,
  ])

  const unassignedGroups = useMemo(() => {
    if (freeGroupMode !== null) return new Map<string, SavedImage[]>()
    const renderFilenames = new Set(rawRenderItems.map((ri) => ri.filename))
    const map = new Map<string, SavedImage[]>()
    for (const img of allImages) {
      if (img.status === "trashed") continue
      if (!renderFilenames.has(img.originalFilename)) {
        if (!map.has(img.originalFilename)) map.set(img.originalFilename, [])
        map.get(img.originalFilename)!.push(img)
      }
    }
    return map
  }, [allImages, rawRenderItems, freeGroupMode])

  const unassignedTotalCount = useMemo(
    () =>
      Array.from(unassignedGroups.values()).reduce(
        (sum, imgs) => sum + imgs.length,
        0
      ),
    [unassignedGroups]
  )

  const setStatus = useCallback(
    async (hash: string, status: SavedImage["status"]) => {
      setAllImages((prev) =>
        prev.map((img) => (img.hash === hash ? { ...img, status } : img))
      )
      await curationApi.patchStatus(backendUrl, hash, status)
    },
    [backendUrl]
  )

  const batchUpdateStatus = useCallback(
    async (
      filename: string,
      filter: (img: SavedImage) => boolean,
      status: SavedImage["status"]
    ) => {
      const images = imagesByFilename.get(filename) ?? []
      const targets = images.filter(filter)
      if (targets.length === 0) return
      const targetHashes = new Set(targets.map((img) => img.hash))
      setAllImages((prev) =>
        prev.map((img) =>
          targetHashes.has(img.hash) ? { ...img, status } : img
        )
      )
      await Promise.all(
        targets.map((img) =>
          curationApi.patchStatus(backendUrl, img.hash, status)
        )
      )
    },
    [backendUrl, imagesByFilename]
  )

  const approveImage = useCallback(
    async (filename: string, selectedHash: string) => {
      const imgs = imagesByFilename.get(filename) ?? []
      const groupHashes = new Set(
        imgs.filter((img) => img.status !== "trashed").map((img) => img.hash)
      )

      setAllImages((prev) =>
        prev.map((img) => {
          if (!groupHashes.has(img.hash) || img.status === "trashed") return img
          return {
            ...img,
            status: img.hash === selectedHash ? "approved" : "rejected",
          }
        })
      )

      await Promise.all(
        imgs.map((img) =>
          curationApi.patchStatus(
            backendUrl,
            img.hash,
            img.hash === selectedHash ? "approved" : "rejected"
          )
        )
      )
    },
    [backendUrl, imagesByFilename]
  )

  return {
    renderItems,
    allImages,
    setAllImages,
    loading,
    error,
    fetchData,
    imagesByFilename,
    doneCount,
    filteredRenderItems,
    unassignedGroups,
    unassignedTotalCount,
    statusFilter,
    setStatusFilter,
    searchTags,
    setSearchTags,
    searchInput,
    setSearchInput,
    candidates,
    setStatus,
    batchUpdateStatus,
    approveImage,
  }
}
