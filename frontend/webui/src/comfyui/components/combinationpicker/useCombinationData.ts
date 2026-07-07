import { useState, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { curationApi } from "../../hooks/useSavedImages"
import { hasApproved } from "../../types/Message"
import type { SavedImage } from "../../types/Message"
import type { RenderItem } from "./CombinationPickerComponents"
import {
  groupSavedImagesAsRenderItems,
  buildImagesByGroupKey,
  type FreeGroupBy,
} from "./freeCurationGroupers"

export interface CurationGroup {
  id: string
  name: string
  selectedAxis: string
  filters: Record<string, string>
}

interface UseCombinationDataProps {
  backendUrl: string
  activeTemplate: string
  freeGroupMode: FreeGroupBy | null
  hideEmptyCurationFolders?: boolean
  selectedAxis: string
  setSelectedAxis: (axis: string) => void
  activeGroupId: string
  setActiveGroupId: (id: string) => void
  activeFilters: Record<string, string>
  setActiveFilters: (filters: Record<string, string>) => void
  savedGroups: CurationGroup[]
  setSavedGroups: (groups: CurationGroup[]) => void
}

export function useCombinationData({
  backendUrl,
  activeTemplate,
  freeGroupMode,
  hideEmptyCurationFolders = false,
  selectedAxis,
  setSelectedAxis,
  activeGroupId,
  setActiveGroupId,
  activeFilters: activeCurationFilters,
  setActiveFilters: setActiveCurationFilters,
  savedGroups,
  setSavedGroups,
}: UseCombinationDataProps): {
  renderItems: RenderItem[]
  allImages: SavedImage[]
  setAllImages: React.Dispatch<React.SetStateAction<SavedImage[]>>
  loading: boolean
  error: string | null
  fetchData: () => Promise<void>
  imagesByFilename: Map<string, SavedImage[]>
  doneCount: number
  filteredRenderItems: RenderItem[]
  unassignedGroups: Map<string, SavedImage[]>
  unassignedTotalCount: number
  statusFilter: "all" | "done" | "pending"
  setStatusFilter: React.Dispatch<
    React.SetStateAction<"all" | "done" | "pending">
  >
  searchTags: string[]
  setSearchTags: React.Dispatch<React.SetStateAction<string[]>>
  searchInput: string
  setSearchInput: React.Dispatch<React.SetStateAction<string>>
  candidates: { value: string; type: "filename" | "metadata" }[]
  setStatus: (hash: string, status: SavedImage["status"]) => Promise<void>
  batchUpdateStatus: (
    filename: string,
    filter: (img: SavedImage) => boolean,
    status: SavedImage["status"]
  ) => Promise<void>
  approveImage: (filename: string, selectedHash: string) => Promise<void>
  updateImageMeta: (hash: string, meta: Record<string, string>) => Promise<void>
  uploadUserImage: (
    file: File,
    meta?: Record<string, string>
  ) => Promise<{ hash: string; filename: string }>
  activeCurationFilters: Record<string, string>
  setActiveCurationFilters: (filters: Record<string, string>) => void
  savedGroups: CurationGroup[]
  activeGroupId: string
  setActiveGroupId: (id: string) => void
  availableFilters: Record<string, string[]>
  saveCurationGroup: (name: string) => void
  deleteCurationGroup: (id: string) => void
  selectCurationGroup: (id: string) => void
} {
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
    setLoading(true)
    setError(null)
    try {
      if (!activeTemplate.trim()) {
        if (freeGroupMode !== null) {
          const imagesRes = await fetch(
            `${backendUrl}/saved-images?limit=5000`
          )
          if (!imagesRes.ok)
            throw new Error(`이미지 로드 실패: HTTP ${String(imagesRes.status)}`)
          const imagesData = (await imagesRes.json()) as { items: SavedImage[] }
          setAllImages(imagesData.items)
          setRawRenderItems(
            groupSavedImagesAsRenderItems(
              imagesData.items,
              freeGroupMode
            )
          )
        } else {
          setError("CEG 템플릿을 먼저 작성해주세요.")
          setRawRenderItems([])
        }
        return
      }

      const [renderRes, imagesRes] = await Promise.all([
        fetch(`${backendUrl}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: activeTemplate }),
        }),
        fetch(`${backendUrl}/saved-images?limit=5000`),
      ])
      if (!renderRes.ok)
        throw new Error(`렌더 실패: HTTP ${String(renderRes.status)}`)
      if (!imagesRes.ok)
        throw new Error(`이미지 로드 실패: HTTP ${String(imagesRes.status)}`)
      const renderData = (await renderRes.json()) as {
        items: RenderItem[]
        sets?: Record<string, string>
      }
      const imagesData = (await imagesRes.json()) as { items: SavedImage[] }

      if (freeGroupMode !== null) {
        setRawRenderItems(
          groupSavedImagesAsRenderItems(
            imagesData.items,
            freeGroupMode
          )
        )
      } else {
        setRawRenderItems(renderData.items)
      }
      setAllImages(imagesData.items)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backendUrl, activeTemplate, freeGroupMode])

  const availableFilters = useMemo(() => {
    const keys: Record<string, Set<string>> = {}
    for (const img of allImages) {
      if (img.status === "trashed") continue
      const imgMeta = img.meta ?? {}
      for (const [mKey, mVal] of Object.entries(imgMeta)) {
        if (mKey.startsWith("set.")) {
          const varName = mKey.slice("set.".length)
          keys[varName] ??= new Set<string>()
          if (mVal) {
            keys[varName].add(mVal)
          }
        }
      }
    }
    const result: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(keys)) {
      result[k] = Array.from(v).sort()
    }
    return result
  }, [allImages])

  const saveCurationGroup = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return

    const existing = savedGroups.find((g) => g.id === activeGroupId)
    if (existing) {
      const updated = savedGroups.map((g) =>
        g.id === activeGroupId
          ? {
              ...g,
              selectedAxis,
              filters: activeCurationFilters,
            }
          : g
      )
      setSavedGroups(updated)
      toast.success("큐레이션 그룹이 업데이트되었습니다.")
    } else {
      const next: CurationGroup = {
        id: `group-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        selectedAxis,
        filters: activeCurationFilters,
      }
      setSavedGroups([...savedGroups, next])
      setActiveGroupId(next.id)
      toast.success("새 큐레이션 그룹이 저장되었습니다.")
    }
  }, [activeGroupId, savedGroups, selectedAxis, activeCurationFilters, setSavedGroups, setActiveGroupId])

  const deleteCurationGroup = useCallback((id: string) => {
    setSavedGroups(savedGroups.filter((g) => g.id !== id))
    if (activeGroupId === id) {
      setActiveGroupId("__all__")
      setActiveCurationFilters({})
    }
    toast.success("큐레이션 그룹이 삭제되었습니다.")
  }, [activeGroupId, savedGroups, setSavedGroups, setActiveGroupId, setActiveCurationFilters])

  const selectCurationGroup = useCallback((id: string) => {
    if (id === "__all__") {
      setActiveGroupId("__all__")
      setActiveCurationFilters({})
      return
    }
    if (id.startsWith("preset:")) {
      const axis = id.slice("preset:".length)
      setActiveGroupId(id)
      setActiveCurationFilters({})
      setSelectedAxis(axis)
      return
    }
    const group = savedGroups.find((g) => g.id === id)
    if (group) {
      setActiveGroupId(id)
      setActiveCurationFilters(group.filters)
      setSelectedAxis(group.selectedAxis)
    }
  }, [savedGroups, setSelectedAxis, setActiveGroupId, setActiveCurationFilters])
  const updateActiveCurationFilters = useCallback((filters: Record<string, string>) => {
    setActiveCurationFilters(filters)
    setActiveGroupId("custom")
  }, [setActiveCurationFilters, setActiveGroupId])

  const imagesByFilename = useMemo(() => {
    // 1. 글로벌 필터 및 trashed 필터링 우선 적용 (템플릿/자유 모드 공통)
    const filteredImages = allImages.filter((img) => {
      if (img.status === "trashed") return false

      const imgMeta = img.meta ?? {}
      for (const [key, expectedVal] of Object.entries(activeCurationFilters)) {
        const actualVal = imgMeta[`set.${key}`]
        if (actualVal === undefined || actualVal !== expectedVal) {
          return false
        }
      }
      return true
    })

    if (freeGroupMode !== null) {
      return buildImagesByGroupKey(filteredImages, freeGroupMode)
    }

    const map = new Map<string, SavedImage[]>()
    for (const img of filteredImages) {
      let matchedFilename: string | null = null
      const imgMeta = img.meta ?? {}
      const hasMeta = Object.keys(imgMeta).length > 0

      if (hasMeta) {
        // 2. 그룹 분류 매칭: ri.meta에서 set.*를 제외한 순수 조합 축(Axis) 정보만 대조
        // 이미지와 renderItem의 축 키 집합이 정확히 일치할 때만 매칭한다.
        // (일부만 겹치는 더 적은 축의 renderItem에 잘못 매칭되는 것을 방지)
        // 단, 축이 아닌 메타데이터 마커(예: image-editor가 붙이는 source)는 제외한다.
        const isAxisKey = (key: string): boolean =>
          !key.startsWith("set.") && key !== "source" && key !== "mode"
        const imgAxisKeys = Object.keys(imgMeta).filter(isAxisKey).sort()
        for (const ri of rawRenderItems) {
          const riMetaKeys = Object.keys(ri.meta)
          const axisKeys = riMetaKeys.filter(isAxisKey)
          if (axisKeys.length === 0) continue

          if (axisKeys.length !== imgAxisKeys.length) continue
          const riAxisKeysSorted = axisKeys.slice().sort()
          let keysEqual = true
          for (let i = 0; i < riAxisKeysSorted.length; i++) {
            if (riAxisKeysSorted[i] !== imgAxisKeys[i]) {
              keysEqual = false
              break
            }
          }
          if (!keysEqual) continue

          let isMatch = true
          for (const key of axisKeys) {
            if (String(imgMeta[key]) !== String(ri.meta[key])) {
              isMatch = false
              break
            }
          }
          if (isMatch) {
            matchedFilename = ri.filename
            break
          }
        }
      }

      if (!matchedFilename) {
        const matchByFile = rawRenderItems.find(
          (ri) => ri.filename === img.originalFilename
        )
        if (matchByFile) {
          matchedFilename = matchByFile.filename
        }
      }

      if (matchedFilename) {
        if (!map.has(matchedFilename)) map.set(matchedFilename, [])
        map.get(matchedFilename)!.push(img)
      }
    }
    return map
  }, [allImages, rawRenderItems, freeGroupMode, activeCurationFilters])

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
        const cleanV = v.trim()
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
        const cleanSearch = searchInput
          .replace(/^[@$]/, "")
          .toLowerCase()
          .trim()
        if (cleanSearch) {
          const inFilename = ri.filename.toLowerCase().includes(cleanSearch)
          const inMetadata = metaValues.some((v) => v.includes(cleanSearch))
          if (!inFilename && !inMetadata) return false
        }
      }

      return true
    })
  }, [renderItems, imagesByFilename, statusFilter, searchTags, searchInput])

  const unassignedGroups = useMemo(() => {
    if (freeGroupMode !== null) return new Map<string, SavedImage[]>()
    const map = new Map<string, SavedImage[]>()

    const assignedHashes = new Set<string>()
    for (const imgs of imagesByFilename.values()) {
      for (const img of imgs) {
        assignedHashes.add(img.hash)
      }
    }

    for (const img of allImages) {
      if (img.status === "trashed") continue
      if (!assignedHashes.has(img.hash)) {
        if (!map.has(img.originalFilename)) map.set(img.originalFilename, [])
        map.get(img.originalFilename)!.push(img)
      }
    }
    return map
  }, [allImages, imagesByFilename, freeGroupMode])

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

  const updateImageMeta = useCallback(
    async (hash: string, meta: Record<string, string>) => {
      setAllImages((prev) =>
        prev.map((img) => (img.hash === hash ? { ...img, meta } : img))
      )
      await curationApi.patchMeta(backendUrl, hash, meta)
    },
    [backendUrl]
  )

  const uploadUserImage = useCallback(
    async (file: File, meta?: Record<string, string>) => {
      const form = new FormData()
      form.append("file", file)
      if (meta) {
        form.append("meta", JSON.stringify(meta))
      }
      setLoading(true)
      try {
        const res = await fetch(`${backendUrl}/saved-images/upload`, {
          method: "POST",
          body: form,
        })
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText)
          throw new Error(`이미지 업로드 실패: ${text}`)
        }
        const resJson = (await res.json()) as { hash: string; filename: string }
        toast.success("이미지가 성공적으로 업로드되었습니다.")
        await fetchData()
        return resJson
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "업로드 실패")
        throw err
      } finally {
        setLoading(false)
      }
    },
    [backendUrl, fetchData]
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
    updateImageMeta,
    uploadUserImage,
    activeCurationFilters,
    setActiveCurationFilters: updateActiveCurationFilters,
    savedGroups,
    activeGroupId,
    setActiveGroupId,
    availableFilters,
    saveCurationGroup,
    deleteCurationGroup,
    selectCurationGroup,
  }
}
