import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
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
import { curationApi } from "./useSavedImages"
import { useAsyncAction } from "./hooks/useAsyncAction"
import type { SavedImage } from "./Message"
import type { SavedTemplate } from "./useSavedTemplates"
import type {
  RenderItem,
  CombinationViewProps,
} from "./CombinationPickerComponents"
import {
  ImagePreviewHoverCard,
  CombinationContextMenu,
  RegenCountControl,
  LoadingButton,
} from "./CombinationPickerComponents"
import { hasApproved, findApproved } from "./Message"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

export function Magnifier({ src }: { src: string }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [show, setShow] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - left) / width) * 100
    const y = ((e.clientY - top) / height) * 100
    setPos({ x, y })
  }

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black/5"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onMouseMove={handleMouseMove}
    >
      <img src={src} className="max-h-full max-w-full object-contain" alt="" />
      {show && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backgroundImage: `url(${src})`,
            backgroundPosition: `${pos.x}% ${pos.y}%`,
            backgroundSize: "250%",
            backgroundRepeat: "no-repeat",
          }}
        />
      )}
    </div>
  )
}

export function TournamentView({
  images,
  backendUrl,
  onComplete,
}: {
  images: SavedImage[]
  backendUrl: string
  onComplete: (winnerHash: string) => void
}) {
  const [matches, setMatches] = useState<SavedImage[]>(() =>
    [...images].sort(() => Math.random() - 0.5)
  )
  const [nextRound, setNextRound] = useState<SavedImage[]>([])

  if (matches.length === 0 && nextRound.length === 0) {
    return (
      <div className="flex h-full items-center justify-center font-bold text-muted-foreground">
        이미지 없음
      </div>
    )
  }

  if (matches.length === 1 && nextRound.length === 0) {
    const winner = matches[0]!
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <h2 className="mb-6 text-2xl font-bold text-green-500">
          🏆 최종 우승 🏆
        </h2>
        <img
          src={`${backendUrl}/saved-images/${winner.hash}`}
          className="max-h-[60%] max-w-full rounded-lg border shadow-lg"
          alt="Winner"
        />
        <Button
          className="mt-8 px-8 py-6 text-lg font-bold"
          onClick={() => onComplete(winner.hash)}
        >
          이 이미지 선택 완료
        </Button>
      </div>
    )
  }

  const left = matches[0]!
  const right = matches[1]!

  const handlePick = (winner: SavedImage) => {
    const newNext = [...nextRound, winner]
    const remaining = matches.slice(2)

    if (remaining.length === 0) {
      setMatches(newNext.sort(() => Math.random() - 0.5))
      setNextRound([])
    } else if (remaining.length === 1) {
      setMatches([...newNext, remaining[0]!].sort(() => Math.random() - 0.5))
      setNextRound([])
    } else {
      setNextRound(newNext)
      setMatches(remaining)
    }
  }

  const totalMatchesThisRound = Math.floor(
    (matches.length + nextRound.length * 2) / 2
  )
  const currentMatchNum = nextRound.length + 1

  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <div className="mb-6 flex flex-col items-center">
        <h3 className="text-xl font-bold">이상형 월드컵</h3>
        <span className="text-sm font-medium text-muted-foreground">
          라운드 매치: {currentMatchNum} / {totalMatchesThisRound}
        </span>
      </div>
      <div className="flex w-full flex-1 gap-6 overflow-hidden">
        {[left, right].map((img) => (
          <button
            key={img.hash}
            onClick={() => handlePick(img)}
            className="group relative flex-1 overflow-hidden rounded-xl border-4 border-transparent bg-black/5 focus:outline-none"
          >
            <img
              src={`${backendUrl}/saved-images/${img.hash}`}
              className="h-full w-full object-contain"
              alt=""
            />
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-4 text-center font-bold text-white opacity-0 group-hover:opacity-100">
              이 이미지 선택
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

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
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.values(item.meta)
                            .slice(0, 2)
                            .map((v, i) => (
                              <span
                                key={i}
                                className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                              >
                                {v}
                              </span>
                            ))}
                        </div>
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
                      {isDone ? (
                        <CheckCircle2Icon className="h-4 w-4 text-green-500" />
                      ) : (
                        <CircleIcon className="h-4 w-4 text-muted-foreground/30" />
                      )}
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
                      <div className="flex flex-wrap gap-1">
                        {Object.values(item.meta).map((v, i) => (
                          <span
                            key={i}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
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

// LongPressWrapper: 500ms 이상 누르면 long press 이벤트 발생
function LongPressWrapper({
  children,
  onLongPress,
  onClick,
  className,
  as: Component = "button",
  ...rest
}: {
  children: React.ReactNode
  onLongPress: () => void
  onClick: () => void
  className?: string
  as?: React.ElementType
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "onClick" | "className">) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)
  const [pressing, setPressing] = useState(false)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 오른쪽 클릭은 무시
      if (e.button !== 0) return
      longPressTriggeredRef.current = false
      setPressing(true)
      timerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true
        setPressing(false)
        onLongPress()
      }, 500)
    },
    [onLongPress]
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      clear()
      setPressing(false)
      if (!longPressTriggeredRef.current) {
        onClick()
      }
    },
    [clear, onClick]
  )

  const handleMouseLeave = useCallback(() => {
    clear()
    setPressing(false)
  }, [clear])

  // cleanup on unmount
  useEffect(() => {
    return () => clear()
  }, [clear])

  return (
    <Component
      className={className}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={pressing ? { opacity: 0.7 } : undefined}
      {...rest}
    >
      {children}
    </Component>
  )
}

interface Props {
  backendUrl: string
  cegTemplate: string
  savedTemplates: SavedTemplate[]
  enableHover?: boolean
  autoApplyReject?: boolean
}

export const CombinationPicker = memo(function CombinationPicker({
  backendUrl,
  cegTemplate,
  savedTemplates,
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
  const [regenCount, setRegenCount] = useState(4)
  const [duplicateStrategy, setDuplicateStrategy] = useState<"hash" | "number">(
    "hash"
  )

  const exportAction = useAsyncAction(3000)
  const regenAction = useAsyncAction(3000)

  const [hideRejected, setHideRejected] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(autoApplyReject)

  const [viewMode, setViewMode] = useState<ViewMode>("gallery")
  const [pinnedHashes, setPinnedHashes] = useState<string[]>([])

  // 선택 모드 관련 상태
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(
    new Set()
  )
  const bulkRegenAction = useAsyncAction(4000)

  // 필터 관련 상태
  const [statusFilter, setStatusFilter] = useState<"all" | "done" | "pending">(
    "all"
  )
  const [filenameFilter, setFilenameFilter] = useState("")
  const [metadataFilter, setMetadataFilter] = useState("")

  // 미할당 이미지(고아) 관리 관련 상태
  const [showUnassignedPanel, setShowUnassignedPanel] = useState(false)
  const [unassignedSelectedFilenames, setUnassignedSelectedFilenames] =
    useState<Set<string>>(new Set())
  const [showTrueOrphansOnly, setShowTrueOrphansOnly] = useState(false)
  const [templateAffiliationCache, setTemplateAffiliationCache] = useState<
    Map<string, string[]>
  >(new Map())
  const [checkingTemplates, setCheckingTemplates] = useState(false)
  const bulkTrashAction = useAsyncAction(4000)

  const activeTemplate =
    savedTemplates.find((t) => t.id === selectedTemplateId)?.template ??
    cegTemplate

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
  const handleUnassignedToggleSelect = useCallback((filename: string) => {
    setUnassignedSelectedFilenames((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
      } else {
        next.add(filename)
      }
      return next
    })
  }, [])

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

  const selectedItem = renderItems.find(
    (ri) => ri.filename === selectedFilename
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

  const handleContextMenuRegenerate = useCallback(
    async (filename: string) => {
      if (regenAction.isLoading) return
      await regenAction.execute(
        () => curationApi.regenerate(backendUrl, filename, regenCount),
        (jobIds) => `잡 ${jobIds.length}개 추가됨`,
        "재생성 실패"
      )
    },
    [backendUrl, regenAction, regenCount]
  )

  const handleRegenerate = useCallback(async () => {
    if (!selectedFilename) return
    await handleContextMenuRegenerate(selectedFilename)
  }, [selectedFilename, handleContextMenuRegenerate])

  const handleOpen = useCallback((filename: string) => {
    setSelectionMode(false)
    setSelectedFilenames(new Set())
    setSelectedFilename(filename)
    setViewMode("grid")
  }, [])

  const handleRejectImage = useCallback(
    async (hash: string) => {
      setAllImages((prev) =>
        prev.map((img) =>
          img.hash === hash ? { ...img, status: "rejected" as const } : img
        )
      )
      await curationApi.patchStatus(backendUrl, hash, "rejected")
    },
    [backendUrl]
  )

  const handleCancelReject = useCallback(
    async (hash: string) => {
      setAllImages((prev) =>
        prev.map((img) =>
          img.hash === hash ? { ...img, status: "pending" as const } : img
        )
      )
      await curationApi.patchStatus(backendUrl, hash, "pending")
    },
    [backendUrl]
  )

  const handleRejectAll = useCallback(async () => {
    const targets = selectedImages.filter(
      (img) => img.status !== "approved" && img.status !== "rejected"
    )
    if (targets.length === 0) return
    setAllImages((prev) =>
      prev.map((img) => {
        if (
          img.originalFilename !== selectedFilename ||
          img.status === "approved"
        )
          return img
        return { ...img, status: "rejected" as const }
      })
    )
    await Promise.all(
      targets.map((img) =>
        curationApi.patchStatus(backendUrl, img.hash, "rejected")
      )
    )
  }, [backendUrl, selectedImages, selectedFilename])

  const handleCancelAllRejects = useCallback(async () => {
    const targets = selectedImages.filter((img) => img.status === "rejected")
    if (targets.length === 0) return
    setAllImages((prev) =>
      prev.map((img) => {
        if (img.originalFilename !== selectedFilename) return img
        return img.status === "rejected"
          ? { ...img, status: "pending" as const }
          : img
      })
    )
    await Promise.all(
      targets.map((img) =>
        curationApi.patchStatus(backendUrl, img.hash, "pending")
      )
    )
  }, [backendUrl, selectedImages, selectedFilename])

  const handleCancelApproval = useCallback(async () => {
    const allInGroup = selectedImages.filter(
      (img) => img.status === "approved" || img.status === "rejected"
    )
    if (allInGroup.length === 0) return
    setAllImages((prev) =>
      prev.map((img) => {
        if (img.originalFilename !== selectedFilename) return img
        if (img.status === "approved" || img.status === "rejected") {
          return { ...img, status: "pending" as const }
        }
        return img
      })
    )
    await Promise.all(
      allInGroup.map((img) =>
        curationApi.patchStatus(backendUrl, img.hash, "pending")
      )
    )
  }, [backendUrl, selectedImages, selectedFilename])

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
  const handleToggleSelect = useCallback((filename: string) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
        // 마지막 선택 해제 시 선택 모드 종료
        if (next.size === 0) {
          setSelectionMode(false)
        }
      } else {
        next.add(filename)
      }
      return next
    })
  }, [])

  // 선택 모드 종료
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedFilenames(new Set())
  }, [])

  // 선택된 항목들 일괄 재생성
  const handleBulkRegenerate = useCallback(async () => {
    if (bulkRegenAction.isLoading || selectedFilenames.size === 0) return
    const result = await bulkRegenAction.execute(
      async () => {
        const filenames = Array.from(selectedFilenames)
        let totalJobs = 0
        for (const filename of filenames) {
          const jobIds = await curationApi.regenerate(
            backendUrl,
            filename,
            regenCount
          )
          totalJobs += jobIds.length
        }
        return { count: filenames.length, totalJobs }
      },
      ({ count, totalJobs }) =>
        `${count}개 항목, 총 ${totalJobs}개 작업 생성 완료`,
      "일괄 재생성 실패"
    )
    if (result !== null) {
      exitSelectionMode()
    }
  }, [
    backendUrl,
    selectedFilenames,
    regenCount,
    bulkRegenAction,
    exitSelectionMode,
  ])

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
          handleRegenerate()
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
    handleRegenerate,
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

  const isBrowsing = !selectedFilename

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
    <div className="flex flex-col gap-4">
      {/* 글로벌 툴바 */}
      <div className="flex flex-col gap-3 border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">템플릿:</span>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="h-9 w-64 rounded-md border bg-background px-3 text-sm font-bold focus:ring-1 focus:ring-ring focus:outline-none"
            >
              <option value="">현재 편집 중인 탬플릿</option>
              {savedTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={viewMode} onValueChange={handleTabChange}>
              <TabsList className="h-9">
                <TabsTrigger
                  value="gallery"
                  className="gap-1.5 px-3 text-xs font-bold"
                >
                  <FolderIcon className="h-3.5 w-3.5" />
                  갤러리
                </TabsTrigger>
                <TabsTrigger
                  value="table"
                  className="gap-1.5 px-3 text-xs font-bold"
                >
                  <LayoutListIcon className="h-3.5 w-3.5" />
                  리스트
                </TabsTrigger>
                <div className="mx-1 h-4 w-px bg-muted-foreground/30" />
                <TabsTrigger
                  value="grid"
                  className="gap-1.5 px-3 text-xs font-bold"
                  disabled={isBrowsing}
                >
                  <Maximize2Icon className="h-3.5 w-3.5" />
                  그리드
                </TabsTrigger>
                <TabsTrigger
                  value="compare"
                  className="gap-1.5 px-3 text-xs font-bold"
                  disabled={isBrowsing || pinnedHashes.length === 0}
                >
                  <ColumnsIcon className="h-3.5 w-3.5" />
                  비교
                </TabsTrigger>
                <TabsTrigger
                  value="tournament"
                  className="gap-1.5 px-3 text-xs font-bold"
                  disabled={isBrowsing || visibleImages.length < 2}
                >
                  <SwordsIcon className="h-3.5 w-3.5" />
                  월드컵
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase">
              <span>진행률</span>
              <span>
                {doneCount} / {renderItems.length}
              </span>
            </div>
            <Progress
              value={(doneCount / renderItems.length) * 100}
              className="h-1.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              title="새로고침"
            >
              <RefreshCwIcon className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1 rounded-md border bg-background p-1">
              <select
                value={duplicateStrategy}
                onChange={(e) =>
                  setDuplicateStrategy(e.target.value as "hash" | "number")
                }
                className="h-7 bg-transparent px-2 text-[10px] font-bold focus:outline-none"
              >
                <option value="hash">HASH</option>
                <option value="number">NUM</option>
              </select>
              <LoadingButton
                size="sm"
                className="h-7 px-3 text-[10px] font-black"
                onClick={handleExport}
                isLoading={exportAction.isLoading}
                disabled={doneCount === 0}
                icon={DownloadIcon}
              >
                DATASET EXPORT
              </LoadingButton>
            </div>
          </div>
          <div className="flex items-center gap-3 border-l pl-4">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <input
                type="checkbox"
                checked={hideRejected}
                onChange={(e) => setHideRejected(e.target.checked)}
                className="rounded"
              />
              리젝 숨기기
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="rounded"
              />
              자동 다음 이동
            </label>
          </div>
          {exportAction.message && (
            <span className="text-xs font-bold text-green-600">
              {exportAction.message}
            </span>
          )}
          {regenAction.message && (
            <span className="text-xs font-bold text-blue-600">
              {regenAction.message}
            </span>
          )}
          {unassignedGroups.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUnassignedPanel(!showUnassignedPanel)}
              className={`h-7 gap-1.5 border-amber-400/60 bg-amber-50/50 text-[10px] font-bold hover:bg-amber-100/60 ${showUnassignedPanel ? "ring-2 ring-amber-400" : ""}`}
            >
              <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-600" />
              미할당: {unassignedGroups.size}파일 ({unassignedTotalCount}장)
            </Button>
          )}
        </div>
      </div>

      {/* 선택 모드 액션 바 */}
      {selectionMode && (
        <div className="flex items-center gap-3 rounded-lg border bg-blue-50/30 px-4 py-2.5">
          <span className="text-sm font-bold text-blue-700">
            {selectedFilenames.size}개 항목 선택됨
          </span>
          <RegenCountControl
            value={regenCount}
            onChange={setRegenCount}
            buttonText="선택 항목 재생성"
            isLoading={bulkRegenAction.isLoading}
            isDisabled={
              bulkRegenAction.isLoading || selectedFilenames.size === 0
            }
            onAction={handleBulkRegenerate}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-[10px] font-bold text-muted-foreground"
            onClick={exitSelectionMode}
          >
            <XIcon className="h-3.5 w-3.5" />
            선택 모드 종료
          </Button>
          {bulkRegenAction.message && (
            <span className="text-xs font-bold text-blue-600">
              {bulkRegenAction.message}
            </span>
          )}
        </div>
      )}

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
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showTrueOrphansOnly}
                  onChange={(e) => {
                    setShowTrueOrphansOnly(e.target.checked)
                    setUnassignedSelectedFilenames(new Set())
                  }}
                  className="rounded"
                />
                ⚠ 완전 고아만 보기
              </label>
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
                    const isSelected = unassignedSelectedFilenames.has(filename)
                    const affiliations = templateAffiliationCache.get(filename)
                    const isTrueOrphan =
                      !affiliations || affiliations.length === 0

                    return (
                      <button
                        key={filename}
                        onClick={() => handleUnassignedToggleSelect(filename)}
                        className={`group relative flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                          isSelected
                            ? "bg-red-50/30 ring-2 ring-red-500"
                            : isTrueOrphan && templateAffiliationCache.size > 0
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
      <div
        className="flex gap-4"
        style={{ height: "calc(100vh - 250px)", minHeight: 500 }}
      >
        {/* 왼쪽: 조합 리스트 (상세 보기일 때만 노출) */}
        {!isBrowsing && (
          <div className="flex w-64 flex-none flex-col overflow-hidden rounded-lg border bg-card">
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
                    <span
                      className={`mt-0.5 flex-none ${isActive ? "" : isDone ? "text-green-500" : "text-muted-foreground/30"}`}
                    >
                      {isDone ? (
                        <CheckCircle2Icon className="h-4 w-4" />
                      ) : (
                        <CircleIcon className="h-4 w-4" />
                      )}
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
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          {isBrowsing ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* 필터 바 */}
              <div className="flex-none border-b bg-muted/10 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <FilterIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                      필터
                    </span>
                  </div>
                  {/* 상태 필터 */}
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(
                        e.target.value as "all" | "done" | "pending"
                      )
                    }
                    className="h-7 rounded border bg-background px-2 text-[10px] font-bold focus:ring-1 focus:ring-ring focus:outline-none"
                  >
                    <option value="all">전체 상태</option>
                    <option value="done">완료만</option>
                    <option value="pending">미완료만</option>
                  </select>
                  {/* 파일명 필터 */}
                  <div className="relative">
                    <SearchIcon className="absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="파일명 검색..."
                      value={filenameFilter}
                      onChange={(e) => setFilenameFilter(e.target.value)}
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
                      onChange={(e) => setMetadataFilter(e.target.value)}
                      className="h-7 w-44 pl-7 text-[10px] font-bold"
                    />
                  </div>
                  {/* 필터 초기화 버튼 (필터가 활성화되었을 때만 표시) */}
                  {(statusFilter !== "all" ||
                    filenameFilter ||
                    metadataFilter) && (
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
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <FolderIcon className="h-4 w-4" /> 모든 조합 탐색
                  </h3>
                  {!selectionMode && (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      길게 누르면 선택 모드 진입
                    </span>
                  )}
                </div>
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
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* 상세 헤더 */}
              <div className="flex-none border-b bg-muted/10 px-4 py-3">
                <div className="flex flex-col gap-2">
                  {/* Row 1: 네비게이션 + 파일명 + 메타 태그 */}
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedFilename(null)
                        setViewMode("gallery")
                      }}
                      className="h-8 shrink-0 gap-1.5 font-bold"
                    >
                      <ArrowLeftIcon className="h-3.5 w-3.5" />
                      목록
                    </Button>
                    <span className="truncate font-mono text-sm font-bold">
                      {selectedFilename}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {Object.values(selectedItem?.meta || {}).map((v, i) => (
                        <span
                          key={i}
                          className="rounded border border-primary/10 bg-primary/10 px-2 py-0.5 text-[9px] font-bold whitespace-nowrap text-primary"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Row 2: 액션 버튼 그룹 */}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <RegenCountControl
                      value={regenCount}
                      onChange={setRegenCount}
                      buttonText="재생성"
                      isLoading={regenAction.isLoading}
                      isDisabled={regenAction.isLoading}
                      onAction={handleRegenerate}
                    />
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 border-red-300 text-[10px] font-bold text-red-600 hover:bg-red-50"
                        onClick={handleRejectAll}
                        disabled={
                          !selectedImages.some(
                            (img) =>
                              img.status !== "approved" &&
                              img.status !== "rejected"
                          )
                        }
                      >
                        <XIcon className="h-3 w-3" />
                        모두 리젝
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-[10px] font-bold"
                        onClick={handleCancelAllRejects}
                        disabled={
                          !selectedImages.some(
                            (img) => img.status === "rejected"
                          )
                        }
                      >
                        <RefreshCwIcon className="h-3 w-3" />
                        리젝 취소
                      </Button>
                      <div className="h-4 w-px bg-border" />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 border-amber-300 text-[10px] font-bold text-amber-600 hover:bg-amber-50"
                        onClick={handleCancelApproval}
                        disabled={!hasApproved(selectedImages)}
                      >
                        <XIcon className="h-3 w-3" />
                        선택 취소
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 이미지 뷰어 */}
              <div className="relative flex-1 overflow-y-auto p-4">
                {visibleImages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center space-y-4 text-muted-foreground">
                    <Maximize2Icon className="h-10 w-10 opacity-20" />
                    <p className="text-sm font-bold">
                      생성된 이미지가 없습니다
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerate}
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
                          <ContextMenuTrigger asChild>
                            <HoverCard
                              openDelay={enableHover ? 400 : 99999}
                              closeDelay={100}
                            >
                              <HoverCardTrigger asChild>
                                <button
                                  onClick={() =>
                                    selectImage(
                                      selectedItem!.filename,
                                      img.hash
                                    )
                                  }
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
                          <ContextMenuContent className="w-40">
                            {isSelected ? (
                              <ContextMenuItem
                                onClick={() => handleCancelApproval()}
                              >
                                <XIcon className="h-3.5 w-3.5" /> 선택 취소
                              </ContextMenuItem>
                            ) : isRejected ? (
                              <ContextMenuItem
                                onClick={() => handleCancelReject(img.hash)}
                              >
                                <RefreshCwIcon className="h-3.5 w-3.5" /> 리젝
                                취소
                              </ContextMenuItem>
                            ) : (
                              <ContextMenuItem
                                onClick={() => handleRejectImage(img.hash)}
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
                        className="relative overflow-hidden rounded-lg border bg-black/5 shadow-inner"
                      >
                        <button
                          type="button"
                          onClick={(e) => togglePin(hash, e)}
                          className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl"
                        >
                          <PinIcon className="h-5 w-5" />
                        </button>
                        <Magnifier src={`${backendUrl}/saved-images/${hash}`} />
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
    </div>
  )
})
