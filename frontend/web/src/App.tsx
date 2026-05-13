import { useEffect, useMemo, useState } from "react"
import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Item, ItemContent, ItemTitle } from "@/components/ui/item"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import CodeEditor from "@/components/CodeEditor"

import { useBackend } from "./comfyui/WebSocketProvider"
import type { WorkerView } from "./comfyui/Message"
import { SavedImagesGallery } from "./comfyui/SavedImagesGallery"
import { CombinationPicker } from "./comfyui/CombinationPicker"
import { useSavedTemplates } from "./comfyui/useSavedTemplates"
import { useSavedWorkflows } from "./comfyui/useSavedWorkflows"
import { WorkflowGraphViewer } from "./comfyui/WorkflowGraphViewer"
import { JobManagerPanel } from "./comfyui/JobManagerPanel"
import { WorkerManager } from "./comfyui/WorkerManager"
import { SettingsPanel } from "./comfyui/SettingsPanel"
import { useSettings } from "./comfyui/useSettings"
import { ComfyWorkflowSchema, type ComfyWorkflow } from "./lib/workflow"
import {
  DEFAULT_BACKEND_URL,
  IS_PACKAGE_MODE,
  PACKAGE_BACKEND_URL,
} from "./lib/runtime"
const HEALTH_CHECK_INTERVAL_MS = 5000
const MAX_RANDOM_SEED = 1_000_000_000

const STORAGE_KEYS = {
  workflow: "workflow",
  cegTemplate: "cegTemplate",
  backendUrl: "backendUrl",
  promptMapping: "promptMapping",
  filenameMapping: "filenameMapping",
} as const

interface Mapping {
  nodeId: string
  inputKey: string
}

interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
}

interface RenderItemsResponse {
  count: number
  items: RenderItem[]
}

interface ServerStatusProps {
  name: string
  isConnected: boolean
  okHint: string
  failHint: string
}

const ServerStatus = ({
  name,
  isConnected,
  okHint,
  failHint,
}: ServerStatusProps) => {
  const statusColor = isConnected ? "bg-green-500" : "bg-red-500"
  const pingColor = isConnected ? "bg-green-400" : "bg-red-400"

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="w-fit cursor-help">
          <Item className="flex items-center gap-2 border-none bg-transparent p-2">
            <span className="relative flex h-3 w-3">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusColor}`}
              />
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${pingColor}`}
              />
            </span>
            <ItemContent>
              <ItemTitle className="text-sm font-semibold">{name}</ItemTitle>
            </ItemContent>
          </Item>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={10}
        className="w-56"
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">
            {isConnected ? "✅ 연결 성공" : "❌ 연결 안됨"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isConnected ? okHint : failHint}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

interface WorkerStatusProps {
  workers: WorkerView[]
  backendAlive: boolean
}

const WorkerStatus = ({ workers, backendAlive }: WorkerStatusProps) => {
  const aliveCount = workers.filter((w) => w.alive).length
  const total = workers.length
  const allAlive = backendAlive && total > 0 && aliveCount === total
  const someAlive = backendAlive && aliveCount > 0
  const dot = allAlive
    ? "bg-green-500"
    : someAlive
      ? "bg-yellow-500"
      : "bg-red-500"
  const ping = allAlive
    ? "bg-green-400"
    : someAlive
      ? "bg-yellow-400"
      : "bg-red-400"

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="w-fit cursor-help">
          <Item className="flex items-center gap-2 border-none bg-transparent p-2">
            <span className="relative flex h-3 w-3">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dot}`}
              />
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${ping}`}
              />
            </span>
            <ItemContent>
              <ItemTitle className="text-sm font-semibold">
                ComfyUI 워커 {backendAlive ? `${aliveCount}/${total}` : "—"}
              </ItemTitle>
            </ItemContent>
          </Item>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="end"
        sideOffset={10}
        className="w-72"
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">
            {allAlive
              ? "모든 워커 연결됨"
              : someAlive
                ? "일부 워커만 연결됨"
                : backendAlive
                  ? "워커 연결 안 됨"
                  : "백엔드 연결 안 됨"}
          </p>
          {workers.length === 0 && backendAlive && (
            <p className="text-xs text-muted-foreground">
              등록된 워커가 없습니다. '서버 설정' &gt; 'ComfyUI 워커'에서 추가하세요.
            </p>
          )}
          {workers.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="font-mono">{w.id}</span>
              <span className="truncate text-muted-foreground">{w.url}</span>
              <span
                className={
                  w.alive
                    ? w.busy
                      ? "text-yellow-600"
                      : "text-green-600"
                    : "text-red-600"
                }
              >
                {w.alive ? (w.busy ? "busy" : "idle") : "down"}
              </span>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

const useLocalStorageState = (key: string, defaultValue = "") => {
  const [value, setValue] = useState<string>(
    () => localStorage.getItem(key) ?? defaultValue
  )
  useEffect(() => {
    localStorage.setItem(key, value)
  }, [key, value])
  return [value, setValue] as const
}

const useLocalStorageObjectState = <T,>(key: string, defaultValue: T) => {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key)
    if (!stored) return defaultValue
    try {
      return JSON.parse(stored) as T
    } catch {
      return defaultValue
    }
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}

const parseWorkflow = (json: string): ComfyWorkflow => {
  const parsed = ComfyWorkflowSchema.safeParse(JSON.parse(json))
  if (!parsed.success) {
    console.error("Workflow validation error:", parsed.error)
    throw new Error("Invalid workflow format")
  }
  return parsed.data
}

/** RenderItem 식별자. filename이 중복일 수 있어 prompt까지 포함. */
const itemKey = (item: RenderItem): string =>
  `${item.filename}\u0000${item.prompt}`

const buildWorkflowForItem = (
  workflowJson: string,
  item: RenderItem,
  seeds: Map<string, number>,
  promptMapping?: Mapping,
  filenameMapping?: Mapping
): ComfyWorkflow => {
  const workflow = parseWorkflow(workflowJson)
  seeds.forEach((seed, nodeId) => {
    workflow[nodeId]!.inputs["seed"] = seed
  })

  // 명시적 매핑 적용
  if (promptMapping && workflow[promptMapping.nodeId]) {
    workflow[promptMapping.nodeId]!.inputs[promptMapping.inputKey] = item.prompt
  }
  if (filenameMapping && workflow[filenameMapping.nodeId]) {
    workflow[filenameMapping.nodeId]!.inputs[filenameMapping.inputKey] = item.filename
  }

  // 기존 탬플릿 방식(치환)도 유지 (폴백용)
  Object.entries(workflow).forEach(([nodeId, node]) => {
    Object.entries(node.inputs).forEach(([inputKey, inputValue]) => {
      if (typeof inputValue === "string") {
        workflow[nodeId]!.inputs[inputKey] = inputValue
          .replace("{input}", item.prompt)
          .replace("{filename}", item.filename)
      }
    })
  })
  return workflow
}

export function App() {
  const [storedBackendUrl, setStoredBackendUrl] = useLocalStorageState(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  // 패키지(포터블) 모드에서는 launcher가 주입한 URL을 강제 사용. localStorage 무시.
  const backendUrl = IS_PACKAGE_MODE
    ? (PACKAGE_BACKEND_URL as string)
    : storedBackendUrl
  const setBackendUrl = IS_PACKAGE_MODE
    ? (_v: string) => {}
    : setStoredBackendUrl
  const [workflowJson, setWorkflowJson] = useLocalStorageState(
    STORAGE_KEYS.workflow
  )
  const [cegTemplate, setCegTemplate] = useLocalStorageState(
    STORAGE_KEYS.cegTemplate
  )
  const [promptMapping, setPromptMapping] = useLocalStorageObjectState<Mapping | undefined>(
    STORAGE_KEYS.promptMapping,
    undefined
  )
  const [filenameMapping, setFilenameMapping] = useLocalStorageObjectState<Mapping | undefined>(
    STORAGE_KEYS.filenameMapping,
    undefined
  )

  const {
    isConnected: backendAlive,
    jobs,
    workers,
    paused,
  } = useBackend()

  const { settings, updateSetting } = useSettings()

  const [activeTab, setActiveTab] = useState<"jobs" | "gallery" | "curation" | "settings">("jobs")
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isAliveBackend, setIsAliveBackend] = useState(false)
  const [isSeedRandom, setIsSeedRandom] = useState<Record<string, boolean>>({})
  const [templateSaveName, setTemplateSaveName] = useState("")
  const { templates: savedTemplates, saveTemplate, deleteTemplate } = useSavedTemplates()
  const { workflows: savedWorkflows, saveWorkflow, deleteWorkflow } = useSavedWorkflows()
  const [workflowSaveName, setWorkflowSaveName] = useState("")

  // 파서 미리보기 필터 / 선택 상태
  const [previewFilter, setPreviewFilter] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [parserError, setParserError] = useState<string | null>(null)

  const parsedWorkflow = useMemo(() => {
    if (!workflowJson) return undefined
    try {
      return ComfyWorkflowSchema.safeParse(JSON.parse(workflowJson))
    } catch (error) {
      console.error("Workflow parsing error:", error)
      return undefined
    }
  }, [workflowJson])

  // 워크플로우 분석하여 프롬프트/파일명 매핑 자동 제안
  useEffect(() => {
    if (!parsedWorkflow?.success) return

    const workflow = parsedWorkflow.data

    // 프롬프트 매핑 자동 감지
    if (!promptMapping) {
      const clipNodes = Object.entries(workflow).filter(([, n]) => n.class_type === "CLIPTextEncode")
      if (clipNodes.length > 0) {
        // Positive나 Prompt 제목이 있는 노드 우선
        const bestMatch = clipNodes.find(([_, n]) => {
          const title = (n._meta?.title || "").toLowerCase()
          return title.includes("positive") || title.includes("prompt")
        }) || clipNodes[0]

        setPromptMapping({ nodeId: bestMatch![0], inputKey: "text" })
      }
    }

    // 파일명 매핑 자동 감지
    if (!filenameMapping) {
      const saveNode = Object.entries(workflow).find(([, n]) => n.class_type === "SaveImage")
      if (saveNode) {
        setFilenameMapping({ nodeId: saveNode[0], inputKey: "filename_prefix" })
      }
    }
  }, [parsedWorkflow, promptMapping, filenameMapping, setPromptMapping, setFilenameMapping])

  const stringInputOptions = useMemo(() => {
    if (!parsedWorkflow?.success) return []
    const options: { nodeId: string; title: string; inputKey: string }[] = []
    Object.entries(parsedWorkflow.data).forEach(([nodeId, node]) => {
      Object.entries(node.inputs).forEach(([inputKey, value]) => {
        // 문자열 필드이거나 이미 매핑된 필드라면 후보에 포함
        if (
          typeof value === "string" ||
          (promptMapping?.nodeId === nodeId && promptMapping?.inputKey === inputKey) ||
          (filenameMapping?.nodeId === nodeId && filenameMapping?.inputKey === inputKey)
        ) {
          options.push({
            nodeId,
            title: node._meta?.title || node.class_type,
            inputKey,
          })
        }
      })
    })
    return options
  }, [parsedWorkflow, promptMapping, filenameMapping])

  const seedNodes = useMemo(() => {
    if (!parsedWorkflow?.success) return []
    return Object.entries(parsedWorkflow.data).filter(
      ([, node]) => node.inputs["seed"] !== undefined
    )
  }, [parsedWorkflow])

  const generateSeedsFor = (workflow: ComfyWorkflow): Map<string, number> => {
    const seeds = new Map<string, number>()
    Object.entries(workflow).forEach(([nodeId, node]) => {
      if (node.inputs["seed"] === undefined) return
      const seed = isSeedRandom[nodeId]
        ? Math.floor(Math.random() * MAX_RANDOM_SEED)
        : Number(node.inputs["seed"])
      seeds.set(nodeId, seed)
    })
    return seeds
  }

  const callParser = async (): Promise<RenderItemsResponse | undefined> => {
    try {
      const response = await fetch(`${backendUrl}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: cegTemplate || "" }),
      })
      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
      }
      return (await response.json()) as RenderItemsResponse
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("Error occurred while fetching parser API:", error)
      setParserError(message)
      return undefined
    }
  }

  const submitJobs = async (renderItems: RenderItem[]): Promise<boolean> => {
    if (!workflowJson || renderItems.length === 0) return false
    // 시드는 한 배치 안에서 동일하게 (기존 동작 유지)
    const seeds = generateSeedsFor(parseWorkflow(workflowJson))
    const items = renderItems.map((item) => ({
      filename: item.filename,
      prompt: item.prompt,
      workflow: buildWorkflowForItem(
        workflowJson,
        item,
        seeds,
        promptMapping,
        filenameMapping
      ),
    }))
    try {
      const res = await fetch(`${backendUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return true
    } catch (error) {
      console.error("Failed to submit jobs:", error)
      return false
    }
  }

  const handleRun = async () => {
    if (!workflowJson || !isAliveBackend) return
    const parserResult = await callParser()
    if (!parserResult) return
    await submitJobs(parserResult.items)
  }

  const handleParser = async () => {
    setParserError(null)
    const data = await callParser()
    if (data) {
      setFakeJobQueue(data.items)
      // 새 파서 결과: 모두 선택 + 필터 초기화
      setSelectedKeys(new Set(data.items.map((it) => itemKey(it))))
      setPreviewFilter("")
      setIsSheetOpen(true)
    }
  }

  // 필터 적용된 미리보기 (검색어가 filename/prompt에 부분일치)
  const filteredPreview = useMemo(() => {
    const needle = previewFilter.trim().toLowerCase()
    if (!needle) return fakeJobQueue
    return fakeJobQueue.filter(
      (it) =>
        it.filename.toLowerCase().includes(needle) ||
        it.prompt.toLowerCase().includes(needle)
    )
  }, [fakeJobQueue, previewFilter])

  // 실제 실행 후보 = 필터된 것 ∩ 선택된 것
  const runnablePreview = useMemo(
    () => filteredPreview.filter((it) => selectedKeys.has(itemKey(it))),
    [filteredPreview, selectedKeys]
  )

  const allFilteredSelected =
    filteredPreview.length > 0 &&
    filteredPreview.every((it) => selectedKeys.has(itemKey(it)))

  const toggleItemSelected = (item: RenderItem) => {
    const key = itemKey(item)
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAllFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const it of filteredPreview) next.delete(itemKey(it))
      } else {
        for (const it of filteredPreview) next.add(itemKey(it))
      }
      return next
    })
  }

  const handleRunSelected = async () => {
    if (!workflowJson || !isAliveBackend) return
    await submitJobs(runnablePreview)
  }

  const updateSeedValue = (nodeId: string, value: string) => {
    if (!parsedWorkflow?.success) return
    const next = parseWorkflow(workflowJson)
    next[nodeId]!.inputs["seed"] = Number(value)
    setWorkflowJson(JSON.stringify(next))
  }

  // 백엔드 헬스 체크
  useEffect(() => {
    let cancelled = false

    const checkHealth = async () => {
      try {
        const response = await fetch(`${backendUrl}/health`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        return data["backend"] === "ok"
      } catch (error) {
        console.error("Error occurred during backend health check:", error)
        return false
      }
    }

    const tick = async () => {
      const ok = await checkHealth()
      if (!cancelled) setIsAliveBackend(ok)
    }

    tick()
    const timer = setInterval(tick, HEALTH_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [backendUrl])

  const canRun = Boolean(workflowJson) && isAliveBackend && backendAlive

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink
                  className={activeTab === "jobs" ? "font-semibold" : ""}
                  onClick={() => setActiveTab("jobs")}
                >
                  잡
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  className={activeTab === "gallery" ? "font-semibold" : ""}
                  onClick={() => setActiveTab("gallery")}
                >
                  갤러리
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  className={activeTab === "curation" ? "font-semibold" : ""}
                  onClick={() => setActiveTab("curation")}
                >
                  큐레이션
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  className={activeTab === "settings" ? "font-semibold" : ""}
                  onClick={() => setActiveTab("settings")}
                >
                  설정
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          <div className="flex items-center gap-1">
            <ServerStatus
              name="백엔드 서버"
              isConnected={isAliveBackend && backendAlive}
              okHint="백엔드와 연결되어 있습니다."
              failHint="백엔드 서버 상태를 확인해주세요."
            />
            <WorkerStatus workers={workers} backendAlive={isAliveBackend} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl p-6">
        {activeTab === "gallery" && (
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">에셋 갤러리</h2>
            <SavedImagesGallery
              backendUrl={backendUrl}
              enableHover={settings.enableHover}
              imagePageSize={settings.imagePageSize}
              imageLazyLoad={settings.imageLazyLoad}
            />
          </section>
        )}
        {activeTab === "curation" && (
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">조합별 에셋 선택</h2>
            <CombinationPicker
              backendUrl={backendUrl}
              cegTemplate={cegTemplate}
              savedTemplates={savedTemplates}
              enableHover={settings.enableHover}
              autoApplyReject={settings.autoApplyReject}
            />
          </section>
        )}
        {activeTab === "settings" && (
          <SettingsPanel
            settings={settings}
            updateSetting={updateSetting}
            backendUrl={backendUrl}
            onBackendUrlChange={setBackendUrl}
          />
        )}
        {activeTab === "jobs" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-6">
              <div className="rounded-lg border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold">서버 설정</h2>
                <FieldGroup>
                  <Field>
                    <FieldLabel>백엔드 서버 URL</FieldLabel>
                    <Input
                      type="url"
                      placeholder={DEFAULT_BACKEND_URL}
                      value={backendUrl}
                      onChange={(e) => setBackendUrl(e.target.value)}
                      disabled={IS_PACKAGE_MODE}
                    />
                    <FieldDescription>
                      {IS_PACKAGE_MODE
                        ? "포터블 모드: 런처가 할당한 백엔드 포트에 자동 연결됩니다."
                        : "ComfyUI 워커 URL은 아래 'ComfyUI 워커' 섹션에서 관리합니다."}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>ComfyUI 워커</FieldLabel>
                    <WorkerManager backendUrl={backendUrl} workers={workers} />
                    <FieldDescription>
                      여러 ComfyUI 인스턴스를 추가하면 잡이 idle 워커에 자동 분배됩니다.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>

              <div className="rounded-lg border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold">CEG & 워크플로우</h2>
                <FieldGroup>
                  <Field>
                    <FieldLabel>CEG 탬플릿</FieldLabel>
                    <CodeEditor
                      language="ceg"
                      placeholder="CEG 탬플릿 입력 칸"
                      value={cegTemplate}
                      onChange={setCegTemplate}
                      minHeight="100px"
                    />
                    {/* 탬플릿 저장 */}
                    <div className="flex gap-2 pt-1">
                      <Input
                        placeholder="탬플릿 이름"
                        value={templateSaveName}
                        onChange={(e) => setTemplateSaveName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && templateSaveName.trim() && cegTemplate.trim()) {
                            saveTemplate(templateSaveName, cegTemplate)
                            setTemplateSaveName("")
                          }
                        }}
                        className="h-8 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!templateSaveName.trim() || !cegTemplate.trim()}
                        onClick={() => {
                          saveTemplate(templateSaveName, cegTemplate)
                          setTemplateSaveName("")
                        }}
                      >
                        저장
                      </Button>
                    </div>
                    {/* 저장된 탬플릿 목록 */}
                    {savedTemplates.length > 0 && (
                      <div className="mt-1 space-y-1 rounded-md border bg-muted/30 p-2">
                        {savedTemplates.map((t) => (
                          <div key={t.id} className="flex items-center gap-2">
                            <button
                              className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                              onClick={() => setCegTemplate(t.template)}
                              title="불러오기"
                            >
                              {t.name}
                            </button>
                            <span className="flex-none text-xs text-muted-foreground">
                              {new Date(t.savedAt).toLocaleDateString()}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 flex-none p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteTemplate(t.id)}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>ComfyUI API 워크플로우</FieldLabel>
                    {savedWorkflows.length > 0 && (
                      <select
                        className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
                        value=""
                        onChange={(e) => {
                          const id = e.target.value
                          if (!id) return
                          const found = savedWorkflows.find((w) => w.id === id)
                          if (found) setWorkflowJson(found.workflow)
                        }}
                      >
                        <option value="" disabled>
                          저장된 워크플로우 불러오기...
                        </option>
                        {savedWorkflows.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <CodeEditor
                      language="json"
                      placeholder="ComfyUI API 워크플로우 입력 칸"
                      value={workflowJson}
                      onChange={setWorkflowJson}
                      minHeight="100px"
                    />
                    <div className="flex gap-2 pt-1">
                      <Input
                        placeholder="워크플로우 이름"
                        value={workflowSaveName}
                        onChange={(e) => setWorkflowSaveName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && workflowSaveName.trim() && workflowJson.trim()) {
                            saveWorkflow(workflowSaveName, workflowJson)
                            setWorkflowSaveName("")
                          }
                        }}
                        className="h-8 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!workflowSaveName.trim() || !workflowJson.trim()}
                        onClick={() => {
                          saveWorkflow(workflowSaveName, workflowJson)
                          setWorkflowSaveName("")
                        }}
                      >
                        저장
                      </Button>
                    </div>
                    {savedWorkflows.length > 0 && (
                      <div className="mt-1 space-y-1 rounded-md border bg-muted/30 p-2">
                        {savedWorkflows.map((w) => (
                          <div key={w.id} className="flex items-center gap-2">
                            <button
                              className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                              onClick={() => setWorkflowJson(w.workflow)}
                              title="불러오기"
                            >
                              {w.name}
                            </button>
                            <span className="flex-none text-xs text-muted-foreground">
                              {new Date(w.savedAt).toLocaleDateString()}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 flex-none p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteWorkflow(w.id)}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>데이터 매핑</FieldLabel>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">프롬프트 주입 대상</Label>
                        <select
                          className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                          value={promptMapping ? `${promptMapping.nodeId}.${promptMapping.inputKey}` : ""}
                          onChange={(e) => {
                            const val = e.target.value
                            if (!val) {
                              setPromptMapping(undefined)
                              return
                            }
                            const [nodeId, inputKey] = val.split(".")
                            setPromptMapping({ nodeId, inputKey })
                          }}
                        >
                          <option value="">자동 또는 {`{input}`} 사용</option>
                          {stringInputOptions.map((opt) => (
                            <option key={`${opt.nodeId}.${opt.inputKey}`} value={`${opt.nodeId}.${opt.inputKey}`}>
                              [{opt.nodeId}] {opt.title} - {opt.inputKey}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">파일명 주입 대상</Label>
                        <select
                          className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                          value={filenameMapping ? `${filenameMapping.nodeId}.${filenameMapping.inputKey}` : ""}
                          onChange={(e) => {
                            const val = e.target.value
                            if (!val) {
                              setFilenameMapping(undefined)
                              return
                            }
                            const [nodeId, inputKey] = val.split(".")
                            setFilenameMapping({ nodeId, inputKey })
                          }}
                        >
                          <option value="">자동 또는 {`{filename}`} 사용</option>
                          {stringInputOptions.map((opt) => (
                            <option key={`${opt.nodeId}.${opt.inputKey}`} value={`${opt.nodeId}.${opt.inputKey}`}>
                              [{opt.nodeId}] {opt.title} - {opt.inputKey}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <FieldDescription>
                      워크플로우 JSON에 {`{input}`}이나 {`{filename}`}이 없어도 선택한 필드에 직접 주입합니다.
                    </FieldDescription>
                  </Field>
                  <Field orientation="horizontal">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-10 items-stretch overflow-hidden rounded-md border bg-background">
                        <input
                          type="number"
                          className="h-full w-24 bg-transparent px-3 outline-none"
                          placeholder="0"
                        />
                        <div className="flex w-8 flex-col border-l">
                          <Button
                            variant="ghost"
                            className="flex-1"
                            aria-label="Increase"
                          >
                            <PlusIcon className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            className="flex-1"
                            aria-label="Decrease"
                          >
                            <MinusIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <Button
                        variant="default"
                        className="h-10"
                        onClick={handleRun}
                        disabled={!canRun}
                      >
                        실행
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-10"
                        onClick={handleParser}
                        disabled={!isAliveBackend}
                      >
                        파서 테스트
                      </Button>
                      {parserError && (
                        <span className="text-sm text-destructive">{parserError}</span>
                      )}
                      {fakeJobQueue.length > 0 && (
                        <Button
                          variant="outline"
                          className="h-10"
                          onClick={() => setIsSheetOpen(true)}
                        >
                          파서 결과 보기 ({fakeJobQueue.length})
                        </Button>
                      )}
                      {parsedWorkflow?.success && (
                        <Button
                          variant="outline"
                          className="h-10"
                          onClick={() => setIsGraphOpen(true)}
                        >
                          그래프 보기
                        </Button>
                      )}
                    </div>
                  </Field>
                </FieldGroup>
              </div>

              {parsedWorkflow && !parsedWorkflow.success && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                  workflow 파싱 오류: {parsedWorkflow.error.message}
                </div>
              )}

              {parsedWorkflow?.success && seedNodes.length > 0 && (
                <div className="rounded-lg border bg-card p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold">시드 노드</h2>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Number</TableHead>
                        <TableHead>seed 값</TableHead>
                        <TableHead>랜덤 여부</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {seedNodes.map(([nodeId, node]) => (
                        <TableRow key={nodeId}>
                          <TableCell>{node._meta?.title || "Untitled"}</TableCell>
                          <TableCell className="font-mono">{nodeId}</TableCell>
                          <TableCell>
                            <Input
                              value={String(node.inputs["seed"])}
                              onChange={(e) =>
                                updateSeedValue(nodeId, e.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={isSeedRandom[nodeId] ?? false}
                              onCheckedChange={(checked) => {
                                setIsSeedRandom((prev) => ({
                                  ...prev,
                                  [nodeId]: checked === true,
                                }))
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
            <div className="relative">
              <section className="absolute inset-0 flex flex-col rounded-lg border bg-card p-6 shadow-sm">
                <h2 className="mb-4 shrink-0 text-lg font-semibold">결과</h2>

                <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                  <JobManagerPanel
                    jobs={jobs}
                    paused={paused}
                    backendUrl={backendUrl}
                    isAliveBackend={isAliveBackend}
                  />
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="flex flex-col min-w-[30vw]">
          <SheetHeader>
            <SheetTitle>파서 결과</SheetTitle>
            <SheetDescription>
              ({selectedKeys.size}/{fakeJobQueue.length} 선택
              {previewFilter ? `, ${filteredPreview.length} 필터됨` : ""})
            </SheetDescription>
          </SheetHeader>
          <Field orientation="horizontal" className="px-4">

            <Input
              type="search"
              placeholder="filename/prompt 필터..."
              value={previewFilter}
              onChange={(e) => setPreviewFilter(e.target.value)}
              className="h-8 flex-1"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleSelectAllFiltered}
              disabled={filteredPreview.length === 0}
            >
              {allFilteredSelected ? "선택 해제" : "전체 선택"}
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={handleRunSelected}
              disabled={!canRun || runnablePreview.length === 0}
            >
              선택 실행 ({runnablePreview.length})
            </Button>
          </Field>
          <div className="flex flex-wrap items-center gap-2 py-4">
          </div>

          <ScrollArea className="flex-1 rounded-md border overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>FileName</TableHead>
                  <TableHead>Prompt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody id="rendered-items-table-body">
                {filteredPreview.map((item, index) => {
                  const key = itemKey(item)
                  return (
                    <TableRow key={`fake-${key}-${index}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedKeys.has(key)}
                          onCheckedChange={() => toggleItemSelected(item)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.filename}
                      </TableCell>
                      <TableCell>{item.prompt}</TableCell>
                    </TableRow>
                  )
                })}
                {filteredPreview.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-xs text-muted-foreground"
                    >
                      필터에 매치되는 항목이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {parsedWorkflow?.success && (
        <WorkflowGraphViewer
          workflow={parsedWorkflow.data}
          isOpen={isGraphOpen}
          onClose={() => setIsGraphOpen(false)}
          backendUrl={backendUrl}
        />
      )}
    </div>
  )
}

export default App
