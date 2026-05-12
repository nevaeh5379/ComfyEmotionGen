import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2Icon,
  CheckIcon,
  CircleIcon,
  DownloadIcon,
  Loader2Icon,
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
  EyeIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { curationApi } from "./useSavedImages"
import type { SavedImage } from "./Message"
import type { SavedTemplate } from "./useSavedTemplates"

type ViewMode = "gallery" | "table" | "grid" | "compare" | "tournament"

interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
}

function Magnifier({ src }: { src: string }) {
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

function TournamentView({
  images,
  backendUrl,
  onComplete,
}: {
  images: SavedImage[]
  backendUrl: string
  onComplete: (winnerHash: string) => void
}) {
  const [matches, setMatches] = useState<SavedImage[]>(() => [...images].sort(() => Math.random() - 0.5))
  const [nextRound, setNextRound] = useState<SavedImage[]>([])

  if (matches.length === 0 && nextRound.length === 0) {
    return <div className="flex h-full items-center justify-center text-muted-foreground font-bold">이미지 없음</div>
  }

  if (matches.length === 1 && nextRound.length === 0) {
    const winner = matches[0]!
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-6 text-green-500">🏆 최종 우승 🏆</h2>
        <img src={`${backendUrl}/saved-images/${winner.hash}`} className="max-h-[60%] max-w-full rounded-lg shadow-lg border" alt="Winner" />
        <Button className="mt-8 px-8 py-6 text-lg font-bold" onClick={() => onComplete(winner.hash)}>
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

  const totalMatchesThisRound = Math.floor((matches.length + nextRound.length * 2) / 2)
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
            <img src={`${backendUrl}/saved-images/${img.hash}`} className="h-full w-full object-contain" alt="" />
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-4 text-center opacity-0 group-hover:opacity-100 font-bold text-white">
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
  selectionMode,
  selectedFilenames,
  onToggleSelect,
  onLongPress,
}: {
  items: RenderItem[]
  imagesByFilename: Map<string, SavedImage[]>
  backendUrl: string
  onSelect: (filename: string) => void
  selectionMode: boolean
  selectedFilenames: Set<string>
  onToggleSelect: (filename: string) => void
  onLongPress: (filename: string) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((item) => {
        const imgs = imagesByFilename.get(item.filename) ?? []
        const approved = imgs.find((img) => img.status === "approved")
        const preview = approved || imgs[0]
        const isDone = !!approved
        const isSelected = selectedFilenames.has(item.filename)

        return (
          <HoverCard key={item.filename} openDelay={500} closeDelay={100}>
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
                className={`group relative flex flex-col gap-2 rounded-lg border bg-card p-2 hover:border-primary hover:shadow-md ${isSelected ? "ring-2 ring-blue-500 bg-blue-50/30" : ""}`}
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
                    <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded z-10">
                      {isSelected ? (
                        <CheckSquareIcon className="h-6 w-6 text-blue-500 drop-shadow-sm" />
                      ) : (
                        <SquareIcon className="h-6 w-6 text-white/70 drop-shadow-sm" />
                      )}
                    </div>
                  )}

                  {!selectionMode && (
                    <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded bg-black/60 text-white backdrop-blur-sm">
                      <FolderIcon className="h-3.5 w-3.5" />
                    </div>
                  )}

                  {isDone && (
                    <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded bg-green-500 text-white shadow-sm">
                      <CheckIcon className="h-4 w-4" strokeWidth={3} />
                    </div>
                  )}

                  <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {imgs.length}장
                  </div>
                </div>

                <div className="px-1 text-left">
                  <div className="truncate font-mono text-[11px] font-bold">{item.filename}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.values(item.meta).slice(0, 2).map((v, i) => (
                      <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground font-medium">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              </LongPressWrapper>
            </HoverCardTrigger>
            <HoverCardContent className="w-72 p-3" side="right" align="start">
              <div className="mb-2 text-[10px] font-black text-primary uppercase tracking-widest border-b pb-1.5">
                {item.filename} ({imgs.length}장)
              </div>
              {imgs.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">이미지 없음</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
                  {imgs.slice(0, 12).map((img) => (
                    <div key={img.hash} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                      <img
                        src={`${backendUrl}/saved-images/${img.hash}`}
                        className="h-full w-full object-cover"
                        alt=""
                        loading="lazy"
                      />
                      {img.status === "approved" && (
                        <div className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-green-500 text-white">
                          <CheckIcon className="h-3 w-3" strokeWidth={3} />
                        </div>
                      )}
                      {img.status === "rejected" && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-white/80">REJ</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {imgs.length > 12 && (
                    <div className="aspect-square flex items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                      +{imgs.length - 12}
                    </div>
                  )}
                </div>
              )}
            </HoverCardContent>
          </HoverCard>
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
  selectionMode,
  selectedFilenames,
  onToggleSelect,
  onLongPress,
}: {
  items: RenderItem[]
  imagesByFilename: Map<string, SavedImage[]>
  backendUrl: string
  onSelect: (filename: string) => void
  selectionMode: boolean
  selectedFilenames: Set<string>
  onToggleSelect: (filename: string) => void
  onLongPress: (filename: string) => void
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            {selectionMode && <th className="px-2 py-2 font-bold text-muted-foreground w-8"></th>}
            <th className="px-4 py-2 font-bold text-muted-foreground w-12">상태</th>
            <th className="px-4 py-2 font-bold text-muted-foreground">파일명</th>
            <th className="px-4 py-2 font-bold text-muted-foreground">메타데이터</th>
            <th className="px-4 py-2 font-bold text-muted-foreground text-right w-20">수</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => {
            const imgs = imagesByFilename.get(item.filename) ?? []
            const isDone = imgs.some((img) => img.status === "approved")
            const isSelected = selectedFilenames.has(item.filename)

            return (
              <LongPressWrapper
                key={item.filename}
                onLongPress={() => onLongPress(item.filename)}
                onClick={() => {
                  if (selectionMode) {
                    onToggleSelect(item.filename)
                  } else {
                    onSelect(item.filename)
                  }
                }}
                className={`group cursor-pointer hover:bg-accent/50 ${isSelected ? "bg-blue-50/30 ring-1 ring-inset ring-blue-300" : ""}`}
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
                  {isDone ? <CheckCircle2Icon className="h-4 w-4 text-green-500" /> : <CircleIcon className="h-4 w-4 text-muted-foreground/30" />}
                </td>
                <HoverCard openDelay={500} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <td className="px-4 py-2 cursor-default">
                      <span className="font-mono text-xs font-bold">{item.filename}</span>
                    </td>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72 p-3" side="right" align="start">
                    <div className="mb-2 text-[10px] font-black text-primary uppercase tracking-widest border-b pb-1.5">
                      {item.filename} ({imgs.length}장)
                    </div>
                    {imgs.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic">이미지 없음</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
                        {imgs.slice(0, 12).map((img) => (
                          <div key={img.hash} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                            <img
                              src={`${backendUrl}/saved-images/${img.hash}`}
                              className="h-full w-full object-cover"
                              alt=""
                              loading="lazy"
                            />
                            {img.status === "approved" && (
                              <div className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-green-500 text-white">
                                <CheckIcon className="h-3 w-3" strokeWidth={3} />
                              </div>
                            )}
                            {img.status === "rejected" && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-white/80">REJ</span>
                              </div>
                            )}
                          </div>
                        ))}
                        {imgs.length > 12 && (
                          <div className="aspect-square flex items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                            +{imgs.length - 12}
                          </div>
                        )}
                      </div>
                    )}
                  </HoverCardContent>
                </HoverCard>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {Object.values(item.meta).map((v, i) => (
                      <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {v}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="font-mono text-xs text-muted-foreground">{imgs.length}</span>
                </td>
              </LongPressWrapper>
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
  as: Component = "button" as any,
  ...rest
}: {
  children: React.ReactNode
  onLongPress: () => void
  onClick: () => void
  className?: string
  as?: any
  [key: string]: any
}) {
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
    (_: React.MouseEvent) => {
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
}

export function CombinationPicker({ backendUrl, cegTemplate, savedTemplates }: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [renderItems, setRenderItems] = useState<RenderItem[]>([])
  const [allImages, setAllImages] = useState<SavedImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [regenCount, setRegenCount] = useState(4)
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenMessage, setRegenMessage] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [duplicateStrategy, setDuplicateStrategy] = useState<"hash" | "number">("hash")

  const [hideRejected, setHideRejected] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(true)

  const [viewMode, setViewMode] = useState<ViewMode>("gallery")
  const [pinnedHashes, setPinnedHashes] = useState<string[]>([])

  // 선택 모드 관련 상태
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set())
  const [bulkRegenLoading, setBulkRegenLoading] = useState(false)
  const [bulkRegenMessage, setBulkRegenMessage] = useState<string | null>(null)

  // 필터 관련 상태
  const [statusFilter, setStatusFilter] = useState<"all" | "done" | "pending">("all")
  const [filenameFilter, setFilenameFilter] = useState("")
  const [metadataFilter, setMetadataFilter] = useState("")

  // 미할당 이미지(고아) 관리 관련 상태
  const [showUnassignedPanel, setShowUnassignedPanel] = useState(false)
  const [unassignedSelectedFilenames, setUnassignedSelectedFilenames] = useState<Set<string>>(new Set())
  const [showTrueOrphansOnly, setShowTrueOrphansOnly] = useState(false)
  const [templateAffiliationCache, setTemplateAffiliationCache] = useState<Map<string, string[]>>(new Map())
  const [checkingTemplates, setCheckingTemplates] = useState(false)
  const [bulkTrashLoading, setBulkTrashLoading] = useState(false)
  const [bulkTrashMessage, setBulkTrashMessage] = useState<string | null>(null)

  const activeTemplate =
    savedTemplates.find((t) => t.id === selectedTemplateId)?.template ?? cegTemplate

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
      if (!imagesRes.ok) throw new Error(`이미지 로드 실패: HTTP ${imagesRes.status}`)
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
        (imagesByFilename.get(ri.filename) ?? []).some((img) => img.status === "approved")
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
    () => Array.from(unassignedGroups.values()).reduce((sum, imgs) => sum + imgs.length, 0),
    [unassignedGroups]
  )

  // 선택된 템플릿의 renderItems에서 filename set (템플릿 소속 확인용 캐시)
  const currentRenderFilenameSet = useMemo(
    () => new Set(renderItems.map((ri) => ri.filename)),
    [renderItems]
  )

  // 템플릿 소속 확인 함수 (lazy: 사용자가 패널 열었을 때)
  const checkTemplateAffiliation = useCallback(async () => {
    if (checkingTemplates || savedTemplates.length === 0) return
    setCheckingTemplates(true)
    const cache = new Map<string, string[]>()
    try {
      // "현재 편집 중인 템플릿" + 저장된 모든 템플릿
      const allTemplateSpecs: { id: string; name: string; template: string }[] = [
        { id: "__current__", name: "현재 편집 중인 템플릿", template: cegTemplate },
        ...savedTemplates.map((st) => ({ id: st.id, name: st.name, template: st.template })),
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
      checkTemplateAffiliation()
    }
  }, [showUnassignedPanel, templateAffiliationCache.size, checkTemplateAffiliation])

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
    if (unassignedSelectedFilenames.size === allFilenames.length && allFilenames.length > 0) {
      setUnassignedSelectedFilenames(new Set())
    } else {
      setUnassignedSelectedFilenames(new Set(allFilenames))
    }
  }, [filteredUnassignedGroups, unassignedSelectedFilenames])

  // 미할당 이미지 선택 항목 일괄 trash 처리
  const handleBulkTrash = useCallback(async () => {
    if (bulkTrashLoading || unassignedSelectedFilenames.size === 0) return
    setBulkTrashLoading(true)
    setBulkTrashMessage(null)
    let trashedCount = 0
    try {
      for (const filename of unassignedSelectedFilenames) {
        const imgs = unassignedGroups.get(filename) ?? []
        for (const img of imgs) {
          if (img.status !== "trashed") {
            await curationApi.patchStatus(backendUrl, img.hash, "trashed")
            trashedCount++
          }
        }
      }
      // allImages에서 제거 (trash된 이미지 제외)
      setAllImages((prev) =>
        prev.map((img) =>
          unassignedSelectedFilenames.has(img.originalFilename) && img.status !== "trashed"
            ? { ...img, status: "trashed" as const, trashedAt: Date.now() }
            : img
        )
      )
      setBulkTrashMessage(`${unassignedSelectedFilenames.size}개 그룹, ${trashedCount}장 휴지통으로 이동`)
      setUnassignedSelectedFilenames(new Set())
      setTimeout(() => setBulkTrashMessage(null), 4000)
    } catch {
      setBulkTrashMessage("삭제 실패")
      setTimeout(() => setBulkTrashMessage(null), 4000)
    } finally {
      setBulkTrashLoading(false)
    }
  }, [backendUrl, unassignedSelectedFilenames, unassignedGroups, bulkTrashLoading])

  // 미할당 패널 닫기
  const closeUnassignedPanel = useCallback(() => {
    setShowUnassignedPanel(false)
    setUnassignedSelectedFilenames(new Set())
  }, [])

  // 필터링된 렌더 아이템
  const filteredRenderItems = useMemo(() => {
    return renderItems.filter((ri) => {
      const imgs = imagesByFilename.get(ri.filename) ?? []
      const isDone = imgs.some((img) => img.status === "approved")

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
  }, [renderItems, imagesByFilename, statusFilter, filenameFilter, metadataFilter])

  const selectedItem = renderItems.find((ri) => ri.filename === selectedFilename)
  const selectedImages = useMemo(
    () =>
      (selectedFilename ? (imagesByFilename.get(selectedFilename) ?? []) : []).sort(
        (a, b) => a.createdAt - b.createdAt
      ),
    [selectedFilename, imagesByFilename]
  )
  const selectedApprovedHash = selectedImages.find((img) => img.status === "approved")?.hash

  const visibleImages = useMemo(
    () => selectedImages.filter((img) => !hideRejected || img.status !== "rejected"),
    [selectedImages, hideRejected]
  )

  const navigateTo = useCallback(
    (direction: "prev" | "next") => {
      const currentIdx = renderItems.findIndex((ri) => ri.filename === selectedFilename)
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
          if (img.originalFilename !== filename || img.status === "trashed") return img
          return { ...img, status: img.hash === selectedHash ? "approved" : "rejected" }
        })
      )

      const currentIdx = renderItems.findIndex((ri) => ri.filename === filename)
      if (autoAdvance) {
        const next = renderItems.find((ri, idx) => {
          if (idx <= currentIdx) return false
          const nextImgs = imagesByFilename.get(ri.filename) ?? []
          return !nextImgs.some((img) => img.status === "approved")
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
    if (exportLoading || doneCount === 0) return
    setExportLoading(true)
    setExportMessage(null)
    try {
      const approvedFilenames = renderItems
        .filter((ri) =>
          (imagesByFilename.get(ri.filename) ?? []).some((img) => img.status === "approved")
        )
        .map((ri) => ri.filename)
      await curationApi.exportDataset(backendUrl, { filenames: approvedFilenames, duplicateStrategy })
      setExportMessage(`${approvedFilenames.length}개 파일 내보내기 완료`)
      setTimeout(() => setExportMessage(null), 3000)
    } catch {
      setExportMessage("내보내기 실패")
      setTimeout(() => setExportMessage(null), 3000)
    } finally {
      setExportLoading(false)
    }
  }, [backendUrl, exportLoading, doneCount, renderItems, imagesByFilename, duplicateStrategy])

  const handleRegenerate = useCallback(async () => {
    if (!selectedFilename || regenLoading) return
    setRegenLoading(true)
    setRegenMessage(null)
    try {
      const jobIds = await curationApi.regenerate(backendUrl, selectedFilename, regenCount)
      setRegenMessage(`잡 ${jobIds.length}개 추가됨`)
      setTimeout(() => setRegenMessage(null), 3000)
    } catch {
      setRegenMessage("재생성 실패")
      setTimeout(() => setRegenMessage(null), 3000)
    } finally {
      setRegenLoading(false)
    }
  }, [backendUrl, selectedFilename, regenCount, regenLoading])

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
    if (bulkRegenLoading || selectedFilenames.size === 0) return
    setBulkRegenLoading(true)
    setBulkRegenMessage(null)
    try {
      const filenames = Array.from(selectedFilenames)
      let totalJobs = 0
      // 순차적으로 각 filename에 대해 regenerate 호출
      for (const filename of filenames) {
        const jobIds = await curationApi.regenerate(backendUrl, filename, regenCount)
        totalJobs += jobIds.length
      }
      setBulkRegenMessage(`${filenames.length}개 항목, 총 ${totalJobs}개 작업 생성 완료`)
      setTimeout(() => setBulkRegenMessage(null), 4000)
      exitSelectionMode()
    } catch {
      setBulkRegenMessage("일괄 재생성 실패")
      setTimeout(() => setBulkRegenMessage(null), 4000)
    } finally {
      setBulkRegenLoading(false)
    }
  }, [backendUrl, selectedFilenames, regenCount, bulkRegenLoading, exitSelectionMode])

  const togglePin = useCallback((hash: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedHashes((prev) => (prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash]))
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
  }, [selectedFilename, navigateTo, handleRegenerate, selectImage, selectedItem, visibleImages, selectionMode, exitSelectionMode])

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
    return <div className="py-20 text-center text-muted-foreground font-bold italic">데이터를 불러오는 중...</div>

  if (error)
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-destructive font-bold">{error}</p>
        <Button onClick={fetchData} className="font-bold">다시 시도</Button>
      </div>
    )

  if (renderItems.length === 0)
    return (
      <div className="py-20 text-center text-muted-foreground font-bold">
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
              className="h-9 w-64 rounded-md border bg-background px-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">현재 편집 중인 탬플릿</option>
              {savedTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={viewMode} onValueChange={handleTabChange}>
              <TabsList className="h-9">
                <TabsTrigger value="gallery" className="text-xs px-3 gap-1.5 font-bold">
                  <FolderIcon className="h-3.5 w-3.5" />갤러리
                </TabsTrigger>
                <TabsTrigger value="table" className="text-xs px-3 gap-1.5 font-bold">
                  <LayoutListIcon className="h-3.5 w-3.5" />리스트
                </TabsTrigger>
                <div className="mx-1 h-4 w-px bg-muted-foreground/30" />
                <TabsTrigger value="grid" className="text-xs px-3 gap-1.5 font-bold" disabled={isBrowsing}>
                  <Maximize2Icon className="h-3.5 w-3.5" />그리드
                </TabsTrigger>
                <TabsTrigger value="compare" className="text-xs px-3 gap-1.5 font-bold" disabled={isBrowsing || pinnedHashes.length === 0}>
                  <ColumnsIcon className="h-3.5 w-3.5" />비교
                </TabsTrigger>
                <TabsTrigger value="tournament" className="text-xs px-3 gap-1.5 font-bold" disabled={isBrowsing || visibleImages.length < 2}>
                  <SwordsIcon className="h-3.5 w-3.5" />월드컵
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase">
              <span>진행률</span>
              <span>{doneCount} / {renderItems.length}</span>
            </div>
            <Progress value={(doneCount / renderItems.length) * 100} className="h-1.5" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} title="새로고침"><RefreshCwIcon className="h-4 w-4" /></Button>
            <div className="flex items-center gap-1 rounded-md border bg-background p-1">
              <select
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value as "hash" | "number")}
                className="h-7 bg-transparent px-2 text-[10px] font-bold focus:outline-none"
              >
                <option value="hash">HASH</option>
                <option value="number">NUM</option>
              </select>
              <Button
                size="sm"
                className="h-7 text-[10px] font-black px-3"
                onClick={handleExport}
                disabled={exportLoading || doneCount === 0}
              >
                {exportLoading ? <Loader2Icon className="h-3 w-3 animate-spin mr-1" /> : <DownloadIcon className="h-3 w-3 mr-1" />}
                DATASET EXPORT
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3 border-l pl-4">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={hideRejected} onChange={(e) => setHideRejected(e.target.checked)} className="rounded" />
              리젝 숨기기
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} className="rounded" />
              자동 다음 이동
            </label>
          </div>
          {exportMessage && <span className="text-xs font-bold text-green-600">{exportMessage}</span>}
          {regenMessage && <span className="text-xs font-bold text-blue-600">{regenMessage}</span>}
          {unassignedGroups.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUnassignedPanel(!showUnassignedPanel)}
              className={`h-7 gap-1.5 text-[10px] font-bold border-amber-400/60 bg-amber-50/50 hover:bg-amber-100/60 ${showUnassignedPanel ? "ring-2 ring-amber-400" : ""}`}
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
          <div className="flex items-center gap-2 bg-background p-1 rounded border shadow-sm">
            <div className="flex flex-col items-center px-2">
              <span className="text-[8px] font-bold text-muted-foreground uppercase leading-none mb-0.5">Regen Count</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={regenCount}
                onChange={(e) => setRegenCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                className="h-6 w-10 text-center text-[11px] font-bold border-none focus-visible:ring-0 p-0"
              />
            </div>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-[10px] font-bold"
              onClick={handleBulkRegenerate}
              disabled={bulkRegenLoading || selectedFilenames.size === 0}
            >
              {bulkRegenLoading ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCwIcon className="h-3.5 w-3.5" />
              )}
              선택 항목 재생성
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-[10px] font-bold text-muted-foreground"
            onClick={exitSelectionMode}
          >
            <XIcon className="h-3.5 w-3.5" />
            선택 모드 종료
          </Button>
          {bulkRegenMessage && (
            <span className="text-xs font-bold text-blue-600">{bulkRegenMessage}</span>
          )}
        </div>
      )}

      {/* 미할당 이미지 관리 패널 */}
      {showUnassignedPanel && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-400/60 bg-amber-50/20 px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-bold text-amber-800">
                미할당 이미지: {unassignedGroups.size}개 파일 ({unassignedTotalCount}장)
              </span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={checkTemplateAffiliation}
                disabled={checkingTemplates}
                className="h-7 gap-1.5 text-[10px] font-bold"
              >
                {checkingTemplates ? (
                  <Loader2Icon className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCwIcon className="h-3 w-3" />
                )}
                템플릿 연결 확인
              </Button>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground cursor-pointer">
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
              {unassignedSelectedFilenames.size === filteredUnassignedGroups.size && filteredUnassignedGroups.size > 0
                ? "전체 해제"
                : "전체 선택"}
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-[10px] font-bold bg-red-600 hover:bg-red-700"
              onClick={handleBulkTrash}
              disabled={bulkTrashLoading || unassignedSelectedFilenames.size === 0}
            >
              {bulkTrashLoading ? (
                <Loader2Icon className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2Icon className="h-3 w-3" />
              )}
              선택 항목 휴지통으로 ({unassignedSelectedFilenames.size}개)
            </Button>
            {bulkTrashMessage && (
              <span className="text-xs font-bold text-red-600">{bulkTrashMessage}</span>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {Array.from(filteredUnassignedGroups.entries()).map(([filename, imgs]) => {
                  const preview = imgs[0]
                  const isSelected = unassignedSelectedFilenames.has(filename)
                  const affiliations = templateAffiliationCache.get(filename)
                  const isTrueOrphan = !affiliations || affiliations.length === 0

                  return (
                    <button
                      key={filename}
                      onClick={() => handleUnassignedToggleSelect(filename)}
                      className={`group relative flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                        isSelected
                          ? "ring-2 ring-red-500 bg-red-50/30"
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
                        <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded z-10">
                          {isSelected ? (
                            <CheckSquareIcon className="h-5 w-5 text-red-500 drop-shadow-sm" />
                          ) : (
                            <SquareIcon className="h-5 w-5 text-white/60 drop-shadow-sm" />
                          )}
                        </div>
                        {/* 완전 고아 표시 */}
                        {isTrueOrphan && templateAffiliationCache.size > 0 && (
                          <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded bg-red-500 text-white shadow-sm">
                            <AlertTriangleIcon className="h-3 w-3" />
                          </div>
                        )}
                        <div className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                          {imgs.length}장
                        </div>
                      </div>

                      <div className="px-0.5 min-w-0">
                        <div className="truncate font-mono text-[10px] font-bold">{filename}</div>
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
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 메인 레이아웃 */}
      <div className="flex gap-4" style={{ height: "calc(100vh - 250px)", minHeight: 500 }}>
        {/* 왼쪽: 조합 리스트 (상세 보기일 때만 노출) */}
        {!isBrowsing && (
          <div className="w-64 flex-none flex flex-col overflow-hidden rounded-lg border bg-card">
            <div className="p-2 border-b bg-muted/30 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Combinations</div>
            <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
              {renderItems.map((item) => {
                const imgs = imagesByFilename.get(item.filename) ?? []
                const isDone = imgs.some((img) => img.status === "approved")
                const isActive = item.filename === selectedFilename
                return (
                  <button
                    key={item.filename}
                    onClick={() => setSelectedFilename(item.filename)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                      isActive ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent/50 text-foreground"
                    }`}
                  >
                    <span className={`mt-0.5 flex-none ${isActive ? "" : isDone ? "text-green-500" : "text-muted-foreground/30"}`}>
                      {isDone ? <CheckCircle2Icon className="h-4 w-4" /> : <CircleIcon className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[10px] font-bold leading-tight">{item.filename}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-1">
                        {Object.values(item.meta).map((v, i) => (
                          <span key={i} className={`text-[9px] uppercase font-medium ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{v}</span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[9px] font-bold opacity-50">{imgs.length}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 오른쪽: 콘텐츠 영역 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-lg border bg-card">
          {isBrowsing ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 필터 바 */}
              <div className="flex-none border-b bg-muted/10 px-4 py-2.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <FilterIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">필터</span>
                  </div>
                  {/* 상태 필터 */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "all" | "done" | "pending")}
                    className="h-7 rounded border bg-background px-2 text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">전체 상태</option>
                    <option value="done">완료만</option>
                    <option value="pending">미완료만</option>
                  </select>
                  {/* 파일명 필터 */}
                  <div className="relative">
                    <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
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
                    <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="메타데이터 검색..."
                      value={metadataFilter}
                      onChange={(e) => setMetadataFilter(e.target.value)}
                      className="h-7 w-44 pl-7 text-[10px] font-bold"
                    />
                  </div>
                  {/* 필터 초기화 버튼 (필터가 활성화되었을 때만 표시) */}
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
                      <XIcon className="h-3 w-3 mr-1" /> 초기화
                    </Button>
                  )}
                  <div className="ml-auto text-[10px] font-bold text-muted-foreground">
                    {filteredRenderItems.length} / {renderItems.length}개
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FolderIcon className="h-4 w-4" /> 모든 조합 탐색
                  </h3>
                  {!selectionMode && (
                    <span className="text-[10px] text-muted-foreground font-medium">길게 누르면 선택 모드 진입</span>
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
                    selectionMode={selectionMode}
                    selectedFilenames={selectedFilenames}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPress}
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
                    selectionMode={selectionMode}
                    selectedFilenames={selectedFilenames}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPress}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 상세 헤더 */}
              <div className="flex-none border-b px-4 py-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setSelectedFilename(null)
                        setViewMode("gallery")
                      }} 
                      className="h-8 gap-1.5 font-bold"
                    >
                      <ArrowLeftIcon className="h-3.5 w-3.5" />목록
                    </Button>
                    <span className="font-mono text-sm font-bold truncate">{selectedFilename}</span>
                    <div className="flex gap-1 overflow-hidden">
                      {Object.values(selectedItem?.meta || {}).map((v, i) => (
                        <span key={i} className="rounded bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary whitespace-nowrap border border-primary/10">{v}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-background p-1 rounded border shadow-sm">
                    <div className="flex flex-col items-center px-2">
                      <span className="text-[8px] font-bold text-muted-foreground uppercase leading-none mb-0.5">Regen Count</span>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={regenCount}
                        onChange={(e) => setRegenCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                        className="h-6 w-10 text-center text-[11px] font-bold border-none focus-visible:ring-0 p-0"
                      />
                    </div>
                    <Button size="sm" className="h-8 gap-1.5 text-[10px] font-bold" onClick={handleRegenerate} disabled={regenLoading}>
                      {regenLoading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <RefreshCwIcon className="h-3.5 w-3.5" />}
                      재생성
                    </Button>
                  </div>
                </div>
              </div>

              {/* 이미지 뷰어 */}
              <div className="flex-1 overflow-y-auto p-4 relative">
                {visibleImages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-muted-foreground space-y-4">
                    <Maximize2Icon className="h-10 w-10 opacity-20" />
                    <p className="text-sm font-bold">생성된 이미지가 없습니다</p>
                    <Button variant="outline" size="sm" onClick={handleRegenerate} className="font-bold">이미지 생성 시작</Button>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className={`grid gap-4 ${colClass}`}>
                    {visibleImages.map((img, idx) => {
                      const isSelected = img.hash === selectedApprovedHash
                      const isRejected = img.status === "rejected"
                      const isPinned = pinnedHashes.includes(img.hash)
                      return (
                        <HoverCard key={img.hash} openDelay={400} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button
                              onClick={() => selectImage(selectedItem!.filename, img.hash)}
                              className={`group relative overflow-hidden rounded-lg transition-colors ${
                                isSelected ? "ring-4 ring-green-500 scale-[0.98] shadow-lg" : isRejected ? "opacity-30 hover:opacity-100" : "hover:ring-2 hover:ring-primary/40 hover:-translate-y-1 shadow-sm"
                              }`}
                            >
                              <img src={`${backendUrl}/saved-images/${img.hash}`} alt="" className="w-full object-cover" />
                              <button
                                type="button"
                                onClick={(e) => togglePin(img.hash, e)}
                                className={`absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-full transition-colors backdrop-blur-sm ${isPinned ? "bg-blue-500 text-white shadow-lg" : "bg-black/40 text-white/50 opacity-0 group-hover:opacity-100"}`}
                              >
                                {isPinned ? <PinIcon className="h-4 w-4" /> : <PinOffIcon className="h-4 w-4" />}
                              </button>
                              {idx < 9 && <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded bg-black/40 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 backdrop-blur-sm">{idx + 1}</span>}
                              {isSelected && <div className="absolute inset-0 flex items-center justify-center bg-green-500/10"><div className="bg-green-500 rounded-full p-2 text-white shadow-2xl"><CheckIcon className="h-8 w-8" strokeWidth={4} /></div></div>}
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80 p-4 text-[10px] font-mono whitespace-pre-wrap break-all bg-card/95 backdrop-blur-md" side="right">
                            <div className="border-b pb-2 mb-2 font-black text-primary uppercase tracking-widest">Metadata</div>
                            {img.prompt}
                          </HoverCardContent>
                        </HoverCard>
                      )
                    })}
                  </div>
                ) : viewMode === "compare" ? (
                  <div className={`grid gap-3 h-full ${pinnedHashes.length === 1 ? 'grid-cols-1' : pinnedHashes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {pinnedHashes.map(hash => (
                      <div key={hash} className="relative rounded-lg border overflow-hidden bg-black/5 shadow-inner">
                        <button type="button" onClick={(e) => togglePin(hash, e)} className="absolute right-4 top-4 z-20 h-9 w-9 flex items-center justify-center rounded-full bg-blue-500 text-white shadow-xl"><PinIcon className="h-5 w-5" /></button>
                        <Magnifier src={`${backendUrl}/saved-images/${hash}`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <TournamentView images={visibleImages} backendUrl={backendUrl} onComplete={(hash) => selectImage(selectedItem!.filename, hash)} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}