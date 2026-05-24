import { useState, useEffect, useMemo } from "react"
import {
  Copy,
  Download,
  Check,
  Save,
  ArrowRight,
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
  Zap,
  Hash,
  X,
  GripVertical,
  Braces,
  ListChecks,
  Eye,
  Code,
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

// ── Parser ────────────────────────────────────────────────────────────

function parseCegTemplate(code: string) {
  const variables: VisualVariable[] = []; const axes: VisualAxis[] = []; const combines: VisualCombine[] = []; const excludes: VisualExclude[] = []; let templateBody = ""; let filenameBody = ""
  if (!code) return { variables, axes, combines, excludes, templateBody, filenameBody }
  let match: RegExpExecArray | null
  const setRe = /\{\{\s*set\s+([a-zA-Z_-][a-zA-Z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*\}\}/g; let vi = 0
  while ((match = setRe.exec(code)) !== null) variables.push({ id: `var-${vi++}`, name: match[1] || "", value: match[2] || "" })
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
  return { variables, axes, combines, excludes, templateBody, filenameBody }
}

// ── Main Component ────────────────────────────────────────────────────

export function TemplateGeneratorPanel({
  setActiveTab,
  backendUrl = "http://localhost:8000",
}: {
  setActiveTab: (t: "jobs" | "stats" | "gallery" | "curation" | "generator" | "settings") => void
  backendUrl?: string
}) {
  const { savedTemplates, setCegTemplate, saveTemplate, setTemplateResetKey } = useTemplateContext()
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [variables, setVariables] = useState<VisualVariable[]>([])
  const [axes, setAxes] = useState<VisualAxis[]>([])
  const [combines, setCombines] = useState<VisualCombine[]>([])
  const [excludes, setExcludes] = useState<VisualExclude[]>([])
  const [templateBody, setTemplateBody] = useState("")
  const [filenameBody, setFilenameBody] = useState("")
  const [saveName, setSaveName] = useState("")
  const [copied, setCopied] = useState(false)
  const [systemTemplates, setSystemTemplates] = useState<TemplateItem[]>([])
  const [prevActiveTemplateId, setPrevActiveTemplateId] = useState<string | null>(null)
  const [activeSubTab, setActiveSubTab] = useState("variables")
  const [rightTab, setRightTab] = useState("code")
  const [mobileTab, setMobileTab] = useState("edit")
  const [parserError, setParserError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [previewFilter, setPreviewFilter] = useState("")

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
    if (activeTemplate) { const p = parseCegTemplate(activeTemplate.code); setVariables(p.variables); setAxes(p.axes); setCombines(p.combines); setExcludes(p.excludes); setTemplateBody(p.templateBody); setFilenameBody(p.filenameBody); setSaveName(`${activeTemplate.name} 커스텀`) }
    else { setVariables([]); setAxes([]); setCombines([]); setExcludes([]); setTemplateBody(""); setFilenameBody(""); setSaveName("") }
  }

  // Handlers (abbreviated for same logic)
  const addVar = () => setVariables((p) => [...p, { id: `v-${Date.now()}`, name: `var_${p.length + 1}`, value: "" }])
  const setVarN = (id: string, n: string) => setVariables((p) => p.map((v) => (v.id === id ? { ...v, name: n } : v)))
  const setVarV = (id: string, n: string) => setVariables((p) => p.map((v) => (v.id === id ? { ...v, value: n } : v)))
  const delVar = (id: string) => setVariables((p) => p.filter((v) => v.id !== id))
  const addAxis = () => setAxes((p) => [...p, { id: `a-${Date.now()}`, name: `axis_${p.length + 1}`, include: "", entries: [] }])
  const setAxN = (id: string, n: string) => setAxes((p) => p.map((a) => (a.id === id ? { ...a, name: n } : a)))
  const setAxI = (id: string, n: string) => setAxes((p) => p.map((a) => (a.id === id ? { ...a, include: n } : a)))
  const delAxis = (id: string) => setAxes((p) => p.filter((a) => a.id !== id))
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

  const generatedCode = useMemo(() => {
    let c = ""
    variables.forEach((v) => { if (v.name.trim()) c += `{{set ${v.name.trim()} = "${v.value}"}}\n` })
    if (variables.length) c += "\n"
    axes.forEach((a) => { if (!a.name.trim()) return; c += `{{axis ${a.name.trim()}${a.include ? ` include="${a.include}"` : ""}}}\n`; a.entries.forEach((e) => { if (!e.key.trim()) return; if (e.isComplex) c += `  ${e.key.trim()} : { ${e.properties.filter((p) => p.name.trim()).map((p) => `${p.name.trim()}: "${p.value}"`).join(", ")} }\n`; else c += `  ${e.key.trim()} : "${e.value}"\n` }); c += `{{/axis}}\n\n` })
    combines.forEach((cb) => { if (cb.expression.trim()) c += `{{combine ${cb.expression.trim()}}}\n` }); if (combines.length) c += "\n"
    excludes.forEach((ex) => { if (ex.statement.trim()) c += `{{exclude ${ex.statement.trim()}}}\n` }); if (excludes.length) c += "\n"
    if (templateBody?.trim()) c += `{{template}}${templateBody}{{/template}}\n\n`
    if (filenameBody?.trim()) c += `{{filename}}${filenameBody}{{/filename}}\n`
    return c.trim()
  }, [variables, axes, combines, excludes, templateBody, filenameBody])

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

  const subTabs = [
    { key: "variables", label: "변수", icon: Sliders, count: variables.length },
    { key: "axes", label: "축", icon: Layers, count: axes.length },
    { key: "combines", label: "규칙", icon: Shuffle, count: combines.length + excludes.length },
    { key: "templates", label: "출력", icon: FileCode2 },
  ]

  // ── Shared: Visual editor content ──────────────────────────────
  const editorContent = (
    <div className="space-y-4">
      {activeSubTab === "variables" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-semibold">전역 변수</h3><p className="text-xs text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{"{{set name = \"value\"}}"}</code></p></div>
            <Button variant="outline" size="sm" onClick={addVar} className="gap-1.5"><Plus className="h-3.5 w-3.5" />추가</Button>
          </div>
          {variables.length === 0 ? <Card className="border-dashed shadow-none"><CardContent className="py-8 text-center text-sm text-muted-foreground">등록된 변수가 없습니다.</CardContent></Card> : (
            <div className="space-y-2">{variables.map((v, i) => (
              <div key={v.id} className="flex items-center gap-2">
                <Badge variant="outline" className="h-7 w-7 shrink-0 items-center justify-center rounded-md p-0 text-[10px] font-bold tabular-nums">{i + 1}</Badge>
                <Input value={v.name} onChange={(e) => setVarN(v.id, e.target.value)} placeholder="변수명" className="h-9 w-28 shrink-0 font-mono text-sm" />
                <Input value={v.value} onChange={(e) => setVarV(v.id, e.target.value)} placeholder="치환될 텍스트" className="h-9 flex-1 text-sm" />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delVar(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {activeSubTab === "axes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-semibold">조합 축</h3><p className="text-xs text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{"{{axis name}}"}</code> 값들이 모든 조합을 생성합니다.</p></div>
            <Button variant="outline" size="sm" onClick={addAxis} className="gap-1.5"><Plus className="h-3.5 w-3.5" />축 추가</Button>
          </div>
          {axes.length === 0 ? <Card className="border-dashed shadow-none"><CardContent className="py-8 text-center text-sm text-muted-foreground">등록된 축이 없습니다.</CardContent></Card> : (
            <div className="space-y-4">{axes.map((axis, ai) => (
              <Card key={axis.id} size="sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Badge className="h-6 items-center justify-center rounded px-1.5 text-[10px] font-bold">A{ai + 1}</Badge>
                    <Input value={axis.name} onChange={(e) => setAxN(axis.id, e.target.value)} placeholder="축 이름 (예: emotion)" className="h-8 flex-1 font-mono text-sm font-semibold" />
                    <Input value={axis.include} onChange={(e) => setAxI(axis.id, e.target.value)} placeholder="include 접미사" className="h-8 w-32 text-sm" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delAxis(axis.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] text-muted-foreground">값 <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[9px]">{axis.entries.length}</Badge></Label>
                      <Button variant="ghost" size="sm" onClick={() => addEntry(axis.id)} className="h-6 gap-1 text-[11px] text-primary"><Plus className="h-3 w-3" />값 추가</Button>
                    </div>
                    {axis.entries.length === 0 && <p className="text-xs text-muted-foreground/50 italic py-3 text-center border border-dashed rounded-lg">값을 추가하세요</p>}
                    {axis.entries.map((entry) => (
                      <div key={entry.id} className="rounded-lg border overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2">
                          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                          <Input value={entry.key} onChange={(e) => setEKey(axis.id, entry.id, e.target.value)} placeholder="키" className="h-8 w-20 shrink-0 rounded-md font-mono text-sm" />
                          {!entry.isComplex ? <Input value={entry.value} onChange={(e) => setEVal(axis.id, entry.id, e.target.value)} placeholder="값" className="h-8 flex-1 rounded-md text-sm" /> : (
                            <Badge variant="outline" className="gap-1 h-8 px-2.5 font-normal text-xs"><Braces className="h-3 w-3 text-primary/60" />{entry.properties.length} 속성</Badge>
                          )}
                          <Button variant={entry.isComplex ? "secondary" : "ghost"} size="sm" onClick={() => toggleCplx(axis.id, entry.id)} className="h-7 shrink-0 text-[11px] gap-1"><Braces className="h-3 w-3" />{entry.isComplex ? "복합" : "단순"}</Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delEntry(axis.id, entry.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                        {entry.isComplex && (
                          <div className="border-t bg-muted/30 px-4 py-2.5 space-y-1.5">
                            <div className="flex items-center justify-between mb-1"><Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">속성</Label><Button variant="ghost" size="sm" onClick={() => addProp(axis.id, entry.id)} className="h-5 gap-0.5 text-[10px] text-primary"><Plus className="h-2.5 w-2.5" />추가</Button></div>
                            {entry.properties.map((prop) => (
                              <div key={prop.id} className="flex items-center gap-1.5">
                                <Input value={prop.name} onChange={(e) => setPropN(axis.id, entry.id, prop.id, e.target.value)} placeholder="속성명" className="h-7 w-24 rounded-md text-xs font-mono" />
                                <Input value={prop.value} onChange={(e) => setPropV(axis.id, entry.id, prop.id, e.target.value)} placeholder="속성값" className="h-7 flex-1 rounded-md text-xs" />
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delProp(axis.id, entry.id, prop.id)}><X className="h-3 w-3" /></Button>
                              </div>
                            ))}
                            {entry.properties.length === 0 && <p className="text-[10px] text-muted-foreground/50 italic">속성을 추가해 주세요.</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}</div>
          )}
        </div>
      )}

      {activeSubTab === "combines" && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">조합 방식</h3><p className="text-xs text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{"{{combine ...}}"}</code> 축 간 연산 관계</p></div><Button variant="outline" size="sm" onClick={addCombine} className="gap-1.5"><Plus className="h-3.5 w-3.5" />추가</Button></div>
            {combines.length === 0 ? <Card className="border-dashed shadow-none"><CardContent className="py-6 text-center text-sm text-muted-foreground">조합 규칙이 없습니다</CardContent></Card> : (
              <div className="space-y-2">{combines.map((c, i) => (<div key={c.id} className="flex items-center gap-2"><Badge variant="outline" className="h-7 w-7 shrink-0 items-center justify-center rounded-md p-0 text-[10px] font-bold tabular-nums">{i + 1}</Badge><Input value={c.expression} onChange={(e) => setCombExpr(c.id, e.target.value)} placeholder="예: character * emotion * pose" className="h-9 flex-1 font-mono text-sm" /><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delCombine(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>))}</div>
            )}
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">제외 규칙</h3><p className="text-xs text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{"{{exclude ...}}"}</code> 특정 조합 배제</p></div><Button variant="outline" size="sm" onClick={addExclude} className="gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/5"><Plus className="h-3.5 w-3.5" />추가</Button></div>
            {excludes.length === 0 ? <Card className="border-dashed shadow-none"><CardContent className="py-6 text-center text-sm text-muted-foreground">제외 규칙이 없습니다</CardContent></Card> : (
              <div className="space-y-2">{excludes.map((ex, i) => (<div key={ex.id} className="flex items-center gap-2"><Badge variant="destructive" className="h-7 w-7 shrink-0 items-center justify-center rounded-md p-0 text-[10px] font-bold tabular-nums">{i + 1}</Badge><Input value={ex.statement} onChange={(e) => setExclStmt(ex.id, e.target.value)} placeholder="예: emotion = sad AND pose = smiling" className="h-9 flex-1 font-mono text-sm" /><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => delExclude(ex.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>))}</div>
            )}
          </div>
          <Card className="border-primary/10 bg-primary/[0.02] shadow-none"><CardContent className="flex items-start gap-3 p-4"><Sparkles className="h-4 w-4 shrink-0 text-primary/50 mt-0.5" /><div className="text-xs text-muted-foreground space-y-1"><p className="font-semibold text-foreground">문법 가이드</p><p><Badge variant="secondary" className="font-mono text-[10px] mr-1">*</Badge>곱연산 (Cartesian product)</p><p><Badge variant="secondary" className="font-mono text-[10px] mr-1">exclude</Badge>특정 조합 배제</p></div></CardContent></Card>
        </div>
      )}

      {activeSubTab === "templates" && (
        <div className="space-y-4">
          <div><h3 className="text-sm font-semibold">출력 서식</h3><p className="text-xs text-muted-foreground mt-0.5"><code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{"{{template}}"}</code> / <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{"{{filename}}"}</code> 블록 정의</p></div>
          <Card size="sm"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-semibold"><FileCode2 className="h-3.5 w-3.5 text-primary/60" />프롬프트 템플릿</CardTitle></CardHeader><CardContent><textarea value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} placeholder={`1girl, {{character}}, {{emotion}}, {{pose}}...`} rows={6} className="w-full rounded-md border bg-background p-3 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-y" /></CardContent></Card>
          <Card size="sm"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-semibold"><Hash className="h-3.5 w-3.5 text-primary/60" />파일명 템플릿</CardTitle></CardHeader><CardContent><Input value={filenameBody} onChange={(e) => setFilenameBody(e.target.value)} placeholder="img_{{character.key}}_{{emotion.key}}" className="h-9 font-mono text-sm" /></CardContent></Card>
          {(variables.length > 0 || axes.length > 0) && (
            <Card className="border-primary/10 bg-primary/[0.02] shadow-none"><CardContent className="flex items-start gap-3 p-4"><Zap className="h-4 w-4 shrink-0 text-primary/50 mt-0.5" /><div className="space-y-2"><p className="text-xs font-semibold text-foreground">사용 가능한 변수</p><div className="flex flex-wrap gap-1.5">{variables.map((v) => v.name).filter(Boolean).map((n) => <Badge key={n} variant="secondary" className="font-mono text-[10px]">{"{{" + n + "}}"}</Badge>)}{axes.map((a) => a.name).filter(Boolean).map((n) => <span key={n} className="flex gap-1"><Badge className="font-mono text-[10px]">{"{{" + n + "}}"}</Badge><Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/20">{"{{" + n + ".key}}"}</Badge></span>)}</div></div></CardContent></Card>
          )}
        </div>
      )}
    </div>
  )

  // ── Shared: Results content ────────────────────────────────────
  const resultsContent = (
    <div className="flex h-full flex-col">
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
            <p className="text-[10px] text-muted-foreground mb-2">총 <Badge variant="secondary" className="text-[9px]">{filtered.length}</Badge>개</p>
            {filtered.map((item, idx) => { const fn = substitute(item.filename, item); const pr = substitute(item.prompt, item); const k = itemKey(item); return (
              <div key={`r-${k}-${idx}`} className="rounded-lg border p-3 space-y-1.5 hover:bg-muted/30 transition-colors">
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
    <div className="flex h-full flex-col">
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── TOP BAR ── */}
      <div className="shrink-0 border-b bg-card">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-xs font-semibold text-muted-foreground">템플릿</Label>
            <Select value={effectiveId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="h-8 w-48 text-sm"><SelectValue placeholder="선택..." /></SelectTrigger>
              <SelectContent>{Object.entries(groupedTemplates).map(([cat, ts]) => (<SelectGroup key={cat}><SelectLabel className="text-[10px] font-bold tracking-widest uppercase">{catLabel(cat)}</SelectLabel>{ts.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}</SelectGroup>))}</SelectContent>
            </Select>
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} disabled={!generatedCode} placeholder="저장 이름..." className="h-8 w-48 text-sm" />
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handleSave} disabled={!generatedCode} className="h-8 gap-1.5 shrink-0"><Save className="h-3.5 w-3.5" /><span className="hidden sm:inline">저장</span></Button></TooltipTrigger><TooltipContent>저장</TooltipContent></Tooltip>
          </div>
          <Button onClick={handleApply} disabled={!generatedCode} className="group h-8 shrink-0 gap-1.5 text-sm font-semibold">적용<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></Button>
        </div>
      </div>

      {/* ═══════ DESKTOP: 2-panel resizable ═══════ */}
      <div className="hidden md:flex min-h-0 flex-1">
        <ResizablePanelGroup autoSaveId="tg-desktop" orientation="horizontal" className="flex-1 min-h-0 h-auto">

          {/* ── LEFT: Visual Editor ── */}
          <ResizablePanel defaultSize={55} minSize={35} className="flex flex-col overflow-hidden">
            {/* Sub-tab bar */}
            <div className="shrink-0 border-b px-3 py-1.5 flex items-center gap-1 bg-muted/30 overflow-x-auto">
              {subTabs.map((tab) => {
                const Icon = tab.icon
                const active = activeSubTab === tab.key
                return (
                  <Button key={tab.key} variant={active ? "secondary" : "ghost"} size="sm" onClick={() => setActiveSubTab(tab.key)} className={`shrink-0 gap-1.5 text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}>
                    <Icon className="h-3.5 w-3.5" />{tab.label}
                    {tab.count !== undefined && tab.count > 0 && <Badge variant="secondary" className="px-1 py-0 text-[9px]">{tab.count}</Badge>}
                  </Button>
                )
              })}
            </div>
            {/* Editor content */}
            {!activeTemplate ? (
              <div className="flex h-full items-center justify-center p-8">
                <Card className="border-dashed shadow-none w-full max-w-sm"><CardContent className="flex flex-col items-center py-10 gap-2"><div className="rounded-xl bg-muted/60 p-3"><Pencil className="h-6 w-6 text-muted-foreground/40" /></div><p className="text-xs font-semibold text-muted-foreground">템플릿을 선택하세요</p><p className="text-[10px] text-muted-foreground/50 text-center">상단 드롭다운에서 템플릿을 선택하면 편집기가 활성화됩니다.</p></CardContent></Card>
              </div>
            ) : (
              <ScrollArea className="flex-1"><div className="p-4 lg:p-5">{editorContent}</div></ScrollArea>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── RIGHT: Code + Results ── */}
          <ResizablePanel defaultSize={45} minSize={25} className="flex flex-col overflow-hidden">
            <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-1 flex-col min-h-0">
              <div className="shrink-0 border-b px-3 py-1">
                <TabsList className="h-8">
                  <TabsTrigger value="code" className="gap-1.5 text-xs"><Code className="h-3 w-3" />코드</TabsTrigger>
                  <TabsTrigger value="results" className="gap-1.5 text-xs"><Eye className="h-3 w-3" />결과{activeQueue.length > 0 && <Badge variant="secondary" className="ml-1 px-1 py-0 text-[9px]">{activeQueue.length}</Badge>}</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="code" className="min-h-0 flex-1 mt-0">{codeContent}</TabsContent>
              <TabsContent value="results" className="min-h-0 flex-1 mt-0">{resultsContent}</TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* ═══════ MOBILE: Full-width tabs ═══════ */}
      <div className="flex md:hidden min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b px-3">
            <TabsList className="w-full">
              <TabsTrigger value="edit" className="gap-1 text-xs"><Sliders className="h-3 w-3" />편집</TabsTrigger>
              <TabsTrigger value="code" className="gap-1 text-xs"><FileCode2 className="h-3 w-3" />코드</TabsTrigger>
              <TabsTrigger value="results" className="gap-1 text-xs"><ListChecks className="h-3 w-3" />결과{activeQueue.length > 0 && <Badge variant="secondary" className="ml-1 px-1 py-0 text-[9px]">{activeQueue.length}</Badge>}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="edit" className="min-h-0 flex-1 overflow-hidden mt-0">
            {!activeTemplate ? (
              <div className="flex h-full items-center justify-center p-6">
                <Card className="border-dashed shadow-none w-full max-w-sm"><CardContent className="flex flex-col items-center py-10 gap-2"><div className="rounded-xl bg-muted/60 p-3"><Pencil className="h-6 w-6 text-muted-foreground/40" /></div><p className="text-xs font-semibold text-muted-foreground">템플릿을 선택하세요</p></CardContent></Card>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                {/* Mobile: sub-tab bar */}
                <div className="shrink-0 border-b px-3 py-1.5 flex items-center gap-1 overflow-x-auto bg-muted/30">
                  {subTabs.map((tab) => {
                    const Icon = tab.icon; const active = activeSubTab === tab.key
                    return <Button key={tab.key} variant={active ? "secondary" : "ghost"} size="sm" onClick={() => setActiveSubTab(tab.key)} className={`shrink-0 gap-1 text-[11px] ${active ? "font-semibold" : "text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" />{tab.label}{tab.count !== undefined && tab.count > 0 && <Badge variant="secondary" className="px-1 py-0 text-[9px]">{tab.count}</Badge>}</Button>
                  })}
                </div>
                <ScrollArea className="flex-1"><div className="p-4">{editorContent}</div></ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="code" className="min-h-0 flex-1 overflow-hidden mt-0">{codeContent}</TabsContent>
          <TabsContent value="results" className="min-h-0 flex-1 overflow-hidden mt-0">{resultsContent}</TabsContent>
        </Tabs>
      </div>
    </div>
  )
}