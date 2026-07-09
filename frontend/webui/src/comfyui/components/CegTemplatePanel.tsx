import { useEffect, useMemo, useRef, useState } from "react"
import {
  Download,
  FileCode2,
  Eye,
  RotateCcw,
  Check,
  X,
  Play,
  AlertCircle,
  Shuffle,
  Search,
  Star,
  Clock,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import CodeEditor, { type AxisEntryContextInfo } from "@/components/CodeEditor"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"

import { SaveInputBar } from "./SavedItemsManager"
import type { SavedTemplate } from "../hooks/useSavedTemplates"
import type { RenderItem, RenderItemsResponse } from "../types/renderTypes"
import {
  applyAxisFilters,
  buildAxisEntryActiveMap,
  disableAxisValue,
  enableAllAxis,
  itemKey,
  randomSelect,
  setAxisOnlyValue,
  substitute,
  type AxisValueFilter,
} from "../../lib/workflowUtils"

interface CegTemplatePanelProps {
  cegTemplate: string
  setCegTemplate: (value: string) => void
  previewCount: number
  onPreviewOpen: () => void
  templateResetKey: number
  savedTemplates: SavedTemplate[]
  activeTemplateId: string | null
  onSaveTemplate: (name: string) => boolean
  onLoadTemplate: (template: SavedTemplate) => void
  onDeleteTemplate: (id: string) => void
  onUpdateTemplate: (() => void) | undefined
  onDownloadSingle?: (() => void) | undefined
  onFileOpen?: ((content: string, name: string) => void) | undefined
  isDirty?: boolean | undefined
  onRevert?: (() => void) | undefined
  // axis entry context menu
  axisValueFilter?: AxisValueFilter | undefined
  setAxisValueFilter?: React.Dispatch<React.SetStateAction<AxisValueFilter>> | undefined
  renderResponse?: RenderItemsResponse | null | undefined
  onRunSingle?: ((item: RenderItem) => Promise<boolean>) | undefined
  parserError?: string | null | undefined
  parserErrorLine?: number | null | undefined
  parserErrorColumn?: number | null | undefined
}

interface CtxMenuState {
  axisName: string
  entryKey: string
  allEntryKeys: string[]
  x: number
  y: number
}

const MAX_RECENT = 5
const MAX_FAVORITES = 20

function recentStorageKey(axisName: string, entryKey: string): string {
  return `ceg_test_recent_${axisName}_${entryKey}`
}

function favoritesStorageKey(axisName: string, entryKey: string): string {
  return `ceg_test_favorites_${axisName}_${entryKey}`
}

function loadRecent(axisName: string, entryKey: string): RenderItem[] {
  try {
    const raw = localStorage.getItem(recentStorageKey(axisName, entryKey))
    if (raw === null || raw === "") return []
    const arr = JSON.parse(raw) as RenderItem[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveRecent(
  axisName: string,
  entryKey: string,
  items: RenderItem[]
): void {
  try {
    localStorage.setItem(
      recentStorageKey(axisName, entryKey),
      JSON.stringify(items.slice(0, MAX_RECENT))
    )
  } catch {
    // ignore quota errors
  }
}

function loadFavorites(axisName: string, entryKey: string): RenderItem[] {
  try {
    const raw = localStorage.getItem(favoritesStorageKey(axisName, entryKey))
    if (raw === null || raw === "") return []
    const arr = JSON.parse(raw) as RenderItem[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveFavorites(
  axisName: string,
  entryKey: string,
  items: RenderItem[]
): void {
  try {
    localStorage.setItem(
      favoritesStorageKey(axisName, entryKey),
      JSON.stringify(items.slice(0, MAX_FAVORITES))
    )
  } catch {
    // ignore quota errors
  }
}

export function CegTemplatePanel({
  cegTemplate,
  setCegTemplate,
  previewCount,
  onPreviewOpen,
  templateResetKey,
  savedTemplates,
  activeTemplateId,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  onUpdateTemplate,
  onDownloadSingle,
  onFileOpen,
  isDirty,
  onRevert,
  axisValueFilter,
  setAxisValueFilter,
  renderResponse,
  onRunSingle,
  parserError,
  parserErrorLine,
  parserErrorColumn,
}: CegTemplatePanelProps): React.JSX.Element {
  const activeName =
    activeTemplateId !== null
      ? savedTemplates.find((t) => t.id === activeTemplateId)?.name
      : undefined

  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const [testDialog, setTestDialog] = useState<{
    axisName: string
    entryKey: string
  } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 컨텍스트 메뉴용 최근 조합 (최대 3개)
  const ctxRecent = useMemo(() => {
    if (ctxMenu === null) return []
    return loadRecent(ctxMenu.axisName, ctxMenu.entryKey).slice(0, 3)
  }, [ctxMenu])

  // 컨텍스트 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (ctxMenu === null) return
    const handlePointerDown = (e: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null)
      }
    }
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setCtxMenu(null)
    }
    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleEsc)
    return (): void => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleEsc)
    }
  }, [ctxMenu])

  const hasSyntaxError = parserError !== null && parserError !== undefined

  const axisEntryActiveMap = useMemo(() => {
    if (hasSyntaxError) return undefined
    if (!axisValueFilter || !setAxisValueFilter) return undefined
    return buildAxisEntryActiveMap(cegTemplate, axisValueFilter)
  }, [cegTemplate, axisValueFilter, setAxisValueFilter, hasSyntaxError])

  const handleAxisEntryContext = (info: AxisEntryContextInfo): void => {
    setCtxMenu({
      axisName: info.axisName,
      entryKey: info.entryKey,
      allEntryKeys: info.allEntryKeys,
      x: info.screenX,
      y: info.screenY,
    })
  }

  const isEntryActive = (axisName: string, entryKey: string): boolean => {
    const vals = axisValueFilter?.[axisName]
    return vals ? vals[entryKey] !== false : true
  }

  const isOnlyValueActive = (
    axisName: string,
    entryKey: string,
    allEntryKeys: string[]
  ): boolean => {
    const vals = axisValueFilter?.[axisName]
    if (!vals) return allEntryKeys.length === 1
    return allEntryKeys.every(
      (k) => vals[k] === (k === entryKey)
    )
  }

  const isAllActive = (axisName: string, allEntryKeys: string[]): boolean => {
    const vals = axisValueFilter?.[axisName]
    if (!vals) return true
    return allEntryKeys.every((k) => vals[k] !== false)
  }

  const closeMenu = (): void => {
    setCtxMenu(null)
  }

  const runMenuAction = (fn: () => void): void => {
    fn()
    closeMenu()
  }

  // "이 값으로 테스트" — 해당 값의 모든 조합
  const testItems = useMemo(() => {
    if (!testDialog || !renderResponse) return []
    const all = renderResponse.items
    return all.filter((item) => {
      const v = item.meta[testDialog.axisName]
      return v === testDialog.entryKey
    })
  }, [testDialog, renderResponse])

  // 컨텍스트 메뉴용 카운트 (다이얼로그 닫혀있을 때)
  const menuTestCount = useMemo(() => {
    if (!ctxMenu || !renderResponse) return 0
    return renderResponse.items.filter(
      (item) => item.meta[ctxMenu.axisName] === ctxMenu.entryKey
    ).length
  }, [ctxMenu, renderResponse])

  // 랜덤 즉시 테스트 (필터 적용 후)
  const handleRandomTest = (): void => {
    if (!onRunSingle || !ctxMenu) return
    const pool = applyAxisFilters(
      renderResponse?.items.filter(
        (item) => item.meta[ctxMenu.axisName] === ctxMenu.entryKey
      ) ?? [],
      axisValueFilter ?? {}
    )
    if (pool.length === 0) {
      toast.error("실행할 조합이 없습니다.")
      return
    }
    const [item] = randomSelect(pool, 1)
    if (item !== undefined) {
      void onRunSingle(item)
      toast.success("랜덤 테스트 실행")
    }
  }

  const handleRunTestItem = (item: RenderItem): void => {
    if (!onRunSingle) return
    void onRunSingle(item)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-muted/40 px-3 py-1.5">
        <div className="relative flex shrink-0 items-center justify-center">
          <FileCode2 className="h-3.5 w-3.5 text-primary opacity-70" />
          {isDirty === true && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500"></span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <SaveInputBar
            key={templateResetKey}
            onSave={onSaveTemplate}
            placeholder={activeName ?? "템플릿 이름 입력..."}
            saveDisabled={!cegTemplate.trim()}
            activeName={activeName}
            items={savedTemplates}
            getFilterText={(t) => t.template}
            onLoad={onLoadTemplate}
            onDelete={onDeleteTemplate}
            activeItemId={activeTemplateId ?? undefined}
            onUpdate={onUpdateTemplate}
            allowEmptySave
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isDirty === true && onRevert && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={onRevert}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>변경사항 취소 (되돌리기)</TooltipContent>
            </Tooltip>
          )}
          {previewCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  onClick={onPreviewOpen}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>미리보기</TooltipContent>
            </Tooltip>
          )}
          {activeTemplateId !== null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  onClick={onDownloadSingle}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>템플릿 다운로드</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault()
            if (onUpdateTemplate) {
              onUpdateTemplate()
            } else {
              const input =
                e.currentTarget.parentElement?.querySelector("input")
              input?.focus()
            }
          }
        }}
      >
        <CodeEditor
          language="ceg"
          placeholder="CEG 템플릿 입력 칸"
          value={cegTemplate}
          onChange={setCegTemplate}
          onFileOpen={onFileOpen}
          minHeight="100px"
          bareWrapper
          className="h-full w-full"
          onAxisEntryContext={
            setAxisValueFilter && !hasSyntaxError
              ? handleAxisEntryContext
              : undefined
          }
          axisEntryActiveMap={axisEntryActiveMap}
          errorLine={hasSyntaxError ? parserErrorLine : null}
        />
      </div>

      {/* 문법 오류 표시바 */}
      {hasSyntaxError && (
        <div className="flex shrink-0 items-start gap-1.5 border-t border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {parserErrorLine !== null && parserErrorLine !== undefined && (
            <span className="shrink-0 font-mono font-semibold">
              L{String(parserErrorLine)}
              {parserErrorColumn !== null && parserErrorColumn !== undefined
                ? `:${String(parserErrorColumn)}`
                : ""}
            </span>
          )}
          <span className="min-w-0 flex-1 break-all whitespace-pre-wrap">
            {parserError}
          </span>
        </div>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {ctxMenu !== null && (
        <div
          ref={menuRef}
          className="fixed z-[1000] flex w-56 flex-col rounded-lg border bg-popover p-1 text-xs text-popover-foreground shadow-md"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e): void => {
            e.stopPropagation()
          }}
        >
          <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">
              {ctxMenu.axisName}
            </span>
            {" → "}
            <span className="font-mono font-semibold text-foreground">
              {ctxMenu.entryKey}
            </span>
          </div>
          <div className="my-1 h-px bg-border" />
          <CtxMenuItem
            onClick={(): void => {
              runMenuAction((): void => {
                if (!setAxisValueFilter) return
                setAxisValueFilter((prev) =>
                  setAxisOnlyValue(
                    prev,
                    ctxMenu.axisName,
                    ctxMenu.entryKey,
                    ctxMenu.allEntryKeys
                  )
                )
              })
            }}
          >
            <Check className="h-3.5 w-3.5 text-green-500" />
            이 값만 활성화
            {isOnlyValueActive(
              ctxMenu.axisName,
              ctxMenu.entryKey,
              ctxMenu.allEntryKeys
            ) && (
              <Check className="ml-auto h-3 w-3 text-muted-foreground" />
            )}
          </CtxMenuItem>
          <CtxMenuItem
            onClick={(): void => {
              runMenuAction((): void => {
                if (!setAxisValueFilter) return
                setAxisValueFilter((prev) =>
                  disableAxisValue(prev, ctxMenu.axisName, ctxMenu.entryKey)
                )
              })
            }}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
            이 값 비활성화
            {!isEntryActive(ctxMenu.axisName, ctxMenu.entryKey) && (
              <Check className="ml-auto h-3 w-3 text-muted-foreground" />
            )}
          </CtxMenuItem>
          <CtxMenuItem
            onClick={(): void => {
              runMenuAction((): void => {
                if (!setAxisValueFilter) return
                setAxisValueFilter((prev) =>
                  enableAllAxis(
                    prev,
                    ctxMenu.axisName,
                    ctxMenu.allEntryKeys
                  )
                )
              })
            }}
          >
            <Check className="h-3.5 w-3.5 text-primary" />
            이 축 전체 활성화
            {isAllActive(ctxMenu.axisName, ctxMenu.allEntryKeys) && (
              <Check className="ml-auto h-3 w-3 text-muted-foreground" />
            )}
          </CtxMenuItem>
          <div className="my-1 h-px bg-border" />
          <CtxMenuItem
            disabled={!onRunSingle || !renderResponse || menuTestCount === 0}
            onClick={(): void => {
              runMenuAction((): void => {
                handleRandomTest()
              })
            }}
          >
            <Shuffle className="h-3.5 w-3.5 text-primary" />
            랜덤 테스트
            {menuTestCount > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {String(menuTestCount)}
              </span>
            )}
          </CtxMenuItem>
          <CtxMenuItem
            disabled={!onRunSingle || !renderResponse || menuTestCount === 0}
            onClick={(): void => {
              if (!onRunSingle || !renderResponse) return
              setTestDialog({
                axisName: ctxMenu.axisName,
                entryKey: ctxMenu.entryKey,
              })
              closeMenu()
            }}
          >
            <Play className="h-3.5 w-3.5 text-primary" />
            조합 선택...
          </CtxMenuItem>

          {/* 최근 실행한 조합 (최대 3개) */}
          {ctxRecent.length > 0 && onRunSingle && (
            <>
              <div className="my-1 h-px bg-border" />
              <div className="px-2.5 py-1 text-[9px] uppercase tracking-wide text-muted-foreground/60">
                최근
              </div>
              {ctxRecent.map((item, idx) => (
                <CtxMenuItem
                  key={`ctx-recent-${itemKey(item)}-${String(idx)}`}
                  onClick={(): void => {
                    runMenuAction((): void => {
                      void onRunSingle(item)
                      // recent 업데이트 (localStorage에만 저장, 메뉴 다시 열릴 때 반영)
                      const k = itemKey(item)
                      const prevRecent = loadRecent(
                        ctxMenu.axisName,
                        ctxMenu.entryKey
                      )
                      const next = [item, ...prevRecent.filter((p) => itemKey(p) !== k)].slice(0, MAX_RECENT)
                      saveRecent(ctxMenu.axisName, ctxMenu.entryKey, next)
                    })
                  }}
                >
                  <Clock className="h-3 w-3 shrink-0 text-blue-400/70" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
                    {substitute(item.filename, item)}
                  </span>
                </CtxMenuItem>
              ))}
            </>
          )}
        </div>
      )}

      {/* "이 값으로 테스트" 조합 선택 다이얼로그 */}
      {testDialog !== null && (
        <TestDialog
          key={`${testDialog.axisName}::${testDialog.entryKey}`}
          testDialog={testDialog}
          testItems={testItems}
          axisValueFilter={axisValueFilter ?? {}}
          onRunSingle={onRunSingle}
          onRunTestItem={handleRunTestItem}
          onClose={(): void => {
            setTestDialog(null)
          }}
        />
      )}
    </div>
  )
}

// ── 조합 선택 다이얼로그 (검색 + 최근 + 파일명 표시) ──────────────────

function TestDialog({
  testDialog,
  testItems,
  axisValueFilter,
  onRunSingle,
  onRunTestItem,
  onClose,
}: {
  testDialog: { axisName: string; entryKey: string }
  testItems: RenderItem[]
  axisValueFilter: AxisValueFilter
  onRunSingle?: ((item: RenderItem) => Promise<boolean>) | undefined
  onRunTestItem: (item: RenderItem) => void
  onClose: () => void
}): React.JSX.Element {
  const [search, setSearch] = useState("")
  const [applyFilter, setApplyFilter] = useState(true)
  const [recent, setRecent] = useState<RenderItem[]>(() =>
    loadRecent(testDialog.axisName, testDialog.entryKey)
  )
  const [favorites, setFavorites] = useState<RenderItem[]>(() =>
    loadFavorites(testDialog.axisName, testDialog.entryKey)
  )

  // 필터 적용된 조합
  const baseItems = useMemo(() => {
    if (!applyFilter) return testItems
    return applyAxisFilters(testItems, axisValueFilter)
  }, [testItems, applyFilter, axisValueFilter])

  // key 집합 (빠른 조회)
  const favoriteKeys = useMemo(() => {
    const s = new Set<string>()
    for (const item of favorites) s.add(itemKey(item))
    return s
  }, [favorites])
  const recentKeys = useMemo(() => {
    const s = new Set<string>()
    for (const item of recent) s.add(itemKey(item))
    return s
  }, [recent])

  // 검색 필터링
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (needle === "") return baseItems
    return baseItems.filter((item) => {
      const fn = substitute(item.filename, item).toLowerCase()
      if (fn.includes(needle)) return true
      const metaText = Object.entries(item.meta)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ")
        .toLowerCase()
      return metaText.includes(needle)
    })
  }, [baseItems, search])

  // 정렬: 즐겨찾기(즐겨찾기 내 최근순) > 최근 사용(최근순) > 일반
  const sortedItems = useMemo(() => {
    if (search.trim() !== "") return filteredItems
    const favs: RenderItem[] = []
    const recents: RenderItem[] = []
    const rest: RenderItem[] = []
    for (const item of filteredItems) {
      const k = itemKey(item)
      if (favoriteKeys.has(k)) favs.push(item)
      else if (recentKeys.has(k)) recents.push(item)
      else rest.push(item)
    }
    // 즐겨찾기: 추가 역순 (최근 추가가 맨 위)
    favs.sort((a, b) => {
      const ia = favorites.findIndex((r) => itemKey(r) === itemKey(a))
      const ib = favorites.findIndex((r) => itemKey(r) === itemKey(b))
      return ia - ib
    })
    // 최근: 실행 역순
    recents.sort((a, b) => {
      const ia = recent.findIndex((r) => itemKey(r) === itemKey(a))
      const ib = recent.findIndex((r) => itemKey(r) === itemKey(b))
      return ia - ib
    })
    return [...favs, ...recents, ...rest]
  }, [filteredItems, favorites, recent, favoriteKeys, recentKeys, search])

  const handleRun = (item: RenderItem): void => {
    onRunTestItem(item)
    // recent 업데이트 (즐겨찾기와 별개)
    const k = itemKey(item)
    setRecent((prev) => {
      const withoutSame = prev.filter((p) => itemKey(p) !== k)
      const next = [item, ...withoutSame].slice(0, MAX_RECENT)
      saveRecent(testDialog.axisName, testDialog.entryKey, next)
      return next
    })
  }

  const toggleFavorite = (item: RenderItem): void => {
    const k = itemKey(item)
    setFavorites((prev) => {
      const exists = prev.some((p) => itemKey(p) === k)
      const next = exists
        ? prev.filter((p) => itemKey(p) !== k)
        : [item, ...prev].slice(0, MAX_FAVORITES)
      saveFavorites(testDialog.axisName, testDialog.entryKey, next)
      return next
    })
  }

  const handleRandomRun = (): void => {
    if (filteredItems.length === 0) return
    const [item] = randomSelect(filteredItems, 1)
    if (item !== undefined) {
      handleRun(item)
      toast.success("랜덤 테스트 실행")
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open): void => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-md">
        {/* 헤더 */}
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <Play className="h-4 w-4 text-primary" />
            이 값으로 테스트 —{" "}
            <span className="font-mono text-primary">
              {testDialog.axisName}
            </span>
            {" → "}
            <span className="font-mono text-primary">
              {testDialog.entryKey}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            조합 {String(testItems.length)}개
            {applyFilter && testItems.length !== baseItems.length
              ? ` (필터 적용: ${String(baseItems.length)}개)`
              : ""}
            {filteredItems.length !== baseItems.length
              ? ` · 검색: ${String(filteredItems.length)}개`
              : ""}
            {favorites.length > 0
              ? ` · ★${String(favorites.length)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* 검색 + 필터 토글 */}
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e): void => {
                setSearch(e.target.value)
              }}
              placeholder="검색..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <Checkbox
              checked={applyFilter}
              onCheckedChange={(v): void => {
                setApplyFilter(v === true)
              }}
            />
            필터
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1 text-xs"
            disabled={filteredItems.length === 0 || !onRunSingle}
            onClick={(): void => {
              handleRandomRun()
            }}
          >
            <Shuffle className="h-3.5 w-3.5" />
            랜덤
          </Button>
        </div>

        {/* 조합 리스트 */}
        {filteredItems.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground italic">
            {testItems.length === 0
              ? "일치하는 조합이 없습니다."
              : "검색/필터 결과가 없습니다."}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: "50vh" }}>
            <div className="flex flex-col px-2 py-1">
              {sortedItems.map((item) => {
                const k = itemKey(item)
                const isFav = favoriteKeys.has(k)
                const isRecent = !isFav && recentKeys.has(k)
                const excluded =
                  !applyFilter &&
                  !applyAxisFilters([item], axisValueFilter).some(
                    (i) => itemKey(i) === k
                  )
                return (
                  <div
                    key={k}
                    className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
                  >
                    {/* 즐겨찾기 토글 버튼 */}
                    <button
                      className="shrink-0 p-0.5"
                      onClick={(e): void => {
                        e.stopPropagation()
                        toggleFavorite(item)
                      }}
                      title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    >
                      {isFav ? (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ) : (
                        <Star className="h-3.5 w-3.5 text-muted-foreground/30 hover:text-amber-400" />
                      )}
                    </button>
                    {/* 최근 사용 표시 */}
                    {isRecent && (
                      <Clock className="h-3 w-3 shrink-0 text-blue-400/70" />
                    )}
                    {/* 파일명 (실행 버튼) */}
                    <button
                      className="min-w-0 flex-1 truncate text-left font-mono text-[11px]"
                      disabled={!onRunSingle}
                      onClick={(): void => {
                        handleRun(item)
                      }}
                    >
                      {substitute(item.filename, item)}
                    </button>
                    {excluded && (
                      <Badge
                        variant="outline"
                        className="shrink-0 text-[9px] text-muted-foreground"
                      >
                        제외
                      </Badge>
                    )}
                    <button
                      className="shrink-0 p-0.5 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                      disabled={!onRunSingle}
                      onClick={(): void => {
                        handleRun(item)
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CtxMenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}