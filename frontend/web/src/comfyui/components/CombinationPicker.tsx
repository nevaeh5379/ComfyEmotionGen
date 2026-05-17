import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useRenderLog } from "@/lib/renderLogger"
import { Button } from "@/components/ui/button"
import { curationApi } from "../hooks/useSavedImages"
import { useAsyncAction } from "../hooks/useAsyncAction"
import type { SavedImage } from "../types/Message"
import type { SavedTemplate } from "../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../hooks/useSavedWorkflows"
import type { RenderItem } from "./CombinationPickerComponents"
import { RegenerateDialog } from "./CombinationPickerComponents"
import { ImageViewer } from "./ImageViewer"
import { hasApproved, findApproved } from "../types/Message"
import { TournamentView } from "./CombinationPickerViews"
import { GalleryView, TableView } from "./CombinationPickerViews"
import { useSetToggle } from "./CombinationPickerHelpers"
import { CombinationPickerToolbar } from "./CombinationPickerToolbar"
import { CombinationPickerUnassignedPanel } from "./CombinationPickerUnassignedPanel"
import { CombinationPickerSidebar } from "./CombinationPickerSidebar"
import { CombinationPickerDetailView } from "./CombinationPickerDetailView"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

interface Props {
  backendUrl: string
  cegTemplate: string
  savedTemplates: SavedTemplate[]
  savedWorkflows: SavedWorkflow[]
  enableHover?: boolean
  autoApplyReject?: boolean
}

export const CombinationPicker = memo(function CombinationPicker({
  backendUrl,
  cegTemplate,
  savedTemplates,
  savedWorkflows,
  enableHover = true,
  autoApplyReject = true,
}: Props) {
  useRenderLog("CombinationPicker")

  // ── State ──
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [renderItems, setRenderItems] = useState<RenderItem[]>([])
  const [allImages, setAllImages] = useState<SavedImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [duplicateStrategy, setDuplicateStrategy] = useState<"hash" | "number">(
    "hash"
  )

  const exportAction = useAsyncAction(3000)
  const regenAction = useAsyncAction(3000)

  const [hideRejected, setHideRejected] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(autoApplyReject)

  const [viewMode, setViewMode] = useState<ViewMode>("gallery")
  const [pinnedHashes, setPinnedHashes] = useState<string[]>([])
  const [previewHash, setPreviewHash] = useState<string | null>(null)

  // 선택 모드 관련 상태
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(
    new Set()
  )
  const bulkRegenAction = useAsyncAction(4000)

  // 재생성 다이얼로그 관련 상태
  const [regenDialogState, setRegenDialogState] = useState<{
    open: boolean
    filenames: string[]
  }>({ open: false, filenames: [] })

  // 필터 관련 상태
  const [statusFilter, setStatusFilter] = useState<"all" | "done" | "pending">(
    "all"
  )
  const [filenameFilter, setFilenameFilter] = useState("")
  const [metadataFilter, setMetadataFilter] = useState("")

  // 미할당 이미지(고아) 관리 관련 상태
  const [showUnassignedPanel, setShowUnassignedPanel] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [unassignedSelectedFilenames, setUnassignedSelectedFilenames] =
    useState<Set<string>>(new Set())
  const [showTrueOrphansOnly, setShowTrueOrphansOnly] = useState(false)
  const [templateAffiliationCache, setTemplateAffiliationCache] = useState<
    Map<string, string[]>
  >(new Map())
  const [checkingTemplates, setCheckingTemplates] = useState(false)
  const bulkTrashAction = useAsyncAction(4000)

  // ── Computed ──
  const activeTemplate = useMemo(
    () =>
      savedTemplates.find((t) => t.id === selectedTemplateId)?.template ??
      cegTemplate,
    [savedTemplates, selectedTemplateId, cegTemplate]
  )

  // ── Data Fetching ──
  const fetchData = useCallback(async () => {
    if (!activeTemplate.trim()) {
      setError("CEG 템플릿을 먼저 작성해주세요.")
      setRenderItems([])
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
      setRenderItems(renderData.items)
      setAllImages(imagesData.items)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backendUrl, activeTemplate])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  // ── Derived Data ──
  const imagesByFilename = useMemo(() => {
    const map = new Map<string, SavedImage[]>()
    for (const img of allImages) {
      if (img.status === "trashed") continue
      if (!map.has(img.originalFilename)) map.set(img.originalFilename, [])
      map.get(img.originalFilename)!.push(img)
    }
    return map
  }, [allImages])

  const doneCount = useMemo(
    () =>
      renderItems.filter((ri) =>
        hasApproved(imagesByFilename.get(ri.filename) ?? [])
      ).length,
    [renderItems, imagesByFilename]
  )

  // 현재 템플릿에 매칭되지 않는 미할당(unassigned) 이미지 그룹
  const unassignedGroups = useMemo(() => {
    const renderFilenames = new Set(renderItems.map((ri) => ri.filename))
    const map = new Map<string, SavedImage[]>()
    for (const img of allImages) {
      if (img.status === "trashed") continue
      if (!renderFilenames.has(img.originalFilename)) {
        if (!map.has(img.originalFilename)) map.set(img.originalFilename, [])
        map.get(img.originalFilename)!.push(img)
      }
    }
    return map
  }, [allImages, renderItems])

  // 총 미할당 이미지 수
  const unassignedTotalCount = useMemo(
    () =>
      Array.from(unassignedGroups.values()).reduce(
        (sum, imgs) => sum + imgs.length,
        0
      ),
    [unassignedGroups]
  )

  // 템플릿 소속 확인 함수 (lazy: 사용자가 패널 열었을 때)
  const checkTemplateAffiliation = useCallback(async () => {
    if (checkingTemplates || savedTemplates.length === 0) return
    setCheckingTemplates(true)
    const cache = new Map<string, string[]>()
    try {
      // "현재 편집 중인 템플릿" + 저장된 모든 템플릿
      const allTemplateSpecs: { id: string; name: string; template: string }[] =
        [
          {
            id: "__current__",
            name: "현재 편집 중인 템플릿",
            template: cegTemplate,
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
  }, [backendUrl, savedTemplates, cegTemplate, checkingTemplates])

  // 미할당 패널 열릴 때 템플릿 소속 확인 실행
  useEffect(() => {
    if (showUnassignedPanel && templateAffiliationCache.size === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      checkTemplateAffiliation()
    }
  }, [
    showUnassignedPanel,
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
  ])

  // 미할당 패널 닫기
  const closeUnassignedPanel = useCallback(() => {
    setShowUnassignedPanel(false)
    setUnassignedSelectedFilenames(new Set())
  }, [])

  // 필터링된 렌더 아이템
  const filteredRenderItems = useMemo(() => {
    return renderItems.filter((ri) => {
      const imgs = imagesByFilename.get(ri.filename) ?? []
      const isDone = hasApproved(imgs)

      // 상태 필터
      if (statusFilter === "done" && !isDone) return false
      if (statusFilter === "pending" && isDone) return false

      // 파일명 필터 (대소문자 구분 없이 포함 검색)
      if (filenameFilter.trim()) {
        const lowerFilename = ri.filename.toLowerCase()
        const lowerFilter = filenameFilter.toLowerCase().trim()
        if (!lowerFilename.includes(lowerFilter)) return false
      }

      // 메타데이터 필터 (meta 값들 중 하나라도 포함되면 통과 - 대소문자 구분 없이)
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

  const selectedItem = useMemo(
    () => renderItems.find((ri) => ri.filename === selectedFilename),
    [renderItems, selectedFilename]
  )
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
        (img) => !hideRejected || img.status !== "rejected"
      ),
    [selectedImages, hideRejected]
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

  const selectImage = useCallback(
    async (filename: string, selectedHash: string) => {
      const imgs = imagesByFilename.get(filename) ?? []

      setAllImages((prev) =>
        prev.map((img) => {
          if (img.originalFilename !== filename || img.status === "trashed")
            return img
          return {
            ...img,
            status: img.hash === selectedHash ? "approved" : "rejected",
          }
        })
      )

      const currentIdx = renderItems.findIndex((ri) => ri.filename === filename)
      if (autoAdvance) {
        const next = renderItems.find((ri, idx) => {
          if (idx <= currentIdx) return false
          const nextImgs = imagesByFilename.get(ri.filename) ?? []
          return !hasApproved(nextImgs)
        })
        if (next) setSelectedFilename(next.filename)
      }

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
    [backendUrl, imagesByFilename, renderItems, autoAdvance]
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
          duplicateStrategy,
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
    duplicateStrategy,
  ])

  const handleContextMenuRegenerate = useCallback((filename: string) => {
    setRegenDialogState({ open: true, filenames: [filename] })
  }, [])

  // 선택 모드 종료
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedFilenames(new Set())
  }, [])

  const performRegenerate = useCallback(
    async (count: number, template: string, workflow?: string) => {
      if (regenAction.isLoading || regenDialogState.filenames.length === 0)
        return
      const filenames = regenDialogState.filenames
      const isBulk = filenames.length > 1

      const result = await regenAction.execute(
        async () => {
          let totalJobs = 0
          for (const filename of filenames) {
            const jobIds = await curationApi.regenerate(
              backendUrl,
              filename,
              count,
              "random",
              template || undefined,
              workflow
            )
            totalJobs += jobIds.length
          }
          return { count: filenames.length, totalJobs }
        },
        ({ count, totalJobs }) =>
          isBulk
            ? `${count}개 항목, 총 ${totalJobs}개 작업 생성 완료`
            : `잡 ${totalJobs}개 추가됨`,
        "재생성 실패"
      )

      if (result !== null) {
        setRegenDialogState({ open: false, filenames: [] })
        if (isBulk) {
          exitSelectionMode()
        }
      }
    },
    [backendUrl, regenAction, regenDialogState.filenames, exitSelectionMode]
  )

  const handleOpen = useCallback((filename: string) => {
    setSelectionMode(false)
    setSelectedFilenames(new Set())
    setSelectedFilename(filename)
    setViewMode("grid")
  }, [])

  // 단일 이미지 상태 변경
  const setStatus = useCallback(
    async (hash: string, status: SavedImage["status"]) => {
      setAllImages((prev) =>
        prev.map((img) => (img.hash === hash ? { ...img, status } : img))
      )
      await curationApi.patchStatus(backendUrl, hash, status)
    },
    [backendUrl]
  )

  // 배치 상태 변경 (필터 함수로 대상 선택)
  const batchUpdateStatus = useCallback(
    async (
      filter: (img: SavedImage) => boolean,
      status: SavedImage["status"]
    ) => {
      const targets = selectedImages.filter(filter)
      if (targets.length === 0) return
      setAllImages((prev) =>
        prev.map((img) =>
          img.originalFilename === selectedFilename && filter(img)
            ? { ...img, status }
            : img
        )
      )
      await Promise.all(
        targets.map((img) =>
          curationApi.patchStatus(backendUrl, img.hash, status)
        )
      )
    },
    [backendUrl, selectedImages, selectedFilename]
  )

  const handleRejectAll = useCallback(
    () =>
      batchUpdateStatus(
        (img) => img.status !== "approved" && img.status !== "rejected",
        "rejected"
      ),
    [batchUpdateStatus]
  )

  const handleCancelAllRejects = useCallback(
    () => batchUpdateStatus((img) => img.status === "rejected", "pending"),
    [batchUpdateStatus]
  )

  const handleCancelApproval = useCallback(
    () =>
      batchUpdateStatus(
        (img) => img.status === "approved" || img.status === "rejected",
        "pending"
      ),
    [batchUpdateStatus]
  )

  // 선택 모드 진입 (long press)
  const handleLongPress = useCallback(
    (filename: string) => {
      if (!selectionMode) {
        setSelectionMode(true)
        setSelectedFilenames(new Set([filename]))
      }
    },
    [selectionMode]
  )

  // 선택 토글
  const handleToggleSelect = useSetToggle(
    setSelectedFilenames,
    exitSelectionMode
  )

  // 선택된 항목들 일괄 재생성
  const handleBulkRegenerate = useCallback(() => {
    if (selectedFilenames.size === 0) return
    setRegenDialogState({
      open: true,
      filenames: Array.from(selectedFilenames),
    })
  }, [selectedFilenames])

  const togglePin = useCallback((hash: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedHashes((prev) =>
      prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash]
    )
  }, [])

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
          if (selectedItem && idx < visibleImages.length) {
            selectImage(selectedItem.filename, visibleImages[idx]!.hash)
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
    selectImage,
    selectedItem,
    visibleImages,
    selectionMode,
    exitSelectionMode,
  ])

  const handleTabChange = (v: ViewMode) => {
    setViewMode(v)
    if (v === "gallery" || v === "table") {
      setSelectedFilename(null)
      exitSelectionMode()
    } else if (!selectedFilename && renderItems.length > 0) {
      setSelectedFilename(renderItems[0]!.filename)
    }
  }

  // ── Render ──
  if (loading)
    return (
      <div className="py-20 text-center font-bold text-muted-foreground italic">
        데이터를 불러오는 중...
      </div>
    )

  if (error)
    return (
      <div className="py-20 text-center">
        <p className="mb-4 font-bold text-destructive">{error}</p>
        <Button onClick={fetchData} className="font-bold">
          다시 시도
        </Button>
      </div>
    )

  if (renderItems.length === 0)
    return (
      <div className="py-20 text-center font-bold text-muted-foreground">
        렌더링된 조합이 없습니다.
      </div>
    )

  return (
    <div className="flex flex-col">
      {/* ── Toolbar ── */}
      <CombinationPickerToolbar
        selectedTemplateId={selectedTemplateId}
        setSelectedTemplateId={setSelectedTemplateId}
        savedTemplates={savedTemplates}
        viewMode={viewMode}
        onViewModeChange={handleTabChange}
        selectedFilename={selectedFilename}
        renderItemsLength={renderItems.length}
        doneCount={doneCount}
        filtersExpanded={filtersExpanded}
        setFiltersExpanded={setFiltersExpanded}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        filenameFilter={filenameFilter}
        setFilenameFilter={setFilenameFilter}
        metadataFilter={metadataFilter}
        setMetadataFilter={setMetadataFilter}
        filteredRenderItemsLength={filteredRenderItems.length}
        hideRejected={hideRejected}
        setHideRejected={setHideRejected}
        autoAdvance={autoAdvance}
        setAutoAdvance={setAutoAdvance}
        duplicateStrategy={duplicateStrategy}
        setDuplicateStrategy={setDuplicateStrategy}
        unassignedGroupsSize={unassignedGroups.size}
        unassignedTotalCount={unassignedTotalCount}
        showUnassignedPanel={showUnassignedPanel}
        setShowUnassignedPanel={setShowUnassignedPanel}
        selectionMode={selectionMode}
        selectedFilenamesSize={selectedFilenames.size}
        handleBulkRegenerate={handleBulkRegenerate}
        exitSelectionMode={exitSelectionMode}
        bulkRegenActionMessage={bulkRegenAction.message}
        handleExport={handleExport}
        exportActionIsLoading={exportAction.isLoading}
        exportActionMessage={exportAction.message}
        regenActionMessage={regenAction.message}
        fetchData={fetchData}
      />

      {/* ── Scrollable Content ── */}
      <div className="flex-1 px-4">
        {/* 미할당 이미지 관리 패널 */}
        {showUnassignedPanel && (
          <CombinationPickerUnassignedPanel
            backendUrl={backendUrl}
            unassignedGroupsSize={unassignedGroups.size}
            unassignedTotalCount={unassignedTotalCount}
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
        <div className="flex gap-4">
          {/* 왼쪽: 조합 리스트 (상세 보기일 때만 노출) */}
          {selectedFilename && (
            <CombinationPickerSidebar
              renderItems={renderItems}
              imagesByFilename={imagesByFilename}
              selectedFilename={selectedFilename}
              setSelectedFilename={setSelectedFilename}
            />
          )}

          {/* 오른쪽: 콘텐츠 영역 */}
          {!selectedFilename ? (
            <div className="flex flex-1 flex-col">
              <div>
                {viewMode === "gallery" ? (
                  <GalleryView
                    items={filteredRenderItems}
                    imagesByFilename={imagesByFilename}
                    backendUrl={backendUrl}
                    onSelect={(filename) => {
                      if (!selectionMode) {
                        setSelectedFilename(filename)
                        setViewMode("grid")
                      }
                    }}
                    onOpen={handleOpen}
                    selectionMode={selectionMode}
                    selectedFilenames={selectedFilenames}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPress}
                    onRegenerate={handleContextMenuRegenerate}
                    enableHover={enableHover}
                  />
                ) : (
                  <TableView
                    items={filteredRenderItems}
                    imagesByFilename={imagesByFilename}
                    backendUrl={backendUrl}
                    onSelect={(filename) => {
                      if (!selectionMode) {
                        setSelectedFilename(filename)
                        setViewMode("grid")
                      }
                    }}
                    onOpen={handleOpen}
                    selectionMode={selectionMode}
                    selectedFilenames={selectedFilenames}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPress}
                    onRegenerate={handleContextMenuRegenerate}
                    enableHover={enableHover}
                  />
                )}
              </div>
            </div>
          ) : (
            <>
              <CombinationPickerDetailView
                backendUrl={backendUrl}
                selectedFilename={selectedFilename}
                selectedItem={selectedItem}
                selectedImages={selectedImages}
                visibleImages={visibleImages}
                selectedApprovedHash={selectedApprovedHash ?? null}
                pinnedHashes={pinnedHashes}
                viewMode={viewMode}
                enableHover={enableHover}
                onBack={() => {
                  setSelectedFilename(null)
                  setViewMode("gallery")
                }}
                onSetPreviewHash={setPreviewHash}
                onTogglePin={togglePin}
                onSelectImage={selectImage}
                onRegenerate={handleContextMenuRegenerate}
                regenActionIsLoading={regenAction.isLoading}
                onRejectAll={handleRejectAll}
                onCancelAllRejects={handleCancelAllRejects}
                onCancelApproval={handleCancelApproval}
                onSetStatus={setStatus}
              />
              {viewMode === "tournament" && (
                <div className="min-h-[700px]">
                  <TournamentView
                    images={visibleImages}
                    backendUrl={backendUrl}
                    onComplete={(hash) => {
                      selectImage(selectedItem!.filename, hash)
                      setViewMode("grid")
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* 이미지 미리보기 팝업 */}
        <ImageViewer
          src={`${backendUrl}/saved-images/${previewHash}`}
          isOpen={previewHash !== null}
          onClose={() => setPreviewHash(null)}
        >
          {/* <Button
          size="lg"
          className="gap-2 px-10 py-5 text-base font-black shadow-lg shadow-green-500/20 transition-all hover:scale-105"
          onClick={() => {
            if (previewHash) {
              selectImage(selectedItem!.filename, previewHash)
              setPreviewHash(null)
            }
          }}
        >
          <CheckIcon className="h-5 w-5" />
          이 이미지 선택
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="gap-2 px-6 py-5 text-base font-bold"
          onClick={() => setPreviewHash(null)}
        >
          <XIcon className="h-4 h-4" />
          닫기
        </Button> */}
        </ImageViewer>

        <RegenerateDialog
          open={regenDialogState.open}
          onOpenChange={(open) =>
            setRegenDialogState((prev) => ({ ...prev, open }))
          }
          filenames={regenDialogState.filenames}
          imagesByFilename={imagesByFilename}
          currentCegTemplate={activeTemplate}
          savedTemplates={savedTemplates}
          savedWorkflows={savedWorkflows}
          onRegenerate={performRegenerate}
          isLoading={regenAction.isLoading}
        />
      </div>
    </div>
  )
})
