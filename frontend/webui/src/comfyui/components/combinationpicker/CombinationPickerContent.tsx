import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import { useRenderLog } from "@/lib/renderLogger"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EmptyMedia,
} from "@/components/ui/empty"
import {
  AlertTriangleIcon,
  LayersIcon,
  SearchXIcon,
  ArrowUpIcon,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { curationApi } from "../../hooks/useSavedImages"
import { API, HEADERS } from "@/lib/api"
import { useSavedWorkflows } from "../../hooks/useSavedWorkflows"
import { useAsyncAction } from "../../hooks/useAsyncAction"
import { useLocalStorage } from "../../hooks/useLocalStorage"
import { useSyncedStorage } from "../../hooks/useSyncedStorage"
import { useLatestRef } from "../../hooks/useLatestRef"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import {
  downloadImagesAsZip,
  getImageFilename,
} from "../../utils/downloadImages"
import type { SavedImage } from "../../types/Message"
import type { RenderItem } from "./CombinationPickerComponents"
import { RegenerateDialog } from "./CombinationPickerComponents"
import { ImageViewer } from "../ImageViewer"
import { ImageDetail } from "../gallery/ImageDetail"
import { GalleryInpaintEditor } from "../GalleryInpaintEditor"
import { ImageEditorDialog } from "../image-editor/ImageEditorDialog"
import { hasApproved, findApproved } from "../../types/Message"
import { TournamentView } from "./CombinationPickerViews"
import { GalleryView, TableView } from "./CombinationPickerViews"

import { CombinationPickerToolbar } from "./CombinationPickerToolbar"
import { CombinationPickerUnassignedPanel } from "./CombinationPickerUnassignedPanel"
import {
  CombinationPickerSidebar,
  type SidebarFilter,
} from "./CombinationPickerSidebar"
import { CombinationPickerDetailView } from "./CombinationPickerDetailView"
import { useCurationContext } from "./CurationContext"
import type {
  CurationToolbarState,
  CurationViewMode,
} from "./CurationToolbarTypes"
import { useCurationToolbar } from "./useCurationToolbar"
import type { FreeGroupBy } from "./freeCurationGroupers"

function useSetToggle<T>(
  setValue: Dispatch<SetStateAction<Set<T>>>,
  onEmpty?: () => void
): (value: T) => void {
  return useCallback(
    (value: T) => {
      setValue((prev) => {
        const next = new Set(prev)
        if (next.has(value)) {
          next.delete(value)
          if (next.size === 0 && onEmpty) onEmpty()
        } else {
          next.add(value)
        }
        return next
      })
    },
    [setValue, onEmpty]
  )
}

type ViewMode = CurationViewMode

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.closest(
      "input, textarea, select, [contenteditable='true'], .cm-editor, [role='textbox']"
    ) !== null
  )
}

interface CombinationPickerContentProps {
  selectedAxis: string
  setSelectedAxis: (axis: string) => void
  activeTemplate: string
  isFreeMode: boolean
  freeGroupMode: FreeGroupBy | null
  toolbarState?: CurationToolbarState
  onSaveCegTemplate?: (template: string) => void
}

export const CombinationPickerContent = memo(function CombinationPickerContent({
  selectedAxis,
  setSelectedAxis,
  activeTemplate,
  isFreeMode,
  freeGroupMode,
  toolbarState,
  onSaveCegTemplate,
}: CombinationPickerContentProps) {
  useRenderLog("CombinationPickerContent")
  const {
    backendUrl,
    savedTemplates,
    savedWorkflows,
    autoApplyReject,
    data,
    selection,
  } = useCurationContext()

  const { saveMappingPreset, deleteMappingPreset } = useSavedWorkflows()

  const {
    renderItems,
    rawRenderItems,
    loading,
    error,
    fetchData,
    imagesByFilename,
    doneCount,
    filteredRenderItems,
    unassignedGroups,
    unassignedTotalCount,
    setStatusFilter,
    setSearchTags,
    setSearchInput,
    approveImage,
    setAllImages,
  } = data

  const { selectionMode, selectedFilenames, toggleSelect, exitSelectionMode } =
    selection

  const curationToolbarCtx = useCurationToolbar()

  // ── State ──
  const [selectedFilename, setSelectedFilename] = useLocalStorage<
    string | null
  >(STORAGE_KEYS.curationSelectedFilename, null)
  const [detailImage, setDetailImage] = useState<SavedImage | null>(null)
  const [inpaintImage, setInpaintImage] = useState<SavedImage | null>(null)
  const [editImage, setEditImage] = useState<SavedImage | null>(null)
  const [sidebarQuery, setSidebarQuery] = useState("")
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all")

  const [heldFilenames, setHeldFilenames] = useSyncedStorage<string[]>(
    STORAGE_KEYS.curationHeldFilenames,
    []
  )

  const toggleHoldCuration = useCallback((filename: string) => {
    setHeldFilenames((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
        toast.success("보류 상태가 해제되었습니다.")
      } else {
        next.add(filename)
        toast.success("보류 조합으로 지정되었습니다.")
      }
      return Array.from(next)
    })
  }, [setHeldFilenames])

  const exportAction = useAsyncAction(3000)
  const regenAction = useAsyncAction(3000)

  // hideTopSection일 때 뷰 모드는 context에서 관리
  const viewMode =
    (toolbarState?.hideTopSection ?? false)
      ? curationToolbarCtx.viewMode
      : (toolbarState?.viewMode ?? curationToolbarCtx.viewMode)
  const setViewMode =
    (toolbarState?.hideTopSection ?? false)
      ? curationToolbarCtx.setViewMode
      : (toolbarState?.setViewMode ?? curationToolbarCtx.setViewMode)
  const [compareImageKeys, setCompareImageKeys] = useState<Set<string>>(
    new Set()
  )
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const handleScroll = (): void => {
      if (window.scrollY > 400) {
        setShowScrollTop(true)
      } else {
        setShowScrollTop(false)
      }
    }
    window.addEventListener("scroll", handleScroll)
    return (): void => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])
  const compareImageCount = compareImageKeys.size
  const [previewHash, setPreviewHash] = useState<string | null>(null)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  const bulkRegenAction = useAsyncAction(4000)
  const bulkDownloadAction = useAsyncAction(8000)

  // 재생성 다이얼로그 관련 상태
  const [regenDialogState, setRegenDialogState] = useState<{
    open: boolean
    sourceImages: SavedImage[]
    targetItem?: RenderItem
    targetItems?: RenderItem[]
    templateOverride?: string
  }>({ open: false, sourceImages: [] })
  const [cegDraftByFilename, setCegDraftByFilename] = useState<
    Record<string, string>
  >({})

  // 미할당 이미지(고아) 관리 관련 상태
  const [unassignedSelectedFilenames, setUnassignedSelectedFilenames] =
    useState<Set<string>>(new Set())
  const [showTrueOrphansOnly, setShowTrueOrphansOnly] = useState(false)
  const [templateAffiliationCache, setTemplateAffiliationCache] = useState<
    Map<string, string[]>
  >(new Map())
  const [checkingTemplates, setCheckingTemplates] = useState(false)
  const bulkTrashAction = useAsyncAction(4000)

  // ── Refs for latest values ────────────────────────────────────────
  const checkingTemplatesRef = useLatestRef(checkingTemplates)
  const savedTemplatesRef = useLatestRef(savedTemplates)
  const activeTemplateRef = useLatestRef(activeTemplate)
  const backendUrlRef = useLatestRef(backendUrl)

  // 템플릿 소속 확인 함수 (lazy: 사용자가 패널 열었을 때)
  const checkTemplateAffiliation = useCallback(async () => {
    if (checkingTemplatesRef.current || savedTemplatesRef.current.length === 0)
      return
    setCheckingTemplates(true)
    const cache = new Map<string, string[]>()
    try {
      const allTemplateSpecs: {
        id: string
        name: string
        template: string
      }[] = [
        {
          id: "__current__",
          name: "현재 편집 중인 템플릿",
          template: activeTemplateRef.current,
        },
        ...savedTemplatesRef.current.map((st) => ({
          id: st.id,
          name: st.name,
          template: st.template,
        })),
      ]
      for (const spec of allTemplateSpecs) {
        if (!spec.template.trim()) continue
        try {
          const res = await fetch(`${backendUrlRef.current}/render`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: spec.template }),
          })
          if (!res.ok) continue
          const data = (await res.json()) as { items: RenderItem[] }
          for (const item of data.items) {
            const existing = cache.get(item.filename) ?? []
            if (!existing.includes(spec.name)) {
              existing.push(spec.name)
              cache.set(item.filename, existing)
            }
          }
        } catch {
          // 템플릿 렌더 실패 시 스킵
        }
      }
      setTemplateAffiliationCache(cache)
    } finally {
      setCheckingTemplates(false)
    }
  }, [
    activeTemplateRef,
    backendUrlRef,
    checkingTemplatesRef,
    savedTemplatesRef,
  ])

  // 미할당 패널 열릴 때 템플릿 소속 확인 실행
  useEffect(() => {
    if (
      curationToolbarCtx.showUnassignedPanel &&
      templateAffiliationCache.size === 0
    ) {
      void checkTemplateAffiliation()
    }
  }, [
    curationToolbarCtx.showUnassignedPanel,
    templateAffiliationCache.size,
    checkTemplateAffiliation,
  ])

  // 미할당 그룹 - 완전 고아 필터 적용
  const filteredUnassignedGroups = useMemo(() => {
    if (!showTrueOrphansOnly) return unassignedGroups
    const filtered = new Map<string, SavedImage[]>()
    for (const [filename, imgs] of unassignedGroups) {
      const affiliations = templateAffiliationCache.get(filename)
      if (!affiliations || affiliations.length === 0) {
        filtered.set(filename, imgs)
      }
    }
    return filtered
  }, [unassignedGroups, showTrueOrphansOnly, templateAffiliationCache])

  // 미할당 그룹에서 선택 토글
  const handleUnassignedToggleSelect = useSetToggle(
    setUnassignedSelectedFilenames
  )

  // 미할당 그룹 전체 선택 / 해제
  const handleUnassignedSelectAll = useCallback(() => {
    const allFilenames = Array.from(filteredUnassignedGroups.keys())
    if (
      unassignedSelectedFilenames.size === allFilenames.length &&
      allFilenames.length > 0
    ) {
      setUnassignedSelectedFilenames(new Set())
    } else {
      setUnassignedSelectedFilenames(new Set(allFilenames))
    }
  }, [filteredUnassignedGroups, unassignedSelectedFilenames])

  // 미할당 이미지 선택 항목 일괄 trash 처리
  const handleBulkTrash = useCallback(async () => {
    if (bulkTrashAction.isLoading || unassignedSelectedFilenames.size === 0)
      return
    const selectedCount = unassignedSelectedFilenames.size
    const result = await bulkTrashAction.execute(
      async () => {
        let trashedCount = 0
        for (const filename of unassignedSelectedFilenames) {
          const imgs = unassignedGroups.get(filename) ?? []
          for (const img of imgs) {
            if (img.status !== "trashed") {
              await curationApi.patchStatus(backendUrl, img.hash, "trashed")
              trashedCount++
            }
          }
        }
        return trashedCount
      },
      (trashedCount) =>
        `${String(selectedCount)}개 그룹, ${String(trashedCount)}장 휴지통으로 이동`,
      "삭제 실패"
    )
    if (result !== null) {
      setAllImages((prev) =>
        prev.map((img) =>
          unassignedSelectedFilenames.has(img.originalFilename) &&
          img.status !== "trashed"
            ? { ...img, status: "trashed" as const, trashedAt: Date.now() }
            : img
        )
      )
      setUnassignedSelectedFilenames(new Set())
    }
  }, [
    backendUrl,
    unassignedSelectedFilenames,
    unassignedGroups,
    bulkTrashAction,
    setAllImages,
  ])

  // 미할당 패널 닫기
  const closeUnassignedPanel = useCallback(() => {
    curationToolbarCtx.setShowUnassignedPanel(false)
    setUnassignedSelectedFilenames(new Set())
  }, [curationToolbarCtx])

  const selectedImages = useMemo(
    () =>
      (selectedFilename !== null
        ? (imagesByFilename.get(selectedFilename) ?? [])
        : []
      ).sort((a, b) => a.createdAt - b.createdAt),
    [selectedFilename, imagesByFilename]
  )
  const selectedApprovedHash = findApproved(selectedImages)?.hash

  const visibleImages = useMemo(
    () =>
      selectedImages.filter(
        (img) => !curationToolbarCtx.hideRejected || img.status !== "rejected"
      ),
    [selectedImages, curationToolbarCtx.hideRejected]
  )

  const sidebarFilteredItems = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase()
    // '빈 폴더' 필터는 hideEmptyCurationFolders 설정과 무관하게 빈 폴더를 보여주기 위해
    // 필터링되지 않은 전체 목록(rawRenderItems)에서 추출한다.
    const source = sidebarFilter === "empty" ? rawRenderItems : renderItems
    return source.filter((item) => {
      const imgs = imagesByFilename.get(item.filename) ?? []
      const isDone = hasApproved(imgs)
      const isHeld = heldFilenames.includes(item.filename)

      if (sidebarFilter === "done" && !isDone) return false
      if (sidebarFilter === "pending" && (isDone || isHeld)) return false
      if (sidebarFilter === "held" && (!isHeld || isDone)) return false
      if (sidebarFilter === "has-images" && imgs.length === 0) return false
      if (sidebarFilter === "empty" && imgs.length > 0) return false

      if (q === "") return true
      const haystack = [
        item.filename,
        item.prompt,
        ...Object.values(item.meta),
        ...imgs.flatMap((img) => [
          img.originalFilename,
          img.prompt,
          img.status,
          ...(img.tags ?? []),
        ]),
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [imagesByFilename, renderItems, rawRenderItems, sidebarFilter, sidebarQuery, heldFilenames])

  const sidebarTotalCount = rawRenderItems.length

  const pendingRenderItems = useMemo(
    () =>
      renderItems.filter(
        (item) => !hasApproved(imagesByFilename.get(item.filename) ?? [])
      ),
    [imagesByFilename, renderItems]
  )

  // ── Handlers ──
  const navigateTo = useCallback(
    (direction: "prev" | "next") => {
      if (sidebarFilteredItems.length === 0) return
      const currentIdx = sidebarFilteredItems.findIndex(
        (ri) => ri.filename === selectedFilename
      )
      const nextIdx =
        currentIdx === -1
          ? direction === "next"
            ? 0
            : sidebarFilteredItems.length - 1
          : direction === "next"
            ? currentIdx + 1
            : currentIdx - 1
      if (nextIdx >= 0 && nextIdx < sidebarFilteredItems.length) {
        const item = sidebarFilteredItems[nextIdx]
        if (item !== undefined) {
          setSelectedFilename(item.filename)
        }
      }
    },
    [sidebarFilteredItems, selectedFilename, setSelectedFilename]
  )

  const handleSelectImage = useCallback(
    async (filename: string, selectedHash: string) => {
      await approveImage(filename, selectedHash)

      if (curationToolbarCtx.autoAdvance) {
        const currentIdx = renderItems.findIndex(
          (ri) => ri.filename === filename
        )
        const next = renderItems.find((ri, idx) => {
          if (idx <= currentIdx) return false
          const nextImgs = imagesByFilename.get(ri.filename) ?? []
          return !hasApproved(nextImgs)
        })
        if (next) setSelectedFilename(next.filename)
      }
    },
    [
      approveImage,
      curationToolbarCtx.autoAdvance,
      renderItems,
      imagesByFilename,
      setSelectedFilename,
    ]
  )

  const handleExport = useCallback(async () => {
    if (exportAction.isLoading || doneCount === 0) return
    await exportAction.execute(
      async () => {
        const approvedFilenames = renderItems
          .filter((ri) => hasApproved(imagesByFilename.get(ri.filename) ?? []))
          .map((ri) => ri.filename)
        await curationApi.exportDataset(backendUrl, {
          filenames: approvedFilenames,
          duplicateStrategy: curationToolbarCtx.duplicateStrategy,
        })
        return approvedFilenames.length
      },
      (count) => `${String(count)}개 파일 내보내기 완료`,
      "내보내기 실패"
    )
  }, [
    backendUrl,
    exportAction,
    doneCount,
    renderItems,
    imagesByFilename,
    curationToolbarCtx.duplicateStrategy,
  ])

  const handleContextMenuRegenerate = useCallback(
    (filename: string) => {
      if (isFreeMode && freeGroupMode !== "filename") return
      const images = imagesByFilename.get(filename) ?? []
      const draft = cegDraftByFilename[filename]
      const targetItem = renderItems.find((item) => item.filename === filename)
      setRegenDialogState({
        open: true,
        sourceImages: images,
        ...(targetItem !== undefined ? { targetItem } : {}),
        ...(draft !== undefined && draft !== activeTemplate
          ? { templateOverride: draft }
          : {}),
      })
    },
    [
      activeTemplate,
      cegDraftByFilename,
      freeGroupMode,
      imagesByFilename,
      isFreeMode,
      renderItems,
    ]
  )

  const handleRegenDone = useCallback(() => {
    setRegenDialogState((prev) => ({ ...prev, open: false }))
    if (
      regenDialogState.sourceImages.length > 1 ||
      (regenDialogState.targetItems?.length ?? 0) > 1
    ) {
      exitSelectionMode()
    }
  }, [
    exitSelectionMode,
    regenDialogState.sourceImages,
    regenDialogState.targetItems,
  ])

  const handleOpen = useCallback(
    (filename: string) => {
      exitSelectionMode()
      setSelectedFilename(filename)
      setViewMode("grid")
    },
    [exitSelectionMode, setViewMode, setSelectedFilename]
  )

  const handleRejectAll = useCallback(() => {
    if (selectedFilename === null) return
    void data.batchUpdateStatus(
      selectedFilename,
      (img) => img.status !== "approved" && img.status !== "rejected",
      "rejected"
    )
  }, [data, selectedFilename])

  const handleCancelAllRejects = useCallback(() => {
    if (selectedFilename === null) return
    void data.batchUpdateStatus(
      selectedFilename,
      (img) => img.status === "rejected",
      "pending"
    )
  }, [data, selectedFilename])

  const handleCancelApproval = useCallback(() => {
    if (selectedFilename === null) return
    void data.batchUpdateStatus(
      selectedFilename,
      (img) => img.status === "approved" || img.status === "rejected",
      "pending"
    )
  }, [data, selectedFilename])

  // 선택 모드 진입 (long press)
  const handleLongPress = useCallback(
    (filename: string) => {
      if (!selectionMode) {
        toggleSelect(filename)
      }
    },
    [selectionMode, toggleSelect]
  )

  // 선택된 항목들 일괄 재생성
  const handleBulkRegenerate = useCallback(() => {
    if (selectedFilenames.size === 0) return
    if (isFreeMode && freeGroupMode !== "filename") return
    const allImages: SavedImage[] = []
    for (const filename of selectedFilenames) {
      const imgs = imagesByFilename.get(filename) ?? []
      allImages.push(...imgs)
    }
    const targetItems = renderItems.filter((item) =>
      selectedFilenames.has(item.filename)
    )
    setRegenDialogState({
      open: true,
      sourceImages: allImages,
      targetItems,
    })
  }, [
    selectedFilenames,
    isFreeMode,
    freeGroupMode,
    imagesByFilename,
    renderItems,
  ])

  const handleRegeneratePending = useCallback(() => {
    if (pendingRenderItems.length === 0) return
    if (isFreeMode && freeGroupMode !== "filename") return
    const allImages: SavedImage[] = []
    for (const item of pendingRenderItems) {
      allImages.push(...(imagesByFilename.get(item.filename) ?? []))
    }
    setRegenDialogState({
      open: true,
      sourceImages: allImages,
      targetItems: pendingRenderItems,
    })
  }, [
    freeGroupMode,
    imagesByFilename,
    isFreeMode,
    pendingRenderItems,
  ])

  const handleRegenerateHeld = useCallback(() => {
    const heldItems = rawRenderItems.filter(
      (item) =>
        heldFilenames.includes(item.filename) &&
        !hasApproved(imagesByFilename.get(item.filename) ?? [])
    )
    if (heldItems.length === 0) return
    if (isFreeMode && freeGroupMode !== "filename") return
    const allImages: SavedImage[] = []
    for (const item of heldItems) {
      allImages.push(...(imagesByFilename.get(item.filename) ?? []))
    }
    setRegenDialogState({
      open: true,
      sourceImages: allImages,
      targetItems: heldItems,
    })
  }, [
    freeGroupMode,
    imagesByFilename,
    isFreeMode,
    rawRenderItems,
    heldFilenames,
  ])

  const handleRegenerateEmpty = useCallback(() => {
    const emptyItems = rawRenderItems.filter(
      (item) => (imagesByFilename.get(item.filename) ?? []).length === 0
    )
    if (emptyItems.length === 0) return
    if (isFreeMode && freeGroupMode !== "filename") return
    setRegenDialogState({
      open: true,
      sourceImages: [],
      targetItems: emptyItems,
    })
  }, [
    freeGroupMode,
    imagesByFilename,
    isFreeMode,
    rawRenderItems,
  ])

  const heldRegenerateCount = useMemo(
    () =>
      rawRenderItems.filter(
        (item) =>
          heldFilenames.includes(item.filename) &&
          !hasApproved(imagesByFilename.get(item.filename) ?? [])
      ).length,
    [rawRenderItems, heldFilenames, imagesByFilename]
  )

  const emptyRegenerateCount = useMemo(
    () =>
      rawRenderItems.filter(
        (item) => (imagesByFilename.get(item.filename) ?? []).length === 0
      ).length,
    [rawRenderItems, imagesByFilename]
  )

  const handleBulkDownload = useCallback(async () => {
    if (bulkDownloadAction.isLoading || selectedFilenames.size === 0) return
    await bulkDownloadAction.execute(
      async () => {
        const downloads: { url: string; filename: string }[] = []
        for (const filename of selectedFilenames) {
          const imgs = imagesByFilename.get(filename) ?? []
          for (const img of imgs) {
            if (img.status === "rejected" || img.status === "trashed") continue
            downloads.push({
              url: `${backendUrl}/saved-images/${img.hash}`,
              filename: `${filename}/${getImageFilename(img)}`,
            })
          }
        }
        await downloadImagesAsZip(downloads, "curation-images.zip")
        return downloads.length
      },
      (count) => `${String(count)}장 다운로드 완료`,
      "다운로드 실패"
    )
  }, [backendUrl, selectedFilenames, imagesByFilename, bulkDownloadAction])

  const toggleCompareImage = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCompareImageKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // ── Register toolbar handlers with context ──
  useEffect(() => {
    curationToolbarCtx.setExportHandler(() => {
      void handleExport()
    })
  }, [curationToolbarCtx, handleExport])

  useEffect(() => {
    curationToolbarCtx.setRefreshHandler(() => {
      void fetchData()
    })
  }, [curationToolbarCtx, fetchData])

  useEffect(() => {
    curationToolbarCtx.setUnassignedGroupsSize(unassignedGroups.size)
  }, [curationToolbarCtx, unassignedGroups.size])

  // autoAdvance 초기값을 autoApplyReject prop에서 동기화
  useEffect(() => {
    if (autoApplyReject) {
      const timer = window.setTimeout(() => {
        curationToolbarCtx.setAutoAdvance(true)
      }, 0)
      return (): void => {
        window.clearTimeout(timer)
      }
    }
    return undefined
  }, [autoApplyReject, curationToolbarCtx])

  // ── Keyboard Handler ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (regenDialogState.open) return
      if (isEditableEventTarget(e.target)) return

      if (selectionMode) {
        if (e.key === "Escape") {
          exitSelectionMode()
        }
        return
      }

      if (selectedFilename !== null) {
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault()
          navigateTo("next")
        } else if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault()
          navigateTo("prev")
        } else if (e.key === "r" || e.key === "R") {
          e.preventDefault()
          e.stopPropagation()
          handleContextMenuRegenerate(selectedFilename)
        } else if (e.key === "h" || e.key === "H") {
          e.preventDefault()
          e.stopPropagation()
          toggleHoldCuration(selectedFilename)
        } else if (e.key === "Escape") {
          setSelectedFilename(null)
          setViewMode("gallery")
        } else if (e.key >= "1" && e.key <= "9") {
          const idx = parseInt(e.key) - 1
          if (idx < visibleImages.length) {
            const img = visibleImages[idx]
            if (img !== undefined) {
              void handleSelectImage(selectedFilename, img.hash)
            }
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return (): void => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [
    selectedFilename,
    navigateTo,
    handleContextMenuRegenerate,
    handleSelectImage,
    visibleImages,
    selectionMode,
    exitSelectionMode,
    setViewMode,
    setSelectedFilename,
    regenDialogState.open,
    toggleHoldCuration,
  ])

  const handleTabChange = useCallback(
    (v: ViewMode) => {
      setViewMode(v)
      if (v === "gallery" || v === "table") {
        setSelectedFilename(null)
        exitSelectionMode()
      } else if (selectedFilename === null && renderItems.length > 0) {
        const firstItem = renderItems[0]
        if (firstItem !== undefined) {
          setSelectedFilename(firstItem.filename)
        }
      }
    },
    [
      setViewMode,
      setSelectedFilename,
      exitSelectionMode,
      selectedFilename,
      renderItems,
    ]
  )

  const handleCegDraftChange = useCallback(
    (value: string) => {
      if (selectedFilename === null) return
      setCegDraftByFilename((prev) => {
        if (prev[selectedFilename] === value) return prev
        return {
          ...prev,
          [selectedFilename]: value,
        }
      })
    },
    [selectedFilename]
  )

  const handleResetCegDraft = useCallback(() => {
    if (selectedFilename === null) return
    setCegDraftByFilename((prev) => {
      if (prev[selectedFilename] === undefined) return prev
      const next = { ...prev }
      delete next[selectedFilename]
      return next
    })
  }, [selectedFilename])

  // ── Render ──
  if (loading)
    return (
      <div className="m-4 flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/5 py-32">
        <div className="flex flex-col items-center gap-4 text-center">
          <Spinner className="h-10 w-10 text-primary opacity-40" />
          <div className="space-y-1">
            <p className="text-base font-bold text-foreground">
              데이터를 불러오는 중입니다
            </p>
            <p className="text-sm text-muted-foreground">
              이미지와 렌더링 정보를 동기화하고 있습니다...
            </p>
          </div>
        </div>
      </div>
    )

  if (error !== null)
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-20">
        <Empty className="max-w-md border-destructive/20 bg-destructive/5 shadow-none">
          <EmptyMedia variant="icon">
            <AlertTriangleIcon className="size-10 text-destructive opacity-40" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="text-lg font-bold text-destructive">
              설정 오류 발생
            </EmptyTitle>
            <EmptyDescription className="font-medium text-destructive/70">
              {error}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            onClick={() => {
              void fetchData()
            }}
            variant="outline"
            className="mt-4 border-destructive/30 font-bold transition-all hover:bg-destructive/10 hover:text-destructive"
          >
            다시 시도
          </Button>
        </Empty>
      </div>
    )

  if (renderItems.length === 0)
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-20">
        <Empty className="max-w-lg py-20 shadow-none">
          <EmptyMedia variant="icon">
            <LayersIcon className="size-12 opacity-10" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="text-xl font-black tracking-tight">
              {isFreeMode
                ? "분류할 이미지가 없습니다"
                : "렌더링된 조합이 없습니다"}
            </EmptyTitle>
            <EmptyDescription className="text-base">
              {isFreeMode
                ? "저장된 이미지가 없거나 현재 그룹화 기준으로 분류할 수 없습니다. 다른 그룹화 기준을 선택하거나 작업을 먼저 실행해 보세요."
                : "'작업' 탭에서 템플릿을 작성하고 실행하면 생성된 이미지들의 조합이 여기에 표시됩니다."}
            </EmptyDescription>
          </EmptyHeader>
          {!isFreeMode && (
            <p className="mt-2 text-xs text-muted-foreground/60 italic">
              Tip: 템플릿의 &#123;&#123;axis&#125;&#125;와
              &#123;&#123;combine&#125;&#125; 문법을 확인해주세요.
            </p>
          )}
        </Empty>
      </div>
    )

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Toolbar ── */}
      <CombinationPickerToolbar
        selectedAxis={selectedAxis}
        setSelectedAxis={setSelectedAxis}
        hideTopSection={toolbarState?.hideTopSection ?? false}
        viewMode={viewMode}
        onViewModeChange={handleTabChange}
        selectedFilename={selectedFilename}
        compareImageCount={compareImageCount}
        filtersExpanded={curationToolbarCtx.filtersExpanded}
        setFiltersExpanded={curationToolbarCtx.setFiltersExpanded}
        hideRejected={curationToolbarCtx.hideRejected}
        setHideRejected={curationToolbarCtx.setHideRejected}
        autoAdvance={curationToolbarCtx.autoAdvance}
        setAutoAdvance={curationToolbarCtx.setAutoAdvance}
        duplicateStrategy={curationToolbarCtx.duplicateStrategy}
        setDuplicateStrategy={curationToolbarCtx.setDuplicateStrategy}
        unassignedGroupsSize={unassignedGroups.size}
        unassignedTotalCount={unassignedTotalCount}
        showUnassignedPanel={curationToolbarCtx.showUnassignedPanel}
        setShowUnassignedPanel={curationToolbarCtx.setShowUnassignedPanel}
        handleBulkRegenerate={handleBulkRegenerate}
        handleRegeneratePending={handleRegeneratePending}
        pendingRegenerateCount={pendingRenderItems.length}
        pendingRegenerateDisabled={
          isFreeMode && freeGroupMode !== "filename"
        }
        heldFilenames={heldFilenames}
        handleRegenerateHeld={handleRegenerateHeld}
        handleRegenerateEmpty={handleRegenerateEmpty}
        heldRegenerateCount={heldRegenerateCount}
        emptyRegenerateCount={emptyRegenerateCount}
        bulkRegenActionMessage={bulkRegenAction.message}
        handleBulkDownload={() => {
          void handleBulkDownload()
        }}
        bulkDownloadIsLoading={bulkDownloadAction.isLoading}
        bulkDownloadMessage={bulkDownloadAction.message}
        handleExport={toolbarState?.onExport ?? handleExport}
        exportActionIsLoading={
          toolbarState?.exportIsLoading ?? exportAction.isLoading
        }
        exportActionMessage={
          toolbarState?.exportMessage ?? exportAction.message
        }
        regenActionMessage={toolbarState?.regenMessage ?? regenAction.message}
      />

      {/* ── Scrollable Content ── */}
      <div className="flex-1 p-2 sm:p-3 md:p-4">
        {/* 미할당 이미지 관리 패널 */}
        {curationToolbarCtx.showUnassignedPanel && !isFreeMode && (
          <CombinationPickerUnassignedPanel
            filteredUnassignedGroups={filteredUnassignedGroups}
            templateAffiliationCache={templateAffiliationCache}
            showTrueOrphansOnly={showTrueOrphansOnly}
            setShowTrueOrphansOnly={setShowTrueOrphansOnly}
            checkingTemplates={checkingTemplates}
            checkTemplateAffiliation={() => {
              void checkTemplateAffiliation()
            }}
            unassignedSelectedFilenames={unassignedSelectedFilenames}
            handleUnassignedToggleSelect={handleUnassignedToggleSelect}
            handleUnassignedSelectAll={handleUnassignedSelectAll}
            handleBulkTrash={() => {
              void handleBulkTrash()
            }}
            bulkTrashActionIsLoading={bulkTrashAction.isLoading}
            bulkTrashActionMessage={bulkTrashAction.message}
            closeUnassignedPanel={closeUnassignedPanel}
          />
        )}

        {/* 메인 레이아웃 */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          {/* 왼쪽: 조합 리스트 (상세 보기일 때만 노출, 모바일에서는 숨김) */}
          {selectedFilename !== null && (
            <div className="hidden flex-none py-4 md:flex">
              <CombinationPickerSidebar
                selectedFilename={selectedFilename}
                setSelectedFilename={setSelectedFilename}
                items={sidebarFilteredItems}
                totalCount={sidebarTotalCount}
                query={sidebarQuery}
                setQuery={setSidebarQuery}
                filter={sidebarFilter}
                setFilter={setSidebarFilter}
                heldFilenames={heldFilenames}
              />
            </div>
          )}

          {/* 오른쪽: 콘텐츠 영역 */}
          {selectedFilename === null ? (
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {filteredRenderItems.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-4 py-20">
                  <Empty className="max-w-md border-dashed bg-muted/5 py-10 shadow-none">
                    <EmptyMedia variant="icon">
                      <SearchXIcon className="size-10 text-muted-foreground/30" />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle className="text-lg font-bold">
                        검색 결과가 없습니다
                      </EmptyTitle>
                      <EmptyDescription>
                        설정한 필터 조건에 맞는 조합이 없습니다. 필터를
                        초기화하거나 검색어를 확인해주세요.
                      </EmptyDescription>
                    </EmptyHeader>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 font-bold"
                      onClick={() => {
                        setStatusFilter("all")
                        setSearchTags([])
                        setSearchInput("")
                      }}
                    >
                      모든 필터 초기화
                    </Button>
                  </Empty>
                </div>
              ) : (
                <div>
                  {viewMode === "gallery" ? (
                    <GalleryView
                      onSelect={(filename) => {
                        setSelectedFilename(filename)
                        setViewMode("grid")
                      }}
                      onOpen={handleOpen}
                      onLongPress={handleLongPress}
                      onRegenerate={handleContextMenuRegenerate}
                    />
                  ) : (
                    <TableView
                      onSelect={(filename) => {
                        setSelectedFilename(filename)
                        setViewMode("grid")
                      }}
                      onOpen={handleOpen}
                      onLongPress={handleLongPress}
                      onRegenerate={handleContextMenuRegenerate}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <CombinationPickerDetailView
                selectedFilename={selectedFilename}
                visibleImages={visibleImages}
                selectedApprovedHash={selectedApprovedHash ?? null}
                compareImageKeys={compareImageKeys}
                viewMode={viewMode}
                activeTemplate={activeTemplate}
                cegDraft={cegDraftByFilename[selectedFilename] ?? activeTemplate}
                onCegDraftChange={handleCegDraftChange}
                onResetCegDraft={handleResetCegDraft}
                onSaveCegDraft={(value) => {
                  onSaveCegTemplate?.(value)
                  handleResetCegDraft()
                }}
                onBack={() => {
                  setSelectedFilename(null)
                  setViewMode("gallery")
                }}
                onSetPreviewHash={setPreviewHash}
                onToggleCompareImage={toggleCompareImage}
                onSelectImage={(filename, hash) => {
                  void handleSelectImage(filename, hash)
                }}
                onRegenerate={handleContextMenuRegenerate}
                regenActionIsLoading={regenAction.isLoading}
                onRejectAll={handleRejectAll}
                onCancelAllRejects={handleCancelAllRejects}
                onCancelApproval={handleCancelApproval}
                onNavigate={navigateTo}
                onOpenList={() => {
                  setIsMobileSidebarOpen(true)
                }}
                onOpenDetail={(img) => {
                  setDetailImage(img)
                }}
                onInpaint={(img) => {
                  setInpaintImage(img)
                }}
                onEdit={(img) => {
                  setEditImage(img)
                }}
                heldFilenames={heldFilenames}
                onToggleHold={() => toggleHoldCuration(selectedFilename)}
              />
              {viewMode === "tournament" && (
                <div className="flex-1 overflow-hidden">
                  <TournamentView
                    images={visibleImages}
                    onComplete={(hash) => {
                      void handleSelectImage(selectedFilename, hash)
                      setViewMode("grid")
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 모바일 사이드바 시트 */}
        <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
          <SheetContent
            side="left"
            className="flex w-[85vw] flex-col p-0"
            onPointerDownOutside={(e) => {
              if (previewHash !== null) {
                e.preventDefault()
              }
            }}
            onInteractOutside={(e) => {
              if (previewHash !== null) {
                e.preventDefault()
              }
            }}
          >
            <SheetHeader className="shrink-0 border-b p-4">
              <SheetTitle>조합 목록</SheetTitle>
            </SheetHeader>
            <div className="no-scrollbar flex-1 overflow-y-auto">
              <CombinationPickerSidebar
                selectedFilename={selectedFilename ?? ""}
                setSelectedFilename={(fn) => {
                  setSelectedFilename(fn)
                  setIsMobileSidebarOpen(false)
                }}
                items={sidebarFilteredItems}
                totalCount={sidebarTotalCount}
                query={sidebarQuery}
                setQuery={setSidebarQuery}
                filter={sidebarFilter}
                setFilter={setSidebarFilter}
                heldFilenames={heldFilenames}
              />
            </div>
          </SheetContent>
        </Sheet>

        <RegenerateDialog
          open={regenDialogState.open}
          onOpenChange={(open) => {
            setRegenDialogState((prev) => ({ ...prev, open }))
          }}
          sourceImages={regenDialogState.sourceImages}
          {...(regenDialogState.targetItem !== undefined
            ? { targetItem: regenDialogState.targetItem }
            : {})}
          {...(regenDialogState.targetItems !== undefined
            ? { targetItems: regenDialogState.targetItems }
            : {})}
          backendUrl={backendUrl}
          currentCegTemplate={regenDialogState.templateOverride ?? activeTemplate}
          preferCurrentTemplate={regenDialogState.templateOverride !== undefined}
          savedTemplates={savedTemplates}
          savedWorkflows={savedWorkflows}
          saveMappingPreset={saveMappingPreset}
          deleteMappingPreset={deleteMappingPreset}
          onSubmit={async (items) => {
            const result = await regenAction.execute(
              async (): Promise<number> => {
                const res = await fetch(`${backendUrl}${API.jobs.root}`, {
                  method: "POST",
                  headers: HEADERS.json,
                  body: JSON.stringify({ items }),
                })
                if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
                const data = (await res.json()) as { jobIds?: string[] }
                return data.jobIds?.length ?? items.length
              },
              (count: number) => `${String(count)}개 작업 추가됨`,
              "재생성 실패"
            )
            if (result !== null) {
              handleRegenDone()
            }
          }}
          isLoading={regenAction.isLoading}
        />

        {/* 이미지 미리보기 팝업 */}
        <ImageViewer
          src={`${backendUrl}/saved-images/${previewHash ?? ""}`}
          isOpen={previewHash !== null}
          onClose={() => {
            setPreviewHash(null)
          }}
        />

        {/* 이미지 상세 정보 모달 */}
        {detailImage && (
          <ImageDetail
            backendUrl={backendUrl}
            image={detailImage}
            onClose={() => {
              setDetailImage(null)
            }}
            onChanged={() => {
              void fetchData()
            }}
          />
        )}
        {inpaintImage && (
          <GalleryInpaintEditor
            open={inpaintImage !== null}
            backendUrl={backendUrl}
            imageUrl={`${backendUrl}/saved-images/${inpaintImage.hash}`}
            filename={getImageFilename(inpaintImage)}
            sourcePrompt={inpaintImage.prompt}
            sourceMeta={inpaintImage.meta}
            onOpenChange={(open) => {
              if (!open) setInpaintImage(null)
            }}
          />
        )}
        {editImage && (
          <ImageEditorDialog
            open={editImage !== null}
            backendUrl={backendUrl}
            imageUrl={`${backendUrl}/saved-images/${editImage.hash}`}
            filename={getImageFilename(editImage)}
            parentHash={editImage.hash}
            onOpenChange={(open) => {
              if (!open) setEditImage(null)
            }}
            onSaveSuccess={() => {
              void fetchData()
            }}
          />
        )}

        {/* 모바일 화면 상단 이동 플로팅 버튼 */}
        {showScrollTop && (
          <Button
            onClick={scrollToTop}
            size="sm"
            className="fixed right-6 bottom-6 z-50 h-10 w-10 rounded-full border border-border bg-card p-0 text-foreground shadow-lg transition-all hover:bg-muted active:scale-95 md:right-8 md:bottom-8"
          >
            <ArrowUpIcon className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  )
})
