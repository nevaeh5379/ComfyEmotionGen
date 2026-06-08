import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useRenderLog } from "@/lib/renderLogger"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EmptyMedia,
} from "@/components/ui/empty"
import { AlertTriangleIcon, LayersIcon, SearchXIcon, ArrowUpIcon } from "lucide-react"
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
import {
  downloadImagesAsZip,
  getImageFilename,
} from "../../utils/downloadImages"
import type { SavedImage } from "../../types/Message"
import type { RenderItem } from "./CombinationPickerComponents"
import { RegenerateDialog } from "./CombinationPickerComponents"
import { ImageViewer } from "../ImageViewer"
import { hasApproved, findApproved } from "../../types/Message"
import { TournamentView } from "./CombinationPickerViews"
import { GalleryView, TableView } from "./CombinationPickerViews"
import { useSetToggle } from "./CombinationPickerHelpers"
import { CombinationPickerToolbar } from "./CombinationPickerToolbar"
import { CombinationPickerUnassignedPanel } from "./CombinationPickerUnassignedPanel"
import { CombinationPickerSidebar } from "./CombinationPickerSidebar"
import { CombinationPickerDetailView } from "./CombinationPickerDetailView"
import { useCurationContext } from "./CurationContext"
import type {
  CurationToolbarState,
  CurationViewMode,
} from "./CurationToolbarTypes"
import { useCurationToolbar } from "./useCurationToolbar"
import type { FreeGroupBy } from "./freeCurationGroupers"

type ViewMode = CurationViewMode

interface CombinationPickerContentProps {
  selectedAxis: string
  setSelectedAxis: (axis: string) => void
  activeTemplate: string
  isFreeMode: boolean
  freeGroupMode: FreeGroupBy | null
  toolbarState?: CurationToolbarState
}

export const CombinationPickerContent = memo(function CombinationPickerContent({
  selectedAxis,
  setSelectedAxis,
  activeTemplate,
  isFreeMode,
  freeGroupMode,
  toolbarState,
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
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)

  const exportAction = useAsyncAction(3000)
  const regenAction = useAsyncAction(3000)

  // hideTopSection일 때 뷰 모드는 context에서 관리
  const viewMode = toolbarState?.hideTopSection
    ? curationToolbarCtx.viewMode
    : (toolbarState?.viewMode ?? curationToolbarCtx.viewMode)
  const setViewMode = toolbarState?.hideTopSection
    ? curationToolbarCtx.setViewMode
    : (toolbarState?.setViewMode ?? curationToolbarCtx.setViewMode)
  const [compareImageKeys, setCompareImageKeys] = useState<Set<string>>(
    new Set()
  )
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTop(true)
      } else {
        setShowScrollTop(false)
      }
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
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
  }>({ open: false, sourceImages: [] })

  // 미할당 이미지(고아) 관리 관련 상태
  const [unassignedSelectedFilenames, setUnassignedSelectedFilenames] =
    useState<Set<string>>(new Set())
  const [showTrueOrphansOnly, setShowTrueOrphansOnly] = useState(false)
  const [templateAffiliationCache, setTemplateAffiliationCache] = useState<
    Map<string, string[]>
  >(new Map())
  const [checkingTemplates, setCheckingTemplates] = useState(false)
  const bulkTrashAction = useAsyncAction(4000)

  // 템플릿 소속 확인 함수 (lazy: 사용자가 패널 열었을 때)
  const checkTemplateAffiliation = useCallback(async () => {
    if (checkingTemplates || savedTemplates.length === 0) return
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
          template: activeTemplate,
        },
        ...savedTemplates.map((st) => ({
          id: st.id,
          name: st.name,
          template: st.template,
        })),
      ]
      for (const spec of allTemplateSpecs) {
        if (!spec.template.trim()) continue
        try {
          const res = await fetch(`${backendUrl}/render`, {
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
  }, [backendUrl, savedTemplates, activeTemplate, checkingTemplates])

  // 미할당 패널 열릴 때 템플릿 소속 확인 실행
  useEffect(() => {
    if (curationToolbarCtx.showUnassignedPanel && templateAffiliationCache.size === 0) {
      checkTemplateAffiliation()
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
        `${selectedCount}개 그룹, ${trashedCount}장 휴지통으로 이동`,
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
      (selectedFilename
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

  // ── Handlers ──
  const navigateTo = useCallback(
    (direction: "prev" | "next") => {
      const currentIdx = renderItems.findIndex(
        (ri) => ri.filename === selectedFilename
      )
      const nextIdx = direction === "next" ? currentIdx + 1 : currentIdx - 1
      if (nextIdx >= 0 && nextIdx < renderItems.length) {
        setSelectedFilename(renderItems[nextIdx]!.filename)
      }
    },
    [renderItems, selectedFilename]
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
    [approveImage, curationToolbarCtx.autoAdvance, renderItems, imagesByFilename]
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
      (count) => `${count}개 파일 내보내기 완료`,
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
      setRegenDialogState({ open: true, sourceImages: images })
    },
    [isFreeMode, freeGroupMode, imagesByFilename]
  )

  const handleRegenDone = useCallback(() => {
    setRegenDialogState((prev) => ({ ...prev, open: false }))
    if (regenDialogState.sourceImages.length > 1) {
      exitSelectionMode()
    }
  }, [exitSelectionMode, regenDialogState.sourceImages])

  const handleOpen = useCallback(
    (filename: string) => {
      exitSelectionMode()
      setSelectedFilename(filename)
      setViewMode("grid")
    },
    [exitSelectionMode, setViewMode]
  )

  const handleRejectAll = useCallback(
    () =>
      data.batchUpdateStatus(
        selectedFilename!,
        (img) => img.status !== "approved" && img.status !== "rejected",
        "rejected"
      ),
    [data, selectedFilename]
  )

  const handleCancelAllRejects = useCallback(
    () =>
      data.batchUpdateStatus(
        selectedFilename!,
        (img) => img.status === "rejected",
        "pending"
      ),
    [data, selectedFilename]
  )

  const handleCancelApproval = useCallback(
    () =>
      data.batchUpdateStatus(
        selectedFilename!,
        (img) => img.status === "approved" || img.status === "rejected",
        "pending"
      ),
    [data, selectedFilename]
  )

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
    setRegenDialogState({
      open: true,
      sourceImages: allImages,
    })
  }, [selectedFilenames, isFreeMode, freeGroupMode, imagesByFilename])

  const handleBulkDownload = useCallback(async () => {
    if (bulkDownloadAction.isLoading || selectedFilenames.size === 0) return
    await bulkDownloadAction.execute(
      async () => {
        const downloads: Array<{ url: string; filename: string }> = []
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
      (count) => `${count}장 다운로드 완료`,
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
    curationToolbarCtx.setExportHandler(handleExport)
  }, [curationToolbarCtx, handleExport])

  useEffect(() => {
    curationToolbarCtx.setRefreshHandler(fetchData)
  }, [curationToolbarCtx, fetchData])

  useEffect(() => {
    curationToolbarCtx.setUnassignedGroupsSize(unassignedGroups.size)
  }, [curationToolbarCtx, unassignedGroups.size])

  // autoAdvance 초기값을 autoApplyReject prop에서 동기화
  useEffect(() => {
    if (autoApplyReject) {
      const timer = window.setTimeout(() => curationToolbarCtx.setAutoAdvance(true), 0)
      return () => window.clearTimeout(timer)
    }
  }, [autoApplyReject, curationToolbarCtx])

  // ── Keyboard Handler ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (selectionMode) {
        if (e.key === "Escape") {
          exitSelectionMode()
        }
        return
      }

      if (selectedFilename) {
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault()
          navigateTo("next")
        } else if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault()
          navigateTo("prev")
        } else if (e.key === "r" || e.key === "R") {
          handleContextMenuRegenerate(selectedFilename)
        } else if (e.key === "Escape") {
          setSelectedFilename(null)
          setViewMode("gallery")
        } else if (e.key >= "1" && e.key <= "9") {
          const idx = parseInt(e.key) - 1
          if (idx < visibleImages.length) {
            handleSelectImage(selectedFilename, visibleImages[idx]!.hash)
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [
    selectedFilename,
    navigateTo,
    handleContextMenuRegenerate,
    handleSelectImage,
    visibleImages,
    selectionMode,
    exitSelectionMode,
    setViewMode,
  ])

  const handleTabChange = useCallback(
    (v: ViewMode) => {
      setViewMode(v)
      if (v === "gallery" || v === "table") {
        setSelectedFilename(null)
        exitSelectionMode()
      } else if (!selectedFilename && renderItems.length > 0) {
        setSelectedFilename(renderItems[0]!.filename)
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

  if (error)
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
            onClick={fetchData}
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
        bulkRegenActionMessage={bulkRegenAction.message}
        handleBulkDownload={handleBulkDownload}
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
            checkTemplateAffiliation={checkTemplateAffiliation}
            unassignedSelectedFilenames={unassignedSelectedFilenames}
            handleUnassignedToggleSelect={handleUnassignedToggleSelect}
            handleUnassignedSelectAll={handleUnassignedSelectAll}
            handleBulkTrash={handleBulkTrash}
            bulkTrashActionIsLoading={bulkTrashAction.isLoading}
            bulkTrashActionMessage={bulkTrashAction.message}
            closeUnassignedPanel={closeUnassignedPanel}
          />
        )}

        {/* 메인 레이아웃 */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          {/* 왼쪽: 조합 리스트 (상세 보기일 때만 노출, 모바일에서는 숨김) */}
          {selectedFilename && (
            <div className="hidden flex-none py-4 md:flex">
              <CombinationPickerSidebar
                selectedFilename={selectedFilename}
                setSelectedFilename={setSelectedFilename}
              />
            </div>
          )}

          {/* 오른쪽: 콘텐츠 영역 */}
          {!selectedFilename ? (
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
                onBack={() => {
                  setSelectedFilename(null)
                  setViewMode("gallery")
                }}
                onSetPreviewHash={setPreviewHash}
                onToggleCompareImage={toggleCompareImage}
                onSelectImage={handleSelectImage}
                onRegenerate={handleContextMenuRegenerate}
                regenActionIsLoading={regenAction.isLoading}
                onRejectAll={handleRejectAll}
                onCancelAllRejects={handleCancelAllRejects}
                onCancelApproval={handleCancelApproval}
                onNavigate={navigateTo}
                onOpenList={() => setIsMobileSidebarOpen(true)}
              />
              {viewMode === "tournament" && (
                <div className="flex-1 overflow-hidden">
                  <TournamentView
                    images={visibleImages}
                    onComplete={(hash) => {
                      handleSelectImage(selectedFilename, hash)
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
              />
            </div>
          </SheetContent>
        </Sheet>

        <RegenerateDialog
          open={regenDialogState.open}
          onOpenChange={(open) =>
            setRegenDialogState((prev) => ({ ...prev, open }))
          }
          sourceImages={regenDialogState.sourceImages}
          backendUrl={backendUrl}
          currentCegTemplate={activeTemplate}
          savedTemplates={savedTemplates}
          savedWorkflows={savedWorkflows}
          saveMappingPreset={saveMappingPreset}
          deleteMappingPreset={deleteMappingPreset}
          onSubmit={async (items) => {
            const result = await regenAction.execute(
              async () => {
                const res = await fetch(`${backendUrl}${API.jobs.root}`, {
                  method: "POST",
                  headers: HEADERS.json,
                  body: JSON.stringify({ items }),
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data = await res.json()
                return data.jobIds?.length ?? items.length
              },
              (count) => `작업 ${count}개 추가됨`,
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
          src={`${backendUrl}/saved-images/${previewHash}`}
          isOpen={previewHash !== null}
          onClose={() => setPreviewHash(null)}
        />

        {/* 모바일 화면 상단 이동 플로팅 버튼 */}
        {showScrollTop && (
          <Button
            onClick={scrollToTop}
            size="sm"
            className="fixed bottom-6 right-6 z-50 h-10 w-10 rounded-full p-0 shadow-lg border border-border bg-card text-foreground hover:bg-muted active:scale-95 transition-all md:bottom-8 md:right-8"
          >
            <ArrowUpIcon className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  )
})
