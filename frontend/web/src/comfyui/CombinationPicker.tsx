import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2Icon,
  CheckIcon,
  CircleIcon,
  DownloadIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { curationApi } from "./useSavedImages"
import type { SavedImage } from "./Message"
import type { SavedTemplate } from "./useSavedTemplates"

interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
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
      const next = renderItems.find((ri, idx) => {
        if (idx <= currentIdx) return false
        const nextImgs = imagesByFilename.get(ri.filename) ?? []
        return !nextImgs.some((img) => img.status === "approved")
      })
      if (next) setSelectedFilename(next.filename)

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
    [backendUrl, imagesByFilename, renderItems]
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
        if (selectedItem && idx < selectedImages.length) {
          selectImage(selectedItem.filename, selectedImages[idx]!.hash)
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [navigateTo, handleRegenerate, selectImage, selectedItem, selectedImages])

  const colClass =
    selectedImages.length <= 2
      ? "grid-cols-2"
      : selectedImages.length <= 6
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

              {/* 이미지 그리드 */}
              <div className="flex-1 overflow-y-auto p-4">
                {selectedImages.length === 0 ? (
                  <div className="flex h-48 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                    이미지 없음
                  </div>
                ) : (
                  <div className={`grid gap-3 ${colClass}`}>
                    {selectedImages.map((img, idx) => {
                      const isSelected = img.hash === selectedApprovedHash
                      const isRejected = img.status === "rejected"
                      return (
                        <button
                          key={img.hash}
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
                          {/* 번호 배지 */}
                          {idx < 9 && (
                            <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                              {idx + 1}
                            </span>
                          )}
                          {isSelected && (
                            <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
                              <CheckIcon className="h-4 w-4" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
