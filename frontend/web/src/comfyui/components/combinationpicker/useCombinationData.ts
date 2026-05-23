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
  const [filenameFilter, setFilenameFilter] = useState("")
  const [metadataFilter, setMetadataFilter] = useState("")

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

  const filteredRenderItems = useMemo(() => {
    return renderItems.filter((ri) => {
      const imgs = imagesByFilename.get(ri.filename) ?? []
      const isDone = hasApproved(imgs)

      if (statusFilter === "done" && !isDone) return false
      if (statusFilter === "pending" && isDone) return false

      if (filenameFilter.trim()) {
        const lowerFilename = ri.filename.toLowerCase()
        const lowerFilter = filenameFilter.toLowerCase().trim()
        if (!lowerFilename.includes(lowerFilter)) return false
      }

      if (metadataFilter.trim()) {
        const lowerMetaFilter = metadataFilter.toLowerCase().trim()
        const metaValues = Object.values(ri.meta)
        const anyMetaMatch = metaValues.some((v) =>
          v.toLowerCase().includes(lowerMetaFilter)
        )
        if (!anyMetaMatch) return false
      }

      return true
    })
  }, [
    renderItems,
    imagesByFilename,
    statusFilter,
    filenameFilter,
    metadataFilter,
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
    filenameFilter,
    setFilenameFilter,
    metadataFilter,
    setMetadataFilter,
    setStatus,
    batchUpdateStatus,
    approveImage,
  }
}
