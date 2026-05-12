import { useCallback, useEffect, useMemo, useState } from "react"
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
  LayoutGridIcon,
  SwordsIcon,
  ColumnsIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { curationApi } from "./useSavedImages"
import type { SavedImage } from "./Message"
import type { SavedTemplate } from "./useSavedTemplates"

type ViewMode = "grid" | "compare" | "tournament"

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
    return <div className="flex h-full items-center justify-center text-muted-foreground">이미지 없음</div>
  }

  if (matches.length === 1 && nextRound.length === 0) {
    const winner = matches[0]!
    return (
      <div className="flex h-full flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
        <h2 className="text-2xl font-bold mb-6 text-green-500">🏆 최종 우승 🏆</h2>
        <img src={`${backendUrl}/saved-images/${winner.hash}`} className="max-h-[60%] max-w-full rounded-lg shadow-2xl" alt="Winner" />
        <Button className="mt-8 px-8 py-6 text-lg" onClick={() => onComplete(winner.hash)}>
          선택 완료 및 다음 조합으로
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
            className="group relative flex-1 overflow-hidden rounded-2xl border-4 border-transparent bg-black/5 transition-all hover:scale-[1.02] hover:border-primary hover:shadow-xl focus:outline-none"
          >
            <img src={`${backendUrl}/saved-images/${img.hash}`} className="h-full w-full object-contain transition-transform group-hover:scale-[1.01]" alt="" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 text-center opacity-0 transition-opacity group-hover:opacity-100">
              <span className="font-bold text-white">이 이미지 선택</span>
            </div>
          </button>
        ))}
      </div>
    </div>
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

  // Phase 1: 빠른 큐레이션 상태
  const [hideRejected, setHideRejected] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(true)

  // Phase 2: 뷰 모드 및 핀 고정 상태
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [pinnedHashes, setPinnedHashes] = useState<string[]>([])

  // 실제로 렌더링에 사용할 템플릿 — 저장된 것 선택 시 그것, 아니면 현재 편집 중인 것
  const activeTemplate =
    savedTemplates.find((t) => t.id === selectedTemplateId)?.template ?? cegTemplate

  const fetchData = useCallback(async () => {
    if (!activeTemplate.trim()) {
      setError("잡 탭에서 CEG 템플릿을 먼저 작성해주세요.")
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

      if (renderData.items.length > 0) {
        const imageMap = new Map<string, SavedImage[]>()
        for (const img of imagesData.items) {
          if (img.status === "trashed") continue
          if (!imageMap.has(img.originalFilename)) imageMap.set(img.originalFilename, [])
          imageMap.get(img.originalFilename)!.push(img)
        }
        const firstIncomplete = renderData.items.find(
          (ri) => !(imageMap.get(ri.filename) ?? []).some((img) => img.status === "approved")
        )
        setSelectedFilename(firstIncomplete?.filename ?? renderData.items[0]!.filename)
      }
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

  const togglePin = useCallback((hash: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedHashes((prev) => (prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash]))
  }, [])

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        navigateTo("next")
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        navigateTo("prev")
      } else if (e.key === "r" || e.key === "R") {
        handleRegenerate()
      } else if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1
        if (selectedItem && idx < visibleImages.length) {
          selectImage(selectedItem.filename, visibleImages[idx]!.hash)
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [navigateTo, handleRegenerate, selectImage, selectedItem, visibleImages])

  const colClass =
    visibleImages.length <= 2
      ? "grid-cols-2"
      : visibleImages.length <= 6
        ? "grid-cols-3"
        : "grid-cols-4"

  if (loading)
    return <div className="py-20 text-center text-muted-foreground">로드 중...</div>

  if (error)
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-destructive">{error}</p>
        <Button onClick={fetchData}>다시 시도</Button>
      </div>
    )

  if (renderItems.length === 0)
    return (
      <div className="py-20 text-center text-muted-foreground">
        렌더링된 조합이 없습니다.
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      {/* 템플릿 선택 */}
      <select
        value={selectedTemplateId}
        onChange={(e) => setSelectedTemplateId(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">현재 편집 중인 탬플릿</option>
        {savedTemplates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {/* 진행률 */}
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">조합 선택 완료</span>
            <span className="font-medium">
              {doneCount} / {renderItems.length}
            </span>
          </div>
          <Progress
            value={renderItems.length > 0 ? (doneCount / renderItems.length) * 100 : 0}
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCwIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exportLoading || doneCount === 0}
        >
          {exportLoading ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <DownloadIcon className="h-4 w-4" />
          )}
          내보내기
        </Button>
        <select
          value={duplicateStrategy}
          onChange={(e) => setDuplicateStrategy(e.target.value as "hash" | "number")}
          className="h-9 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="hash">중복 시 해시</option>
          <option value="number">중복 시 번호</option>
        </select>
        
        {/* 빠른 큐레이션 토글 */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
          <input 
            type="checkbox" 
            checked={hideRejected} 
            onChange={(e) => setHideRejected(e.target.checked)} 
            className="rounded border-gray-300"
          />
          리젝 숨기기
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input 
            type="checkbox" 
            checked={autoAdvance} 
            onChange={(e) => setAutoAdvance(e.target.checked)} 
            className="rounded border-gray-300"
          />
          자동 다음 이동
        </label>

        {exportMessage && (
          <span className="text-xs text-muted-foreground">{exportMessage}</span>
        )}
      </div>

      {/* 마스터-디테일 */}
      <div className="flex gap-3" style={{ height: "calc(100vh - 220px)", minHeight: 500 }}>
        {/* 왼쪽: 조합 목록 */}
        <div className="w-64 flex-none overflow-y-auto rounded-lg border bg-card">
          <div className="space-y-0.5 p-2">
            {renderItems.map((item) => {
              const imgs = imagesByFilename.get(item.filename) ?? []
              const isDone = imgs.some((img) => img.status === "approved")
              const isActive = item.filename === selectedFilename
              return (
                <button
                  key={item.filename}
                  onClick={() => setSelectedFilename(item.filename)}
                  className={`flex w-full items-start gap-2 rounded px-2 py-2 text-left transition-colors ${
                    isActive ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex-none ${isDone ? "text-green-500" : "text-muted-foreground/30"}`}
                  >
                    {isDone ? (
                      <CheckCircle2Icon className="h-4 w-4" />
                    ) : (
                      <CircleIcon className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs">{item.filename}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-1.5">
                      {Object.values(item.meta).map((v, i) => (
                        <span key={i} className="text-[10px] text-muted-foreground">
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="mt-0.5 flex-none text-[10px] text-muted-foreground">
                    {imgs.length}장
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 오른쪽: 이미지 그리드 */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden rounded-lg border bg-card">
          {!selectedItem ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              왼쪽에서 조합을 선택하세요
            </div>
          ) : (
            <>
              {/* 헤더 */}
              <div className="flex-none border-b px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium">
                    {selectedItem.filename}
                  </span>
                  {Object.values(selectedItem.meta).map((v, i) => (
                    <span key={i} className="rounded bg-muted px-2 py-0.5 text-xs">
                      {v}
                    </span>
                  ))}
                  <div className="ml-4">
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                      <TabsList className="h-8">
                        <TabsTrigger value="grid" className="text-xs px-2"><LayoutGridIcon className="mr-1 h-3 w-3" />그리드</TabsTrigger>
                        <TabsTrigger value="compare" className="text-xs px-2" disabled={pinnedHashes.length === 0}><ColumnsIcon className="mr-1 h-3 w-3" />비교 ({pinnedHashes.length})</TabsTrigger>
                        <TabsTrigger value="tournament" className="text-xs px-2" disabled={visibleImages.length < 2}><SwordsIcon className="mr-1 h-3 w-3" />토너먼트</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  {/* 재생성 컨트롤 */}
                  <div className="ml-auto flex items-center gap-2">
                    {regenMessage && (
                      <span className="text-xs text-muted-foreground">{regenMessage}</span>
                    )}
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={regenCount}
                      onChange={(e) =>
                        setRegenCount(
                          Math.max(1, Math.min(20, parseInt(e.target.value) || 1))
                        )
                      }
                      className="h-8 w-16 text-center text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerate}
                      disabled={regenLoading}
                    >
                      {regenLoading ? (
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="h-4 w-4" />
                      )}
                      재생성
                    </Button>
                  </div>
                </div>
                {/* 단축키 힌트 */}
                <div className="flex gap-3 text-[10px] text-muted-foreground/60">
                  <span><kbd className="font-sans">↑↓</kbd> / <kbd className="font-sans">J K</kbd> 조합 이동</span>
                  <span><kbd className="font-sans">1–9</kbd> 이미지 선택</span>
                  <span><kbd className="font-sans">R</kbd> 재생성</span>
                </div>
              </div>

              {/* 이미지 영역 */}
              <div className="flex-1 overflow-y-auto p-4 relative">
                {visibleImages.length === 0 ? (
                  <div className="flex h-48 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                    이미지 없음
                  </div>
                ) : viewMode === "grid" ? (
                  <div className={`grid gap-3 ${colClass}`}>
                    {visibleImages.map((img, idx) => {
                      const isSelected = img.hash === selectedApprovedHash
                      const isRejected = img.status === "rejected"
                      const isPinned = pinnedHashes.includes(img.hash)
                      return (
                        <HoverCard key={img.hash} openDelay={400} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button
                              onClick={() => selectImage(selectedItem.filename, img.hash)}
                              title={isSelected ? "선택됨" : `이미지 선택 [${idx + 1}]`}
                              className={`group relative overflow-hidden rounded-lg transition-all focus:outline-none ${
                                isSelected
                                  ? "ring-4 ring-green-500"
                                  : isRejected
                                    ? "opacity-40 hover:opacity-80 hover:ring-2 hover:ring-primary/40"
                                    : "opacity-85 hover:opacity-100 hover:ring-2 hover:ring-primary/40"
                              }`}
                            >
                              <img
                                src={`${backendUrl}/saved-images/${img.hash}`}
                                alt={img.originalFilename}
                                className="w-full object-cover"
                              />
                              {/* 핀 고정 버튼 */}
                              <button
                                type="button"
                                onClick={(e) => togglePin(img.hash, e)}
                                className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow-lg transition-all z-10 ${
                                  isPinned ? "bg-blue-500 text-white" : "bg-black/50 text-white/50 opacity-0 group-hover:opacity-100 hover:text-white"
                                }`}
                              >
                                {isPinned ? <PinIcon className="h-4 w-4" /> : <PinOffIcon className="h-4 w-4" />}
                              </button>
                              {/* 번호 배지 */}
                              {idx < 9 && (
                                <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none z-10">
                                  {idx + 1}
                                </span>
                              )}
                              {isSelected && (
                                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg pointer-events-none z-10">
                                  <CheckIcon className="h-6 w-6" />
                                </span>
                              )}
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80 whitespace-pre-wrap font-mono text-xs overflow-hidden text-ellipsis break-all bg-card/95 backdrop-blur-md" side="right" align="start">
                            <div className="space-y-2">
                              <div className="flex justify-between border-b pb-1">
                                <span className="font-bold">Prompt Data</span>
                                <span>{(img.sizeBytes / 1024).toFixed(1)} KB</span>
                              </div>
                              <div className="max-h-48 overflow-y-auto scrollbar-thin">
                                <p className="text-muted-foreground">{img.prompt}</p>
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      )
                    })}
                  </div>
                ) : viewMode === "compare" ? (
                  <div className={`grid gap-2 h-full ${pinnedHashes.length === 1 ? 'grid-cols-1' : pinnedHashes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {pinnedHashes.map(hash => (
                      <div key={hash} className="relative rounded-lg border overflow-hidden bg-black/5">
                        <button
                          type="button"
                          onClick={(e) => togglePin(hash, e)}
                          className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition-transform hover:scale-110"
                        >
                          <PinIcon className="h-4 w-4" />
                        </button>
                        <Magnifier src={`${backendUrl}/saved-images/${hash}`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <TournamentView
                    key={selectedItem.filename}
                    images={visibleImages}
                    backendUrl={backendUrl}
                    onComplete={(winnerHash) => {
                      selectImage(selectedItem.filename, winnerHash)
                      setViewMode("grid")
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
