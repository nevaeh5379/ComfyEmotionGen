import { useState, useEffect, useMemo } from "react"
import { Sparkles, Copy, Download, Check, Save, ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import CodeEditor from "@/components/CodeEditor"
import { useTemplateContext } from "../contexts/TemplateContext"

interface TemplateItem {
  id: string
  name: string
  category: string
  code: string
  savedAt?: number
}





export function TemplateGeneratorPanel({
  setActiveTab,
  backendUrl = "http://localhost:8000"
}: {
  setActiveTab: (t: "jobs" | "stats" | "gallery" | "curation" | "generator" | "settings") => void
  backendUrl?: string
}) {
  const { savedTemplates, setCegTemplate, saveTemplate, setTemplateResetKey } = useTemplateContext()

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [saveName, setSaveName] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [systemTemplates, setSystemTemplates] = useState<TemplateItem[]>([])

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

  // 목록 갱신 시 안전한 초기 선택 처리
  useEffect(() => {
    if (combinedTemplates.length > 0) {
      if (!selectedTemplateId || !combinedTemplates.some((t) => t.id === selectedTemplateId)) {
        setSelectedTemplateId(combinedTemplates[0]!.id)
      }
    }
  }, [combinedTemplates, selectedTemplateId])

  // 현재 선택된 템플릿
  const activeTemplate = useMemo<TemplateItem | null>(() => {
    return combinedTemplates.find((t) => t.id === selectedTemplateId) || combinedTemplates[0] || null
  }, [combinedTemplates, selectedTemplateId])

  // {{set name = "value"}} 패턴을 파싱하여 변수 추출
  useEffect(() => {
    if (!activeTemplate) return
    const regex = /\{\{\s*set\s+(\w+)\s*=\s*"([^"]*)"\s*\}\}/g
    const foundVars: Record<string, string> = {}
    let match
    while ((match = regex.exec(activeTemplate.code)) !== null) {
      if (match[1] && match[2] !== undefined) {
        foundVars[match[1]] = match[2]
      }
    }
    setVariables(foundVars)
    setSaveName(`${activeTemplate.name} 커스텀`)
  }, [activeTemplate])

  // 변수값 실시간 업데이트
  const handleVariableChange = (name: string, value: string) => {
    setVariables((prev) => ({
      ...prev,
      [name]: value
    }))
  }



  // 사용자 입력을 반영한 DSL 최종 코드 생성
  const generatedCode = useMemo(() => {
    if (!activeTemplate) return ""
    let finalCode = activeTemplate.code
    Object.entries(variables).forEach(([name, value]) => {
      const searchRegex = new RegExp(`(\\{\\{\\s*set\\s+${name}\\s*=\\s*")[^"]*("\\s*\\}\\})`, "g")
      finalCode = finalCode.replace(searchRegex, `$1${value}$2`)
    })
    return finalCode
  }, [activeTemplate, variables])

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className="grid h-full grid-cols-1 md:grid-cols-12 overflow-hidden">
        
        {/* 왼쪽 영역: 템플릿 선택 및 변수 치환 폼 */}
        <div className="col-span-1 md:col-span-5 flex flex-col border-r border-line overflow-y-auto p-4 md:p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              템플릿 생성기
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              기존에 작성해 둔 템플릿을 골라 캐릭터 속성값을 손쉽게 치환하고 조합을 생성합니다.
            </p>
          </div>

          {/* 템플릿 목록 */}
          <div className="space-y-2.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              대상 템플릿 선택
            </Label>
            
            {combinedTemplates.length === 0 ? (
              <div className="p-4 rounded-xl border border-line bg-panel-2/30 text-center">
                <p className="text-xs text-muted-foreground italic">선택 가능한 템플릿이 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {combinedTemplates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplateId(tmpl.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-200 ${
                      selectedTemplateId === tmpl.id
                        ? "bg-muted/70 border-primary/70 shadow-sm"
                        : "bg-panel/40 border-line hover:border-muted-foreground/30 hover:bg-muted/20"
                    }`}
                  >
                    <span className="font-bold text-sm text-foreground truncate max-w-[200px]">
                      {tmpl.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 font-medium">
                      {tmpl.category === "saved" && tmpl.savedAt
                        ? new Date(tmpl.savedAt).toLocaleDateString()
                        : "기본"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 변수 치환 입력 필드 */}
          <div className="space-y-4 pt-2 border-t border-line/60">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              태그 입력
            </Label>
            
            {!activeTemplate ? (
              <p className="text-xs text-muted-foreground italic">템플릿을 선택하면 변수가 자동으로 노출됩니다.</p>
            ) : Object.keys(variables).length === 0 ? (
              <div className="p-3.5 rounded-lg border border-dashed border-line bg-muted/10 text-center">
                <p className="text-xs text-muted-foreground leading-normal">
                  선택한 템플릿 내에 치환 가능한 캐릭터 변수가 정의되어 있지 않습니다.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {Object.entries(variables).map(([name, val]) => (
                  <div key={name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`var-${name}`} className="text-xs font-bold text-foreground">
                        {name === "character" ? "캐릭터 기본 태그 (character)" : name}
                      </Label>
                      <span className="text-[10px] text-muted-foreground mono font-medium">
                        {"{{" + name + "}}"}
                      </span>
                    </div>
                    <Input
                      id={`var-${name}`}
                      value={val}
                      onChange={(e) => handleVariableChange(name, e.target.value)}
                      placeholder={`${name} 값을 입력하세요...`}
                      className="bg-panel/50 border-line rounded-lg text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* 오른쪽 영역: 실시간 코드 미리보기 및 연동 제어 */}
        <div className="col-span-1 md:col-span-7 flex flex-col overflow-hidden bg-panel-2/20">
          
          <div className="flex items-center justify-between border-b border-line bg-muted/30 px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-ok animate-pulse" />
              <span className="text-xs font-bold text-muted-foreground">코드 미리보기</span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!generatedCode}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:bg-background/80"
              >
                {copied ? <Check className="h-3.5 w-3.5 mr-1 text-ok" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                복사
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                disabled={!generatedCode}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:bg-background/80"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                다운로드
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

          {/* 저장 및 적용 제어 하단 툴바 */}
          <div className="border-t border-line bg-muted/30 p-4 shrink-0 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1">
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  disabled={!generatedCode}
                  placeholder="저장할 템플릿 이름 입력..."
                  className="bg-panel border-line rounded-lg text-xs h-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAsPreset}
                disabled={!generatedCode}
                className="h-9 px-4 text-xs font-semibold shrink-0 gap-1.5 rounded-lg border-line hover:bg-background"
              >
                <Save className="h-3.5 w-3.5" />
                템플릿 저장
              </Button>
            </div>

            <Button
              onClick={handleApplyToEditor}
              disabled={!generatedCode}
              className="w-full h-10 font-bold bg-primary text-primary-foreground hover:bg-primary/95 rounded-xl shadow-sm flex items-center justify-center gap-2 group transition-all duration-200 text-xs"
            >
              작업 탭 에디터에 적용하기
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 duration-200" />
            </Button>
          </div>

        </div>

      </div>
    </div>
  )
}
