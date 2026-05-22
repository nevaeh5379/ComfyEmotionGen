import { useState, useEffect, useMemo, useRef } from "react"
import {
  Copy,
  Download,
  Check,
  Save,
  ArrowRight,
  FileCode2,
  ChevronDown,
  Pencil,
  Search,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import CodeEditor from "@/components/CodeEditor"
import { useTemplateContext } from "../contexts/TemplateContext"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { RenderItem, RenderItemsResponse } from "../types/renderTypes"
import { API, HEADERS } from "@/lib/api"
import { CEG_TEMPLATE_DEBOUNCE_MS } from "@/lib/constants"
import { itemKey } from "../../lib/workflowUtils"

interface TemplateVariable {
  id: string
  originalName: string
  name: string
  value: string
}

interface TemplateItem {
  id: string
  name: string
  category: string
  code: string
  savedAt?: number
}

export function TemplateGeneratorPanel({
  setActiveTab,
  backendUrl = "http://localhost:8000",
}: {
  setActiveTab: (
    t: "jobs" | "stats" | "gallery" | "curation" | "generator" | "settings"
  ) => void
  backendUrl?: string
}) {
  const { savedTemplates, setCegTemplate, saveTemplate, setTemplateResetKey } =
    useTemplateContext()

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [saveName, setSaveName] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [systemTemplates, setSystemTemplates] = useState<TemplateItem[]>([])
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true)
  const [isSection1Expanded, setIsSection1Expanded] = useState(true)
  const [isSection2Expanded, setIsSection2Expanded] = useState(true)
  const previewRef = useRef<HTMLDivElement>(null)

  // 시스템 templates 폴더에서 템플릿 목록 로드
  useEffect(() => {
    let active = true
    async function loadTemplates() {
      try {
        const res = await fetch(`${backendUrl}/templates`)
        if (res.ok) {
          const data = await res.json()
          if (active && Array.isArray(data) && data.length > 0) {
            setSystemTemplates(data)
            return
          }
        }
      } catch (err) {
        console.error("Failed to load templates from directory:", err)
      }
    }
    loadTemplates()
    return () => {
      active = false
    }
  }, [backendUrl])

  // 개발자 또는 사용자가 저장해둔 템플릿 리스트와 templates 폴더 템플릿 결합
  const combinedTemplates = useMemo<TemplateItem[]>(() => {
    const customItems: TemplateItem[] = savedTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      category: "saved",
      code: t.template,
      savedAt: t.savedAt,
    }))
    return [...customItems, ...systemTemplates]
  }, [savedTemplates, systemTemplates])

  // 카테고리 그룹화
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, TemplateItem[]> = {}
    for (const tmpl of combinedTemplates) {
      const cat = tmpl.category || "기타"
      if (!groups[cat]) groups[cat] = []
      groups[cat]!.push(tmpl)
    }
    return groups
  }, [combinedTemplates])

  // 목록 갱신 시 안전한 초기 선택 처리
  useEffect(() => {
    if (combinedTemplates.length > 0) {
      if (
        !selectedTemplateId ||
        !combinedTemplates.some((t) => t.id === selectedTemplateId)
      ) {
        setSelectedTemplateId(combinedTemplates[0]!.id)
      }
    }
  }, [combinedTemplates, selectedTemplateId])

  // 현재 선택된 템플릿
  const activeTemplate = useMemo<TemplateItem | null>(() => {
    return (
      combinedTemplates.find((t) => t.id === selectedTemplateId) ||
      combinedTemplates[0] ||
      null
    )
  }, [combinedTemplates, selectedTemplateId])

  // {{set name = "value"}} 패턴을 파싱하여 변수 추출
  useEffect(() => {
    if (!activeTemplate) return
    // 하이픈(-)이 포함된 식별자도 정상 파싱할 수 있도록 Lark 문법 규칙([a-zA-Z_-][a-zA-Z0-9_-]*) 적용
    const regex =
      /\{\{\s*set\s+([a-zA-Z_-][a-zA-Z0-9_-]*)\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\}\}/g
    const foundVars: TemplateVariable[] = []
    let match
    let index = 0
    while ((match = regex.exec(activeTemplate.code)) !== null) {
      if (match[1] && match[2] !== undefined) {
        foundVars.push({
          id: `${match[1]}-${index++}`,
          originalName: match[1],
          name: match[1],
          value: match[2],
        })
      }
    }
    setVariables(foundVars)
    setSaveName(`${activeTemplate.name} 커스텀`)
  }, [activeTemplate])

  // 변수명 실시간 업데이트
  const handleVariableNameChange = (id: string, newName: string) => {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, name: newName } : v))
    )
  }

  // 변수값 실시간 업데이트
  const handleVariableValueChange = (id: string, newValue: string) => {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, value: newValue } : v))
    )
  }

  // 사용자 입력을 반영한 DSL 최종 코드 생성
  const generatedCode = useMemo(() => {
    if (!activeTemplate) return ""
    let finalCode = activeTemplate.code

    // 치환할 변수가 전혀 없다면 즉시 반환
    if (variables.length === 0) return finalCode

    // 1. 단일 패스 렉서 방식 매칭 패턴 작성
    // 변수명 충돌(길이가 긴 식별자 우선)을 예방하기 위해 내림차순 정렬 및 이스케이프
    const escapedOriginals = variables
      .map((v) => v.originalName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"))
      .sort((a, b) => b.length - a.length)

    // 마스터 패턴들 조립
    // declPattern: {{set <원래 식별자> = "<값>"}}
    const declPattern = `\\{\\{\\s*set\\s+([a-zA-Z_-][a-zA-Z0-9_-]*)\\s*=\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\\s*\\}\\}`
    // stringPattern: 문자열 상수 수호 ("...")
    const stringPattern = `"[^"\\\\]*(?:\\\\.[^"\\\\]*)*"`
    // varPattern: 식별자 단어 전후방 하이픈 및 단어 경계 탐색
    const varPattern = `(?<![a-zA-Z0-9_-])(${escapedOriginals.join("|")})(?![a-zA-Z0-9_-])`

    // 마스터 정규식 생성 (하나의 단일 패스로 결합)
    const masterRegex = new RegExp(
      `${declPattern}|${stringPattern}|${varPattern}`,
      "g"
    )

    // 2. 단일 패스 스캔 및 안전 치환 수행
    finalCode = finalCode.replace(
      masterRegex,
      (match, declOrigName, _declOrigVal, matchedVarName) => {
        // Case A: 선언부를 만난 경우
        if (declOrigName !== undefined) {
          const v = variables.find((x) => x.originalName === declOrigName)
          if (v) {
            const finalVarName = v.name.trim() !== "" ? v.name : v.originalName
            return `{{set ${finalVarName} = "${v.value}"}}`
          }
          return match
        }

        // Case B: 문자열 바깥의 순수한 변수명 식별자를 만난 경우
        if (matchedVarName !== undefined) {
          const v = variables.find((x) => x.originalName === matchedVarName)
          if (v && v.name.trim() !== "" && v.originalName !== v.name) {
            return v.name
          }
          return match
        }

        // Case C: 문자열 리터럴을 만난 경우 -> 문자열은 절대 훼손하지 않고 그대로 반환
        return match
      }
    )

    return finalCode
  }, [activeTemplate, variables])

  // 파서 실시간 렌더링 결과용 state
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [parserError, setParserError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [previewFilter, setPreviewFilter] = useState("")

  // substitute 헬퍼 함수 추가
  const substitute = (text: string, item: RenderItem) => {
    let res = text || ""
    // Meta variables
    Object.entries(item.meta).forEach(([k, v]) => {
      res = res.split(`{{${k}}}`).join(v)
      res = res.split(`{${k}}`).join(v)
    })
    // Built-ins
    res = res.split("{{input}}").join(item.prompt || "")
    res = res.split("{input}").join(item.prompt || "")
    return res
  }

  // 실시간 파싱 디바운스 Effect
  useEffect(() => {
    if (!generatedCode.trim()) {
      setFakeJobQueue([])
      setParserError(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setParserError(null)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${backendUrl}${API.render}`, {
          method: "POST",
          headers: HEADERS.json,
          body: JSON.stringify({ template: generatedCode }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const errorText = await res.text().catch(() => "")
          throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`)
        }
        const data = (await res.json()) as RenderItemsResponse
        setFakeJobQueue(data.items)
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        setParserError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsLoading(false)
      }
    }, CEG_TEMPLATE_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [generatedCode, backendUrl])

  // 검색 필터링된 렌더링 아이템 목록
  const filteredPreview = useMemo(() => {
    const needle = previewFilter.trim().toLowerCase()
    if (!needle) return fakeJobQueue
    return fakeJobQueue.filter((item) => {
      const renderedFilename = substitute(item.filename, item)
      const renderedPrompt = substitute(item.prompt, item)
      return (
        renderedFilename.toLowerCase().includes(needle) ||
        renderedPrompt.toLowerCase().includes(needle)
      )
    })
  }, [fakeJobQueue, previewFilter])

  // 에디터 적용
  const handleApplyToEditor = () => {
    if (!generatedCode) return
    setCegTemplate(generatedCode)
    toast.success("작업 탭 에디터에 적용되었습니다.")
    setActiveTab("jobs")
  }

  // 프리셋 저장
  const handleSaveAsPreset = () => {
    if (!saveName.trim()) {
      toast.error("저장할 이름을 입력해 주세요.")
      return
    }
    saveTemplate(saveName, generatedCode)
    setTemplateResetKey((k) => k + 1)
    toast.success(`'${saveName}' 템플릿으로 저장되었습니다.`)
  }

  // 클립보드 복사
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode)
      setCopied(true)
      toast.success("클립보드에 복사되었습니다.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("복사에 실패했습니다.")
    }
  }

  // 파일 다운로드
  const handleDownload = () => {
    const blob = new Blob([generatedCode], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${saveName.replace(/\s+/g, "_") || "template"}.template`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("다운로드가 완료되었습니다.")
  }

  const categoryLabel = (cat: string) => {
    if (cat === "saved") return "내 저장"
    return cat
  }

  const varCount = variables.length

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          defaultSize={65}
          minSize={40}
          className="flex flex-col overflow-y-auto"
        >
          <div className="space-y-4 p-4">
            {/* ── Step 1: 대상 템플릿 선택 ── */}
            <section>
              <button
                type="button"
                onClick={() => setIsSection1Expanded((v) => !v)}
                className="flex w-full items-center gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-black text-muted-foreground">
                  1
                </span>
                <h2 className="text-sm font-bold text-foreground">
                  대상 템플릿 선택
                </h2>
                <ChevronDown
                  className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    isSection1Expanded ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isSection1Expanded
                    ? "mt-2 opacity-100"
                    : "mt-0 max-h-0 opacity-0"
                }`}
              >
                <Select
                  value={selectedTemplateId}
                  onValueChange={(v) => setSelectedTemplateId(v)}
                >
                  <SelectTrigger className="h-9 w-full rounded-lg border-line bg-background text-sm">
                    <SelectValue placeholder="템플릿을 선택하세요..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(groupedTemplates).map(
                      ([category, templates]) => (
                        <SelectGroup key={category}>
                          <SelectLabel className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                            {categoryLabel(category)}
                          </SelectLabel>
                          {templates.map((tmpl) => (
                            <SelectItem key={tmpl.id} value={tmpl.id}>
                              {tmpl.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* ── Step 2: 태그 입력 (변수 치환) ── */}
            <section>
              <button
                type="button"
                onClick={() => setIsSection2Expanded((v) => !v)}
                className="flex w-full items-center gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-black text-muted-foreground">
                  2
                </span>
                <h2 className="text-sm font-bold text-foreground">태그 입력</h2>
                {varCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {varCount}개 변수
                  </Badge>
                )}
                <ChevronDown
                  className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    isSection2Expanded ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isSection2Expanded
                    ? "mt-2 opacity-100"
                    : "mt-0 max-h-0 opacity-0"
                }`}
              >
                {!activeTemplate ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-muted/10 py-10">
                    <Pencil className="mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground italic">
                      템플릿을 선택하면 변수가 자동으로 노출됩니다.
                    </p>
                  </div>
                ) : varCount === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-muted/10 py-10">
                    <Pencil className="mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="px-4 text-center text-xs leading-relaxed text-muted-foreground">
                      선택한 템플릿 내에 치환 가능한
                      <br />
                      캐릭터 변수가 정의되어 있지 않습니다.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-line bg-card/30">
                    <ScrollArea className="max-h-[320px]">
                      <div className="space-y-2.5 p-3">
                        {variables.map((v, idx) => (
                          <div
                            key={v.id}
                            className="space-y-2.5 rounded-lg border border-line/60 bg-muted/20 p-3 transition-colors hover:bg-muted/30"
                          >
                            <div className="flex items-center justify-between">
                              <Label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-black text-primary">
                                  {idx + 1}
                                </span>
                                {v.originalName === "character"
                                  ? "캐릭터 기본 태그 정의"
                                  : `${v.originalName} 변수 정의`}
                              </Label>
                              <span className="mono rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/60">
                                {"{{" + v.name + "}}"}
                              </span>
                            </div>

                            <div className="flex gap-2">
                              {/* 변수명 인풋 */}
                              <div className="w-1/3 space-y-1">
                                <span className="text-[9px] font-bold text-muted-foreground">
                                  변수명
                                </span>
                                <Input
                                  value={v.name}
                                  onChange={(e) =>
                                    handleVariableNameChange(
                                      v.id,
                                      e.target.value
                                    )
                                  }
                                  placeholder="변수명..."
                                  className="h-8 rounded-lg border-line/80 bg-background/60 font-mono text-xs"
                                />
                              </div>
                              {/* 치환값 인풋 */}
                              <div className="flex-1 space-y-1">
                                <span className="text-[9px] font-bold text-muted-foreground">
                                  치환값 (Value)
                                </span>
                                <Input
                                  value={v.value}
                                  onChange={(e) =>
                                    handleVariableValueChange(
                                      v.id,
                                      e.target.value
                                    )
                                  }
                                  placeholder="변수 값을 입력하세요..."
                                  className="h-8 rounded-lg border-line/80 bg-background/60 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </section>

            {/* ── Step 3: 코드 미리보기 ── */}
            <section>
              <button
                type="button"
                onClick={() => setIsPreviewExpanded((v) => !v)}
                className="flex w-full items-center gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-black text-muted-foreground">
                  3
                </span>
                <h2 className="text-sm font-bold text-foreground">
                  코드 미리보기
                </h2>
                <div
                  className="ml-auto flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 복사 */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        disabled={!generatedCode}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-ok" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>복사</TooltipContent>
                  </Tooltip>

                  {/* 다운로드 */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDownload}
                        disabled={!generatedCode}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>다운로드</TooltipContent>
                  </Tooltip>

                  <Separator orientation="vertical" className="mx-0.5 h-4" />

                  <span className="text-[10px] text-muted-foreground">
                    {isPreviewExpanded ? "접기" : "펼치기"}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    isPreviewExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isPreviewExpanded
                    ? "mt-2 opacity-100"
                    : "mt-0 max-h-0 opacity-0"
                }`}
              >
                <div
                  ref={previewRef}
                  className="overflow-hidden rounded-xl border border-line"
                >
                  <div className="flex items-center gap-2 border-b border-line/60 bg-muted/30 px-3 py-1.5">
                    <FileCode2 className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[10px] font-medium text-muted-foreground/70">
                      {activeTemplate?.name || "코드"}.template
                    </span>
                    {generatedCode && (
                      <span className="mono ml-auto text-[10px] text-muted-foreground/50">
                        {generatedCode.split("\n").length} lines
                      </span>
                    )}
                  </div>

                  <div className="h-[280px] md:h-[320px]">
                    <CodeEditor
                      language="ceg"
                      value={generatedCode}
                      onChange={() => {}}
                      minHeight="100%"
                      bareWrapper
                      className="h-full w-full"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          defaultSize={35}
          minSize={20}
          className="flex flex-col overflow-hidden border-l border-line/50"
        >
          {/* ── 오른쪽: 생성 결과 리스트 미리보기 헤더 ── */}
          <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-muted/20 px-4 py-3">
            {/* 검색창 */}
            {!parserError && fakeJobQueue.length > 0 && (
              <div className="relative mt-1">
                <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="파일명 또는 프롬프트 검색..."
                  value={previewFilter}
                  onChange={(e) => setPreviewFilter(e.target.value)}
                  className="h-8 rounded-lg border-line/60 bg-background/50 pl-8 text-xs focus-visible:ring-1"
                />
              </div>
            )}
          </div>

          {/* 본문 영역 */}
          <div className="min-h-0 flex-1 overflow-hidden bg-card/10">
            {isLoading ? (
              // 로딩 상태: 세련된 스켈레톤
              <div className="h-full space-y-3 overflow-y-auto p-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse space-y-2 rounded-xl border border-line/40 bg-muted/10 p-3"
                  >
                    <div className="h-4 w-2/3 rounded bg-muted/40" />
                    <div className="flex gap-1.5">
                      <div className="h-4 w-16 rounded bg-muted/30" />
                      <div className="h-4 w-20 rounded bg-muted/30" />
                    </div>
                    <div className="h-10 w-full rounded bg-muted/20" />
                  </div>
                ))}
              </div>
            ) : parserError ? (
              // 에러 상태: 프리미엄 에러 카드 UI
              <div className="flex h-full items-center justify-center p-4">
                <div className="w-full max-w-md rounded-xl border border-bad/30 bg-bad-bg/20 p-4 shadow-lg backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-lg bg-bad/10 p-2">
                      <AlertCircle className="h-5 w-5 text-bad" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-xs font-bold text-bad">
                        템플릿 파싱 에러
                      </h3>
                      <p className="text-[11px] leading-normal text-muted-foreground">
                        템플릿 문법에 오류가 있어 리스트를 구성할 수 없습니다.
                        문법이나 변수 선언을 확인해 주세요.
                      </p>
                      <div className="mt-2.5 max-h-[180px] overflow-y-auto rounded-lg border border-line/40 bg-background/80 p-2.5 font-mono text-[10px] break-all whitespace-pre-wrap text-bad/90">
                        {parserError}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : fakeJobQueue.length === 0 ? (
              // 비어 있는 상태
              <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-4 rounded-full bg-muted/30 p-4">
                  <FileCode2 className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <p className="text-xs font-bold text-muted-foreground">
                  생성 가능한 결과가 없습니다
                </p>
                <p className="mt-1 max-w-[200px] text-[11px] leading-relaxed text-muted-foreground/60">
                  템플릿을 선택하거나 에디터에 올바른 CEG 코드를 작성하면 실시간
                  조합 목록이 표시됩니다.
                </p>
              </div>
            ) : filteredPreview.length === 0 ? (
              // 검색 결과 없음
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <p className="text-xs font-bold text-muted-foreground">
                  검색 결과가 없습니다
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/60">
                  다른 키워드로 검색해 보세요.
                </p>
              </div>
            ) : (
              // 렌더링 테이블 뷰
              <ScrollArea className="h-full rounded-md border border-line bg-background/50 shadow-inner">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-muted/95 shadow-sm backdrop-blur-sm">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[30%] px-3 py-2 font-bold text-foreground">
                        파일명
                      </TableHead>
                      <TableHead className="w-[25%] px-3 py-2 font-bold text-foreground">
                        조합 속성
                      </TableHead>
                      <TableHead className="px-3 py-2 font-bold text-foreground">
                        치환된 프롬프트 (Prompt)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPreview.map((item, idx) => {
                      const renderedFilename = substitute(item.filename, item)
                      const renderedPrompt = substitute(item.prompt, item)
                      const key = itemKey(item)

                      return (
                        <TableRow
                          key={`res-${key}-${idx}`}
                          className="group transition-colors hover:bg-accent/30"
                        >
                          {/* 파일명 */}
                          <TableCell className="border-r border-line/20 px-3 py-3 align-top font-mono text-[11px] font-black">
                            <div className="leading-relaxed break-all text-foreground select-all">
                              {renderedFilename}
                            </div>
                          </TableCell>

                          {/* 조합 속성 (값만 뱃지로 렌더링) */}
                          <TableCell className="border-r border-line/20 px-3 py-3 align-top">
                            {Object.keys(item.meta).length > 0 ? (
                              <div className="flex flex-wrap gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                                {Object.entries(item.meta).map(([k, v]) => (
                                  <Badge
                                    key={k}
                                    variant="outline"
                                    className="origin-left scale-95 border-primary/10 bg-primary/5 px-1.5 py-0 text-[9px] font-bold text-primary/80 capitalize"
                                  >
                                    {v}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40 italic">
                                -
                              </span>
                            )}
                          </TableCell>

                          {/* 치환된 프롬프트 내용 */}
                          <TableCell className="px-3 py-3 align-top font-mono">
                            <div className="line-clamp-4 text-[10px] leading-relaxed text-muted-foreground transition-all select-all group-hover:line-clamp-none group-hover:text-foreground">
                              {renderedPrompt}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* ────── 하단 고정 액션 바 ────── */}
      <div className="shrink-0 border-t border-line bg-muted/20 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 md:px-8">
          <div className="flex flex-col items-stretch gap-2.5 sm:flex-row">
            {/* 저장 영역 */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                disabled={!generatedCode}
                placeholder="저장할 템플릿 이름 입력..."
                className="h-9 min-w-0 flex-1 rounded-lg border-line bg-background text-xs"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveAsPreset}
                    disabled={!generatedCode}
                    className="h-9 shrink-0 gap-1.5 rounded-lg border-line px-3 text-xs font-semibold hover:bg-background"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">템플릿 저장</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>현재 코드를 템플릿으로 저장</TooltipContent>
              </Tooltip>
            </div>

            {/* 적용 버튼 */}
            <Button
              onClick={handleApplyToEditor}
              disabled={!generatedCode}
              className="group flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 sm:h-9"
            >
              작업 탭 에디터에 적용
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
