import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRenderLog } from "@/lib/renderLogger"
import {
  CheckCircle2Icon,
  CheckIcon,
  CircleIcon,
  DownloadIcon,
  RefreshCwIcon,
  PinIcon,
  PinOffIcon,
  Maximize2Icon,
  SwordsIcon,
  ColumnsIcon,
  FolderIcon,
  LayoutListIcon,
  ArrowLeftIcon,
  CheckSquareIcon,
  SquareIcon,
  XIcon,
  SearchIcon,
  FilterIcon,
  AlertTriangleIcon,
  Trash2Icon,
  Settings2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { curationApi } from "../hooks/useSavedImages"
import { useAsyncAction } from "../hooks/useAsyncAction"
import type { SavedImage } from "../types/Message"
import type { SavedTemplate } from "../hooks/useSavedTemplates"
import type { SavedWorkflow } from "../hooks/useSavedWorkflows"
import type {
  RenderItem,
  CombinationViewProps,
} from "./CombinationPickerComponents"
import {
  ImagePreviewHoverCard,
  CombinationContextMenu,
  LoadingButton,
  RegenerateDialog,
} from "./CombinationPickerComponents"
import { ImageViewer } from "./ImageViewer"
import { hasApproved, findApproved } from "../types/Message"
import {
  Magnifier,
  TournamentView,
  LongPressWrapper,
} from "./CombinationPickerViews"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

function GalleryView({
  items,
  imagesByFilename,
  backendUrl,
  onSelect,
  onOpen,
  selectionMode,
  selectedFilenames,
  onToggleSelect,
  onLongPress,
  onRegenerate,
  enableHover,
}: CombinationViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => {
        const imgs = imagesByFilename.get(item.filename) ?? []
        const approved = findApproved(imgs)
        const preview = approved || imgs[0]
        const isDone = hasApproved(imgs)
        const isSelected = selectedFilenames.has(item.filename)

        return (
          <ContextMenu key={item.filename}>
            <ContextMenuTrigger asChild>
              <div className="contents">
                <HoverCard
                  openDelay={enableHover ? 500 : 99999}
                  closeDelay={100}
                >
                  <HoverCardTrigger asChild>
                    <LongPressWrapper
                      onLongPress={() => onLongPress(item.filename)}
                      onClick={() => {
                        if (selectionMode) {
                          onToggleSelect(item.filename)
                        } else {
                          onSelect(item.filename)
                        }
                      }}
                      className={`group relative flex flex-col gap-2 rounded-lg border bg-card p-2 hover:border-primary hover:shadow-md ${isSelected ? "bg-blue-50/30 ring-2 ring-blue-500" : ""}`}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                        {preview ? (
                          <img
                            src={`${backendUrl}/saved-images/${preview.hash}`}
                            className="h-full w-full object-cover"
                            alt=""
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <FolderIcon className="h-10 w-10 text-muted-foreground/20" />
                          </div>
                        )}

                        {/* 선택 모드 체크박스 */}
                        {selectionMode && (
                          <div className="absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded">
                            {isSelected ? (
                              <CheckSquareIcon className="h-6 w-6 text-blue-500 drop-shadow-sm" />
                            ) : (
                              <SquareIcon className="h-6 w-6 text-white/70 drop-shadow-sm" />
                            )}
                          </div>
                        )}

                        {!selectionMode && (
                          <div className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded bg-black/60 text-white backdrop-blur-sm">
                            <FolderIcon className="h-3.5 w-3.5" />
                          </div>
                        )}

                        {isDone && (
                          <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded bg-green-500 text-white shadow-sm">
                            <CheckIcon className="h-4 w-4" strokeWidth={3} />
                          </div>
                        )}

                        <div className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {imgs.length}장
                        </div>
                      </div>

                      <div className="px-1 text-left">
                        <div className="truncate font-mono text-[11px] font-bold">
                          {item.filename}
                        </div>
                        <MetaTags meta={item.meta} variant="compact" max={2} />
                      </div>
                    </LongPressWrapper>
                  </HoverCardTrigger>
                  {enableHover && (
                    <ImagePreviewHoverCard
                      filename={item.filename}
                      images={imgs}
                      backendUrl={backendUrl}
                    />
                  )}
                </HoverCard>
              </div>
            </ContextMenuTrigger>
            <CombinationContextMenu
              filename={item.filename}
              isSelected={isSelected}
              selectionMode={selectionMode}
              onOpen={onOpen}
              onToggleSelect={onToggleSelect}
              onLongPress={onLongPress}
              {...(onRegenerate && { onRegenerate })}
            />
          </ContextMenu>
        )
      })}
    </div>
  )
}

function TableView({
  items,
  imagesByFilename,
  backendUrl,
  onSelect,
  onOpen,
  selectionMode,
  selectedFilenames,
  onToggleSelect,
  onLongPress,
  onRegenerate,
  enableHover,
}: CombinationViewProps) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            {selectionMode && (
              <th className="w-8 px-2 py-2 font-bold text-muted-foreground"></th>
            )}
            <th className="w-12 px-4 py-2 font-bold text-muted-foreground">
              상태
            </th>
            <th className="px-4 py-2 font-bold text-muted-foreground">
              파일명
            </th>
            <th className="px-4 py-2 font-bold text-muted-foreground">
              메타데이터
            </th>
            <th className="w-20 px-4 py-2 text-right font-bold text-muted-foreground">
              수
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => {
            const imgs = imagesByFilename.get(item.filename) ?? []
            const isDone = hasApproved(imgs)
            const isSelected = selectedFilenames.has(item.filename)

            return (
              <ContextMenu key={item.filename}>
                <ContextMenuTrigger asChild>
                  <LongPressWrapper
                    onLongPress={() => onLongPress(item.filename)}
                    onClick={() => {
                      if (selectionMode) {
                        onToggleSelect(item.filename)
                      } else {
                        onSelect(item.filename)
                      }
                    }}
                    className={`group cursor-pointer hover:bg-accent/50 ${isSelected ? "bg-blue-50/30 ring-1 ring-blue-300 ring-inset" : ""}`}
                    as="tr"
                  >
                    {selectionMode && (
                      <td className="px-2 py-2">
                        {isSelected ? (
                          <CheckSquareIcon className="h-5 w-5 text-blue-500" />
                        ) : (
                          <SquareIcon className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <StatusIcon done={isDone} />
                    </td>
                    <HoverCard
                      openDelay={enableHover ? 500 : 99999}
                      closeDelay={100}
                    >
                      <HoverCardTrigger asChild>
                        <td className="cursor-default px-4 py-2">
                          <span className="font-mono text-xs font-bold">
                            {item.filename}
                          </span>
                        </td>
                      </HoverCardTrigger>
                      {enableHover && (
                        <ImagePreviewHoverCard
                          filename={item.filename}
                          images={imgs}
                          backendUrl={backendUrl}
                        />
                      )}
                    </HoverCard>
                    <td className="px-4 py-2">
                      <MetaTags meta={item.meta} variant="default" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-mono text-xs text-muted-foreground">
                        {imgs.length}
                      </span>
                    </td>
                  </LongPressWrapper>
                </ContextMenuTrigger>
                <CombinationContextMenu
                  filename={item.filename}
                  isSelected={isSelected}
                  selectionMode={selectionMode}
                  onOpen={onOpen}
                  onToggleSelect={onToggleSelect}
                  onLongPress={onLongPress}
                  {...(onRegenerate && { onRegenerate })}
                />
              </ContextMenu>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// 상태 아이콘 컴포넌트
function StatusIcon({ done, active }: { done: boolean; active?: boolean }) {
  if (active) {
    return done ? (
      <CheckCircle2Icon className="h-4 w-4" />
    ) : (
      <CircleIcon className="h-4 w-4" />
    )
  }
  return done ? (
    <CheckCircle2Icon className="h-4 w-4 text-green-500" />
  ) : (
    <CircleIcon className="h-4 w-4 text-muted-foreground/30" />
  )
}

// 메타 태그 렌더링 컴포넌트
function MetaTags({
  meta,
  variant = "default",
  max,
}: {
  meta: Record<string, string>
  variant?: "default" | "compact" | "primary" | "sidebar"
  max?: number
}) {
  const values = Object.values(meta)
  const display = max ? values.slice(0, max) : values
  const variants = {
    default: "rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground",
    compact:
      "rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground",
    primary:
      "rounded border border-primary/10 bg-primary/10 px-1.5 py-0 text-[8px] font-bold whitespace-nowrap text-primary",
    sidebar: `text-[9px] font-medium uppercase`,
  }
  return (
    <div className="flex flex-wrap gap-1">
      {display.map((v, i) => (
        <span key={i} className={variants[variant]}>
          {v}
        </span>
      ))}
    </div>
  )
}

// Set 토글 훅: value 추가/제거 토글
function useSetToggle<T>(
  setValue: React.Dispatch<React.SetStateAction<Set<T>>>,
  onEmpty?: () => void
) {
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

  // 툴바 높이 자동 계산 (CSS 변수)
  const toolbarRef = useRef<HTMLDivElement>(null)

  // 필터 변경 시 자동 확장 헬퍼
  const withExpand = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
      setter(value)
      setFiltersExpanded(true)
    },
    []
  )
  const [toolbarHeight, setToolbarHeight] = useState(0)
  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    const update = () => setToolbarHeight(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const activeTemplate = useMemo(
    () =>
      savedTemplates.find((t) => t.id === selectedTemplateId)?.template ??
      cegTemplate,
    [savedTemplates, selectedTemplateId, cegTemplate]
  )

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

  // fetchData는 setLoading/setError를 포함한 비동기 데이터 로딩 함수
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

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

  // 미할당 패널 열릴 때 템플릿 소속 확인 실행 (checkTemplateAffiliation은 비동기 데이터 로딩 함수)
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

  const colClass =
    visibleImages.length <= 2
      ? "grid-cols-2"
      : visibleImages.length <= 6
        ? "grid-cols-3"
        : "grid-cols-4"

  const handleTabChange = (v: string) => {
    const mode = v as ViewMode
    setViewMode(mode)
    if (mode === "gallery" || mode === "table") {
      setSelectedFilename(null)
      exitSelectionMode()
    } else if (!selectedFilename && renderItems.length > 0) {
      setSelectedFilename(renderItems[0]!.filename)
    }
  }

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
      {/* ── Sticky Toolbar Header (1단 통합) ── */}
      <div
        ref={toolbarRef}
        className="sticky top-[45px] z-40 shrink-0 border-b border-line bg-panel"
        style={
          { "--toolbar-height": `${toolbarHeight}px` } as React.CSSProperties
        }
      >
        {/* 메인 툴바: 1줄 */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
          {/* 템플릿 선택 */}
          <Select
            value={selectedTemplateId || "__current__"}
            onValueChange={(v) =>
              setSelectedTemplateId(v === "__current__" ? "" : v)
            }
          >
            <SelectTrigger className="h-7 w-44 border-0 bg-transparent font-bold shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__current__">현재 편집 중인 탬플릿</SelectItem>
              {savedTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 뷰 모드 탭 */}
          <Tabs value={viewMode} onValueChange={handleTabChange}>
            <TabsList className="h-7">
              <TabsTrigger
                value="gallery"
                className="gap-1 px-2.5 text-[10px] font-bold"
              >
                <FolderIcon className="h-3 w-3" />
                갤러리
              </TabsTrigger>
              <TabsTrigger
                value="table"
                className="gap-1 px-2.5 text-[10px] font-bold"
              >
                <LayoutListIcon className="h-3 w-3" />
                리스트
              </TabsTrigger>
              <div className="mx-0.5 h-3 w-px bg-muted-foreground/30" />
              <TabsTrigger
                value="grid"
                className="gap-1 px-2.5 text-[10px] font-bold"
                disabled={!selectedFilename}
              >
                <Maximize2Icon className="h-3 w-3" />
                그리드
              </TabsTrigger>
              <TabsTrigger
                value="compare"
                className="gap-1 px-2.5 text-[10px] font-bold"
                disabled={!selectedFilename || pinnedHashes.length === 0}
              >
                <ColumnsIcon className="h-3 w-3" />
                비교
              </TabsTrigger>
              <TabsTrigger
                value="tournament"
                className="gap-1 px-2.5 text-[10px] font-bold"
                disabled={!selectedFilename || visibleImages.length < 2}
              >
                <SwordsIcon className="h-3 w-3" />
                월드컵
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* 진행률 */}
          <div className="flex min-w-[120px] items-center gap-2">
            <Progress
              value={(doneCount / renderItems.length) * 100}
              className="h-1.5 flex-1"
            />
            <span className="shrink-0 text-[10px] font-bold text-muted-foreground">
              {doneCount}/{renderItems.length}
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          {/* 필터 토글 */}
          <Button
            variant={
              filtersExpanded ||
              statusFilter !== "all" ||
              filenameFilter ||
              metadataFilter
                ? "secondary"
                : "outline"
            }
            size="sm"
            className={`h-7 gap-1 px-2 text-[10px] font-bold ${(statusFilter !== "all" || filenameFilter || metadataFilter) && !filtersExpanded ? "ring-1 ring-blue-400" : ""}`}
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            title="필터"
          >
            <FilterIcon className="h-3 w-3" />
            필터
            {(statusFilter !== "all" || filenameFilter || metadataFilter) &&
              !filtersExpanded && (
                <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
          </Button>

          {/* 설정 드롭다운 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[10px] font-bold"
                title="설정"
              >
                <Settings2Icon className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>설정</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={fetchData}>
                <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
                새로고침
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={hideRejected}
                onCheckedChange={(v) => setHideRejected(v)}
              >
                리젝 숨기기
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={autoAdvance}
                onCheckedChange={(v) => setAutoAdvance(v)}
              >
                자동 다음 이동
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {/* 중복 전략 */}
              <DropdownMenuLabel>중복 전략</DropdownMenuLabel>
              <DropdownMenuItem
                className={duplicateStrategy === "hash" ? "bg-accent" : ""}
                onClick={() => setDuplicateStrategy("hash")}
              >
                HASH
              </DropdownMenuItem>
              <DropdownMenuItem
                className={duplicateStrategy === "number" ? "bg-accent" : ""}
                onClick={() => setDuplicateStrategy("number")}
              >
                NUM
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {unassignedGroups.size > 0 && (
                <DropdownMenuItem
                  onClick={() => setShowUnassignedPanel(!showUnassignedPanel)}
                >
                  <AlertTriangleIcon className="mr-2 h-3.5 w-3.5 text-amber-600" />
                  미할당: {unassignedGroups.size}파일 ({unassignedTotalCount}장)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 선택 모드 (인라인) */}
          {selectionMode && (
            <>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50/60 px-2 py-0.5">
                <span className="text-[10px] font-bold text-blue-700">
                  {selectedFilenames.size}개
                </span>
                <Button
                  size="sm"
                  className="h-6 px-1.5 text-[9px] font-bold"
                  onClick={handleBulkRegenerate}
                  disabled={selectedFilenames.size === 0}
                >
                  <RefreshCwIcon className="h-2.5 w-2.5" />
                  재생성
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1 text-[9px] font-bold text-muted-foreground"
                  onClick={exitSelectionMode}
                >
                  <XIcon className="h-2.5 w-2.5" />
                </Button>
              </div>
              {bulkRegenAction.message && (
                <span className="text-[10px] font-bold text-blue-600">
                  {bulkRegenAction.message}
                </span>
              )}
            </>
          )}

          {/* EXPORT 버튼 */}
          <LoadingButton
            size="sm"
            className="h-7 px-2.5 text-[10px] font-black"
            onClick={handleExport}
            isLoading={exportAction.isLoading}
            disabled={doneCount === 0}
            icon={DownloadIcon}
          >
            EXPORT
          </LoadingButton>

          {/* 메시지 */}
          {exportAction.message && (
            <span className="text-[10px] font-bold text-green-600">
              {exportAction.message}
            </span>
          )}
          {regenAction.message && (
            <span className="text-[10px] font-bold text-blue-600">
              {regenAction.message}
            </span>
          )}
        </div>

        {/* 필터 바 (접이식) */}
        {filtersExpanded && (
          <div className="flex flex-wrap items-center gap-3 border-t border-dashed px-3 py-2">
            {/* 상태 필터 */}
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                withExpand(setStatusFilter, v as "all" | "done" | "pending")
              }
            >
              <SelectTrigger className="h-7 w-28 text-[10px] font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="done">완료만</SelectItem>
                <SelectItem value="pending">미완료만</SelectItem>
              </SelectContent>
            </Select>
            {/* 파일명 필터 */}
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="파일명 검색..."
                value={filenameFilter}
                onChange={(e) => withExpand(setFilenameFilter, e.target.value)}
                className="h-7 w-40 pl-7 text-[10px] font-bold"
              />
            </div>
            {/* 메타데이터 필터 */}
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="메타데이터 검색..."
                value={metadataFilter}
                onChange={(e) => withExpand(setMetadataFilter, e.target.value)}
                className="h-7 w-44 pl-7 text-[10px] font-bold"
              />
            </div>
            {/* 필터 초기화 버튼 */}
            {(statusFilter !== "all" || filenameFilter || metadataFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] font-bold text-muted-foreground"
                onClick={() => {
                  setStatusFilter("all")
                  setFilenameFilter("")
                  setMetadataFilter("")
                }}
              >
                <XIcon className="mr-1 h-3 w-3" /> 초기화
              </Button>
            )}
            <div className="ml-auto text-[10px] font-bold text-muted-foreground">
              {filteredRenderItems.length} / {renderItems.length}개
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 px-4 py-4">
        {/* 미할당 이미지 관리 패널 */}
        {showUnassignedPanel && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-400/60 bg-amber-50/20 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-bold text-amber-800">
                  미할당 이미지: {unassignedGroups.size}개 파일 (
                  {unassignedTotalCount}장)
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={checkTemplateAffiliation}
                  isLoading={checkingTemplates}
                  icon={RefreshCwIcon}
                  className="h-7 gap-1.5 text-[10px] font-bold"
                >
                  템플릿 연결 확인
                </LoadingButton>
                <div className="flex cursor-pointer items-center gap-1.5">
                  <Checkbox
                    id="cp-true-orphans"
                    checked={showTrueOrphansOnly}
                    onCheckedChange={(v) => {
                      setShowTrueOrphansOnly(v === true)
                      setUnassignedSelectedFilenames(new Set())
                    }}
                  />
                  <Label
                    htmlFor="cp-true-orphans"
                    className="cursor-pointer text-[10px] font-bold text-muted-foreground"
                  >
                    ⚠ 완전 고아만 보기
                  </Label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-[10px] font-bold text-muted-foreground"
                  onClick={closeUnassignedPanel}
                >
                  <XIcon className="h-3.5 w-3.5" />
                  닫기
                </Button>
              </div>
            </div>

            {/* 액션 바 */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] font-bold"
                onClick={handleUnassignedSelectAll}
              >
                {unassignedSelectedFilenames.size ===
                  filteredUnassignedGroups.size &&
                filteredUnassignedGroups.size > 0
                  ? "전체 해제"
                  : "전체 선택"}
              </Button>
              <LoadingButton
                size="sm"
                className="h-7 gap-1.5 bg-red-600 text-[10px] font-bold hover:bg-red-700"
                onClick={handleBulkTrash}
                isLoading={bulkTrashAction.isLoading}
                disabled={unassignedSelectedFilenames.size === 0}
                icon={Trash2Icon}
              >
                선택 항목 휴지통으로 ({unassignedSelectedFilenames.size}개)
              </LoadingButton>
              {bulkTrashAction.message && (
                <span className="text-xs font-bold text-red-600">
                  {bulkTrashAction.message}
                </span>
              )}
            </div>

            {/* 미할당 이미지 그리드 */}
            <div className="max-h-96 overflow-y-auto">
              {filteredUnassignedGroups.size === 0 ? (
                <div className="py-8 text-center text-[11px] font-bold text-muted-foreground">
                  {showTrueOrphansOnly
                    ? "완전 고아 이미지가 없습니다. 모든 미할당 이미지가 다른 템플릿에 속해 있습니다."
                    : "미할당 이미지가 없습니다."}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {Array.from(filteredUnassignedGroups.entries()).map(
                    ([filename, imgs]) => {
                      const preview = imgs[0]
                      const isSelected =
                        unassignedSelectedFilenames.has(filename)
                      const affiliations =
                        templateAffiliationCache.get(filename)
                      const isTrueOrphan =
                        !affiliations || affiliations.length === 0

                      return (
                        <button
                          key={filename}
                          onClick={() => handleUnassignedToggleSelect(filename)}
                          className={`group relative flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                            isSelected
                              ? "bg-red-50/30 ring-2 ring-red-500"
                              : isTrueOrphan &&
                                  templateAffiliationCache.size > 0
                                ? "border-red-300/60 bg-red-50/20 hover:border-red-400"
                                : "border-muted bg-card hover:border-amber-400/60"
                          }`}
                        >
                          <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                            {preview ? (
                              <img
                                src={`${backendUrl}/saved-images/${preview.hash}`}
                                className="h-full w-full object-cover"
                                alt=""
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <FolderIcon className="h-8 w-8 text-muted-foreground/20" />
                              </div>
                            )}
                            {/* 선택 체크 */}
                            <div className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded">
                              {isSelected ? (
                                <CheckSquareIcon className="h-5 w-5 text-red-500 drop-shadow-sm" />
                              ) : (
                                <SquareIcon className="h-5 w-5 text-white/60 drop-shadow-sm" />
                              )}
                            </div>
                            {/* 완전 고아 표시 */}
                            {isTrueOrphan &&
                              templateAffiliationCache.size > 0 && (
                                <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded bg-red-500 text-white shadow-sm">
                                  <AlertTriangleIcon className="h-3 w-3" />
                                </div>
                              )}
                            <div className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                              {imgs.length}장
                            </div>
                          </div>

                          <div className="min-w-0 px-0.5">
                            <div className="truncate font-mono text-[10px] font-bold">
                              {filename}
                            </div>
                            {/* 템플릿 소속 정보 */}
                            {templateAffiliationCache.size > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-0.5">
                                {isTrueOrphan ? (
                                  <span className="rounded bg-red-100 px-1 py-0.5 text-[8px] font-bold text-red-700">
                                    완전 고아
                                  </span>
                                ) : (
                                  affiliations!.map((name, i) => (
                                    <span
                                      key={i}
                                      className="rounded bg-green-100 px-1 py-0.5 text-[8px] font-bold text-green-700"
                                    >
                                      ✅ {name}
                                    </span>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    }
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 메인 레이아웃 */}
        <div className="flex gap-4">
          {/* 왼쪽: 조합 리스트 (상세 보기일 때만 노출) */}
          {selectedFilename && (
            <div
              className="sticky flex w-64 flex-none flex-col self-start overflow-hidden rounded-lg border bg-card"
              style={
                {
                  top: "calc(45px + var(--toolbar-height, 60px))",
                  maxHeight:
                    "calc(100vh - 45px - var(--toolbar-height, 60px) - 20px)",
                } as React.CSSProperties
              }
            >
              <div className="border-b bg-muted/30 p-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                Combinations
              </div>
              <div className="flex-1 space-y-0.5 overflow-y-auto p-1">
                {renderItems.map((item) => {
                  const imgs = imagesByFilename.get(item.filename) ?? []
                  const isDone = hasApproved(imgs)
                  const isActive = item.filename === selectedFilename
                  return (
                    <button
                      key={item.filename}
                      onClick={() => setSelectedFilename(item.filename)}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-accent/50"
                      }`}
                    >
                      <span className="mt-0.5 flex-none">
                        <StatusIcon done={isDone} active={isActive} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[10px] leading-tight font-bold">
                          {item.filename}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-1">
                          {Object.values(item.meta).map((v, i) => (
                            <span
                              key={i}
                              className={`text-[9px] font-medium uppercase ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-[9px] font-bold opacity-50">
                        {imgs.length}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 오른쪽: 콘텐츠 영역 */}
          <div className="flex min-h-[700px] min-w-0 flex-1 flex-col">
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
              <div className="flex flex-1 flex-col">
                {/* 상세 헤더 (1줄 통합) */}
                <div className="flex-none border-b bg-muted/10 px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedFilename(null)
                        setViewMode("gallery")
                      }}
                      className="h-6 w-6 shrink-0 p-0"
                    >
                      <ArrowLeftIcon className="h-2.5 w-2.5" />
                    </Button>
                    <span className="truncate font-mono text-[11px] font-bold">
                      {selectedFilename}
                    </span>
                    <MetaTags
                      meta={selectedItem?.meta || {}}
                      variant="primary"
                    />
                    <div className="ml-auto flex items-center gap-1.5">
                      <LoadingButton
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() =>
                          selectedFilename &&
                          handleContextMenuRegenerate(selectedFilename)
                        }
                        isLoading={regenAction.isLoading}
                        icon={RefreshCwIcon}
                      ></LoadingButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0"
                          >
                            <Settings2Icon className="h-2.5 w-2.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={handleRejectAll}
                            disabled={
                              !selectedImages.some(
                                (img) =>
                                  img.status !== "approved" &&
                                  img.status !== "rejected"
                              )
                            }
                          >
                            <XIcon className="mr-2 h-3.5 w-3.5 text-red-500" />
                            모두 리젝
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={handleCancelAllRejects}
                            disabled={
                              !selectedImages.some(
                                (img) => img.status === "rejected"
                              )
                            }
                          >
                            <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
                            리젝 취소
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={handleCancelApproval}
                            disabled={!hasApproved(selectedImages)}
                          >
                            <XIcon className="mr-2 h-3.5 w-3.5 text-amber-600" />
                            선택 취소
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>

                {/* 이미지 뷰어 */}
                <div className="relative p-4">
                  {visibleImages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center space-y-4 text-muted-foreground">
                      <Maximize2Icon className="h-10 w-10 opacity-20" />
                      <p className="text-sm font-bold">
                        생성된 이미지가 없습니다
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          selectedFilename &&
                          handleContextMenuRegenerate(selectedFilename)
                        }
                        className="font-bold"
                      >
                        이미지 생성 시작
                      </Button>
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className={`grid gap-4 ${colClass}`}>
                      {visibleImages.map((img, idx) => {
                        const isSelected = img.hash === selectedApprovedHash
                        const isRejected = img.status === "rejected"
                        const isPinned = pinnedHashes.includes(img.hash)
                        return (
                          <ContextMenu key={img.hash}>
                            <div className="flex flex-col gap-1.5">
                              <ContextMenuTrigger asChild>
                                <HoverCard
                                  openDelay={enableHover ? 400 : 99999}
                                  closeDelay={100}
                                >
                                  <HoverCardTrigger asChild>
                                    <button
                                      onClick={() => setPreviewHash(img.hash)}
                                      className={`group relative overflow-hidden rounded-lg transition-colors ${
                                        isSelected
                                          ? "scale-[0.98] shadow-lg ring-4 ring-green-500"
                                          : isRejected
                                            ? "opacity-30 hover:opacity-100"
                                            : "shadow-sm hover:-translate-y-1 hover:ring-2 hover:ring-primary/40"
                                      }`}
                                    >
                                      <img
                                        src={`${backendUrl}/saved-images/${img.hash}`}
                                        alt=""
                                        className="w-full object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={(e) => togglePin(img.hash, e)}
                                        className={`absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${isPinned ? "bg-blue-500 text-white shadow-lg" : "bg-black/40 text-white/50 opacity-0 group-hover:opacity-100"}`}
                                      >
                                        {isPinned ? (
                                          <PinIcon className="h-4 w-4" />
                                        ) : (
                                          <PinOffIcon className="h-4 w-4" />
                                        )}
                                      </button>
                                      {idx < 9 && (
                                        <span className="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded bg-black/40 text-[10px] font-bold text-white opacity-0 backdrop-blur-sm group-hover:opacity-100">
                                          {idx + 1}
                                        </span>
                                      )}
                                      {isSelected && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-green-500/10">
                                          <div className="rounded-full bg-green-500 p-2 text-white shadow-2xl">
                                            <CheckIcon
                                              className="h-8 w-8"
                                              strokeWidth={4}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </button>
                                  </HoverCardTrigger>
                                  {enableHover && (
                                    <HoverCardContent
                                      className="w-80 bg-card/95 p-4 font-mono text-[10px] break-all whitespace-pre-wrap backdrop-blur-md"
                                      side="right"
                                    >
                                      <div className="mb-2 border-b pb-2 font-black tracking-widest text-primary uppercase">
                                        Metadata
                                      </div>
                                      {img.prompt}
                                    </HoverCardContent>
                                  )}
                                </HoverCard>
                              </ContextMenuTrigger>

                              {/* 선택하기 버튼 */}
                              {!isSelected && !isRejected && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-full gap-1 border-green-300 text-[10px] font-bold text-green-600 hover:bg-green-50 hover:text-green-700"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    selectImage(
                                      selectedItem!.filename,
                                      img.hash
                                    )
                                  }}
                                >
                                  <CheckIcon className="h-3 w-3" />
                                  선택
                                </Button>
                              )}
                              {isSelected && (
                                <div className="flex h-7 items-center justify-center rounded bg-green-100 text-[10px] font-bold text-green-700">
                                  <CheckIcon className="mr-1 h-3 w-3" />
                                  선택됨
                                </div>
                              )}
                              {isRejected && (
                                <div className="flex h-7 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                                  <XIcon className="mr-1 h-3 w-3" />
                                  리젝됨
                                </div>
                              )}
                            </div>
                            <ContextMenuContent className="w-40">
                              {isSelected ? (
                                <ContextMenuItem
                                  onClick={() => handleCancelApproval()}
                                >
                                  <XIcon className="h-3.5 w-3.5" /> 선택 취소
                                </ContextMenuItem>
                              ) : isRejected ? (
                                <ContextMenuItem
                                  onClick={() => setStatus(img.hash, "pending")}
                                >
                                  <RefreshCwIcon className="h-3.5 w-3.5" /> 리젝
                                  취소
                                </ContextMenuItem>
                              ) : (
                                <ContextMenuItem
                                  onClick={() =>
                                    setStatus(img.hash, "rejected")
                                  }
                                >
                                  <XIcon className="h-3.5 w-3.5" /> 리젝
                                </ContextMenuItem>
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        )
                      })}
                    </div>
                  ) : viewMode === "compare" ? (
                    <div
                      className={`grid h-full gap-3 ${pinnedHashes.length === 1 ? "grid-cols-1" : pinnedHashes.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
                    >
                      {pinnedHashes.map((hash) => (
                        <div
                          key={hash}
                          className="relative flex h-full overflow-hidden rounded-lg border bg-black/5 shadow-inner"
                        >
                          <button
                            type="button"
                            onClick={(e) => togglePin(hash, e)}
                            className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl"
                          >
                            <PinIcon className="h-5 w-5" />
                          </button>
                          <Magnifier
                            src={`${backendUrl}/saved-images/${hash}`}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <TournamentView
                      images={visibleImages}
                      backendUrl={backendUrl}
                      onComplete={(hash) => {
                        selectImage(selectedItem!.filename, hash)
                        setViewMode("grid")
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
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
          <XIcon className="h-4 w-4" />
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
