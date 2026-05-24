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
} from "lucide-react"
import { toast } from "sonner"

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

import {
  Card,
  CardContent,
  CardDescription,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import CodeEditor from "@/components/CodeEditor"
import { useTemplateContext } from "../contexts/TemplateContext"
import type { RenderItem, RenderItemsResponse } from "../types/renderTypes"
import { API, HEADERS } from "@/lib/api"
import { CEG_TEMPLATE_DEBOUNCE_MS } from "@/lib/constants"
import { itemKey } from "../../lib/workflowUtils"

// ── Types ─────────────────────────────────────────────────────────────

interface VisualVariable { id: string; name: string; value: string }
interface AxisEntryProperty { id: string; name: string; value: string }
interface VisualAxisEntry { id: string; key: string; value: string; properties: AxisEntryProperty[]; isComplex: boolean }
interface VisualAxis { id: string; name: string; include: string; entries: VisualAxisEntry[] }
interface VisualCombine { id: string; expression: string }
interface VisualExclude { id: string; statement: string }
interface TemplateItem { id: string; name: string; category: string; code: string; savedAt?: number }

// ── localStorage helpers ─────────────────────────────────────────────

const STORAGE_KEYS = {
  accordionSections: "tg-accordion-sections",
  expandedAxes: "tg-expanded-axes",
  axisAdvanced: "tg-axis-advanced",
  mobileTab: "tg-mobile-tab",
} as const

function loadSet(key: string): Set<string> {
  try { const raw = localStorage.getItem(key); if (raw) return new Set(JSON.parse(raw) as string[]) } catch { /* ignore */ }
  return new Set()
}
function saveSet(key: string, value: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...value])) } catch { /* ignore */ }
}
function loadString(key: string, fallback: string): string {
  try { const raw = localStorage.getItem(key); if (raw) return raw } catch { /* ignore */ }
  return fallback
}
function saveString(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

// ── Collapsible Section ────────────────────────────────────────────────

function CollapsibleSection({ value, open, onToggle, icon, label, count, children }: {
  value: string
  open: boolean
  onToggle: (value: string) => void
  icon: React.ElementType
  label: string
  count?: number
  children: React.ReactNode
}) {
  const Icon = icon
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      setHeight(0)
      return
    }
    const el = contentRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setHeight(el.scrollHeight)
    })
    observer.observe(el)
    setHeight(el.scrollHeight)
    return () => observer.disconnect()
  }, [open])

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(value)}
        className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-muted/30 transition-colors rounded-md px-1"
        aria-expanded={open}
      >
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold">{label}</span>
        {count !== undefined && count > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">{count}</Badge>}
      </button>
      <div
        className="overflow-hidden transition-[height] duration-200 ease-in-out"
        style={{ height: open ? height ?? "auto" : 0 }}
      >
        <div ref={contentRef} className="pb-3">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Parser ────────────────────────────────────────────────────────────

function parseCegTemplate(code: string) {
  const variables: VisualVariable[] = []; const axes: VisualAxis[] = []; const combines: VisualCombine[] = []; const excludes: VisualExclude[] = []; let templateBody = ""; let filenameBody = ""; let cleanFilename = true
  if (!code) return { variables, axes, combines, excludes, templateBody, filenameBody, cleanFilename }
  let match: RegExpExecArray | null
  const setRe = /\{\{\s*set\s+([a-zA-Z_-][a-zA-Z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*\}\}/g; let vi = 0
  while ((match = setRe.exec(code)) !== null) {
    const name = match[1] || ""
    const val = match[2] || ""
    if (name === "clean_filename") {
      cleanFilename = val.toLowerCase() === "true"
    } else {
      variables.push({ id: `var-${vi++}`, name, value: val })
    }
  }
  const axRe = /\{\{\s*axis\s+([a-zA-Z_-][a-zA-Z0-9_-]*)(?:\s+include="((?:[^"\\]|\\.)*)")?\s*\}\}([\s\S]*?)\{\{\s*\/axis\s*\}\}/gi; let ai = 0
  while ((match = axRe.exec(code)) !== null) {
    const entries: VisualAxisEntry[] = []; let ei = 0
    for (const line of (match[3] || "").split("\n")) {
      const t = line.trim(); if (!t || t.startsWith("#") || t.startsWith("//")) continue
      const s = t.match(/^([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:\s*"((?:[^"\\]|\\.)*)"$/)
      if (s) { entries.push({ id: `e-${ai}-${ei++}`, key: s[1] || "", value: s[2] || "", properties: [], isComplex: false }); continue }
      const c = t.match(/^([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:\s*\{\s*([^{}]+)\s*\}$/)
      if (c) {
        const props: AxisEntryProperty[] = []; const pr = /([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:\s*"((?:[^"\\]|\\.)*)"/g; let pm, pi = 0
        while ((pm = pr.exec(c[2] || "")) !== null) props.push({ id: `p-${ai}-${ei}-${pi++}`, name: pm[1] || "", value: pm[2] || "" })
        entries.push({ id: `e-${ai}-${ei++}`, key: c[1] || "", value: "", properties: props, isComplex: true })
      }
    }
    axes.push({ id: `a-${ai++}`, name: match[1] || "", include: match[2] || "", entries })
  }
  const cbRe = /\{\{\s*combine\s+([^\}]+)\s*\}\}/g; let ci = 0
  while ((match = cbRe.exec(code)) !== null) { const e = (match[1] || "").trim(); if (!e.startsWith("/")) combines.push({ id: `c-${ci++}`, expression: e }) }
  const exRe = /\{\{\s*exclude\s+([^\}]+)\s*\}\}/g; let xi = 0
  while ((match = exRe.exec(code)) !== null) excludes.push({ id: `ex-${xi++}`, statement: (match[1] || "").trim() })
  const tm = /\{\{\s*template\s*\}\}([\s\S]*?)\{\{\s*\/template\s*\}\}/i.exec(code); if (tm) templateBody = tm[1] || ""
  const fn = /\{\{\s*filename\s*\}\}([\s\S]*?)\{\{\s*\/filename\s*\}\}/i.exec(code); if (fn) filenameBody = fn[1] || ""
  return { variables, axes, combines, excludes, templateBody, filenameBody, cleanFilename }
}

// ── Helpers ───────────────────────────────────────────────────────────

const DUPLICATE_VAR = (v: VisualVariable): VisualVariable => ({ id: `v-${Date.now()}`, name: v.name + "_copy", value: v.value })
const DUPLICATE_AXIS = (a: VisualAxis): VisualAxis => ({ id: `a-${Date.now()}`, name: a.name + "_copy", include: a.include, entries: a.entries.map((e) => ({ ...e, id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, properties: e.properties.map((p) => ({ ...p, id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })) })) })

// ── Sub-components ─────────────────────────────────────────────────────

function AxisBadgeButtons({ axisNames, onInsert }: { axisNames: string[]; onInsert: (text: string) => void }) {
  if (axisNames.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      <span className="text-[10px] text-muted-foreground mr-1 self-center">축:</span>
      {axisNames.map((n) => (
        <Badge
          key={n}
          variant="secondary"
          className="cursor-pointer font-mono text-[10px] hover:bg-primary/10 transition-colors"
          onClick={() => onInsert(n)}
        >
          {n}
        </Badge>
      ))}
    </div>
  )
}

function VarBadgeButtons({ variables, axes, onInsertVar, onInsertAxisKey }: { variables: VisualVariable[]; axes: VisualAxis[]; onInsertVar: (name: string) => void; onInsertAxisKey: (name: string) => void }) {
  if (variables.length === 0 && axes.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {variables.map((v) => v.name.trim()).filter(Boolean).map((n) => (
        <Badge key={`v-${n}`} variant="secondary" className="cursor-pointer font-mono text-[10px] hover:bg-primary/10 transition-colors" onClick={() => onInsertVar(n)}>
          {"{{" + n + "}}"}
        </Badge>
      ))}
      {axes.map((a) => a.name.trim()).filter(Boolean).map((n) => (
        <span key={`a-${n}`} className="inline-flex gap-0.5">
          <Badge variant="default" className="cursor-pointer font-mono text-[10px] hover:bg-primary/80 transition-colors" onClick={() => onInsertVar(n)}>
            {"{{" + n + "}}"}
          </Badge>
          <Badge variant="outline" className="cursor-pointer font-mono text-[10px] text-primary border-primary/20 hover:bg-primary/5 transition-colors" onClick={() => onInsertAxisKey(n)}>
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
  backendUrl = "http://localhost:8000",
}: {
  setActiveTab: (t: "jobs" | "stats" | "gallery" | "curation" | "generator" | "settings") => void
  backendUrl?: string
}) {
  const { savedTemplates, setCegTemplate, saveTemplate, setTemplateResetKey, setGeneratorToolbarProps } = useTemplateContext()
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [variables, setVariables] = useState<VisualVariable[]>([])
  const [cleanFilename, setCleanFilename] = useState<boolean>(true)
  const [axes, setAxes] = useState<VisualAxis[]>([])
  const [combines, setCombines] = useState<VisualCombine[]>([])
  const [excludes, setExcludes] = useState<VisualExclude[]>([])
  const [templateBody, setTemplateBody] = useState("")
  const [filenameBody, setFilenameBody] = useState("")
  const [saveName, setSaveName] = useState("")
  const [copied, setCopied] = useState(false)
  const [systemTemplates, setSystemTemplates] = useState<TemplateItem[]>([])
  const [prevActiveTemplateId, setPrevActiveTemplateId] = useState<string | null>(null)
  const [accordionValue, setAccordionValue] = useState<Set<string>>(() => { const s = loadSet(STORAGE_KEYS.accordionSections); return s.size > 0 ? s : new Set(["axes"]) })
  const [mobileTab, setMobileTab] = useState(() => loadString(STORAGE_KEYS.mobileTab, "edit"))
  const [parserError, setParserError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [previewFilter, setPreviewFilter] = useState("")
  const [expandedAxes, setExpandedAxes] = useState<Set<string>>(() => loadSet(STORAGE_KEYS.expandedAxes))
  const [showAxisAdvanced, setShowAxisAdvanced] = useState<Set<string>>(() => loadSet(STORAGE_KEYS.axisAdvanced))

  const lastVarInputRef = useRef<HTMLInputElement | null>(null)
  const lastEntryInputRef = useRef<HTMLInputElement | null>(null)
  const combineInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const excludeInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const templateTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const filenameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let a = true
    fetch(`${backendUrl}/templates`).then((r) => (r.ok ? r.json() : [])).then((d) => { if (a && Array.isArray(d) && d.length > 0) setSystemTemplates(d) }).catch(() => {})
    return () => { a = false }
  }, [backendUrl])

  const combinedTemplates = useMemo<TemplateItem[]>(() => [...savedTemplates.map((t) => ({ id: t.id, name: t.name, category: "saved", code: t.template, savedAt: t.savedAt })), ...systemTemplates], [savedTemplates, systemTemplates])
  const groupedTemplates = useMemo(() => { const g: Record<string, TemplateItem[]> = {}; for (const t of combinedTemplates) { const c = t.category || "기타"; (g[c] ??= []).push(t) } return g }, [combinedTemplates])
  const effectiveId = useMemo(() => { if (!combinedTemplates.length) return ""; if (!selectedTemplateId || !combinedTemplates.some((t) => t.id === selectedTemplateId)) return combinedTemplates[0]!.id; return selectedTemplateId }, [selectedTemplateId, combinedTemplates])
  const activeTemplate = useMemo(() => combinedTemplates.find((t) => t.id === effectiveId) || null, [combinedTemplates, effectiveId])

  const curId = activeTemplate?.id ?? null
  if (curId !== prevActiveTemplateId) {
    setPrevActiveTemplateId(curId)
    if (activeTemplate) { const p = parseCegTemplate(activeTemplate.code); setVariables(p.variables); setAxes(p.axes); setCombines(p.combines); setExcludes(p.excludes); setTemplateBody(p.templateBody); setFilenameBody(p.filenameBody); setCleanFilename(p.cleanFilename); setSaveName(`${activeTemplate.name} 커스텀`) }
    else { setVariables([]); setAxes([]); setCombines([]); setExcludes([]); setTemplateBody(""); setFilenameBody(""); setCleanFilename(true); setSaveName("") }
  }



  // Handlers
  const addVar = () => setVariables((p) => [...p, { id: `v-${Date.now()}`, name: `var_${p.length + 1}`, value: "" }])
  const setVarN = (id: string, n: string) => setVariables((p) => p.map((v) => (v.id === id ? { ...v, name: n } : v)))
  const setVarV = (id: string, n: string) => setVariables((p) => p.map((v) => (v.id === id ? { ...v, value: n } : v)))
  const delVar = (id: string) => setVariables((p) => p.filter((v) => v.id !== id))
  const dupVar = (id: string) => { const v = variables.find((x) => x.id === id); if (v) setVariables((p) => [...p, DUPLICATE_VAR(v)]) }
  const addAxis = () => { const newId = `a-${Date.now()}`; setAxes((p) => [...p, { id: newId, name: `axis_${p.length + 1}`, include: "", entries: [] }]); setExpandedAxes((s) => new Set([...s, newId])) }
  const setAxN = (id: string, n: string) => setAxes((p) => p.map((a) => (a.id === id ? { ...a, name: n } : a)))
  const setAxI = (id: string, n: string) => setAxes((p) => p.map((a) => (a.id === id ? { ...a, include: n } : a)))
  const delAxis = (id: string) => setAxes((p) => p.filter((a) => a.id !== id))
  const dupAxis = (id: string) => { const a = axes.find((x) => x.id === id); if (a) { const dup = DUPLICATE_AXIS(a); setAxes((p) => [...p, dup]); setExpandedAxes((s) => new Set([...s, dup.id])) } }
  const toggleAxisExpand = (id: string) => setExpandedAxes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); saveSet(STORAGE_KEYS.expandedAxes, n); return n })
  const toggleAxisAdvanced = (id: string) => setShowAxisAdvanced((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); saveSet(STORAGE_KEYS.axisAdvanced, n); return n })
  const addEntry = (axId: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: [...a.entries, { id: `e-${Date.now()}`, key: `val_${a.entries.length + 1}`, value: "", properties: [], isComplex: false }] }))
  const setEKey = (axId: string, eId: string, k: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: a.entries.map((e) => (e.id === eId ? { ...e, key: k } : e)) }))
  const setEVal = (axId: string, eId: string, v: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: a.entries.map((e) => (e.id === eId ? { ...e, value: v } : e)) }))
  const toggleCplx = (axId: string, eId: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: a.entries.map((e) => { if (e.id !== eId) return e; const c = !e.isComplex; return { ...e, isComplex: c, properties: c && e.properties.length === 0 ? [{ id: `p-${Date.now()}`, name: "text", value: e.value || "" }] : e.properties } }) }))
  const delEntry = (axId: string, eId: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: a.entries.filter((e) => e.id !== eId) }))
  const addProp = (axId: string, eId: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: a.entries.map((e) => e.id !== eId ? e : { ...e, properties: [...e.properties, { id: `p-${Date.now()}`, name: `prop_${e.properties.length + 1}`, value: "" }] }) }))
  const setPropN = (axId: string, eId: string, pId: string, n: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: a.entries.map((e) => e.id !== eId ? e : { ...e, properties: e.properties.map((pp) => (pp.id === pId ? { ...pp, name: n } : pp)) }) }))
  const setPropV = (axId: string, eId: string, pId: string, n: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: a.entries.map((e) => e.id !== eId ? e : { ...e, properties: e.properties.map((pp) => (pp.id === pId ? { ...pp, value: n } : pp)) }) }))
  const delProp = (axId: string, eId: string, pId: string) => setAxes((p) => p.map((a) => a.id !== axId ? a : { ...a, entries: a.entries.map((e) => e.id !== eId ? e : { ...e, properties: e.properties.filter((pp) => pp.id !== pId) }) }))
  const addCombine = () => setCombines((p) => [...p, { id: `c-${Date.now()}`, expression: "" }])
  const setCombExpr = (id: string, n: string) => setCombines((p) => p.map((c) => (c.id === id ? { ...c, expression: n } : c)))
  const delCombine = (id: string) => setCombines((p) => p.filter((c) => c.id !== id))
  const addExclude = () => setExcludes((p) => [...p, { id: `ex-${Date.now()}`, statement: "" }])
  const setExclStmt = (id: string, n: string) => setExcludes((p) => p.map((e) => (e.id === id ? { ...e, statement: n } : e)))
  const delExclude = (id: string) => setExcludes((p) => p.filter((e) => e.id !== id))

  const insertToCombine = useCallback((combineId: string, text: string) => {
    const el = combineInputRefs.current[combineId]
    if (el) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      const before = el.value.slice(0, start)
      const after = el.value.slice(end)
      const needSpace = before.length > 0 && !before.endsWith(" ") && !before.endsWith("*") ? " " : ""
      const newVal = before + needSpace + text + after
      setCombExpr(combineId, newVal)
    } else {
      setCombExpr(combineId, (combines.find((c) => c.id === combineId)?.expression ?? "") + (combines.find((c) => c.id === combineId)?.expression && !combines.find((c) => c.id === combineId)?.expression.endsWith(" ") ? " " : "") + text)
    }
  }, [combines])

  const insertToExclude = useCallback((excludeId: string, text: string) => {
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
      setExclStmt(excludeId, (excludes.find((e) => e.id === excludeId)?.statement ?? "") + text)
    }
  }, [excludes])

  const insertToTemplate = useCallback((text: string) => {
    const el = templateTextareaRef.current
    if (el) {
      const start = el.selectionStart ?? templateBody.length
      const end = el.selectionEnd ?? templateBody.length
      const newBody = templateBody.slice(0, start) + text + templateBody.slice(end)
      setTemplateBody(newBody)
    } else {
      setTemplateBody(templateBody + text)
    }
  }, [templateBody])

  const toggleSection = (key: string) => setAccordionValue((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); saveSet(STORAGE_KEYS.accordionSections, next); return next })

  const axisNames = useMemo(() => axes.map((a) => a.name.trim()).filter(Boolean), [axes])

  const generatedCode = useMemo(() => {
    let c = ""
    if (!cleanFilename) {
      c += `{{set clean_filename = "false"}}\n`
    }
    variables.forEach((v) => { if (v.name.trim()) c += `{{set ${v.name.trim()} = "${v.value}"}}\n` })
    if (!cleanFilename || variables.length) c += "\n"
    axes.forEach((a) => {
      const incStr = a.include?.trim() ? ` include="${a.include.trim()}"` : ""
      c += `{{axis ${a.name}${incStr}}}\n`
      a.entries.forEach((e) => {
        if (e.isComplex) {
          const props = e.properties.map((p) => `${p.name}: "${p.value}"`).join(", ")
          c += `  ${e.key}: { ${props} }\n`
        } else {
          c += `  ${e.key}: "${e.value}"\n`
        }
      })
      c += `{{/axis}}\n\n`
    })
    combines.forEach((cm) => { if (cm.expression.trim()) c += `{{combine ${cm.expression.trim()}}}\n` })
    if (combines.length) c += "\n"
    excludes.forEach((ex) => { if (ex.statement.trim()) c += `{{exclude ${ex.statement.trim()}}}\n` })
    if (excludes.length) c += "\n"
    if (templateBody?.trim()) c += `{{template}}\n${templateBody}\n{{/template}}\n\n`
    if (filenameBody?.trim()) c += `{{filename}}${filenameBody}{{/filename}}\n`
    return c.trim() + "\n"
  }, [variables, axes, combines, excludes, templateBody, filenameBody, cleanFilename])

  const substitute = (text: string, item: RenderItem) => { let r = text || ""; Object.entries(item.meta).forEach(([k, v]) => { r = r.split(`{{${k}}}`).join(v); r = r.split(`{${k}}`).join(v) }); r = r.split("{{input}}").join(item.prompt || ""); r = r.split("{input}").join(item.prompt || ""); return r }

  useEffect(() => {
    if (!generatedCode.trim()) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => { setIsLoading(true); setParserError(null); try { const r = await fetch(`${backendUrl}${API.render}`, { method: "POST", headers: HEADERS.json, body: JSON.stringify({ template: generatedCode }), signal: ctrl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); setFakeJobQueue(((await r.json()) as RenderItemsResponse).items) } catch (e) { if (e instanceof Error && e.name === "AbortError") return; setParserError(e instanceof Error ? e.message : String(e)) } finally { setIsLoading(false) } }, CEG_TEMPLATE_DEBOUNCE_MS)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [generatedCode, backendUrl])

  const activeQueue = useMemo(() => (generatedCode.trim() ? fakeJobQueue : []), [generatedCode, fakeJobQueue])
  const dispLoading = generatedCode.trim() ? isLoading : false
  const dispError = generatedCode.trim() ? parserError : null
  const filtered = useMemo(() => { const n = previewFilter.trim().toLowerCase(); if (!n) return activeQueue; return activeQueue.filter((i) => substitute(i.filename, i).toLowerCase().includes(n) || substitute(i.prompt, i).toLowerCase().includes(n)) }, [activeQueue, previewFilter])

  const handleApply = () => { if (!generatedCode) return; setCegTemplate(generatedCode); toast.success("작업 탭에 적용되었습니다."); setActiveTab("jobs") }
  const handleSave = () => { if (!saveName.trim()) { toast.error("저장할 이름을 입력해 주세요."); return } saveTemplate(saveName, generatedCode); setTemplateResetKey((k) => k + 1); toast.success(`'${saveName}' 저장됨`) }
  const handleCopy = async () => { try { await navigator.clipboard.writeText(generatedCode); setCopied(true); toast.success("복사됨"); setTimeout(() => setCopied(false), 2000) } catch { toast.error("복사 실패") } }
  const handleDownload = () => { const u = URL.createObjectURL(new Blob([generatedCode], { type: "text/plain;charset=utf-8" })); const a = document.createElement("a"); a.href = u; a.download = `${saveName.replace(/\s+/g, "_") || "template"}.template`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); toast.success("다운로드 완료") }

  const catLabel = (c: string) => (c === "saved" ? "내 저장" : c)

  useEffect(() => {
    if (activeTemplate) {
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
    return () => setGeneratorToolbarProps(null)
  }, [
    activeTemplate,
    generatedCode,
    saveName,
    effectiveId,
    setSelectedTemplateId,
    groupedTemplates,
    setGeneratorToolbarProps,
  ])

  const handleVarKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter" && idx === variables.length - 1) {
      e.preventDefault()
      addVar()
      setTimeout(() => lastVarInputRef.current?.focus(), 50)
    }
  }

  const handleEntryKeyDown = (e: React.KeyboardEvent, axId: string, idx: number, totalEntries: number) => {
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
          <p className="text-xs text-muted-foreground">변수를 추가하면 <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">{"{{name}}"}</code>으로 참조할 수 있습니다.</p>
          <Button variant="outline" size="sm" onClick={addVar} className="mt-3 gap-1.5"><Plus className="h-3.5 w-3.5" />첫 변수 추가</Button>
        </div>
      ) : (
        <div className="space-y-1.5">{variables.map((v, i) => (
          <div key={v.id} className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-1.5 p-2 md:p-0 rounded-lg md:rounded-none border md:border-0 bg-muted/10 md:bg-transparent group">
            {/* Top row on mobile: {{ name }} indicator and copy/delete buttons */}
            <div className="flex items-center gap-1.5 w-full md:w-auto">
              <Badge variant="outline" className="h-7 shrink-0 rounded-md px-1.5 font-mono text-[11px] text-muted-foreground/60 select-none">{"{{"}</Badge>
              <Input value={v.name} onChange={(e) => setVarN(v.id, e.target.value)} placeholder="변수명" className="h-8 flex-1 md:w-28 md:flex-initial font-mono text-sm" onKeyDown={(e) => handleVarKeyDown(e, i)} />
              <Badge variant="outline" className="h-7 shrink-0 rounded-md px-1.5 font-mono text-[11px] text-muted-foreground/60 select-none md:hidden">{"}}"}</Badge>
              
              {/* Mobile-only action buttons aligned to the right */}
              <div className="flex items-center gap-1 ml-auto md:hidden">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => dupVar(v.id)}>
                  <CopyPlus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => delVar(v.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Equals sign - hidden on mobile, visible on desktop */}
            <span className="hidden md:inline text-sm text-muted-foreground/50 select-none font-mono">=</span>

            {/* Bottom row on mobile: Value input and desktop copy/delete buttons */}
            <div className="flex items-center gap-1.5 w-full md:flex-1">
              <span className="md:hidden text-xs text-muted-foreground/60 select-none font-mono font-bold mr-1">=</span>
              <Input ref={i === variables.length - 1 ? lastVarInputRef : undefined} value={v.value} onChange={(e) => setVarV(v.id, e.target.value)} placeholder="치환될 텍스트" className="h-8 flex-1 text-sm" onKeyDown={(e) => handleVarKeyDown(e, i)} />
              
              {/* Desktop Copy/Delete buttons */}
              <div className="hidden md:flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground" onClick={() => dupVar(v.id)}>
                      <CopyPlus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>복제</TooltipContent>
                </Tooltip>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={() => delVar(v.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}</div>
      )}
      {variables.length > 0 && (
        <Button variant="ghost" size="sm" onClick={addVar} className="w-full border border-dashed text-muted-foreground hover:text-foreground gap-1.5 text-xs h-8"><Plus className="h-3 w-3" />변수 추가</Button>
      )}
    </div>
  )

  const axesSection = (
    <div className="space-y-3">
      {axes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-xs text-muted-foreground">축을 추가하면 값들이 모든 조합을 생성합니다.</p>
          <Button variant="outline" size="sm" onClick={addAxis} className="mt-3 gap-1.5"><Plus className="h-3.5 w-3.5" />첫 축 추가</Button>
        </div>
      ) : (
        <div className="space-y-2">{axes.map((axis, ai) => {
          const isExpanded = expandedAxes.has(axis.id)
          const showAdvanced = showAxisAdvanced.has(axis.id)
          return (
            <div key={axis.id} className={`rounded-lg border transition-all ${isExpanded ? "border-primary/20 bg-primary/[0.02]" : "border-border"}`}>
              {/* Axis header */}
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" onClick={() => toggleAxisExpand(axis.id)}>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                <Badge className="h-5 items-center justify-center rounded px-1.5 text-[10px] font-bold">A{ai + 1}</Badge>
                <Input value={axis.name} onChange={(e) => setAxN(axis.id, e.target.value)} placeholder="축 이름 (예: emotion)" className="h-7 flex-1 border-0 bg-transparent font-mono text-sm font-semibold shadow-none px-1 focus-visible:ring-1" onClick={(e) => e.stopPropagation()} />
                <Badge variant="secondary" className="text-[9px] shrink-0">{axis.entries.length}값</Badge>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); delAxis(axis.id) }}><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>축 삭제</TooltipContent></Tooltip>
              </div>

              {/* Axis body (collapsible) */}
              {isExpanded && (
                <div className="border-t px-3 pb-3 pt-2 space-y-2">
                  {/* Advanced: include */}
                  {showAdvanced && (
                    <div className="flex items-center gap-2 mb-2">
                      <Label className="text-[11px] text-muted-foreground shrink-0">include</Label>
                      <Input value={axis.include} onChange={(e) => setAxI(axis.id, e.target.value)} placeholder="접미사 (예: _detail)" className="h-7 text-xs" />
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground">값</Label>
                      <Button variant="ghost" size="sm" className="h-5 gap-0.5 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => toggleAxisAdvanced(axis.id)}>
                        <Settings2 className="h-3 w-3" />{showAdvanced ? "고급 숨기기" : "고급"}
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => addEntry(axis.id)} className="h-6 gap-1 text-[11px] text-primary"><Plus className="h-3 w-3" />값 추가</Button>
                  </div>

                  {axis.entries.length === 0 && <p className="text-xs text-muted-foreground/50 italic py-2 text-center">값을 추가하세요</p>}
                  {axis.entries.map((entry, ei) => (
                    <div key={entry.id} className="rounded-md border overflow-hidden">
                      <div className="flex items-center gap-1.5 px-2 py-1.5">
                        <Input value={entry.key} onChange={(e) => setEKey(axis.id, entry.id, e.target.value)} placeholder="키" className="h-7 w-20 shrink-0 font-mono text-xs" onKeyDown={(e) => handleEntryKeyDown(e, axis.id, ei, axis.entries.length)} />
                        <span className="text-xs text-muted-foreground/40 select-none font-mono">:</span>
                        {!entry.isComplex ? (
                          <Input ref={ei === axis.entries.length - 1 ? lastEntryInputRef : undefined} value={entry.value} onChange={(e) => setEVal(axis.id, entry.id, e.target.value)} placeholder="값" className="h-7 flex-1 text-xs" onKeyDown={(e) => handleEntryKeyDown(e, axis.id, ei, axis.entries.length)} />
                        ) : (
                          <Badge variant="outline" className="gap-1 h-7 px-2 text-[11px] font-normal"><Braces className="h-3 w-3 text-primary/60" />{entry.properties.length} 속성</Badge>
                        )}
                        <Button variant={entry.isComplex ? "secondary" : "ghost"} size="sm" onClick={() => toggleCplx(axis.id, entry.id)} className="h-6 shrink-0 text-[10px] gap-0.5 px-1.5"><Braces className="h-3 w-3" />{entry.isComplex ? "복합" : "단순"}</Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delEntry(axis.id, entry.id)}><X className="h-3 w-3" /></Button>
                      </div>
                      {entry.isComplex && (
                        <div className="border-t bg-muted/30 px-3 py-2 space-y-1.5">
                          <div className="flex items-center justify-between mb-0.5"><Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">속성</Label><Button variant="ghost" size="sm" onClick={() => addProp(axis.id, entry.id)} className="h-5 gap-0.5 text-[10px] text-primary"><Plus className="h-2.5 w-2.5" />추가</Button></div>
                          {entry.properties.map((prop) => (
                            <div key={prop.id} className="flex items-center gap-1.5">
                              <Input value={prop.name} onChange={(e) => setPropN(axis.id, entry.id, prop.id, e.target.value)} placeholder="속성명" className="h-6 w-24 rounded-md text-xs font-mono" />
                              <Input value={prop.value} onChange={(e) => setPropV(axis.id, entry.id, prop.id, e.target.value)} placeholder="속성값" className="h-6 flex-1 rounded-md text-xs" />
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delProp(axis.id, entry.id, prop.id)}><X className="h-3 w-3" /></Button>
                            </div>
                          ))}
                          {entry.properties.length === 0 && <p className="text-[10px] text-muted-foreground/50 italic">속성을 추가해 주세요.</p>}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-1 mt-1">
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={() => dupAxis(axis.id)} className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-foreground"><CopyPlus className="h-3 w-3" />축 복제</Button></TooltipTrigger><TooltipContent>이 축을 복제합니다</TooltipContent></Tooltip>
                  </div>
                </div>
              )}
            </div>
          )
        })}</div>
      )}
      {axes.length > 0 && (
        <Button variant="ghost" size="sm" onClick={addAxis} className="w-full border border-dashed text-muted-foreground hover:text-foreground gap-1.5 text-xs h-8"><Plus className="h-3 w-3" />축 추가</Button>
      )}
    </div>
  )

  const combinesSection = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div><h4 className="text-xs font-semibold">조합 방식</h4><p className="text-[10px] text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{combine ...}}"}</code> 축 간 연산 관계</p></div>
          <Button variant="outline" size="sm" onClick={addCombine} className="gap-1.5 h-7 text-xs"><Plus className="h-3 w-3" />추가</Button>
        </div>
        {combines.length === 0 ? <p className="text-xs text-muted-foreground/50 text-center py-3">조합 규칙이 없습니다</p> : (
          <div className="space-y-1.5">{combines.map((c, i) => (
            <div key={c.id} className="flex items-center gap-1.5">
              <Badge variant="outline" className="h-7 w-7 shrink-0 items-center justify-center rounded-md p-0 text-[10px] font-bold tabular-nums">{i + 1}</Badge>
              <Input ref={(el) => { combineInputRefs.current[c.id] = el }} value={c.expression} onChange={(e) => setCombExpr(c.id, e.target.value)} placeholder="예: character * emotion * pose" className="h-8 flex-1 font-mono text-xs" />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delCombine(c.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}</div>
        )}
        <AxisBadgeButtons axisNames={axisNames} onInsert={(text) => {
          const target = combines.find((c) => !c.expression.trim())
          if (target) {
            setCombExpr(target.id, text)
          } else if (combines.length > 0) {
            insertToCombine(combines[combines.length - 1]!.id, text)
          }
        }} />
        {combines.length > 0 && axisNames.length > 0 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 gap-0.5 text-[10px] text-muted-foreground" onClick={() => {
              const target = combines.find((c) => !c.expression.trim()) || combines[combines.length - 1]
              if (target) insertToCombine(target.id, " * ")
            }}><Badge variant="secondary" className="font-mono text-[10px] mr-0.5">×</Badge>곱연산 삽입</Button>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div><h4 className="text-xs font-semibold">제외 규칙</h4><p className="text-[10px] text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{exclude ...}}"}</code> 특정 조합 배제</p></div>
          <Button variant="outline" size="sm" onClick={addExclude} className="gap-1.5 h-7 text-xs text-destructive border-destructive/20 hover:bg-destructive/5"><Plus className="h-3 w-3" />추가</Button>
        </div>
        {excludes.length === 0 ? <p className="text-xs text-muted-foreground/50 text-center py-3">제외 규칙이 없습니다</p> : (
          <div className="space-y-1.5">{excludes.map((ex, i) => (
            <div key={ex.id} className="flex items-center gap-1.5">
              <Badge variant="destructive" className="h-7 w-7 shrink-0 items-center justify-center rounded-md p-0 text-[10px] font-bold tabular-nums">{i + 1}</Badge>
              <Input ref={(el) => { excludeInputRefs.current[ex.id] = el }} value={ex.statement} onChange={(e) => setExclStmt(ex.id, e.target.value)} placeholder="예: emotion = sad AND pose = smiling" className="h-8 flex-1 font-mono text-xs" />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delExclude(ex.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}</div>
        )}
        <AxisBadgeButtons axisNames={axisNames} onInsert={(text) => {
          const target = excludes.find((e) => !e.statement.trim())
          if (target) {
            setExclStmt(target.id, text)
          } else if (excludes.length > 0) {
            insertToExclude(excludes[excludes.length - 1]!.id, text)
          }
        }} />
        {excludes.length > 0 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 gap-0.5 text-[10px] text-muted-foreground" onClick={() => {
              const target = excludes.find((e) => !e.statement.trim()) || excludes[excludes.length - 1]
              if (target) insertToExclude(target.id, " AND ")
            }}><Badge variant="secondary" className="font-mono text-[10px] mr-0.5">AND</Badge>조건 결합</Button>
            <Button variant="ghost" size="sm" className="h-6 gap-0.5 text-[10px] text-muted-foreground" onClick={() => {
              const target = excludes.find((e) => !e.statement.trim()) || excludes[excludes.length - 1]
              if (target) insertToExclude(target.id, " OR ")
            }}><Badge variant="secondary" className="font-mono text-[10px] mr-0.5">OR</Badge>조건 분기</Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.02] to-primary/[0.01] p-3 flex items-start gap-2.5 transition-all duration-300 hover:border-primary/20 hover:bg-primary/[0.03] group/guide">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary/50 mt-0.5 animate-pulse" />
        <div className="text-[11px] text-muted-foreground space-y-1.5 flex-1">
          <p className="font-semibold text-foreground text-xs">문법 가이드</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            <div className="flex items-center gap-2 bg-background/40 hover:bg-background/80 transition-colors duration-200 rounded-lg p-1.5 border border-primary/5">
              <Badge variant="secondary" className="font-mono text-[9px] h-4 px-1 shrink-0 bg-primary/5 border border-primary/10 text-primary font-bold shadow-none">*</Badge>
              <span className="text-foreground/80 font-medium">곱연산 (Cartesian product)</span>
            </div>
            <div className="flex items-center gap-2 bg-background/40 hover:bg-background/80 transition-colors duration-200 rounded-lg p-1.5 border border-primary/5">
              <Badge variant="secondary" className="font-mono text-[9px] h-4 px-1.5 shrink-0 bg-primary/5 border border-primary/10 text-primary font-bold shadow-none">exclude</Badge>
              <span className="text-foreground/80 font-medium">특정 조합 배제</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  )

  const templatesSection = (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold flex items-center gap-1.5"><FileCode2 className="h-3.5 w-3.5 text-primary/60" />프롬프트 템플릿</Label>
        <p className="text-[10px] text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{template}}"}</code> 블록 — 조합된 값으로 치환됩니다</p>
        <Textarea ref={templateTextareaRef} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} placeholder={"1girl, {{character}}, {{emotion}}, {{pose}}..."} rows={6} className="mt-1.5 font-mono text-sm leading-relaxed resize-y" />
      </div>
      <div>
        <Label className="text-xs font-semibold flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-primary/60" />파일명 템플릿</Label>
        <p className="text-[10px] text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{filename}}"}</code> 블록</p>
        <Input ref={filenameInputRef} value={filenameBody} onChange={(e) => setFilenameBody(e.target.value)} placeholder="img_{{character.key}}_{{emotion.key}}" className="mt-1.5 h-9 font-mono text-sm" />
        <div className="flex items-center justify-between mt-2.5 rounded-lg border border-primary/5 bg-primary/[0.01] p-2">
          <div className="space-y-0.5">
            <Label htmlFor="clean-filename" className="text-[11px] font-medium leading-none cursor-pointer">파일명 자동 정규화</Label>
            <p className="text-[9px] text-muted-foreground">생략된 축으로 인해 발생하는 중복 구분자(__) 자동 제거</p>
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
        onInsertVar={(name) => insertToTemplate(`{{${name}}}`)}
        onInsertAxisKey={(name) => insertToTemplate(`{{${name}.key}}`)}
      />
    </div>
  )

  // ── Shared: Results content ────────────────────────────────────
  const resultsContent = (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 border-b px-3 py-1.5 bg-muted/20">
        <Eye className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[10px] text-muted-foreground font-medium">결과</span>
        {activeQueue.length > 0 && <Badge variant="secondary" className="text-[9px]">{filtered.length}/{activeQueue.length}</Badge>}
      </div>
      {!dispError && activeQueue.length > 0 && (
        <div className="shrink-0 border-b px-3 py-2">
          <div className="relative w-full"><Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input placeholder="검색..." value={previewFilter} onChange={(e) => setPreviewFilter(e.target.value)} className="h-8 pl-9 text-xs" /></div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {dispLoading ? <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <div key={i} className="animate-pulse rounded-lg border p-4 space-y-2"><div className="h-3 w-2/3 rounded bg-muted/50" /><div className="flex gap-2"><div className="h-4 w-12 rounded bg-muted/40" /><div className="h-4 w-16 rounded bg-muted/40" /></div><div className="h-10 w-full rounded bg-muted/30" /></div>)}</div>
        : dispError ? <div className="flex h-full items-center justify-center p-4"><Card className="w-full border-destructive/20 shadow-none"><CardContent className="flex items-start gap-3 p-5"><div className="shrink-0 rounded-lg bg-destructive/10 p-2"><AlertCircle className="h-4 w-4 text-destructive" /></div><div className="min-w-0 flex-1 space-y-1.5"><h3 className="text-xs font-bold text-destructive">파싱 에러</h3><CardDescription className="text-[11px]">문법 오류로 조합 목록을 생성할 수 없습니다.</CardDescription><div className="mt-2 max-h-36 overflow-auto rounded-md border border-destructive/10 bg-background p-2.5 font-mono text-[10px] break-all whitespace-pre-wrap text-destructive/80">{dispError}</div></div></CardContent></Card></div>
        : activeQueue.length === 0 ? <div className="flex h-full items-center justify-center p-6"><Card className="border-dashed shadow-none w-full max-w-sm"><CardContent className="flex flex-col items-center py-10 gap-2"><div className="rounded-xl bg-muted/60 p-3"><Sparkles className="h-6 w-6 text-muted-foreground/40" /></div><p className="text-xs font-semibold text-muted-foreground">결과 없음</p><p className="text-[10px] text-muted-foreground/50 text-center">템플릿을 편집하면 결과가 여기에 표시됩니다.</p></CardContent></Card></div>
        : filtered.length === 0 ? <div className="flex h-full items-center justify-center"><p className="text-xs text-muted-foreground">검색 결과 없음</p></div>
        : <ScrollArea className="h-full"><div className="p-3 space-y-1.5">
            {filtered.map((item, idx) => { const fn = substitute(item.filename, item); const pr = substitute(item.prompt, item); const k = itemKey(item); return (
              <div key={`r-${k}-${idx}`} className="rounded-lg border p-2.5 space-y-1 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-1.5"><span className="font-mono text-[11px] font-semibold break-all select-all leading-tight flex-1">{fn}</span><Badge variant="secondary" className="shrink-0 text-[9px]">{idx + 1}</Badge></div>
                {Object.keys(item.meta).length > 0 && <div className="flex flex-wrap gap-1">{Object.entries(item.meta).map(([mk, mv]) => <Badge key={mk} variant="outline" className="text-[9px] font-normal">{mk}: {mv}</Badge>)}</div>}
                <div className="font-mono text-[10px] leading-relaxed text-muted-foreground bg-muted/40 rounded-md p-2 break-words select-all">{pr}</div>
              </div>
            )})}
          </div></ScrollArea>
        }
      </div>
    </div>
  )

  // ── Shared: Code preview ───────────────────────────────────────
  const codeContent = (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 border-b px-3 py-1.5 bg-muted/20">
        <FileCode2 className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[10px] text-muted-foreground font-mono">{activeTemplate?.name || "template"}.template</span>
        {generatedCode && <Badge variant="secondary" className="font-mono text-[9px]">{generatedCode.split("\n").length}L</Badge>}
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} disabled={!generatedCode}>{copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}</Button></TooltipTrigger><TooltipContent>복사</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} disabled={!generatedCode}><Download className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>다운로드</TooltipContent></Tooltip>
        </div>
      </div>
      <div className="flex-1 min-h-0"><CodeEditor language="ceg" value={generatedCode} onChange={() => {}} minHeight="100%" bareWrapper className="h-full w-full" /></div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════

  const emptyState = (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="border-dashed shadow-none w-full max-w-sm"><CardContent className="flex flex-col items-center py-10 gap-2"><div className="rounded-xl bg-muted/60 p-3"><Pencil className="h-6 w-6 text-muted-foreground/40" /></div><p className="text-xs font-semibold text-muted-foreground">템플릿을 선택하세요</p><p className="text-[10px] text-muted-foreground/50 text-center">상단 드롭다운에서 템플릿을 선택하면 편집기가 활성화됩니다.</p></CardContent></Card>
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* ═══════ DESKTOP: Left Accordion + Right Code/Results ═══════ */}
      <div className="hidden md:flex min-h-0 flex-1">
        <ResizablePanelGroup autoSaveId="tg-desktop" orientation="horizontal" className="flex-1 min-h-0">
          {/* LEFT: Accordion Editor */}
          <ResizablePanel defaultSize={55} minSize={35} className="flex flex-col overflow-hidden">
            {!activeTemplate ? emptyState : (
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 lg:p-5">
                  <CollapsibleSection value="variables" open={accordionValue.has("variables")} onToggle={toggleSection} icon={Sliders} label="변수" count={variables.length}>{variablesSection}</CollapsibleSection>
                  <CollapsibleSection value="axes" open={accordionValue.has("axes")} onToggle={toggleSection} icon={Layers} label="축" count={axes.length}>{axesSection}</CollapsibleSection>
                  <CollapsibleSection value="combines" open={accordionValue.has("combines")} onToggle={toggleSection} icon={Shuffle} label="규칙" count={combines.length + excludes.length}>{combinesSection}</CollapsibleSection>
                  <CollapsibleSection value="templates" open={accordionValue.has("templates")} onToggle={toggleSection} icon={MessageSquare} label="출력">{templatesSection}</CollapsibleSection>
                </div>
              </ScrollArea>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* RIGHT: Code + Results (always visible, vertical split) */}
          <ResizablePanel defaultSize={45} minSize={25} className="flex flex-col overflow-hidden">
            <ResizablePanelGroup autoSaveId="tg-right" orientation="vertical" className="flex-1 min-h-0">
              <ResizablePanel defaultSize={55} minSize={20} className="flex flex-col overflow-hidden">
                {codeContent}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={45} minSize={15} className="flex flex-col overflow-hidden">
                {resultsContent}
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* ═══════ MOBILE: Accordion + Code+Results tabs ═══════ */}
      <div className="flex md:hidden min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs value={mobileTab} onValueChange={(v) => { setMobileTab(v); saveString(STORAGE_KEYS.mobileTab, v) }} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b px-3">
            <TabsList className="w-full">
              <TabsTrigger value="edit" className="gap-1 text-xs"><Sliders className="h-3 w-3" />편집</TabsTrigger>
              <TabsTrigger value="code" className="gap-1 text-xs"><FileCode2 className="h-3 w-3" />코드</TabsTrigger>
              <TabsTrigger value="results" className="gap-1 text-xs"><Eye className="h-3 w-3" />결과{activeQueue.length > 0 && <Badge variant="secondary" className="ml-1 px-1 py-0 text-[9px]">{activeQueue.length}</Badge>}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="edit" className="min-h-0 flex-1 overflow-hidden mt-0 flex flex-col">
            {!activeTemplate ? emptyState : (
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4">
                  <CollapsibleSection value="variables" open={accordionValue.has("variables")} onToggle={toggleSection} icon={Sliders} label="변수" count={variables.length}>{variablesSection}</CollapsibleSection>
                  <CollapsibleSection value="axes" open={accordionValue.has("axes")} onToggle={toggleSection} icon={Layers} label="축" count={axes.length}>{axesSection}</CollapsibleSection>
                  <CollapsibleSection value="combines" open={accordionValue.has("combines")} onToggle={toggleSection} icon={Shuffle} label="규칙" count={combines.length + excludes.length}>{combinesSection}</CollapsibleSection>
                  <CollapsibleSection value="templates" open={accordionValue.has("templates")} onToggle={toggleSection} icon={MessageSquare} label="출력">{templatesSection}</CollapsibleSection>
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="code" className="min-h-0 flex-1 overflow-hidden mt-0 flex flex-col">{codeContent}</TabsContent>
          <TabsContent value="results" className="min-h-0 flex-1 overflow-hidden mt-0 flex flex-col">{resultsContent}</TabsContent>
        </Tabs>
      </div>

    </div>
  )
}