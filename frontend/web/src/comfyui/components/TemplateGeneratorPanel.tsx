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
  Sliders,
  Code,
  Plus,
  Trash2,
  Layers,
  Shuffle,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
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

interface VisualVariable {
  id: string
  name: string
  value: string
}

interface AxisEntryProperty {
  id: string
  name: string
  value: string
}

interface VisualAxisEntry {
  id: string
  key: string
  value: string
  properties: AxisEntryProperty[]
  isComplex: boolean
}

interface VisualAxis {
  id: string
  name: string
  include: string
  entries: VisualAxisEntry[]
}

interface VisualCombine {
  id: string
  expression: string
}

interface VisualExclude {
  id: string
  statement: string
}

interface TemplateItem {
  id: string
  name: string
  category: string
  code: string
  savedAt?: number
}

function parseCegTemplate(code: string) {
  const variables: VisualVariable[] = []
  const axes: VisualAxis[] = []
  const combines: VisualCombine[] = []
  const excludes: VisualExclude[] = []
  let templateBody = ""
  let filenameBody = ""

  if (!code) {
    return { variables, axes, combines, excludes, templateBody, filenameBody }
  }

  // 1. Parse Variables: {{set name = "value"}}
  const setRegex = /\{\{\s*set\s+([a-zA-Z_-][a-zA-Z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*\}\}/g
  let match
  let vIdx = 0
  while ((match = setRegex.exec(code)) !== null) {
    variables.push({
      id: `var-${vIdx++}`,
      name: match[1] || "",
      value: match[2] || ""
    })
  }

  // 2. Parse Axes: {{axis NAME [include="..."]}} ... {{/axis}}
  const axisRegex = /\{\{\s*axis\s+([a-zA-Z_-][a-zA-Z0-9_-]*)(?:\s+include="((?:[^"\\]|\\.)*)")?\s*\}\}([\s\S]*?)\{\{\s*\/axis\s*\}\}/gi
  let aIdx = 0
  while ((match = axisRegex.exec(code)) !== null) {
    const axisName = match[1] || ""
    const axisInclude = match[2] || ""
    const axisBody = match[3] || ""
    
    const entries: VisualAxisEntry[] = []
    const entryLines = axisBody.split("\n")
    let eIdx = 0
    
    for (const line of entryLines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue
      
      // Simple entry: key : "value"
      const simpleEntryMatch = trimmed.match(/^([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:\s*"((?:[^"\\]|\\.)*)"$/)
      if (simpleEntryMatch) {
        entries.push({
          id: `entry-${aIdx}-${eIdx++}`,
          key: simpleEntryMatch[1] || "",
          value: simpleEntryMatch[2] || "",
          properties: [],
          isComplex: false
        })
      } else {
        // Complex entry: key : { prop1: "val1", prop2: "val2" }
        const complexEntryMatch = trimmed.match(/^([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:\s*\{\s*([^{}]+)\s*\}$/)
        if (complexEntryMatch) {
          const key = complexEntryMatch[1] || ""
          const propsStr = complexEntryMatch[2] || ""
          const properties: AxisEntryProperty[] = []
          
          const propRegex = /([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:\s*"((?:[^"\\]|\\.)*)"/g
          let pMatch
          let pIdx = 0
          while ((pMatch = propRegex.exec(propsStr)) !== null) {
            properties.push({
              id: `prop-${aIdx}-${eIdx}-${pIdx++}`,
              name: pMatch[1] || "",
              value: pMatch[2] || ""
            })
          }
          
          entries.push({
            id: `entry-${aIdx}-${eIdx++}`,
            key,
            value: "",
            properties,
            isComplex: true
          })
        }
      }
    }
    
    axes.push({
      id: `axis-${aIdx++}`,
      name: axisName,
      include: axisInclude,
      entries
    })
  }

  // 3. Parse Combines: {{combine ...}}
  const combineRegex = /\{\{\s*combine\s+([^\}]+)\s*\}\}/g
  let cIdx = 0
  while ((match = combineRegex.exec(code)) !== null) {
    const expr = (match[1] || "").trim()
    if (!expr.startsWith("/")) {
      combines.push({
        id: `combine-${cIdx++}`,
        expression: expr
      })
    }
  }

  // 4. Parse Excludes: {{exclude ...}}
  const excludeRegex = /\{\{\s*exclude\s+([^\}]+)\s*\}\}/g
  let exIdx = 0
  while ((match = excludeRegex.exec(code)) !== null) {
    const stmt = (match[1] || "").trim()
    excludes.push({
      id: `exclude-${exIdx++}`,
      statement: stmt
    })
  }

  // 5. Parse Template: {{template}} ... {{/template}}
  const templateRegex = /\{\{\s*template\s*\}\}([\s\S]*?)\{\{\s*\/template\s*\}\}/i
  const templateMatch = templateRegex.exec(code)
  if (templateMatch) {
    templateBody = templateMatch[1] || ""
  }

  // 6. Parse Filename: {{filename}} ... {{/filename}}
  const filenameRegex = /\{\{\s*filename\s*\}\}([\s\S]*?)\{\{\s*\/filename\s*\}\}/i
  const filenameMatch = filenameRegex.exec(code)
  if (filenameMatch) {
    filenameBody = filenameMatch[1] || ""
  }

  return { variables, axes, combines, excludes, templateBody, filenameBody }
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
  const [variables, setVariables] = useState<VisualVariable[]>([])
  const [axes, setAxes] = useState<VisualAxis[]>([])
  const [combines, setCombines] = useState<VisualCombine[]>([])
  const [excludes, setExcludes] = useState<VisualExclude[]>([])
  const [templateBody, setTemplateBody] = useState<string>("")
  const [filenameBody, setFilenameBody] = useState<string>("")

  const [saveName, setSaveName] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [systemTemplates, setSystemTemplates] = useState<TemplateItem[]>([])
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true)
  const [isSection1Expanded, setIsSection1Expanded] = useState(true)
  const [isSection2Expanded, setIsSection2Expanded] = useState(true)
  const previewRef = useRef<HTMLDivElement>(null)
  const [prevActiveTemplateId, setPrevActiveTemplateId] = useState<
    string | null
  >(null)
  const [mobileSubTab, setMobileSubTab] = useState<"settings" | "editor" | "results">("settings")
  const [activeSubTab, setActiveSubTab] = useState<"variables" | "axes" | "combines" | "templates">("variables")

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

  // 목록에 없는 ID 선택 시 첫 번째 항목으로 폴백
  const effectiveSelectedTemplateId = useMemo(() => {
    if (combinedTemplates.length === 0) return ""
    if (
      !selectedTemplateId ||
      !combinedTemplates.some((t) => t.id === selectedTemplateId)
    ) {
      return combinedTemplates[0]!.id
    }
    return selectedTemplateId
  }, [selectedTemplateId, combinedTemplates])

  // 현재 선택된 템플릿
  const activeTemplate = useMemo<TemplateItem | null>(() => {
    return (
      combinedTemplates.find((t) => t.id === effectiveSelectedTemplateId) ||
      null
    )
  }, [combinedTemplates, effectiveSelectedTemplateId])

  // activeTemplate이 바뀔 때만 파싱하여 상태 초기화 (state during render 패턴)
  const currentActiveTemplateId = activeTemplate?.id ?? null
  if (currentActiveTemplateId !== prevActiveTemplateId) {
    setPrevActiveTemplateId(currentActiveTemplateId)
    if (activeTemplate) {
      const parsed = parseCegTemplate(activeTemplate.code)
      setVariables(parsed.variables)
      setAxes(parsed.axes)
      setCombines(parsed.combines)
      setExcludes(parsed.excludes || [])
      setTemplateBody(parsed.templateBody)
      setFilenameBody(parsed.filenameBody)
      setSaveName(`${activeTemplate.name} 커스텀`)
    } else {
      setVariables([])
      setAxes([])
      setCombines([])
      setExcludes([])
      setTemplateBody("")
      setFilenameBody("")
      setSaveName("")
    }
  }

  // --- Variables Handlers ---
  const handleAddVariable = () => {
    setVariables((prev) => [
      ...prev,
      {
        id: `var-new-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: `var_${prev.length + 1}`,
        value: "",
      },
    ])
  }

  const handleVariableNameChange = (id: string, newName: string) => {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, name: newName } : v))
    )
  }

  const handleVariableValueChange = (id: string, newValue: string) => {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, value: newValue } : v))
    )
  }

  const handleDeleteVariable = (id: string) => {
    setVariables((prev) => prev.filter((v) => v.id !== id))
  }

  // --- Axes Handlers ---
  const handleAddAxis = () => {
    setAxes((prev) => [
      ...prev,
      {
        id: `axis-new-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: `axis_${prev.length + 1}`,
        include: "",
        entries: [],
      },
    ])
  }

  const handleAxisNameChange = (id: string, newName: string) => {
    setAxes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, name: newName } : a))
    )
  }

  const handleAxisIncludeChange = (id: string, newInclude: string) => {
    setAxes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, include: newInclude } : a))
    )
  }

  const handleDeleteAxis = (id: string) => {
    setAxes((prev) => prev.filter((a) => a.id !== id))
  }

  // --- Axis Entries Handlers ---
  const handleAddAxisEntry = (axisId: string) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        const entryId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
        return {
          ...axis,
          entries: [
            ...axis.entries,
            {
              id: entryId,
              key: `val_${axis.entries.length + 1}`,
              value: "",
              properties: [],
              isComplex: false,
            },
          ],
        }
      })
    )
  }

  const handleAxisEntryKeyChange = (axisId: string, entryId: string, newKey: string) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        return {
          ...axis,
          entries: axis.entries.map((entry) =>
            entry.id === entryId ? { ...entry, key: newKey } : entry
          ),
        }
      })
    )
  }

  const handleAxisEntryValueChange = (axisId: string, entryId: string, newValue: string) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        return {
          ...axis,
          entries: axis.entries.map((entry) =>
            entry.id === entryId ? { ...entry, value: newValue } : entry
          ),
        }
      })
    )
  }

  const handleToggleComplexEntry = (axisId: string, entryId: string) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        return {
          ...axis,
          entries: axis.entries.map((entry) => {
            if (entry.id !== entryId) return entry
            const isComplex = !entry.isComplex
            const properties =
              isComplex && entry.properties.length === 0
                ? [
                    {
                      id: `prop-${Date.now()}`,
                      name: "text",
                      value: entry.value || "",
                    },
                  ]
                : entry.properties
            return {
              ...entry,
              isComplex,
              properties,
            }
          }),
        }
      })
    )
  }

  const handleDeleteAxisEntry = (axisId: string, entryId: string) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        return {
          ...axis,
          entries: axis.entries.filter((entry) => entry.id !== entryId),
        }
      })
    )
  }

  // --- Entry Properties Handlers ---
  const handleAddEntryProperty = (axisId: string, entryId: string) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        return {
          ...axis,
          entries: axis.entries.map((entry) => {
            if (entry.id !== entryId) return entry
            return {
              ...entry,
              properties: [
                ...entry.properties,
                {
                  id: `prop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                  name: `prop_${entry.properties.length + 1}`,
                  value: "",
                },
              ],
            }
          }),
        }
      })
    )
  }

  const handleEntryPropertyNameChange = (
    axisId: string,
    entryId: string,
    propId: string,
    newName: string
  ) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        return {
          ...axis,
          entries: axis.entries.map((entry) => {
            if (entry.id !== entryId) return entry
            return {
              ...entry,
              properties: entry.properties.map((p) =>
                p.id === propId ? { ...p, name: newName } : p
              ),
            }
          }),
        }
      })
    )
  }

  const handleEntryPropertyValueChange = (
    axisId: string,
    entryId: string,
    propId: string,
    newValue: string
  ) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        return {
          ...axis,
          entries: axis.entries.map((entry) => {
            if (entry.id !== entryId) return entry
            return {
              ...entry,
              properties: entry.properties.map((p) =>
                p.id === propId ? { ...p, value: newValue } : p
              ),
            }
          }),
        }
      })
    )
  }

  const handleDeleteEntryProperty = (axisId: string, entryId: string, propId: string) => {
    setAxes((prev) =>
      prev.map((axis) => {
        if (axis.id !== axisId) return axis
        return {
          ...axis,
          entries: axis.entries.map((entry) => {
            if (entry.id !== entryId) return entry
            return {
              ...entry,
              properties: entry.properties.filter((p) => p.id !== propId),
            }
          }),
        }
      })
    )
  }

  // --- Combine Handlers ---
  const handleAddCombine = () => {
    setCombines((prev) => [
      ...prev,
      {
        id: `combine-new-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        expression: "",
      },
    ])
  }

  const handleCombineExpressionChange = (id: string, newExpr: string) => {
    setCombines((prev) =>
      prev.map((c) => (c.id === id ? { ...c, expression: newExpr } : c))
    )
  }

  const handleDeleteCombine = (id: string) => {
    setCombines((prev) => prev.filter((c) => c.id !== id))
  }

  // --- Exclude Handlers ---
  const handleAddExclude = () => {
    setExcludes((prev) => [
      ...prev,
      {
        id: `exclude-new-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        statement: "",
      },
    ])
  }

  const handleExcludeStatementChange = (id: string, newStmt: string) => {
    setExcludes((prev) =>
      prev.map((ex) => (ex.id === id ? { ...ex, statement: newStmt } : ex))
    )
  }

  const handleDeleteExclude = (id: string) => {
    setExcludes((prev) => prev.filter((ex) => ex.id !== id))
  }

  // 사용자 입력을 반영한 DSL 최종 코드 생성
  const generatedCode = useMemo(() => {
    let code = ""
    
    // 1. Set variables
    variables.forEach(v => {
      if (v.name.trim()) {
        code += `{{set ${v.name.trim()} = "${v.value}"}}\n`
      }
    })
    if (variables.length > 0) code += "\n"
    
    // 2. Axes
    axes.forEach(axis => {
      if (axis.name.trim()) {
        const includePart = axis.include ? ` include="${axis.include}"` : ""
        code += `{{axis ${axis.name.trim()}${includePart}}}\n`
        axis.entries.forEach(entry => {
          if (entry.key.trim()) {
            if (entry.isComplex) {
              const propsStr = entry.properties
                .filter(p => p.name.trim())
                .map(p => `${p.name.trim()}: "${p.value}"`)
                .join(", ")
              code += `  ${entry.key.trim()} : { ${propsStr} }\n`
            } else {
              code += `  ${entry.key.trim()} : "${entry.value}"\n`
            }
          }
        })
        code += `{{/axis}}\n\n`
      }
    })
    
    // 3. Combines
    combines.forEach(c => {
      if (c.expression.trim()) {
        code += `{{combine ${c.expression.trim()}}}\n`
      }
    })
    if (combines.length > 0) code += "\n"

    // 4. Excludes
    excludes.forEach(ex => {
      if (ex.statement.trim()) {
        code += `{{exclude ${ex.statement.trim()}}}\n`
      }
    })
    if (excludes.length > 0) code += "\n"
    
    // 5. Template
    if (templateBody !== undefined && templateBody.trim() !== "") {
      code += `{{template}}${templateBody}{{/template}}\n\n`
    }
    
    // 6. Filename
    if (filenameBody !== undefined && filenameBody.trim() !== "") {
      code += `{{filename}}${filenameBody}{{/filename}}\n`
    }
    
    return code.trim()
  }, [variables, axes, combines, excludes, templateBody, filenameBody])

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
    if (!generatedCode.trim()) return

    const controller = new AbortController()

    const timer = setTimeout(async () => {
      setIsLoading(true)
      setParserError(null)
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

  // generatedCode가 비어있을 때 이전 상태가 노출되지 않도록 파생값으로 처리
  const activeQueue = useMemo(
    () => (generatedCode.trim() ? fakeJobQueue : []),
    [generatedCode, fakeJobQueue]
  )
  const displayIsLoading = generatedCode.trim() ? isLoading : false
  const displayParserError = generatedCode.trim() ? parserError : null

  // 검색 필터링된 렌더링 아이템 목록
  const filteredPreview = useMemo(() => {
    const needle = previewFilter.trim().toLowerCase()
    if (!needle) return activeQueue
    return activeQueue.filter((item) => {
      const renderedFilename = substitute(item.filename, item)
      const renderedPrompt = substitute(item.prompt, item)
      return (
        renderedFilename.toLowerCase().includes(needle) ||
        renderedPrompt.toLowerCase().includes(needle)
      )
    })
  }, [activeQueue, previewFilter])

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* 데스크탑 뷰: 기존 좌우 2단 분할 Resizable 패널 */}
      <div className="hidden md:flex min-h-0 flex-1">
        <ResizablePanelGroup
          autoSaveId="template-generator-layout"
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel
            id="template-input-panel"
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
                    value={effectiveSelectedTemplateId}
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

              {/* ── Step 2: 태그 및 규칙 시각적 정의 ── */}
              <section className="space-y-3">
                <button
                  type="button"
                  onClick={() => setIsSection2Expanded((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-black text-muted-foreground">
                    2
                  </span>
                  <h2 className="text-sm font-bold text-foreground">태그 및 규칙 정의</h2>
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
                        템플릿을 선택하면 편집기가 자동으로 활성화됩니다.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-line bg-card/30 p-3">
                      {/* 비주얼 편집 서브 탭 컨트롤 */}
                      <div className="flex border-b border-line bg-muted/10 p-1 shrink-0 gap-1 rounded-lg">
                        {(["variables", "axes", "combines", "templates"] as const).map((tab) => {
                          let label = ""
                          let icon = null
                          if (tab === "variables") { label = "변수 선언"; icon = <Sliders className="h-3.5 w-3.5" /> }
                          else if (tab === "axes") { label = "조합 축 (Axes)"; icon = <Layers className="h-3.5 w-3.5" /> }
                          else if (tab === "combines") { label = "조합 규칙"; icon = <Shuffle className="h-3.5 w-3.5" /> }
                          else if (tab === "templates") { label = "출력 템플릿"; icon = <FileCode2 className="h-3.5 w-3.5" /> }
                          
                          return (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setActiveSubTab(tab)}
                              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition-all duration-200 ${
                                activeSubTab === tab
                                  ? "bg-background text-foreground shadow-xs border border-line"
                                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                              }`}
                            >
                              {icon}
                              <span>{label}</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* 탭 콘텐츠 영역 */}
                      <ScrollArea className="max-h-[420px] overflow-y-auto pr-1">
                        <div className="space-y-3 p-1">
                          
                          {/* A. 변수 선언 (Variables) */}
                          {activeSubTab === "variables" && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-muted-foreground">
                                  전역 변수 정의 ({"{{set varName = \"value\"}}"})
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleAddVariable}
                                  className="h-7 gap-1 rounded-md px-2 text-[10px] font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                                >
                                  <Plus className="h-3 w-3" />
                                  변수 추가
                                </Button>
                              </div>

                              {variables.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/60 bg-muted/5 py-8">
                                  <Sliders className="mb-1.5 h-6 w-6 text-muted-foreground/30" />
                                  <p className="text-[10px] text-muted-foreground/70 italic text-center">
                                    등록된 전역 변수가 없습니다.
                                    <br />
                                    위의 버튼을 눌러 새 변수를 추가할 수 있습니다.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {variables.map((v, idx) => (
                                    <div
                                      key={v.id}
                                      className="flex items-center gap-2 rounded-lg border border-line/60 bg-muted/20 p-2.5 transition-colors hover:bg-muted/30"
                                    >
                                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-black text-primary">
                                        {idx + 1}
                                      </span>
                                      <div className="flex flex-1 gap-2">
                                        <Input
                                          value={v.name}
                                          onChange={(e) => handleVariableNameChange(v.id, e.target.value)}
                                          placeholder="변수명..."
                                          className="h-8 w-1/3 rounded-lg border-line bg-background font-mono text-xs"
                                        />
                                        <Input
                                          value={v.value}
                                          onChange={(e) => handleVariableValueChange(v.id, e.target.value)}
                                          placeholder="치환될 텍스트 입력..."
                                          className="h-8 flex-1 rounded-lg border-line bg-background text-xs"
                                        />
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteVariable(v.id)}
                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-bad hover:bg-bad/10"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* B. 조합 축 정의 (Axes) */}
                          {activeSubTab === "axes" && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-muted-foreground">
                                  세부 조합 축 정의 ({"{{axis ...}}"})
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleAddAxis}
                                  className="h-7 gap-1 rounded-md px-2 text-[10px] font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                                >
                                  <Plus className="h-3 w-3" />
                                  조합 축 추가
                                </Button>
                              </div>

                              {axes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/60 bg-muted/5 py-8">
                                  <Layers className="mb-1.5 h-6 w-6 text-muted-foreground/30" />
                                  <p className="text-[10px] text-muted-foreground/70 italic text-center">
                                    등록된 조합 축이 없습니다.
                                    <br />
                                    새 축을 추가하여 무궁무진한 조합을 만들어 보세요.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {axes.map((axis, axisIdx) => (
                                    <div
                                      key={axis.id}
                                      className="rounded-lg border border-line bg-muted/10 p-3 space-y-3"
                                    >
                                      {/* 축 헤더: 축 이름, Include, 삭제 */}
                                      <div className="flex items-center gap-2 border-b border-line/50 pb-2.5">
                                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/15 text-[9px] font-black text-primary">
                                          A{axisIdx + 1}
                                        </span>
                                        <div className="flex flex-1 gap-2">
                                          <div className="w-1/2 space-y-0.5">
                                            <span className="text-[8px] font-bold text-muted-foreground block">축 식별 이름</span>
                                            <Input
                                              value={axis.name}
                                              onChange={(e) => handleAxisNameChange(axis.id, e.target.value)}
                                              placeholder="예: emotion, pose..."
                                              className="h-8 rounded-lg border-line bg-background font-mono text-xs font-bold"
                                            />
                                          </div>
                                          <div className="w-1/2 space-y-0.5">
                                            <span className="text-[8px] font-bold text-muted-foreground block">자동 접미사 (Include)</span>
                                            <Input
                                              value={axis.include}
                                              onChange={(e) => handleAxisIncludeChange(axis.id, e.target.value)}
                                              placeholder="include 값..."
                                              className="h-8 rounded-lg border-line bg-background text-xs"
                                            />
                                          </div>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteAxis(axis.id)}
                                          className="h-8 w-8 p-0 mt-3 text-muted-foreground hover:text-bad hover:bg-bad/10 self-center"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>

                                      {/* 축 값 항목 (Entries) */}
                                      <div className="space-y-2 pl-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[9px] font-bold text-muted-foreground">
                                            축 세부 값 리스트
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleAddAxisEntry(axis.id)}
                                            className="h-6 gap-1 rounded px-1.5 text-[9px] text-primary hover:bg-primary/5"
                                          >
                                            <Plus className="h-2.5 w-2.5" />
                                            값 추가
                                          </Button>
                                        </div>

                                        {axis.entries.length === 0 ? (
                                          <p className="text-[9px] text-muted-foreground/60 italic text-center py-2">
                                            추가된 축 값이 없습니다.
                                          </p>
                                        ) : (
                                          <div className="space-y-2">
                                            {axis.entries.map((entry) => (
                                              <div
                                                key={entry.id}
                                                className="flex flex-col gap-2 rounded-md border border-line/40 bg-background/40 p-2"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <Input
                                                    value={entry.key}
                                                    onChange={(e) => handleAxisEntryKeyChange(axis.id, entry.id, e.target.value)}
                                                    placeholder="키..."
                                                    className="h-7 w-1/4 rounded border-line/80 font-mono text-[11px]"
                                                  />
                                                  
                                                  <div className="flex flex-1 items-center gap-2">
                                                    {!entry.isComplex ? (
                                                      <Input
                                                        value={entry.value}
                                                        onChange={(e) => handleAxisEntryValueChange(axis.id, entry.id, e.target.value)}
                                                        placeholder="값..."
                                                        className="h-7 flex-1 rounded border-line/80 text-[11px]"
                                                      />
                                                    ) : (
                                                      <span className="text-[10px] text-muted-foreground italic font-semibold">
                                                        속성 세트 ({entry.properties.filter(p=>p.name).length}개 속성)
                                                      </span>
                                                    )}
                                                    
                                                    {/* Complex Toggle */}
                                                    <button
                                                      type="button"
                                                      onClick={() => handleToggleComplexEntry(axis.id, entry.id)}
                                                      className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors ${
                                                        entry.isComplex 
                                                          ? "bg-primary/10 border-primary/30 text-primary font-bold" 
                                                          : "border-line hover:bg-muted/50 text-muted-foreground"
                                                      }`}
                                                    >
                                                      {entry.isComplex ? "중괄호 모드" : "일반 모드"}
                                                    </button>
                                                  </div>

                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteAxisEntry(axis.id, entry.id)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-bad"
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </div>

                                                {/* 만약 복잡한 속성이 켜져있다면, 속성 편집 리스트 표시 */}
                                                {entry.isComplex && (
                                                  <div className="pl-2 border-l border-primary/20 space-y-1.5 mt-1">
                                                    <div className="flex items-center justify-between">
                                                      <span className="text-[8px] font-bold text-muted-foreground">세부 속성 (Properties)</span>
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleAddEntryProperty(axis.id, entry.id)}
                                                        className="h-5 gap-0.5 rounded px-1 text-[8px] text-primary/80 hover:bg-primary/5"
                                                      >
                                                        <Plus className="h-2 w-2" />
                                                        속성 추가
                                                      </Button>
                                                    </div>
                                                    
                                                    {entry.properties.length === 0 ? (
                                                      <p className="text-[8px] text-muted-foreground/60 italic">속성이 없습니다.</p>
                                                    ) : (
                                                      <div className="space-y-1">
                                                        {entry.properties.map((prop) => (
                                                          <div key={prop.id} className="flex items-center gap-1.5">
                                                            <Input
                                                              value={prop.name}
                                                              onChange={(e) => handleEntryPropertyNameChange(axis.id, entry.id, prop.id, e.target.value)}
                                                              placeholder="속성명..."
                                                              className="h-6 w-1/3 rounded text-[10px] font-mono border-line/60"
                                                            />
                                                            <Input
                                                              value={prop.value}
                                                              onChange={(e) => handleEntryPropertyValueChange(axis.id, entry.id, prop.id, e.target.value)}
                                                              placeholder="속성값..."
                                                              className="h-6 flex-1 rounded text-[10px] border-line/60"
                                                            />
                                                            <Button
                                                              variant="ghost"
                                                              size="sm"
                                                              onClick={() => handleDeleteEntryProperty(axis.id, entry.id, prop.id)}
                                                              className="h-6 w-6 p-0 text-muted-foreground hover:text-bad"
                                                            >
                                                              <Trash2 className="h-2.5 w-2.5" />
                                                            </Button>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* C. 조합 & 제외 규칙 (Combinations & Exclusions) */}
                          {activeSubTab === "combines" && (
                            <div className="space-y-4 divide-y divide-line/40">
                              {/* 1) 조합 방식 설정 */}
                              <div className="space-y-3 pb-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
                                    <Shuffle className="h-3.5 w-3.5" />
                                    조합 방식 설정 ({"{{combine ...}}"})
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddCombine}
                                    className="h-7 gap-1 rounded-md px-2 text-[10px] font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                                  >
                                    <Plus className="h-3 w-3" />
                                    조합 추가
                                  </Button>
                                </div>

                                {combines.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/60 bg-muted/5 py-6">
                                    <p className="text-[10px] text-muted-foreground/70 italic text-center">
                                      정의된 조합 규칙이 없습니다.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {combines.map((c, idx) => (
                                      <div
                                        key={c.id}
                                        className="flex items-center gap-2 rounded-lg border border-line/60 bg-muted/20 p-2.5 transition-colors hover:bg-muted/30"
                                      >
                                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-black text-primary">
                                          {idx + 1}
                                        </span>
                                        <div className="flex-1 space-y-1">
                                          <Input
                                            value={c.expression}
                                            onChange={(e) => handleCombineExpressionChange(c.id, e.target.value)}
                                            placeholder="예: character * emotion * pose 또는 mood + weather"
                                            className="h-8 w-full rounded-lg border-line bg-background font-mono text-xs"
                                          />
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteCombine(c.id)}
                                          className="h-8 w-8 p-0 text-muted-foreground hover:text-bad hover:bg-bad/10"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 2) 제외 조건 설정 */}
                              <div className="space-y-3 pt-4 pb-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    제외 규칙 설정 ({"{{exclude ...}}"})
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddExclude}
                                    className="h-7 gap-1 rounded-md px-2 text-[10px] font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                                  >
                                    <Plus className="h-3 w-3" />
                                    제외 규칙 추가
                                  </Button>
                                </div>

                                {excludes.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/60 bg-muted/5 py-6">
                                    <p className="text-[10px] text-muted-foreground/70 italic text-center">
                                      정의된 제외 규칙이 없습니다.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {excludes.map((ex, idx) => (
                                      <div
                                        key={ex.id}
                                        className="flex items-center gap-2 rounded-lg border border-line/60 bg-muted/20 p-2.5 transition-colors hover:bg-muted/30"
                                      >
                                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-black text-primary">
                                          {idx + 1}
                                        </span>
                                        <div className="flex-1 space-y-1">
                                          <Input
                                            value={ex.statement}
                                            onChange={(e) => handleExcludeStatementChange(ex.id, e.target.value)}
                                            placeholder="예: emotion = sad AND pose = smiling"
                                            className="h-8 w-full rounded-lg border-line bg-background font-mono text-xs"
                                          />
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteExclude(ex.id)}
                                          className="h-8 w-8 p-0 text-muted-foreground hover:text-bad hover:bg-bad/10"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5 text-[9.5px] leading-relaxed text-muted-foreground pt-3">
                                <span className="font-bold text-foreground block mb-0.5">💡 CEG 조합/제외 문법 도움말</span>
                                <li>곱연산(<code className="font-mono bg-muted px-0.5 rounded">*</code>): 축의 모든 조합을 생성합니다.</li>
                                <li>제외(<code className="font-mono bg-muted px-0.5 rounded">exclude</code>): 특정 축 조합을 배제합니다. 예: <code className="font-mono bg-muted px-0.5 rounded">emotion = sad AND pose = smile</code></li>
                              </div>
                            </div>
                          )}

                          {/* D. 출력 템플릿 (Templates) */}
                          {activeSubTab === "templates" && (
                            <div className="space-y-3">
                              <span className="text-[11px] font-bold text-muted-foreground block mb-1">
                                프롬프트 및 파일명 서식 ({"{{template}}"}, {"{{filename}}"})
                              </span>

                              {/* 프롬프트 템플릿 */}
                              <div className="rounded-lg border border-line bg-muted/10 p-3 space-y-1.5">
                                <Label className="text-xs font-bold text-foreground">프롬프트 템플릿 (Prompt Template)</Label>
                                <textarea
                                  value={templateBody}
                                  onChange={(e) => setTemplateBody(e.target.value)}
                                  placeholder="최종 생성될 프롬프트 서식을 입력하세요. 예: 1girl, {{character}}, {{emotion}}, {{pose}}..."
                                  rows={4}
                                  className="w-full rounded-lg border border-line bg-background p-2 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                              </div>

                              {/* 파일명 템플릿 */}
                              <div className="rounded-lg border border-line bg-muted/10 p-3 space-y-1.5">
                                <Label className="text-xs font-bold text-foreground">저장 파일명 템플릿 (Filename Template)</Label>
                                <Input
                                  value={filenameBody}
                                  onChange={(e) => setFilenameBody(e.target.value)}
                                  placeholder="파일명 규칙 입력. 예: img_{{character.key}}_{{emotion.key}}"
                                  className="h-8 rounded-lg border-line bg-background font-mono text-xs"
                                />
                              </div>

                              {/* 변수 및 축 레퍼런스 가이드 */}
                              <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5 text-[9.5px] leading-relaxed text-muted-foreground">
                                <span className="font-bold text-foreground block mb-0.5">📌 사용 가능한 변수/축 참조</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {variables.map(v => v.name).filter(Boolean).map(name => (
                                    <Badge key={name} variant="outline" className="text-[8.5px] bg-background/50 px-1 border-primary/20 font-mono">
                                      {"{{" + name + "}}"}
                                    </Badge>
                                  ))}
                                  {axes.map(a => a.name).filter(Boolean).map(name => (
                                    <span key={name} className="flex gap-1">
                                      <Badge variant="outline" className="text-[8.5px] bg-background/50 px-1 border-primary/20 font-mono text-primary font-bold">
                                        {"{{" + name + "}}"}
                                      </Badge>
                                      <Badge variant="outline" className="text-[8.5px] bg-background/50 px-1 border-primary/20 font-mono text-primary/80">
                                        {"{{" + name + ".key}}"}
                                      </Badge>
                                    </span>
                                  ))}
                                  {variables.length === 0 && axes.length === 0 && (
                                    <span className="italic text-[8.5px] text-muted-foreground/60">정의된 변수나 축이 없습니다.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

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
            id="template-preview-panel"
            defaultSize={35}
            minSize={20}
            className="flex flex-col overflow-hidden border-l border-line/50"
          >
            {/* ── 오른쪽: 생성 결과 리스트 미리보기 헤더 ── */}
            <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-muted/20 px-4 py-3">
              {/* 검색창 */}
              {!displayParserError && activeQueue.length > 0 && (
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
              {displayIsLoading ? (
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
              ) : displayParserError ? (
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
                          {displayParserError}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeQueue.length === 0 ? (
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
                <div className="h-full overflow-auto rounded-md border border-line bg-background/50 shadow-inner">
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
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* 모바일 뷰: 상단 서브 탭 스위치 + 전용 최적화 레이아웃 */}
      <div className="flex md:hidden min-h-0 flex-1 flex-col overflow-hidden">
        {/* 상단 Segmented Control 탭 바 */}
        <div className="flex border-b border-line bg-muted/10 p-1.5 shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setMobileSubTab("settings")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all duration-200 ${
              mobileSubTab === "settings"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>설정</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileSubTab("editor")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all duration-200 ${
              mobileSubTab === "editor"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>에디터</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileSubTab("results")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all duration-200 ${
              mobileSubTab === "results"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>결과</span>
            {activeQueue.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[9px] font-bold origin-left scale-90">
                {activeQueue.length}
              </Badge>
            )}
          </button>
        </div>

        {/* 탭 콘텐츠 영역 */}
        {mobileSubTab === "settings" && (
          <ScrollArea className="flex-1">
            <div className="space-y-5 p-4 pb-8">
              {/* ── Step 1: 대상 템플릿 선택 ── */}
              <div className="rounded-xl border border-line bg-card/20 p-4 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-black text-primary">
                    1
                  </span>
                  <h2 className="text-sm font-bold text-foreground">
                    대상 템플릿 선택
                  </h2>
                </div>
                <Select
                  value={effectiveSelectedTemplateId}
                  onValueChange={(v) => setSelectedTemplateId(v)}
                >
                  <SelectTrigger className="h-10 w-full rounded-lg border-line bg-background text-sm">
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

              {/* ── Step 2: 태그 및 규칙 시각적 정의 ── */}
              <div className="rounded-xl border border-line bg-card/20 p-4 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-black text-primary">
                    2
                  </span>
                  <h2 className="text-sm font-bold text-foreground">태그 및 규칙 정의</h2>
                </div>

                {!activeTemplate ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-muted/10 py-10">
                    <Pencil className="mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground italic">
                      템플릿을 선택하면 편집기가 자동으로 활성화됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 비주얼 편집 서브 탭 컨트롤 */}
                    <div className="flex border border-line bg-muted/10 p-1 shrink-0 gap-1 rounded-lg">
                      {(["variables", "axes", "combines", "templates"] as const).map((tab) => {
                        let label = ""
                        let icon = null
                        if (tab === "variables") { label = "변수"; icon = <Sliders className="h-3.5 w-3.5" /> }
                        else if (tab === "axes") { label = "축(Axes)"; icon = <Layers className="h-3.5 w-3.5" /> }
                        else if (tab === "combines") { label = "조합"; icon = <Shuffle className="h-3.5 w-3.5" /> }
                        else if (tab === "templates") { label = "템플릿"; icon = <FileCode2 className="h-3.5 w-3.5" /> }
                        
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveSubTab(tab)}
                            className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[10px] font-bold transition-all duration-200 ${
                              activeSubTab === tab
                                ? "bg-background text-foreground shadow-xs border border-line"
                                : "text-muted-foreground hover:bg-muted/30"
                            }`}
                          >
                            {icon}
                            <span>{label}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* 탭 콘텐츠 영역 */}
                    <div className="space-y-3 pt-1">
                      
                      {/* A. 변수 선언 (Variables) */}
                      {activeSubTab === "variables" && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              전역 변수 정의
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleAddVariable}
                              className="h-7 gap-1 rounded-md px-2 text-[9px] font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                            >
                              <Plus className="h-3 w-3" />
                              변수 추가
                            </Button>
                          </div>

                          {variables.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/60 bg-muted/5 py-8">
                              <Sliders className="mb-1.5 h-5 w-5 text-muted-foreground/30" />
                              <p className="text-[9px] text-muted-foreground/70 italic text-center">
                                등록된 전역 변수가 없습니다.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {variables.map((v, idx) => (
                                <div
                                  key={v.id}
                                  className="flex items-center gap-2 rounded-lg border border-line/60 bg-muted/20 p-2 transition-colors"
                                >
                                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[8px] font-black text-primary">
                                    {idx + 1}
                                  </span>
                                  <div className="flex flex-1 flex-col gap-1.5">
                                    <Input
                                      value={v.name}
                                      onChange={(e) => handleVariableNameChange(v.id, e.target.value)}
                                      placeholder="변수명..."
                                      className="h-7 w-full rounded border-line bg-background font-mono text-[10px]"
                                    />
                                    <Input
                                      value={v.value}
                                      onChange={(e) => handleVariableValueChange(v.id, e.target.value)}
                                      placeholder="치환될 텍스트..."
                                      className="h-7 w-full rounded border-line bg-background text-[10px]"
                                    />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteVariable(v.id)}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-bad"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* B. 조합 축 정의 (Axes) */}
                      {activeSubTab === "axes" && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              세부 조합 축 정의
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleAddAxis}
                              className="h-7 gap-1 rounded-md px-2 text-[9px] font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                            >
                              <Plus className="h-3 w-3" />
                              축 추가
                            </Button>
                          </div>

                          {axes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/60 bg-muted/5 py-8">
                              <Layers className="mb-1.5 h-5 w-5 text-muted-foreground/30" />
                              <p className="text-[9px] text-muted-foreground/70 italic text-center">
                                등록된 조합 축이 없습니다.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {axes.map((axis, axisIdx) => (
                                <div
                                  key={axis.id}
                                  className="rounded-lg border border-line bg-muted/10 p-2.5 space-y-2.5"
                                >
                                  {/* 축 헤더 */}
                                  <div className="flex flex-col gap-1.5 border-b border-line/50 pb-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/15 text-[8px] font-black text-primary">
                                          {axisIdx + 1}
                                        </span>
                                        <span className="text-[10px] font-bold text-foreground">축 설정</span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteAxis(axis.id)}
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-bad"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                      <div className="w-1/2 space-y-0.5">
                                        <span className="text-[7px] font-bold text-muted-foreground block">식별 이름</span>
                                        <Input
                                          value={axis.name}
                                          onChange={(e) => handleAxisNameChange(axis.id, e.target.value)}
                                          placeholder="이름..."
                                          className="h-7 rounded border-line bg-background font-mono text-[10px] font-bold"
                                        />
                                      </div>
                                      <div className="w-1/2 space-y-0.5">
                                        <span className="text-[7px] font-bold text-muted-foreground block">접미사(Include)</span>
                                        <Input
                                          value={axis.include}
                                          onChange={(e) => handleAxisIncludeChange(axis.id, e.target.value)}
                                          placeholder="include..."
                                          className="h-7 rounded border-line bg-background text-[10px]"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* 축 값 리스트 */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[8px] font-bold text-muted-foreground">세부 값</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleAddAxisEntry(axis.id)}
                                        className="h-5 gap-0.5 rounded px-1 text-[8px] text-primary"
                                      >
                                        <Plus className="h-2 w-2" />
                                        값 추가
                                      </Button>
                                    </div>

                                    {axis.entries.length === 0 ? (
                                      <p className="text-[8px] text-muted-foreground/60 italic text-center py-1">없음</p>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {axis.entries.map((entry) => (
                                          <div
                                            key={entry.id}
                                            className="flex flex-col gap-1.5 rounded border border-line/40 bg-background/45 p-1.5"
                                          >
                                            <div className="flex items-center gap-1.5">
                                              <Input
                                                value={entry.key}
                                                onChange={(e) => handleAxisEntryKeyChange(axis.id, entry.id, e.target.value)}
                                                placeholder="키"
                                                className="h-6 w-1/4 rounded border-line/80 font-mono text-[9px]"
                                              />
                                              
                                              <div className="flex flex-1 items-center gap-1.5">
                                                {!entry.isComplex ? (
                                                  <Input
                                                    value={entry.value}
                                                    onChange={(e) => handleAxisEntryValueChange(axis.id, entry.id, e.target.value)}
                                                    placeholder="값"
                                                    className="h-6 flex-1 rounded border-line/80 text-[9px]"
                                                  />
                                                ) : (
                                                  <span className="text-[8px] text-muted-foreground italic flex-1">
                                                    속성 세트 ({entry.properties.filter(p=>p.name).length}개)
                                                  </span>
                                                )}
                                                
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleComplexEntry(axis.id, entry.id)}
                                                  className={`px-1 py-0.5 rounded text-[8px] border ${
                                                    entry.isComplex 
                                                      ? "bg-primary/10 border-primary/20 text-primary font-bold" 
                                                      : "border-line text-muted-foreground"
                                                  }`}
                                                >
                                                  {entry.isComplex ? "중괄호" : "일반"}
                                                </button>
                                              </div>

                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteAxisEntry(axis.id, entry.id)}
                                                className="h-6 w-6 p-0 text-muted-foreground hover:text-bad"
                                              >
                                                <Trash2 className="h-2.5 w-2.5" />
                                              </Button>
                                            </div>

                                            {entry.isComplex && (
                                              <div className="pl-1.5 border-l border-primary/20 space-y-1 mt-0.5">
                                                <div className="flex items-center justify-between">
                                                  <span className="text-[7px] font-bold text-muted-foreground">속성</span>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleAddEntryProperty(axis.id, entry.id)}
                                                    className="h-4 gap-0.5 rounded px-0.5 text-[7px] text-primary"
                                                  >
                                                    <Plus className="h-1.5 w-1.5" />
                                                    추가
                                                  </Button>
                                                </div>
                                                
                                                {entry.properties.map((prop) => (
                                                  <div key={prop.id} className="flex items-center gap-1">
                                                    <Input
                                                      value={prop.name}
                                                      onChange={(e) => handleEntryPropertyNameChange(axis.id, entry.id, prop.id, e.target.value)}
                                                      placeholder="속성명"
                                                      className="h-5 w-1/3 rounded text-[9px] font-mono border-line/60"
                                                    />
                                                    <Input
                                                      value={prop.value}
                                                      onChange={(e) => handleEntryPropertyValueChange(axis.id, entry.id, prop.id, e.target.value)}
                                                      placeholder="속성값"
                                                      className="h-5 flex-1 rounded text-[9px] border-line/60"
                                                    />
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => handleDeleteEntryProperty(axis.id, entry.id, prop.id)}
                                                      className="h-5 w-5 p-0 text-muted-foreground"
                                                    >
                                                      <Trash2 className="h-2 w-2" />
                                                    </Button>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* C. 조합 & 제외 규칙 (Combinations & Exclusions) */}
                      {activeSubTab === "combines" && (
                        <div className="space-y-4 divide-y divide-line/20">
                          {/* 1) 조합 방식 설정 */}
                          <div className="space-y-3 pb-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                <Shuffle className="h-3.5 w-3.5" />
                                조합 방식 설정
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAddCombine}
                                className="h-7 gap-1 rounded-md px-2 text-[9px] font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                              >
                                <Plus className="h-3 w-3" />
                                조합 추가
                              </Button>
                            </div>

                            {combines.length === 0 ? (
                              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/60 bg-muted/5 py-4">
                                <p className="text-[9px] text-muted-foreground/70 italic text-center">
                                  정의된 조합 규칙이 없습니다.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {combines.map((c, idx) => (
                                  <div
                                    key={c.id}
                                    className="flex items-center gap-2 rounded-lg border border-line/60 bg-muted/20 p-2"
                                  >
                                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[8px] font-black text-primary">
                                      {idx + 1}
                                    </span>
                                    <Input
                                      value={c.expression}
                                      onChange={(e) => handleCombineExpressionChange(c.id, e.target.value)}
                                      placeholder="예: character * emotion"
                                      className="h-7 flex-1 rounded border-line bg-background font-mono text-[10px]"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteCombine(c.id)}
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-bad"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 2) 제외 조건 설정 */}
                          <div className="space-y-3 pt-3 pb-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" />
                                제외 규칙 설정
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAddExclude}
                                className="h-7 gap-1 rounded-md px-2 text-[9px] font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                              >
                                <Plus className="h-3 w-3" />
                                제외 추가
                              </Button>
                            </div>

                            {excludes.length === 0 ? (
                              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/60 bg-muted/5 py-4">
                                <p className="text-[9px] text-muted-foreground/70 italic text-center">
                                  정의된 제외 규칙이 없습니다.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {excludes.map((ex, idx) => (
                                  <div
                                    key={ex.id}
                                    className="flex items-center gap-2 rounded-lg border border-line/60 bg-muted/20 p-2"
                                  >
                                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[8px] font-black text-primary">
                                      {idx + 1}
                                    </span>
                                    <Input
                                      value={ex.statement}
                                      onChange={(e) => handleExcludeStatementChange(ex.id, e.target.value)}
                                      placeholder="예: emotion = sad AND pose = smiling"
                                      className="h-7 flex-1 rounded border-line bg-background font-mono text-[10px]"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteExclude(ex.id)}
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-bad"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* D. 출력 템플릿 (Templates) */}
                      {activeSubTab === "templates" && (
                        <div className="space-y-3">
                          <span className="text-[10px] font-bold text-muted-foreground block">
                            프롬프트 및 파일명 서식
                          </span>

                          <div className="rounded-lg border border-line bg-muted/10 p-2.5 space-y-1">
                            <span className="text-[10px] font-bold text-foreground block">프롬프트 템플릿</span>
                            <textarea
                              value={templateBody}
                              onChange={(e) => setTemplateBody(e.target.value)}
                              placeholder="서식 입력..."
                              rows={3}
                              className="w-full rounded border border-line bg-background p-1.5 font-mono text-[10px] leading-normal text-foreground focus:outline-none"
                            />
                          </div>

                          <div className="rounded-lg border border-line bg-muted/10 p-2.5 space-y-1">
                            <span className="text-[10px] font-bold text-foreground block">파일명 템플릿</span>
                            <Input
                              value={filenameBody}
                              onChange={(e) => setFilenameBody(e.target.value)}
                              placeholder="img_{{character.key}}..."
                              className="h-7 rounded border-line bg-background font-mono text-[10px]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        {mobileSubTab === "editor" && (
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-line bg-card/20 shadow-xs">
              <div className="flex items-center justify-between border-b border-line/60 bg-muted/30 px-3 py-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-black text-primary">
                    3
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    코드 미리보기
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({activeTemplate?.name || "코드"}.template)
                  </span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!generatedCode}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-ok" />
                        <span className="text-[10px] font-bold text-ok">복사됨</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold">복사</span>
                      </>
                    )}
                  </Button>

                  <Separator orientation="vertical" className="h-4 mx-0.5" />

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!generatedCode}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold">다운로드</span>
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 relative">
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
        )}

        {mobileSubTab === "results" && (
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            {!displayParserError && activeQueue.length > 0 && (
              <div className="relative mb-3 shrink-0">
                <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="파일명 또는 프롬프트 검색..."
                  value={previewFilter}
                  onChange={(e) => setPreviewFilter(e.target.value)}
                  className="h-9 rounded-lg border-line/60 bg-background/50 pl-8 text-xs focus-visible:ring-1"
                />
              </div>
            )}

            <div className="flex-1 min-h-0 rounded-xl border border-line bg-card/10 overflow-hidden">
              {displayIsLoading ? (
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
              ) : displayParserError ? (
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
                          {displayParserError}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeQueue.length === 0 ? (
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
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <p className="text-xs font-bold text-muted-foreground">
                    검색 결과가 없습니다
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/60">
                    다른 키워드로 검색해 보세요.
                  </p>
                </div>
              ) : (
                <div className="h-full overflow-auto bg-background/50">
                  <div className="divide-y divide-line/20">
                    {filteredPreview.map((item, idx) => {
                      const renderedFilename = substitute(item.filename, item)
                      const renderedPrompt = substitute(item.prompt, item)
                      const key = itemKey(item)

                      return (
                        <div
                          key={`res-mobile-${key}-${idx}`}
                          className="p-3.5 space-y-2 hover:bg-accent/10 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-xs font-black break-all text-foreground select-all leading-tight">
                              {renderedFilename}
                            </span>
                          </div>

                          {Object.keys(item.meta).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(item.meta).map(([k, v]) => (
                                <Badge
                                  key={k}
                                  variant="outline"
                                  className="origin-left scale-90 border-primary/15 bg-primary/5 px-2 py-0 text-[9px] font-bold text-primary capitalize"
                                >
                                  {k}: {v}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <div className="font-mono text-[11px] leading-relaxed text-muted-foreground bg-muted/30 rounded-lg p-2.5 break-words select-all">
                            {renderedPrompt}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
