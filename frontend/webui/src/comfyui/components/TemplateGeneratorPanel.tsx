import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  Copy,
  Download,
  Check,
  FileCode2,
  Pencil,
  Search,
  AlertCircle,
  Sliders,
  Plus,
  Trash2,
  Layers,
  Shuffle,
  Sparkles,
  Hash,
  X,
  Braces,
  Eye,
  ChevronDown,
  CopyPlus,
  Settings2,
  MessageSquare,
  Upload,
  Star,
} from "lucide-react"
import { toast } from "sonner"

import { DEFAULT_BACKEND_URL } from "@/lib/runtime"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { Card, CardContent, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import CodeEditor from "@/components/CodeEditor"
import { useTemplateContext } from "../contexts/useTemplateContext"
import { useJobRunner } from "../hooks/useJobRunner"
import { InlineImagePreview } from "./InlineImagePreview"
import { QuickTestPopover } from "./QuickTestPopover"
import type { RenderItem, RenderItemsResponse } from "../types/renderTypes"
import { API, HEADERS } from "@/lib/api"
import { CEG_TEMPLATE_DEBOUNCE_MS } from "@/lib/constants"
import { itemKey } from "../../lib/workflowUtils"

// ── Types ─────────────────────────────────────────────────────────────

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
  fileKey: string
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
export interface TemplateItem {
  id: string
  name: string
  category: string
  code: string
  savedAt?: number
}
interface LoadedFileTemplate {
  name: string
  code: string
  savedAt: number
}
interface TemplateDraft {
  sourceId: string | null
  variables: VisualVariable[]
  cleanFilename: boolean
  axes: VisualAxis[]
  combines: VisualCombine[]
  excludes: VisualExclude[]
  templateBody: string
  filenameBody: string
  saveName: string
}

interface ParsedTemplate {
  variables: VisualVariable[]
  axes: VisualAxis[]
  combines: VisualCombine[]
  excludes: VisualExclude[]
  templateBody: string
  filenameBody: string
  cleanFilename: boolean
}

// ── localStorage helpers ─────────────────────────────────────────────

const STORAGE_KEYS = {
  accordionSections: "tg-accordion-sections",
  expandedAxes: "tg-expanded-axes",
  axisAdvanced: "tg-axis-advanced",
  mobileTab: "tg-mobile-tab",
} as const

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* ignore */
  }
  return new Set()
}
function saveSet(key: string, value: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...value]))
  } catch {
    /* ignore */
  }
}
function loadString(key: string, fallback: string): string {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) return raw
  } catch {
    /* ignore */
  }
  return fallback
}
function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function emptyDraft(sourceId: string | null, saveName = ""): TemplateDraft {
  return {
    sourceId,
    variables: [],
    cleanFilename: true,
    axes: [],
    combines: [],
    excludes: [],
    templateBody: "",
    filenameBody: "",
    saveName,
  }
}

// ── Collapsible Section ────────────────────────────────────────────────

function CollapsibleSection({
  value,
  open,
  onToggle,
  icon,
  label,
  count,
  children,
}: {
  value: string
  open: boolean
  onToggle: (value: string) => void
  icon: React.ElementType
  label: string
  count?: number
  children: React.ReactNode
}): React.ReactNode {
  const Icon = icon
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => {
          onToggle(value)
        }}
        className="flex w-full items-center gap-2 rounded-md px-1 py-2.5 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
        />
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold">{label}</span>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
            {count}
          </Badge>
        )}
      </button>
      <div
        className="overflow-hidden transition-[height] duration-200 ease-in-out"
        style={{ height: open ? "auto" : 0 }}
      >
        <div ref={contentRef} className="pb-3">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Parser ────────────────────────────────────────────────────────────

function parseCegTemplate(code: string): ParsedTemplate {
  const variables: VisualVariable[] = []
  const axes: VisualAxis[] = []
  const combines: VisualCombine[] = []
  const excludes: VisualExclude[] = []
  let templateBody = ""
  let filenameBody = ""
  let cleanFilename = true
  if (code === "")
    return {
      variables,
      axes,
      combines,
      excludes,
      templateBody,
      filenameBody,
      cleanFilename,
    }
  let match: RegExpExecArray | null
  const setRe =
    /\{\{\s*set\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*\}\}/g
  let vi = 0
  while ((match = setRe.exec(code)) !== null) {
    const name = match[1] ?? ""
    const val = match[2] ?? ""
    if (name === "clean_filename") {
      cleanFilename = val.toLowerCase() === "true"
    } else {
      variables.push({ id: `var-${String(vi++)}`, name, value: val })
    }
  }
  const axRe =
    /\{\{\s*axis\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+include="((?:[^"\\]|\\.)*)")?\s*\}\}([\s\S]*?)\{\{\s*\/axis\s*\}\}/gi
  let ai = 0
  while ((match = axRe.exec(code)) !== null) {
    const entries: VisualAxisEntry[] = []
    let ei = 0
    for (const line of (match[3] ?? "").split("\n")) {
      const t = line.trim()
      if (t === "" || t.startsWith("#") || t.startsWith("//")) continue
      const s =
        /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+"((?:[^"\\]|\\.)*)")?\s*:\s*"((?:[^"\\]|\\.)*)"$/.exec(
          t
        )
      if (s !== null) {
        entries.push({
          id: `e-${String(ai)}-${String(ei++)}`,
          key: s[1] ?? "",
          fileKey: s[2] ?? "",
          value: s[3] ?? "",
          properties: [],
          isComplex: false,
        })
        continue
      }
      const c =
        /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+"((?:[^"\\]|\\.)*)")?\s*:\s*\{\s*([^{}]+)\s*\}$/.exec(
          t
        )
      if (c !== null) {
        const props: AxisEntryProperty[] = []
        const pr = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*"((?:[^"\\]|\\.)*)"/g
        let pm: RegExpExecArray | null
        let pi = 0
        while ((pm = pr.exec(c[3] ?? "")) !== null)
          props.push({
            id: `p-${String(ai)}-${String(ei)}-${String(pi++)}`,
            name: pm[1] ?? "",
            value: pm[2] ?? "",
          })
        entries.push({
          id: `e-${String(ai)}-${String(ei++)}`,
          key: c[1] ?? "",
          fileKey: c[2] ?? "",
          value: "",
          properties: props,
          isComplex: true,
        })
      }
    }
    axes.push({
      id: `a-${String(ai++)}`,
      name: match[1] ?? "",
      include: match[2] ?? "",
      entries,
    })
  }
  const cbRe = /\{\{\s*combine\s+([^}]+)\s*\}\}/g
  let ci = 0
  while ((match = cbRe.exec(code)) !== null) {
    const e = (match[1] ?? "").trim()
    if (!e.startsWith("/"))
      combines.push({ id: `c-${String(ci++)}`, expression: e })
  }
  const exRe = /\{\{\s*exclude\s+([^}]+)\s*\}\}/g
  let xi = 0
  while ((match = exRe.exec(code)) !== null)
    excludes.push({
      id: `ex-${String(xi++)}`,
      statement: (match[1] ?? "").trim(),
    })
  const tm = /\{\{\s*template\s*\}\}([\s\S]*?)\{\{\s*\/template\s*\}\}/i.exec(
    code
  )
  if (tm !== null) templateBody = tm[1] ?? ""
  const fn = /\{\{\s*filename\s*\}\}([\s\S]*?)\{\{\s*\/filename\s*\}\}/i.exec(
    code
  )
  if (fn !== null) filenameBody = fn[1] ?? ""
  return {
    variables,
    axes,
    combines,
    excludes,
    templateBody,
    filenameBody,
    cleanFilename,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

const DUPLICATE_VAR = (v: VisualVariable): VisualVariable => ({
  id: `v-${String(Date.now())}`,
  name: v.name + "_copy",
  value: v.value,
})
const DUPLICATE_AXIS = (a: VisualAxis): VisualAxis => ({
  id: `a-${String(Date.now())}`,
  name: a.name + "_copy",
  include: a.include,
  entries: a.entries.map((e) => ({
    ...e,
    id: `e-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
    properties: e.properties.map((p) => ({
      ...p,
      id: `p-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
    })),
  })),
})

// ── Sub-components ─────────────────────────────────────────────────────

function AxisBadgeButtons({
  axisNames,
  onInsert,
}: {
  axisNames: string[]
  onInsert: (text: string) => void
}): React.ReactNode {
  if (axisNames.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <span className="mr-1 self-center text-[10px] text-muted-foreground">
        축:
      </span>
      {axisNames.map((n) => (
        <Badge
          key={n}
          variant="secondary"
          className="cursor-pointer font-mono text-[10px] transition-colors hover:bg-primary/10"
          onClick={() => {
            onInsert(n)
          }}
        >
          {n}
        </Badge>
      ))}
    </div>
  )
}

function VarBadgeButtons({
  variables,
  axes,
  onInsertVar,
  onInsertAxisKey,
}: {
  variables: VisualVariable[]
  axes: VisualAxis[]
  onInsertVar: (name: string) => void
  onInsertAxisKey: (name: string) => void
}): React.ReactNode {
  if (variables.length === 0 && axes.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {variables
        .map((v) => v.name.trim())
        .filter(Boolean)
        .map((n) => (
          <Badge
            key={`v-${n}`}
            variant="secondary"
            className="cursor-pointer font-mono text-[10px] transition-colors hover:bg-primary/10"
            onClick={() => {
              onInsertVar(n)
            }}
          >
            {"{{" + n + "}}"}
          </Badge>
        ))}
      {axes
        .map((a) => a.name.trim())
        .filter(Boolean)
        .map((n) => (
          <span key={`a-${n}`} className="inline-flex gap-0.5">
            <Badge
              variant="default"
              className="cursor-pointer font-mono text-[10px] transition-colors hover:bg-primary/80"
              onClick={() => {
                onInsertVar(n)
              }}
            >
              {"{{" + n + "}}"}
            </Badge>
            <Badge
              variant="outline"
              className="cursor-pointer border-primary/20 font-mono text-[10px] text-primary transition-colors hover:bg-primary/5"
              onClick={() => {
                onInsertAxisKey(n)
              }}
            >
              {"{{" + n + ".key}}"}
            </Badge>
          </span>
        ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export function TemplateGeneratorPanel({
  setActiveTab,
  backendUrl = DEFAULT_BACKEND_URL,
}: {
  setActiveTab: (
    t: "jobs" | "stats" | "gallery" | "curation" | "generator" | "settings"
  ) => void
  backendUrl?: string
}): React.ReactNode {
  const {
    savedTemplates,
    setCegTemplate,
    saveTemplate,
    setTemplateResetKey,
    setGeneratorToolbarProps,
  } = useTemplateContext()
  const { handleRunSingle } = useJobRunner()
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [loadedFileTemplate, setLoadedFileTemplate] =
    useState<LoadedFileTemplate | null>(null)
  const [draft, setDraft] = useState<TemplateDraft>(() => emptyDraft(null))
  const [copied, setCopied] = useState(false)
  const [systemTemplates, setSystemTemplates] = useState<TemplateItem[]>([])
  const [accordionValue, setAccordionValue] = useState<Set<string>>(() => {
    const s = loadSet(STORAGE_KEYS.accordionSections)
    return s.size > 0 ? s : new Set(["axes"])
  })
  const [mobileTab, setMobileTab] = useState(() =>
    loadString(STORAGE_KEYS.mobileTab, "edit")
  )
  const [parserError, setParserError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [parserRenderResponse, setParserRenderResponse] =
    useState<RenderItemsResponse | null>(null)
  const [previewFilter, setPreviewFilter] = useState("")
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null)
  const [expandedAxes, setExpandedAxes] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.expandedAxes)
  )
  const [showAxisAdvanced, setShowAxisAdvanced] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.axisAdvanced)
  )
  const [favoriteCombinations, setFavoriteCombinations] = useState<Set<string>>(
    () => loadSet("ceg_favorite_combinations")
  )
  const [recentTestItems, setRecentTestItems] = useState<RenderItem[]>([])
  const [activeTestItemKey, setActiveTestItemKey] = useState<string | null>(
    null
  )

  const toggleFavorite = useCallback((key: string): void => {
    setFavoriteCombinations((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveSet("ceg_favorite_combinations", next)
      return next
    })
  }, [])

  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file !== undefined) {
        const name = file.name
        const ext = name.split(".").pop()?.toLowerCase()
        if (ext === "ceg" || ext === "template" || ext === "txt") {
          const reader = new FileReader()
          reader.onload = (event: ProgressEvent<FileReader>): void => {
            const content = event.target?.result as string
            if (content !== "") {
              try {
                setLoadedFileTemplate({
                  name: file.name,
                  code: content,
                  savedAt: Date.now(),
                })
                setSelectedTemplateId("loaded")
                toast.success(`템플릿 '${name}' 불러오기 완료!`)
              } catch {
                toast.error("템플릿 파싱에 실패했습니다.")
              }
            }
          }
          reader.readAsText(file)
        } else {
          toast.error("*.ceg 또는 *.template 파일만 지원합니다.")
        }
      }
    }
  }

  const lastVarInputRef = useRef<HTMLInputElement | null>(null)
  const lastEntryInputRef = useRef<HTMLInputElement | null>(null)
  const combineInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const excludeInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const templateTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const filenameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let a = true
    void fetch(`${backendUrl}/templates`)
      .then((r: Response) => (r.ok ? r.json() : []))
      .then((d: unknown) => {
        if (a && Array.isArray(d) && d.length > 0)
          setSystemTemplates(d as TemplateItem[])
      })
      .catch(() => undefined)
    return (): void => {
      a = false
    }
  }, [backendUrl])

  const combinedTemplates = useMemo<TemplateItem[]>(() => {
    const list: TemplateItem[] = [
      { id: "new", name: "새 템플릿", category: "new", code: "", savedAt: 0 },
    ]
    if (loadedFileTemplate) {
      list.push({
        id: "loaded",
        name: `[파일] ${loadedFileTemplate.name}`,
        category: "loaded",
        code: loadedFileTemplate.code,
        savedAt: loadedFileTemplate.savedAt,
      })
    }
    return [
      ...list,
      ...savedTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        category: "saved",
        code: t.template,
        savedAt: t.savedAt,
      })),
      ...systemTemplates,
    ]
  }, [savedTemplates, systemTemplates, loadedFileTemplate])
  const groupedTemplates = useMemo(() => {
    const g: Record<string, TemplateItem[]> = {}
    for (const t of combinedTemplates) {
      const c = t.category || "기타"
      ;(g[c] ??= []).push(t)
    }
    return g
  }, [combinedTemplates])
  const effectiveId = useMemo(() => {
    if (combinedTemplates.length === 0) return ""
    if (
      selectedTemplateId !== "" &&
      combinedTemplates.some((t) => t.id === selectedTemplateId)
    ) {
      return selectedTemplateId
    }
    const defaultTemplate =
      combinedTemplates.find((t) => t.id !== "new" && t.id !== "loaded") ??
      combinedTemplates[0]
    return defaultTemplate?.id ?? ""
  }, [selectedTemplateId, combinedTemplates])
  const activeTemplate = useMemo(
    () => combinedTemplates.find((t) => t.id === effectiveId) ?? null,
    [combinedTemplates, effectiveId]
  )

  const curId = activeTemplate?.id ?? null
  const templateDraft = useMemo<TemplateDraft>(() => {
    if (activeTemplate === null) return emptyDraft(null)
    if (activeTemplate.id === "new")
      return emptyDraft(activeTemplate.id, "새 템플릿")

    const parsed = parseCegTemplate(activeTemplate.code)
    const baseName =
      activeTemplate.id === "loaded"
        ? (
            activeTemplate.name.substring(
              0,
              activeTemplate.name.lastIndexOf(".")
            ) || activeTemplate.name
          ).replace(/^\[파일\]\s*/, "")
        : `${activeTemplate.name} 커스텀`

    return {
      sourceId: activeTemplate.id,
      variables: parsed.variables,
      cleanFilename: parsed.cleanFilename,
      axes: parsed.axes,
      combines: parsed.combines,
      excludes: parsed.excludes,
      templateBody: parsed.templateBody,
      filenameBody: parsed.filenameBody,
      saveName: baseName,
    }
  }, [activeTemplate])

  const activeDraft = draft.sourceId === curId ? draft : templateDraft
  const {
    variables,
    cleanFilename,
    axes,
    combines,
    excludes,
    templateBody,
    filenameBody,
    saveName,
  } = activeDraft

  const updateDraft = useCallback(
    (updater: (prev: TemplateDraft) => TemplateDraft): void => {
      setDraft((prev) =>
        updater(prev.sourceId === curId ? prev : templateDraft)
      )
    },
    [curId, templateDraft]
  )

  const setVariables: React.Dispatch<React.SetStateAction<VisualVariable[]>> =
    useCallback(
      (value) => {
        updateDraft((prev) => ({
          ...prev,
          sourceId: curId,
          variables:
            typeof value === "function" ? value(prev.variables) : value,
        }))
      },
      [curId, updateDraft]
    )
  const setCleanFilename: React.Dispatch<React.SetStateAction<boolean>> =
    useCallback(
      (value) => {
        updateDraft((prev) => ({
          ...prev,
          sourceId: curId,
          cleanFilename:
            typeof value === "function" ? value(prev.cleanFilename) : value,
        }))
      },
      [curId, updateDraft]
    )
  const setAxes: React.Dispatch<React.SetStateAction<VisualAxis[]>> =
    useCallback(
      (value) => {
        updateDraft((prev) => ({
          ...prev,
          sourceId: curId,
          axes: typeof value === "function" ? value(prev.axes) : value,
        }))
      },
      [curId, updateDraft]
    )
  const setCombines: React.Dispatch<React.SetStateAction<VisualCombine[]>> =
    useCallback(
      (value) => {
        updateDraft((prev) => ({
          ...prev,
          sourceId: curId,
          combines: typeof value === "function" ? value(prev.combines) : value,
        }))
      },
      [curId, updateDraft]
    )
  const setExcludes: React.Dispatch<React.SetStateAction<VisualExclude[]>> =
    useCallback(
      (value) => {
        updateDraft((prev) => ({
          ...prev,
          sourceId: curId,
          excludes: typeof value === "function" ? value(prev.excludes) : value,
        }))
      },
      [curId, updateDraft]
    )
  const setTemplateBody: React.Dispatch<React.SetStateAction<string>> =
    useCallback(
      (value) => {
        updateDraft((prev) => ({
          ...prev,
          sourceId: curId,
          templateBody:
            typeof value === "function" ? value(prev.templateBody) : value,
        }))
      },
      [curId, updateDraft]
    )
  const setFilenameBody: React.Dispatch<React.SetStateAction<string>> =
    useCallback(
      (value) => {
        updateDraft((prev) => ({
          ...prev,
          sourceId: curId,
          filenameBody:
            typeof value === "function" ? value(prev.filenameBody) : value,
        }))
      },
      [curId, updateDraft]
    )
  const setSaveName = useCallback(
    (value: string): void => {
      updateDraft((prev) => ({ ...prev, sourceId: curId, saveName: value }))
    },
    [curId, updateDraft]
  )

  // Handlers
  const addVar = (): void => {
    setVariables((p) => [
      ...p,
      {
        id: `v-${String(Date.now())}`,
        name: `var_${String(p.length + 1)}`,
        value: "",
      },
    ])
  }
  const setVarN = (id: string, n: string): void => {
    setVariables((p) => p.map((v) => (v.id === id ? { ...v, name: n } : v)))
  }
  const setVarV = (id: string, n: string): void => {
    setVariables((p) => p.map((v) => (v.id === id ? { ...v, value: n } : v)))
  }
  const delVar = (id: string): void => {
    setVariables((p) => p.filter((v) => v.id !== id))
  }
  const dupVar = (id: string): void => {
    const v = variables.find((x) => x.id === id)
    if (v !== undefined) setVariables((p) => [...p, DUPLICATE_VAR(v)])
  }
  const addAxis = (): void => {
    const newId = `a-${String(Date.now())}`
    setAxes((p) => [
      ...p,
      {
        id: newId,
        name: `axis_${String(p.length + 1)}`,
        include: "",
        entries: [],
      },
    ])
    setExpandedAxes((s) => new Set([...s, newId]))
  }
  const setAxN = (id: string, n: string): void => {
    setAxes((p) => p.map((a) => (a.id === id ? { ...a, name: n } : a)))
  }
  const setAxI = (id: string, n: string): void => {
    setAxes((p) => p.map((a) => (a.id === id ? { ...a, include: n } : a)))
  }
  const delAxis = (id: string): void => {
    setAxes((p) => p.filter((a) => a.id !== id))
  }
  const dupAxis = (id: string): void => {
    const a = axes.find((x) => x.id === id)
    if (a !== undefined) {
      const dup = DUPLICATE_AXIS(a)
      setAxes((p) => [...p, dup])
      setExpandedAxes((s) => new Set([...s, dup.id]))
    }
  }
  const toggleAxisExpand = (id: string): void => {
    setExpandedAxes((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      saveSet(STORAGE_KEYS.expandedAxes, n)
      return n
    })
  }
  const toggleAxisAdvanced = (id: string): void => {
    setShowAxisAdvanced((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      saveSet(STORAGE_KEYS.axisAdvanced, n)
      return n
    })
  }
  const addEntry = (axId: string): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: [
                ...a.entries,
                {
                  id: `e-${String(Date.now())}`,
                  key: `val_${String(a.entries.length + 1)}`,
                  fileKey: "",
                  value: "",
                  properties: [],
                  isComplex: false,
                },
              ],
            }
      )
    )
  }
  const setEKey = (axId: string, eId: string, k: string): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: a.entries.map((e) =>
                e.id === eId ? { ...e, key: k } : e
              ),
            }
      )
    )
  }
  const setEVal = (axId: string, eId: string, v: string): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: a.entries.map((e) =>
                e.id === eId ? { ...e, value: v } : e
              ),
            }
      )
    )
  }
  const setEFileKey = (axId: string, eId: string, fk: string): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: a.entries.map((e) =>
                e.id === eId ? { ...e, fileKey: fk } : e
              ),
            }
      )
    )
  }
  const toggleCplx = (axId: string, eId: string): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: a.entries.map((e) => {
                if (e.id !== eId) return e
                const c = !e.isComplex
                return {
                  ...e,
                  isComplex: c,
                  properties:
                    c && e.properties.length === 0
                      ? [
                          {
                            id: `p-${String(Date.now())}`,
                            name: "text",
                            value: e.value,
                          },
                        ]
                      : e.properties,
                }
              }),
            }
      )
    )
  }
  const delEntry = (axId: string, eId: string): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : { ...a, entries: a.entries.filter((e) => e.id !== eId) }
      )
    )
  }
  const addProp = (axId: string, eId: string): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: a.entries.map((e) =>
                e.id !== eId
                  ? e
                  : {
                      ...e,
                      properties: [
                        ...e.properties,
                        {
                          id: `p-${String(Date.now())}`,
                          name: `prop_${String(e.properties.length + 1)}`,
                          value: "",
                        },
                      ],
                    }
              ),
            }
      )
    )
  }
  const setPropN = (
    axId: string,
    eId: string,
    pId: string,
    n: string
  ): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: a.entries.map((e) =>
                e.id !== eId
                  ? e
                  : {
                      ...e,
                      properties: e.properties.map((pp) =>
                        pp.id === pId ? { ...pp, name: n } : pp
                      ),
                    }
              ),
            }
      )
    )
  }
  const setPropV = (
    axId: string,
    eId: string,
    pId: string,
    n: string
  ): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: a.entries.map((e) =>
                e.id !== eId
                  ? e
                  : {
                      ...e,
                      properties: e.properties.map((pp) =>
                        pp.id === pId ? { ...pp, value: n } : pp
                      ),
                    }
              ),
            }
      )
    )
  }
  const delProp = (axId: string, eId: string, pId: string): void => {
    setAxes((p) =>
      p.map((a) =>
        a.id !== axId
          ? a
          : {
              ...a,
              entries: a.entries.map((e) =>
                e.id !== eId
                  ? e
                  : {
                      ...e,
                      properties: e.properties.filter((pp) => pp.id !== pId),
                    }
              ),
            }
      )
    )
  }
  const addCombine = (): void => {
    setCombines((p) => [
      ...p,
      { id: `c-${String(Date.now())}`, expression: "" },
    ])
  }
  const setCombExpr = useCallback(
    (id: string, n: string): void => {
      setCombines((p) =>
        p.map((c) => (c.id === id ? { ...c, expression: n } : c))
      )
    },
    [setCombines]
  )
  const delCombine = (id: string): void => {
    setCombines((p) => p.filter((c) => c.id !== id))
  }
  const addExclude = (): void => {
    setExcludes((p) => [
      ...p,
      { id: `ex-${String(Date.now())}`, statement: "" },
    ])
  }
  const setExclStmt = useCallback(
    (id: string, n: string): void => {
      setExcludes((p) =>
        p.map((e) => (e.id === id ? { ...e, statement: n } : e))
      )
    },
    [setExcludes]
  )
  const delExclude = (id: string): void => {
    setExcludes((p) => p.filter((e) => e.id !== id))
  }

  const insertToCombine = useCallback(
    (combineId: string, text: string): void => {
      const el = combineInputRefs.current[combineId]
      if (el) {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        const before = el.value.slice(0, start)
        const after = el.value.slice(end)
        const needSpace =
          before.length > 0 && !before.endsWith(" ") && !before.endsWith("*")
            ? " "
            : ""
        const newVal = before + needSpace + text + after
        setCombExpr(combineId, newVal)
      } else {
        const target = combines.find((c) => c.id === combineId)
        const currentExpr = target?.expression ?? ""
        const needsSpace = currentExpr !== "" && !currentExpr.endsWith(" ")
        setCombExpr(combineId, currentExpr + (needsSpace ? " " : "") + text)
      }
    },
    [combines, setCombExpr]
  )

  const insertToExclude = useCallback(
    (excludeId: string, text: string): void => {
      const el = excludeInputRefs.current[excludeId]
      if (el) {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        const before = el.value.slice(0, start)
        const after = el.value.slice(end)
        const needSpace = before.length > 0 && !before.endsWith(" ") ? " " : ""
        const newVal = before + needSpace + text + after
        setExclStmt(excludeId, newVal)
      } else {
        setExclStmt(
          excludeId,
          (excludes.find((e) => e.id === excludeId)?.statement ?? "") + text
        )
      }
    },
    [excludes, setExclStmt]
  )

  const insertToTemplate = useCallback(
    (text: string): void => {
      const el = templateTextareaRef.current
      if (el !== null) {
        const start = el.selectionStart
        const end = el.selectionEnd
        const newBody =
          templateBody.slice(0, start) + text + templateBody.slice(end)
        setTemplateBody(newBody)
      } else {
        setTemplateBody(templateBody + text)
      }
    },
    [setTemplateBody, templateBody]
  )

  const toggleSection = (key: string): void => {
    setAccordionValue((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveSet(STORAGE_KEYS.accordionSections, next)
      return next
    })
  }

  const axisNames = useMemo(
    () => axes.map((a) => a.name.trim()).filter(Boolean),
    [axes]
  )

  const generatedCode = useMemo(() => {
    let c = ""
    if (!cleanFilename) {
      c += `{{set clean_filename = "false"}}\n`
    }
    variables.forEach((v) => {
      if (v.name.trim() !== "") c += `{{set ${v.name.trim()} = "${v.value}"}}\n`
    })
    if (!cleanFilename || variables.length > 0) c += "\n"
    axes.forEach((a) => {
      const trimmedInc = a.include.trim()
      const incStr = trimmedInc !== "" ? ` include="${trimmedInc}"` : ""
      c += `{{axis ${a.name}${incStr}}}\n`
      a.entries.forEach((e) => {
        const fileKeyStr =
          e.fileKey.trim() !== "" ? ` as "${e.fileKey.trim()}"` : ""
        if (e.isComplex) {
          const props = e.properties
            .map((p) => `${p.name}: "${p.value}"`)
            .join(", ")
          c += `  ${e.key}${fileKeyStr}: { ${props} }\n`
        } else {
          c += `  ${e.key}${fileKeyStr}: "${e.value}"\n`
        }
      })
      c += `{{/axis}}\n\n`
    })
    combines.forEach((cm) => {
      if (cm.expression.trim() !== "")
        c += `{{combine ${cm.expression.trim()}}}\n`
    })
    if (combines.length > 0) c += "\n"
    excludes.forEach((ex) => {
      if (ex.statement.trim() !== "")
        c += `{{exclude ${ex.statement.trim()}}}\n`
    })
    if (excludes.length > 0) c += "\n"
    if (templateBody.trim() !== "")
      c += `{{template}}\n${templateBody}\n{{/template}}\n\n`
    if (filenameBody.trim() !== "")
      c += `{{filename}}${filenameBody}{{/filename}}\n`
    return c.trim() + "\n"
  }, [
    variables,
    axes,
    combines,
    excludes,
    templateBody,
    filenameBody,
    cleanFilename,
  ])

  const substitute = (text: string, item: RenderItem): string => {
    let r = text || ""
    Object.entries(item.meta).forEach(([k, v]) => {
      r = r.split(`{{${k}}}`).join(v)
      r = r.split(`{${k}}`).join(v)
    })
    r = r.split("{{input}}").join(item.prompt)
    r = r.split("{input}").join(item.prompt)
    return r
  }

  useEffect(() => {
    if (generatedCode.trim() === "") {
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout((): void => {
      void (async (): Promise<void> => {
        setIsLoading(true)
        setParserError(null)
        try {
          const r = await fetch(`${backendUrl}${API.render}`, {
            method: "POST",
            headers: HEADERS.json,
            body: JSON.stringify({ template: generatedCode }),
            signal: ctrl.signal,
          })
          if (!r.ok) throw new Error(`HTTP ${String(r.status)}`)
          setParserRenderResponse((await r.json()) as RenderItemsResponse)
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") return
          setParserError(e instanceof Error ? e.message : String(e))
          setParserRenderResponse(null)
        } finally {
          setIsLoading(false)
        }
      })()
    }, CEG_TEMPLATE_DEBOUNCE_MS)
    return (): void => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [generatedCode, backendUrl])

  const renderResponse =
    generatedCode.trim() !== "" ? parserRenderResponse : null
  const activeQueue = useMemo(
    () => (generatedCode.trim() !== "" ? (renderResponse?.items ?? []) : []),
    [generatedCode, renderResponse]
  )
  const renderAxes = useMemo(() => renderResponse?.axes ?? {}, [renderResponse])
  const renderSets = useMemo(() => renderResponse?.sets ?? {}, [renderResponse])
  const filtered = useMemo(() => {
    const n = previewFilter.trim().toLowerCase()
    if (n === "") return activeQueue
    return activeQueue.filter(
      (i) => {
        const metaText = Object.entries(i.meta)
          .map(([key, value]) => `${key}:${value}`)
          .join(" ")
          .toLowerCase()
        return (
          itemKey(i).toLowerCase().includes(n) ||
          metaText.includes(n) ||
          substitute(i.filename, i).toLowerCase().includes(n) ||
          substitute(i.prompt, i).toLowerCase().includes(n)
        )
      }
    )
  }, [activeQueue, previewFilter])

  const activeTestItem = useMemo(() => {
    if (activeTestItemKey === null) return null
    return (
      activeQueue.find((item) => itemKey(item) === activeTestItemKey) ??
      recentTestItems.find((item) => itemKey(item) === activeTestItemKey) ??
      null
    )
  }, [activeQueue, activeTestItemKey, recentTestItems])

  const runTestItem = useCallback(
    (item: RenderItem): void => {
      const k = itemKey(item)
      setRecentTestItems((prev) => {
        const withoutSame = prev.filter((p) => itemKey(p) !== k)
        return [item, ...withoutSame].slice(0, 8)
      })
      setActiveTestItemKey(k)
      setExpandedItemKey(k)
      void handleRunSingle(item, { cegTemplate: generatedCode })
    },
    [generatedCode, handleRunSingle]
  )

  const handleRunTestFromPopover = useCallback(
    (item: RenderItem): void => {
      const k = itemKey(item)
      runTestItem(item)
      setPreviewFilter(k)
    },
    [runTestItem]
  )

  const handleApply = useCallback((): void => {
    if (generatedCode === "") return
    setCegTemplate(generatedCode)
    toast.success("작업 탭에 적용되었습니다.")
    setActiveTab("jobs")
  }, [generatedCode, setActiveTab, setCegTemplate])
  const handleSave = useCallback((): void => {
    const trimmedName = saveName.trim()
    if (trimmedName === "") {
      toast.error("저장할 이름을 입력해 주세요.")
      return
    }
    const existing = savedTemplates.find(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (existing !== undefined) {
      if (activeTemplate?.id !== existing.id) {
        const ok = window.confirm(
          `'${trimmedName}' 이름의 템플릿이 이미 존재합니다. 덮어쓰시겠습니까?`
        )
        if (!ok) return
      }
    }
    const saved = saveTemplate(trimmedName, generatedCode)
    setTemplateResetKey((k) => k + 1)
    setSelectedTemplateId(saved.id)
    toast.success(`'${trimmedName}' 저장됨`)
  }, [
    activeTemplate,
    generatedCode,
    saveName,
    saveTemplate,
    savedTemplates,
    setTemplateResetKey,
  ])
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(generatedCode)
      setCopied(true)
      toast.success("복사됨")
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch {
      toast.error("복사 실패")
    }
  }
  const handleDownload = (): void => {
    const u = URL.createObjectURL(
      new Blob([generatedCode], { type: "text/plain;charset=utf-8" })
    )
    const a = document.createElement("a")
    a.href = u
    a.download = `${saveName.replace(/\s+/g, "_") || "template"}.template`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(u)
    toast.success("다운로드 완료")
  }

  const catLabel = useCallback(
    (c: string): string => (c === "saved" ? "내 저장" : c),
    []
  )

  useEffect(() => {
    if (activeTemplate !== null) {
      setGeneratorToolbarProps({
        generatedCode,
        saveName,
        setSaveName,
        handleSave,
        handleApply,
        effectiveId,
        setSelectedTemplateId,
        groupedTemplates,
        catLabel,
      })
    } else {
      setGeneratorToolbarProps(null)
    }
    return (): void => {
      setGeneratorToolbarProps(null)
    }
  }, [
    activeTemplate,
    generatedCode,
    saveName,
    setSaveName,
    effectiveId,
    setSelectedTemplateId,
    groupedTemplates,
    handleApply,
    handleSave,
    catLabel,
    setGeneratorToolbarProps,
  ])

  const handleVarKeyDown = (e: React.KeyboardEvent, idx: number): void => {
    if (e.key === "Enter" && idx === variables.length - 1) {
      e.preventDefault()
      addVar()
      setTimeout(() => lastVarInputRef.current?.focus(), 50)
    }
  }

  const handleEntryKeyDown = (
    e: React.KeyboardEvent,
    axId: string,
    idx: number,
    totalEntries: number
  ): void => {
    if (e.key === "Enter" && idx === totalEntries - 1) {
      e.preventDefault()
      addEntry(axId)
      setTimeout(() => lastEntryInputRef.current?.focus(), 50)
    }
  }

  // ── Accordion sections ──────────────────────────────────────────

  const variablesSection = (
    <div className="space-y-2">
      {variables.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-xs text-muted-foreground">
            변수를 추가하면{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              {"{{name}}"}
            </code>
            으로 참조할 수 있습니다.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={addVar}
            className="mt-3 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />첫 변수 추가
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {variables.map((v, i) => (
            <div
              key={v.id}
              className="group flex flex-col gap-1.5 rounded-lg border bg-muted/10 p-2 md:flex-row md:items-center md:gap-1.5 md:rounded-none md:border-0 md:bg-transparent md:p-0"
            >
              {/* Top row on mobile: {{ name }} indicator and copy/delete buttons */}
              <div className="flex w-full items-center gap-1.5 md:w-auto">
                <Badge
                  variant="outline"
                  className="h-7 shrink-0 rounded-md px-1.5 font-mono text-[11px] text-muted-foreground/60 select-none"
                >
                  {"{{"}
                </Badge>
                <Input
                  value={v.name}
                  onChange={(e) => {
                    setVarN(v.id, e.target.value)
                  }}
                  placeholder="변수명"
                  className="h-8 flex-1 font-mono text-sm md:w-28 md:flex-initial"
                  onKeyDown={(e) => {
                    handleVarKeyDown(e, i)
                  }}
                />
                <Badge
                  variant="outline"
                  className="h-7 shrink-0 rounded-md px-1.5 font-mono text-[11px] text-muted-foreground/60 select-none md:hidden"
                >
                  {"}}"}
                </Badge>

                {/* Mobile-only action buttons aligned to the right */}
                <div className="ml-auto flex items-center gap-1 md:hidden">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      dupVar(v.id)
                    }}
                  >
                    <CopyPlus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      delVar(v.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Equals sign - hidden on mobile, visible on desktop */}
              <span className="hidden font-mono text-sm text-muted-foreground/50 select-none md:inline">
                =
              </span>

              {/* Bottom row on mobile: Value input and desktop copy/delete buttons */}
              <div className="flex w-full items-center gap-1.5 md:flex-1">
                <span className="mr-1 font-mono text-xs font-bold text-muted-foreground/60 select-none md:hidden">
                  =
                </span>
                <Input
                  ref={i === variables.length - 1 ? lastVarInputRef : undefined}
                  value={v.value}
                  onChange={(e) => {
                    setVarV(v.id, e.target.value)
                  }}
                  placeholder="치환될 텍스트"
                  className="h-8 flex-1 text-sm"
                  onKeyDown={(e) => {
                    handleVarKeyDown(e, i)
                  }}
                />
                <QuickTestPopover
                  factorType="variable"
                  factorName={v.name}
                  factorValue={v.value}
                  activeQueue={activeQueue}
                  favoriteCombinations={favoriteCombinations}
                  onRunTest={handleRunTestFromPopover}
                  onToggleFavorite={toggleFavorite}
                />

                {/* Desktop Copy/Delete buttons */}
                <div className="hidden shrink-0 items-center gap-1 md:flex">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                        onClick={() => {
                          dupVar(v.id)
                        }}
                      >
                        <CopyPlus className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>복제</TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    onClick={() => {
                      delVar(v.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {variables.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={addVar}
          className="h-8 w-full gap-1.5 border border-dashed text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          변수 추가
        </Button>
      )}
    </div>
  )

  const axesSection = (
    <div className="space-y-3">
      {axes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-xs text-muted-foreground">
            축을 추가하면 값들이 모든 조합을 생성합니다.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={addAxis}
            className="mt-3 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />첫 축 추가
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {axes.map((axis, ai) => {
            const isExpanded = expandedAxes.has(axis.id)
            const showAdvanced = showAxisAdvanced.has(axis.id)
            return (
              <div
                key={axis.id}
                className={`rounded-lg border transition-all ${isExpanded ? "border-primary/20 bg-primary/[0.02]" : "border-border"}`}
              >
                {/* Axis header */}
                <div
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none"
                  onClick={() => {
                    toggleAxisExpand(axis.id)
                  }}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                  />
                  <Badge className="h-5 items-center justify-center rounded px-1.5 text-[10px] font-bold">
                    A{String(ai + 1)}
                  </Badge>
                  <Input
                    value={axis.name}
                    onChange={(e) => {
                      setAxN(axis.id, e.target.value)
                    }}
                    placeholder="축 이름 (예: emotion)"
                    className="h-7 flex-1 border-0 bg-transparent px-1 font-mono text-sm font-semibold shadow-none focus-visible:ring-1"
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  />
                  <Badge variant="secondary" className="shrink-0 text-[9px]">
                    {axis.entries.length}값
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          delAxis(axis.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>축 삭제</TooltipContent>
                  </Tooltip>
                </div>

                {/* Axis body (collapsible) */}
                {isExpanded && (
                  <div className="space-y-2 border-t px-3 pt-2 pb-3">
                    {/* Advanced: include */}
                    {showAdvanced && (
                      <div className="mb-2 flex items-center gap-2">
                        <Label className="shrink-0 text-[11px] text-muted-foreground">
                          include
                        </Label>
                        <Input
                          value={axis.include}
                          onChange={(e) => {
                            setAxI(axis.id, e.target.value)
                          }}
                          placeholder="접미사 (예: _detail)"
                          className="h-7 text-xs"
                        />
                      </div>
                    )}
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-muted-foreground">
                          값
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            toggleAxisAdvanced(axis.id)
                          }}
                        >
                          <Settings2 className="h-3 w-3" />
                          {showAdvanced ? "고급 숨기기" : "고급"}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          addEntry(axis.id)
                        }}
                        className="h-6 gap-1 text-[11px] text-primary"
                      >
                        <Plus className="h-3 w-3" />값 추가
                      </Button>
                    </div>

                    {axis.entries.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted-foreground/50 italic">
                        값을 추가하세요
                      </p>
                    )}
                    {axis.entries.map((entry, ei) => (
                      <div
                        key={entry.id}
                        className="overflow-hidden rounded-md border"
                      >
                        <div className="flex items-center gap-1.5 px-2 py-1.5">
                          <Input
                            value={entry.key}
                            onChange={(e) => {
                              setEKey(axis.id, entry.id, e.target.value)
                            }}
                            placeholder="키"
                            className="h-7 w-20 shrink-0 font-mono text-xs"
                            onKeyDown={(e) => {
                              handleEntryKeyDown(
                                e,
                                axis.id,
                                ei,
                                axis.entries.length
                              )
                            }}
                          />
                          {entry.fileKey.trim() !== "" ||
                          entry.key.trim() !== "" ? (
                            <>
                              <span className="font-mono text-[10px] text-muted-foreground/40 select-none">
                                as
                              </span>
                              <Input
                                value={entry.fileKey}
                                onChange={(e) => {
                                  setEFileKey(axis.id, entry.id, e.target.value)
                                }}
                                placeholder="파일키"
                                className="h-7 w-20 shrink-0 font-mono text-xs"
                              />
                            </>
                          ) : null}
                          <span className="font-mono text-xs text-muted-foreground/40 select-none">
                            :
                          </span>
                          {!entry.isComplex ? (
                            <Input
                              ref={
                                ei === axis.entries.length - 1
                                  ? lastEntryInputRef
                                  : undefined
                              }
                              value={entry.value}
                              onChange={(e) => {
                                setEVal(axis.id, entry.id, e.target.value)
                              }}
                              placeholder="값"
                              className="h-7 flex-1 text-xs"
                              onKeyDown={(e) => {
                                handleEntryKeyDown(
                                  e,
                                  axis.id,
                                  ei,
                                  axis.entries.length
                                )
                              }}
                            />
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-7 gap-1 px-2 text-[11px] font-normal"
                            >
                              <Braces className="h-3 w-3 text-primary/60" />
                              {entry.properties.length} 속성
                            </Badge>
                          )}
                          <Button
                            variant={entry.isComplex ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => {
                              toggleCplx(axis.id, entry.id)
                            }}
                            className="h-6 shrink-0 gap-0.5 px-1.5 text-[10px]"
                          >
                            <Braces className="h-3 w-3" />
                            {entry.isComplex ? "복합" : "단순"}
                          </Button>
                          <QuickTestPopover
                            factorType="axis"
                            factorName={axis.name}
                            factorValue={entry.key}
                            activeQueue={activeQueue}
                            favoriteCombinations={favoriteCombinations}
                            onRunTest={handleRunTestFromPopover}
                            onToggleFavorite={toggleFavorite}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              delEntry(axis.id, entry.id)
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        {entry.isComplex && (
                          <div className="space-y-1.5 border-t bg-muted/30 px-3 py-2">
                            <div className="mb-0.5 flex items-center justify-between">
                              <Label className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                                속성
                              </Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  addProp(axis.id, entry.id)
                                }}
                                className="h-5 gap-0.5 text-[10px] text-primary"
                              >
                                <Plus className="h-2.5 w-2.5" />
                                추가
                              </Button>
                            </div>
                            {entry.properties.map((prop) => (
                              <div
                                key={prop.id}
                                className="flex items-center gap-1.5"
                              >
                                <Input
                                  value={prop.name}
                                  onChange={(e) => {
                                    setPropN(
                                      axis.id,
                                      entry.id,
                                      prop.id,
                                      e.target.value
                                    )
                                  }}
                                  placeholder="속성명"
                                  className="h-6 w-24 rounded-md font-mono text-xs"
                                />
                                <Input
                                  value={prop.value}
                                  onChange={(e) => {
                                    setPropV(
                                      axis.id,
                                      entry.id,
                                      prop.id,
                                      e.target.value
                                    )
                                  }}
                                  placeholder="속성값"
                                  className="h-6 flex-1 rounded-md text-xs"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    delProp(axis.id, entry.id, prop.id)
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                            {entry.properties.length === 0 && (
                              <p className="text-[10px] text-muted-foreground/50 italic">
                                속성을 추가해 주세요.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="mt-1 flex gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              dupAxis(axis.id)
                            }}
                            className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            <CopyPlus className="h-3 w-3" />축 복제
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>이 축을 복제합니다</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {axes.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={addAxis}
          className="h-8 w-full gap-1.5 border border-dashed text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />축 추가
        </Button>
      )}
    </div>
  )

  const combinesSection = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold">조합 방식</h4>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                {"{{combine ...}}"}
              </code>{" "}
              축 간 연산 관계
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addCombine}
            className="h-7 gap-1.5 text-xs"
          >
            <Plus className="h-3 w-3" />
            추가
          </Button>
        </div>
        {combines.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground/50">
            조합 규칙이 없습니다
          </p>
        ) : (
          <div className="space-y-1.5">
            {combines.map((c, i) => (
              <div key={c.id} className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="h-7 w-7 shrink-0 items-center justify-center rounded-md p-0 text-[10px] font-bold tabular-nums"
                >
                  {i + 1}
                </Badge>
                <Input
                  ref={(el) => {
                    combineInputRefs.current[c.id] = el
                  }}
                  value={c.expression}
                  onChange={(e) => {
                    setCombExpr(c.id, e.target.value)
                  }}
                  placeholder="예: character * emotion * pose"
                  className="h-8 flex-1 font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    delCombine(c.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <AxisBadgeButtons
          axisNames={axisNames}
          onInsert={(text: string): void => {
            const target = combines.find((c) => c.expression.trim() === "")
            if (target !== undefined) {
              setCombExpr(target.id, text)
            } else if (combines.length > 0) {
              insertToCombine(combines[combines.length - 1]?.id ?? "", text)
            }
          }}
        />
        {combines.length > 0 && axisNames.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-0.5 text-[10px] text-muted-foreground"
              onClick={(): void => {
                const target =
                  combines.find((c) => c.expression.trim() === "") ??
                  combines[combines.length - 1]
                if (target !== undefined) insertToCombine(target.id, " * ")
              }}
            >
              <Badge
                variant="secondary"
                className="mr-0.5 font-mono text-[10px]"
              >
                ×
              </Badge>
              곱연산 삽입
            </Button>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold">제외 규칙</h4>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                {"{{exclude ...}}"}
              </code>{" "}
              특정 조합 배제
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addExclude}
            className="h-7 gap-1.5 border-destructive/20 text-xs text-destructive hover:bg-destructive/5"
          >
            <Plus className="h-3 w-3" />
            추가
          </Button>
        </div>
        {excludes.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground/50">
            제외 규칙이 없습니다
          </p>
        ) : (
          <div className="space-y-1.5">
            {excludes.map((ex, i) => (
              <div key={ex.id} className="flex items-center gap-1.5">
                <Badge
                  variant="destructive"
                  className="h-7 w-7 shrink-0 items-center justify-center rounded-md p-0 text-[10px] font-bold tabular-nums"
                >
                  {i + 1}
                </Badge>
                <Input
                  ref={(el) => {
                    excludeInputRefs.current[ex.id] = el
                  }}
                  value={ex.statement}
                  onChange={(e) => {
                    setExclStmt(ex.id, e.target.value)
                  }}
                  placeholder="예: emotion = sad AND pose = smiling"
                  className="h-8 flex-1 font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    delExclude(ex.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <AxisBadgeButtons
          axisNames={axisNames}
          onInsert={(text: string): void => {
            const target = excludes.find((e) => e.statement.trim() === "")
            if (target !== undefined) {
              setExclStmt(target.id, text)
            } else if (excludes.length > 0) {
              insertToExclude(excludes[excludes.length - 1]?.id ?? "", text)
            }
          }}
        />
        {excludes.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-0.5 text-[10px] text-muted-foreground"
              onClick={(): void => {
                const target =
                  excludes.find((e) => e.statement.trim() === "") ??
                  excludes[excludes.length - 1]
                if (target !== undefined) insertToExclude(target.id, " AND ")
              }}
            >
              <Badge
                variant="secondary"
                className="mr-0.5 font-mono text-[10px]"
              >
                AND
              </Badge>
              조건 결합
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-0.5 text-[10px] text-muted-foreground"
              onClick={(): void => {
                const target =
                  excludes.find((e) => e.statement.trim() === "") ??
                  excludes[excludes.length - 1]
                if (target !== undefined) insertToExclude(target.id, " OR ")
              }}
            >
              <Badge
                variant="secondary"
                className="mr-0.5 font-mono text-[10px]"
              >
                OR
              </Badge>
              조건 분기
            </Button>
          </div>
        )}
      </div>

      <div className="group/guide flex items-start gap-2.5 rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.02] to-primary/[0.01] p-3 transition-all duration-300 hover:border-primary/20 hover:bg-primary/[0.03]">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse text-primary/50" />
        <div className="flex-1 space-y-1.5 text-[11px] text-muted-foreground">
          <p className="text-xs font-semibold text-foreground">문법 가이드</p>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-lg border border-primary/5 bg-background/40 p-1.5 transition-colors duration-200 hover:bg-background/80">
              <Badge
                variant="secondary"
                className="h-4 shrink-0 border border-primary/10 bg-primary/5 px-1 font-mono text-[9px] font-bold text-primary shadow-none"
              >
                *
              </Badge>
              <span className="font-medium text-foreground/80">
                곱연산 (Cartesian product)
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-primary/5 bg-background/40 p-1.5 transition-colors duration-200 hover:bg-background/80">
              <Badge
                variant="secondary"
                className="h-4 shrink-0 border border-primary/10 bg-primary/5 px-1.5 font-mono text-[9px] font-bold text-primary shadow-none"
              >
                exclude
              </Badge>
              <span className="font-medium text-foreground/80">
                특정 조합 배제
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const templatesSection = (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-1.5 text-xs font-semibold">
          <FileCode2 className="h-3.5 w-3.5 text-primary/60" />
          프롬프트 템플릿
        </Label>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
            {"{{template}}"}
          </code>{" "}
          블록 — 조합된 값으로 치환됩니다
        </p>
        <Textarea
          ref={templateTextareaRef}
          value={templateBody}
          onChange={(e) => {
            setTemplateBody(e.target.value)
          }}
          placeholder={"1girl, {{character}}, {{emotion}}, {{pose}}..."}
          rows={6}
          className="mt-1.5 resize-y font-mono text-sm leading-relaxed"
        />
      </div>
      <div>
        <Label className="flex items-center gap-1.5 text-xs font-semibold">
          <Hash className="h-3.5 w-3.5 text-primary/60" />
          파일명 템플릿
        </Label>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
            {"{{filename}}"}
          </code>{" "}
          블록
        </p>
        <Input
          ref={filenameInputRef}
          value={filenameBody}
          onChange={(e) => {
            setFilenameBody(e.target.value)
          }}
          placeholder="img_{{character.key}}_{{emotion.key}}"
          className="mt-1.5 h-9 font-mono text-sm"
        />
        <div className="mt-2.5 flex items-center justify-between rounded-lg border border-primary/5 bg-primary/[0.01] p-2">
          <div className="space-y-0.5">
            <Label
              htmlFor="clean-filename"
              className="cursor-pointer text-[11px] leading-none font-medium"
            >
              파일명 자동 정규화
            </Label>
            <p className="text-[9px] text-muted-foreground">
              생략된 축으로 인해 발생하는 중복 구분자(__) 자동 제거
            </p>
          </div>
          <Switch
            id="clean-filename"
            checked={cleanFilename}
            onCheckedChange={setCleanFilename}
          />
        </div>
      </div>
      <VarBadgeButtons
        variables={variables}
        axes={axes}
        onInsertVar={(name: string): void => {
          insertToTemplate(`{{${name}}}`)
        }}
        onInsertAxisKey={(name: string): void => {
          insertToTemplate(`{{${name}.key}}`)
        }}
      />
    </div>
  )

  // ── Shared: Results content ────────────────────────────────────
  const resultsContent = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
        <Eye className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[10px] font-medium text-muted-foreground">
          결과
        </span>
        {activeQueue.length > 0 && (
          <Badge variant="secondary" className="text-[9px]">
            {filtered.length}/{activeQueue.length}
          </Badge>
        )}
      </div>
      {activeTestItem !== null && (
        <div className="shrink-0 border-b bg-primary/[0.03] px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-[11px] font-bold text-foreground">
                테스트
              </span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {substitute(activeTestItem.filename, activeTestItem)}
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-[10px]"
              onClick={() => {
                runTestItem(activeTestItem)
              }}
            >
              <Sparkles className="h-3 w-3" />
              다시 생성
            </Button>
          </div>
          {Object.keys(activeTestItem.meta).length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {Object.entries(activeTestItem.meta).map(([mk, mv]) => (
                <Badge
                  key={mk}
                  variant="outline"
                  className="bg-background/70 text-[9px] font-normal"
                >
                  {mk}: {mv}
                </Badge>
              ))}
            </div>
          )}
          {recentTestItems.length > 1 && (
            <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
              {recentTestItems.map((item, idx) => {
                const k = itemKey(item)
                const selected = k === activeTestItemKey
                return (
                  <Button
                    key={k}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    className="h-6 shrink-0 px-2 text-[10px]"
                    onClick={() => {
                      setActiveTestItemKey(k)
                      setExpandedItemKey(k)
                    }}
                  >
                    {idx + 1}
                  </Button>
                )
              })}
            </div>
          )}
          <InlineImagePreview
            filename={substitute(activeTestItem.filename, activeTestItem)}
            backendUrl={backendUrl}
            showCurationActions
            onRegenerate={() => {
              runTestItem(activeTestItem)
            }}
          />
        </div>
      )}
      {parserError === null && activeQueue.length > 0 && (
        <div className="shrink-0 border-b px-3 py-2">
          <div className="relative w-full">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="검색..."
              value={previewFilter}
              onChange={(e) => {
                setPreviewFilter(e.target.value)
              }}
              className="h-8 pl-9 text-xs"
            />
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse space-y-2 rounded-lg border p-4"
              >
                <div className="h-3 w-2/3 rounded bg-muted/50" />
                <div className="flex gap-2">
                  <div className="h-4 w-12 rounded bg-muted/40" />
                  <div className="h-4 w-16 rounded bg-muted/40" />
                </div>
                <div className="h-10 w-full rounded bg-muted/30" />
              </div>
            ))}
          </div>
        ) : parserError !== null ? (
          <div className="flex h-full items-center justify-center p-4">
            <Card className="w-full border-destructive/20 shadow-none">
              <CardContent className="flex items-start gap-3 p-5">
                <div className="shrink-0 rounded-lg bg-destructive/10 p-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h3 className="text-xs font-bold text-destructive">
                    파싱 에러
                  </h3>
                  <CardDescription className="text-[11px]">
                    문법 오류로 조합 목록을 생성할 수 없습니다.
                  </CardDescription>
                  <div className="mt-2 max-h-36 overflow-auto rounded-md border border-destructive/10 bg-background p-2.5 font-mono text-[10px] break-all whitespace-pre-wrap text-destructive/80">
                    {parserError}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : activeQueue.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <Card className="w-full max-w-sm border-dashed shadow-none">
              <CardContent className="flex flex-col items-center gap-2 py-10">
                <div className="rounded-xl bg-muted/60 p-3">
                  <Sparkles className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-xs font-semibold text-muted-foreground">
                  결과 없음
                </p>
                <p className="text-center text-[10px] text-muted-foreground/50">
                  템플릿을 편집하면 결과가 여기에 표시됩니다.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">검색 결과 없음</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-1.5 p-3">
              {filtered.map((item: RenderItem, idx: number) => {
                const fn = substitute(item.filename, item)
                const pr = substitute(item.prompt, item)
                const k = itemKey(item)
                const isExpanded = expandedItemKey === k
                return (
                  <div
                    key={`r-${k}-${String(idx)}`}
                    className={`cursor-pointer space-y-1 rounded-lg border p-2.5 transition-colors hover:bg-muted/30 ${isExpanded ? "border-primary/20 bg-primary/[0.02]" : ""}`}
                    onClick={() => {
                      setExpandedItemKey(isExpanded ? null : k)
                    }}
                  >
                    {/* Summary view */}
                    <div className="flex items-start gap-1.5">
                      <span className="flex-1 font-mono text-[11px] leading-tight font-semibold break-all select-all">
                        {fn}
                      </span>
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[9px]"
                      >
                        {idx + 1}
                      </Badge>
                    </div>
                    {Object.keys(item.meta).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(item.meta).map(([mk, mv]) => (
                          <Badge
                            key={mk}
                            variant="outline"
                            className="text-[9px] font-normal"
                          >
                            {mk}: {mv}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {!isExpanded && (
                      <div className="rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed break-words text-muted-foreground select-all">
                        {pr}
                      </div>
                    )}
                    {/* Expanded detail view */}
                    {isExpanded && (
                      <div className="mt-2 space-y-2 border-t border-dashed border-primary/10 pt-2">
                        {/* Set variables */}
                        {Object.keys(renderSets).length > 0 && (
                          <div>
                            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                              <Sliders className="h-3 w-3" />
                              Set 변수
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(renderSets).map(([sk, sv]) => (
                                <Badge
                                  key={sk}
                                  variant="secondary"
                                  className="font-mono text-[9px]"
                                >
                                  {sk}: {sv}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Axis combination details */}
                        {Object.keys(item.meta).length > 0 && (
                          <div>
                            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                              <Layers className="h-3 w-3" />축 조합
                            </div>
                            <div className="grid grid-cols-1 gap-1">
                              {Object.entries(item.meta).map(
                                ([axisName, key]) => {
                                  const axisInfo = renderAxes[axisName]
                                  const matched = axisInfo?.values.find(
                                    (v) => v.key === key
                                  )
                                  const value = matched?.value ?? ""
                                  const props = matched?.props ?? {}
                                  const include = axisInfo?.include
                                  return (
                                    <div
                                      key={axisName}
                                      className="flex items-start gap-2 rounded-md bg-muted/30 p-1.5 text-[10px]"
                                    >
                                      <Badge
                                        variant="outline"
                                        className="shrink-0 text-[9px] font-semibold"
                                      >
                                        {axisName}
                                      </Badge>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1">
                                          <Badge
                                            variant="secondary"
                                            className="font-mono text-[9px]"
                                          >
                                            {key}
                                          </Badge>
                                          {value !== "" && (
                                            <span className="text-muted-foreground">
                                              {value}
                                            </span>
                                          )}
                                          {include !== undefined && (
                                            <Badge
                                              variant="outline"
                                              className="text-[8px]"
                                            >
                                              include: {include}
                                            </Badge>
                                          )}
                                        </div>
                                        {Object.keys(props).length > 0 && (
                                          <div className="mt-0.5 flex flex-wrap gap-0.5">
                                            {Object.entries(props).map(
                                              ([pk, pv]) => (
                                                <span
                                                  key={pk}
                                                  className="rounded border bg-background px-1 text-[9px] text-muted-foreground"
                                                >
                                                  {pk}: {pv}
                                                </span>
                                              )
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                }
                              )}
                            </div>
                          </div>
                        )}
                        {/* Original templates */}
                        <div>
                          <div className="mb-1 text-[10px] font-semibold text-muted-foreground">
                            원본 템플릿
                          </div>
                          <div className="space-y-1.5">
                            <div>
                              <div className="mb-0.5 font-mono text-[9px] text-muted-foreground">
                                filename
                              </div>
                              <div className="rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed break-words text-muted-foreground select-all">
                                {filenameBody}
                              </div>
                            </div>
                            <div>
                              <div className="mb-0.5 font-mono text-[9px] text-muted-foreground">
                                template
                              </div>
                              <div className="rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground select-all">
                                {templateBody}
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Final result */}
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <div className="text-[10px] font-semibold text-muted-foreground">
                              최종 결과
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-yellow-500"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleFavorite(k)
                                }}
                              >
                                <Star
                                  className={`h-3 w-3 ${favoriteCombinations.has(k) ? "fill-yellow-400 text-yellow-400" : ""}`}
                                />
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-6 gap-1 text-[10px]"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  runTestItem(item)
                                }}
                              >
                                <Sparkles className="h-3 w-3" />
                                테스트 생성
                              </Button>
                            </div>
                          </div>
                          <div className="rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground select-all">
                            {pr}
                          </div>
                          <InlineImagePreview
                            filename={fn}
                            backendUrl={backendUrl}
                            showCurationActions
                            onRegenerate={() => {
                              runTestItem(item)
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )

  // ── Shared: Code preview ───────────────────────────────────────
  const codeContent = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
        <FileCode2 className="h-3 w-3 text-muted-foreground/60" />
        <span className="font-mono text-[10px] text-muted-foreground">
          {activeTemplate?.name ?? "template"}.template
        </span>
        {generatedCode !== "" && (
          <Badge variant="secondary" className="font-mono text-[9px]">
            {generatedCode.split("\n").length}L
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  void handleCopy()
                }}
                disabled={!generatedCode}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>복사</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleDownload}
                disabled={!generatedCode}
              >
                <Download className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>다운로드</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor
          language="ceg"
          value={generatedCode}
          onChange={(): void => undefined}
          minHeight="100%"
          bareWrapper
          className="h-full w-full"
        />
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════

  const emptyState = (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-sm border-dashed shadow-none">
        <CardContent className="flex flex-col items-center gap-2 py-10">
          <div className="rounded-xl bg-muted/60 p-3">
            <Pencil className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="text-xs font-semibold text-muted-foreground">
            템플릿을 선택하세요
          </p>
          <p className="text-center text-[10px] text-muted-foreground/50">
            상단 드롭다운에서 템플릿을 선택하면 편집기가 활성화됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ═══════ DESKTOP: Left Accordion + Right Code/Results ═══════ */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <ResizablePanelGroup
          autoSaveId="tg-desktop"
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          {/* LEFT: Accordion Editor */}
          <ResizablePanel
            defaultSize={55}
            minSize={35}
            className="flex flex-col overflow-hidden"
          >
            {!activeTemplate ? (
              emptyState
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4 lg:p-5">
                  <CollapsibleSection
                    value="variables"
                    open={accordionValue.has("variables")}
                    onToggle={toggleSection}
                    icon={Sliders}
                    label="변수"
                    count={variables.length}
                  >
                    {variablesSection}
                  </CollapsibleSection>
                  <CollapsibleSection
                    value="axes"
                    open={accordionValue.has("axes")}
                    onToggle={toggleSection}
                    icon={Layers}
                    label="축"
                    count={axes.length}
                  >
                    {axesSection}
                  </CollapsibleSection>
                  <CollapsibleSection
                    value="combines"
                    open={accordionValue.has("combines")}
                    onToggle={toggleSection}
                    icon={Shuffle}
                    label="규칙"
                    count={combines.length + excludes.length}
                  >
                    {combinesSection}
                  </CollapsibleSection>
                  <CollapsibleSection
                    value="templates"
                    open={accordionValue.has("templates")}
                    onToggle={toggleSection}
                    icon={MessageSquare}
                    label="출력"
                  >
                    {templatesSection}
                  </CollapsibleSection>
                </div>
              </ScrollArea>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* RIGHT: Code + Results (always visible, vertical split) */}
          <ResizablePanel
            defaultSize={45}
            minSize={25}
            className="flex flex-col overflow-hidden"
          >
            <ResizablePanelGroup
              autoSaveId="tg-right"
              orientation="vertical"
              className="min-h-0 flex-1"
            >
              <ResizablePanel
                defaultSize={55}
                minSize={20}
                className="flex flex-col overflow-hidden"
              >
                {codeContent}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                defaultSize={45}
                minSize={15}
                className="flex flex-col overflow-hidden"
              >
                {resultsContent}
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* ═══════ MOBILE: Accordion + Code+Results tabs ═══════ */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
        <Tabs
          value={mobileTab}
          onValueChange={(v) => {
            setMobileTab(v)
            saveString(STORAGE_KEYS.mobileTab, v)
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b px-3">
            <TabsList className="w-full">
              <TabsTrigger value="edit" className="gap-1 text-xs">
                <Sliders className="h-3 w-3" />
                편집
              </TabsTrigger>
              <TabsTrigger value="code" className="gap-1 text-xs">
                <FileCode2 className="h-3 w-3" />
                코드
              </TabsTrigger>
              <TabsTrigger value="results" className="gap-1 text-xs">
                <Eye className="h-3 w-3" />
                결과
                {activeQueue.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 px-1 py-0 text-[9px]"
                  >
                    {activeQueue.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="edit"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {!activeTemplate ? (
              emptyState
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4">
                  <CollapsibleSection
                    value="variables"
                    open={accordionValue.has("variables")}
                    onToggle={toggleSection}
                    icon={Sliders}
                    label="변수"
                    count={variables.length}
                  >
                    {variablesSection}
                  </CollapsibleSection>
                  <CollapsibleSection
                    value="axes"
                    open={accordionValue.has("axes")}
                    onToggle={toggleSection}
                    icon={Layers}
                    label="축"
                    count={axes.length}
                  >
                    {axesSection}
                  </CollapsibleSection>
                  <CollapsibleSection
                    value="combines"
                    open={accordionValue.has("combines")}
                    onToggle={toggleSection}
                    icon={Shuffle}
                    label="규칙"
                    count={combines.length + excludes.length}
                  >
                    {combinesSection}
                  </CollapsibleSection>
                  <CollapsibleSection
                    value="templates"
                    open={accordionValue.has("templates")}
                    onToggle={toggleSection}
                    icon={MessageSquare}
                    label="출력"
                  >
                    {templatesSection}
                  </CollapsibleSection>
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent
            value="code"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {codeContent}
          </TabsContent>
          <TabsContent
            value="results"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {resultsContent}
          </TabsContent>
        </Tabs>
      </div>

      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 p-6 backdrop-blur-md">
          <div className="flex h-full max-h-[300px] w-full max-w-lg animate-in flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.02] p-8 text-center duration-200 zoom-in-95 fade-in">
            <div className="mb-4 animate-bounce rounded-2xl bg-primary/10 p-4 text-primary">
              <Upload className="h-10 w-10" />
            </div>
            <h3 className="mb-1 text-sm font-bold text-foreground">
              여기에 파일 놓기
            </h3>
            <p className="max-w-[280px] text-xs text-muted-foreground">
              *.ceg 또는 *.template 파일을 드롭하여 템플릿 편집기를 즉시
              불러옵니다
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
