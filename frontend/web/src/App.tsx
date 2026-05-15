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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  nodeMappings: "nodeMappings",
} as const

// ---------------------------------------------------------------------------
// Navigation tab definitions
// ---------------------------------------------------------------------------
const NAV_TABS = [
  { id: "jobs", label: "잡" },
  { id: "gallery", label: "갤러리" },
  { id: "curation", label: "큐레이션" },
  { id: "settings", label: "설정" },
] as const

type TabId = (typeof NAV_TABS)[number]["id"]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MappingSourceType = "prompt" | "filename" | "seed" | "image" | "fixed"

interface NodeMapping {
  id: string
  nodeId: string
  inputKey: string
  sourceType: MappingSourceType
  seedValue?: number
  seedRandom?: boolean
  fixedValue?: string
}

type ObjectInfoInputSpec = [string[] | string, Record<string, unknown>?]
type ObjectInfo = Record<
  string,
  {
    input: {
      required?: Record<string, ObjectInfoInputSpec>
      optional?: Record<string, ObjectInfoInputSpec>
    }
  }
>

interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
}

interface AxisValueOut {
  key: string
  value: string
  props: Record<string, string>
}

interface AxisOut {
  include?: string
  values: AxisValueOut[]
}

interface ExcludeConditionOut {
  axis: string
  op: string
  values: string[]
}

interface ExcludeRuleOut {
  conditions: ExcludeConditionOut[]
  connective: string
}

interface RenderItemsResponse {
  count: number
  items: RenderItem[]
  axes: Record<string, AxisOut>
  sets: Record<string, string>
  excludes: ExcludeRuleOut[]
}

// ---- saved-items-manager contracts ----
interface SaveableItem {
  id: string
  name: string
  savedAt: number
}

interface SavedItemsManagerProps<T extends SaveableItem> {
  items: T[]
  saveName: string
  onSaveNameChange: (name: string) => void
  onSave: (name: string) => void
  onLoad: (item: T) => void
  onDelete: (id: string) => void
  placeholder: string
  saveDisabled: boolean
  extraHeader?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Generic localStorage hook (unifies string + object codepaths)
// ---------------------------------------------------------------------------
function useLocalStorage<T>(key: string, defaultValue: T) {
  const isStringDefault = typeof defaultValue === "string"

  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue
    if (isStringDefault) return stored as T
    try {
      return JSON.parse(stored) as T
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    if (isStringDefault) {
      localStorage.setItem(key, value as string)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }, [key, value, isStringDefault])

  return [value, setValue] as const
}

// ---------------------------------------------------------------------------
// Reusable base status indicator (HoverCard + pulsing-dot + Item layout)
// ---------------------------------------------------------------------------
interface StatusHoverCardProps {
  dotColor: string
  pingColor: string
  title: string
  hoverAlign?: "start" | "center" | "end"
  hoverWidth?: string
  children: React.ReactNode
}

const StatusHoverCard = ({
  dotColor,
  pingColor,
  title,
  hoverAlign = "start",
  hoverWidth = "w-56",
  children,
}: StatusHoverCardProps) => (
  <HoverCard openDelay={200} closeDelay={100}>
    <HoverCardTrigger asChild>
      <div className="w-fit cursor-help">
        <Item className="flex items-center gap-2 border-none bg-transparent p-2">
          <span className="relative flex h-3 w-3">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`}
            />
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${pingColor}`}
            />
          </span>
          <ItemContent>
            <ItemTitle className="text-sm font-semibold">{title}</ItemTitle>
          </ItemContent>
        </Item>
      </div>
    </HoverCardTrigger>
    <HoverCardContent
      side="bottom"
      align={hoverAlign}
      sideOffset={10}
      className={hoverWidth}
    >
      {children}
    </HoverCardContent>
  </HoverCard>
)

// ---------------------------------------------------------------------------
// ServerStatus – thin wrapper over StatusHoverCard
// ---------------------------------------------------------------------------
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
  const color = isConnected ? "bg-green-500" : "bg-red-500"
  const ping = isConnected ? "bg-green-400" : "bg-red-400"

  return (
    <StatusHoverCard dotColor={color} pingColor={ping} title={name}>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold">
          {isConnected ? "✅ 연결 성공" : "❌ 연결 안됨"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isConnected ? okHint : failHint}
        </p>
      </div>
    </StatusHoverCard>
  )
}

// ---------------------------------------------------------------------------
// WorkerStatus – thin wrapper over StatusHoverCard
// ---------------------------------------------------------------------------
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
    <StatusHoverCard
      dotColor={dot}
      pingColor={ping}
      title={`ComfyUI 워커 ${backendAlive ? `${aliveCount}/${total}` : "—"}`}
      hoverAlign="end"
      hoverWidth="w-72"
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
            등록된 워커가 없습니다. '서버 설정' &gt; 'ComfyUI 워커'에서
            추가하세요.
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
    </StatusHoverCard>
  )
}

// ---------------------------------------------------------------------------
// SavedItemsManager – reusable save/load/list UI for CEG templates & workflows
// ---------------------------------------------------------------------------
function SavedItemsManager<T extends SaveableItem>({
  items,
  saveName,
  onSaveNameChange,
  onSave,
  onLoad,
  onDelete,
  placeholder,
  saveDisabled,
  extraHeader,
}: SavedItemsManagerProps<T>) {
  const handleSave = () => {
    onSave(saveName.trim())
  }

  return (
    <>
      {extraHeader}
      <div className="flex gap-2 pt-1">
        <Input
          placeholder={placeholder}
          value={saveName}
          onChange={(e) => onSaveNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && saveName.trim() && !saveDisabled) {
              handleSave()
            }
          }}
          className="h-8 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={saveDisabled || !saveName.trim()}
          onClick={handleSave}
        >
          저장
        </Button>
      </div>
      {items.length > 0 && (
        <div className="mt-1 space-y-1 rounded-md border bg-muted/30 p-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <button
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                onClick={() => onLoad(item)}
                title="불러오기"
              >
                {item.name}
              </button>
              <span className="flex-none text-xs text-muted-foreground">
                {new Date(item.savedAt).toLocaleDateString()}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 flex-none p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(item.id)}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const parseWorkflow = (json: string): ComfyWorkflow => {
  const parsed = ComfyWorkflowSchema.safeParse(JSON.parse(json))
  if (!parsed.success) {
    console.error("Workflow validation error:", parsed.error)
    throw new Error("Invalid workflow format")
  }
  return parsed.data
}

/** RenderItem 식별자. filename이 중복일 수 있어 prompt까지 포함. */
const itemKey = (item: RenderItem): string => `${item.filename} ${item.prompt}`
const buildAutoMappings = (workflow: ComfyWorkflow): NodeMapping[] => {
  const auto: NodeMapping[] = []

  const clipNode =
    Object.entries(workflow).find(([, n]) => {
      if (n.class_type !== "CLIPTextEncode") return false
      const title = (n._meta?.title || "").toLowerCase()
      return title.includes("positive") || title.includes("prompt")
    }) ??
    Object.entries(workflow).find(([, n]) => n.class_type === "CLIPTextEncode")
  if (clipNode)
    auto.push({
      id: crypto.randomUUID(),
      nodeId: clipNode[0],
      inputKey: "text",
      sourceType: "prompt",
    })

  const saveNode = Object.entries(workflow).find(
    ([, n]) => n.class_type === "SaveImage"
  )
  if (saveNode)
    auto.push({
      id: crypto.randomUUID(),
      nodeId: saveNode[0],
      inputKey: "filename_prefix",
      sourceType: "filename",
    })

  Object.entries(workflow).forEach(([nodeId, node]) => {
    if (node.class_type === "LoadImage")
      auto.push({
        id: crypto.randomUUID(),
        nodeId,
        inputKey: "image",
        sourceType: "image",
      })
  })

  Object.entries(workflow).forEach(([nodeId, node]) => {
    Object.entries(node.inputs).forEach(([inputKey, value]) => {
      if (typeof value === "number" && inputKey.toLowerCase().includes("seed"))
        auto.push({
          id: crypto.randomUUID(),
          nodeId,
          inputKey,
          sourceType: "seed",
          seedValue: Number(value),
          seedRandom: true,
        })
    })
  })

  return auto
}

const applyAxisFilters = (
  items: RenderItem[],
  filter: Record<string, Record<string, boolean>>
): RenderItem[] => {
  const hasAnyDisabled = Object.values(filter).some((vals) =>
    Object.values(vals).some((v) => !v)
  )
  if (!hasAnyDisabled) return items
  return items.filter((item) =>
    Object.entries(item.meta).every(([key, value]) => {
      const axisVals = filter[key]
      if (!axisVals) return true
      return axisVals[value] !== false
    })
  )
}

const filterByItem = (
  item: RenderItem,
  setFilter: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, boolean>>>
  >
) => {
  setFilter((prev) => {
    const next: Record<string, Record<string, boolean>> = {}
    for (const axis of Object.keys(prev)) {
      const itemValue = item.meta[axis]
      if (itemValue === undefined) {
        next[axis] = { ...prev[axis] }
      } else {
        next[axis] = Object.fromEntries(
          Object.keys(prev[axis]!).map((v) => [v, v === itemValue])
        )
      }
    }
    return next
  })
}

const buildWorkflowForItem = (
  workflowJson: string,
  item: RenderItem,
  nodeMappings: NodeMapping[],
  imageNameMap: Record<string, string>
): ComfyWorkflow => {
  const workflow = parseWorkflow(workflowJson)

  let firstImageName = ""
  nodeMappings.forEach(
    ({ nodeId, inputKey, sourceType, seedValue, seedRandom, fixedValue }) => {
      if (!workflow[nodeId]) return
      switch (sourceType) {
        case "prompt":
          workflow[nodeId]!.inputs[inputKey] = item.prompt
          break
        case "filename":
          workflow[nodeId]!.inputs[inputKey] = item.filename
          break
        case "seed": {
          const v = seedRandom
            ? Math.floor(Math.random() * MAX_RANDOM_SEED)
            : (seedValue ?? 0)
          workflow[nodeId]!.inputs[inputKey] = v
          break
        }
        case "image": {
          const name = imageNameMap[`${nodeId}.${inputKey}`]
          if (name) {
            workflow[nodeId]!.inputs[inputKey] = name
            if (!firstImageName) firstImageName = name
          }
          break
        }
        case "fixed":
          workflow[nodeId]!.inputs[inputKey] = fixedValue ?? ""
          break
      }
    }
  )

  // 플레이스홀더 치환: meta 변수 + 내장 변수 + 하위호환 단일중괄호
  const subs: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(item.meta).map(([k, v]) => [`{{${k}}}`, v])
    ),
    "{{input}}": item.prompt,
    "{{filename}}": item.filename,
    "{{image}}": firstImageName,
    "{input}": item.prompt,
    "{filename}": item.filename,
  }
  Object.entries(workflow).forEach(([nodeId, node]) => {
    Object.entries(node.inputs).forEach(([inputKey, inputValue]) => {
      if (typeof inputValue === "string") {
        let v = inputValue
        for (const [key, val] of Object.entries(subs)) {
          v = v.split(key).join(val)
        }
        workflow[nodeId]!.inputs[inputKey] = v
      }
    })
  })
  return workflow
}

// ---------------------------------------------------------------------------
// PreviewTable – reusable table section for axis filter preview
// ---------------------------------------------------------------------------
interface PreviewTableProps {
  title: string
  items: RenderItem[]
  accent?: string
  summary?: string
  className?: string
  onItemClick?: (item: RenderItem) => void
  showCheckboxes?: boolean
  getItemChecked?: (item: RenderItem) => boolean
  onToggleItem?: (item: RenderItem) => void
}

const PreviewTable = ({ title, items, accent, summary, className, onItemClick, showCheckboxes, getItemChecked, onToggleItem }: PreviewTableProps) => (
  <div className={`flex min-h-0 flex-col ${className ?? "flex-1"}`}>
    <div className="mb-1 flex items-baseline gap-2 shrink-0">
      <span className="text-sm font-semibold">{title}</span>
      <span className={accent}>{items.length}</span>
      {summary && (
        <span className="text-xs text-muted-foreground">{summary}</span>
      )}
    </div>
    <ScrollArea className="min-h-0 flex-1 rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckboxes && <TableHead className="w-8" />}
            <TableHead className="w-[40%]">FileName</TableHead>
            <TableHead>Prompt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, i) => (
            <TableRow
              key={`${title}-${itemKey(item)}-${i}`}
              className={onItemClick ? "cursor-pointer" : ""}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
            >
              {showCheckboxes && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={getItemChecked?.(item) ?? true}
                    onCheckedChange={() => onToggleItem?.(item)}
                  />
                </TableCell>
              )}
              <TableCell className="font-mono text-xs">{item.filename}</TableCell>
              <TableCell className="text-xs">{item.prompt}</TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={showCheckboxes ? 3 : 2}
                className="text-center text-xs text-muted-foreground"
              >
                없음
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  </div>
)

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export function App() {
  const [storedBackendUrl, setStoredBackendUrl] = useLocalStorage(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  // 패키지(포터블) 모드에서는 launcher가 주입한 URL을 강제 사용. localStorage 무시.
  const backendUrl = IS_PACKAGE_MODE
    ? (PACKAGE_BACKEND_URL as string)
    : storedBackendUrl
  const setBackendUrl = IS_PACKAGE_MODE
    ? (_: string) => {}
    : setStoredBackendUrl
  const [workflowJson, setWorkflowJson] = useLocalStorage(
    STORAGE_KEYS.workflow,
    ""
  )
  const [cegTemplate, setCegTemplate] = useLocalStorage(
    STORAGE_KEYS.cegTemplate,
    ""
  )
  const [nodeMappings, setNodeMappings] = useLocalStorage<NodeMapping[]>(
    STORAGE_KEYS.nodeMappings,
    []
  )

  const { isConnected: backendAlive, jobs, workers, paused } = useBackend()

  const { settings, updateSetting } = useSettings()

  const [activeTab, setActiveTab] = useState<TabId>("jobs")
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isAxisFilterOpen, setIsAxisFilterOpen] = useState(false)
  const [isSelectionOpen, setIsSelectionOpen] = useState(false)
  const [isAliveBackend, setIsAliveBackend] = useState(false)
  const [objectInfo, setObjectInfo] = useState<ObjectInfo | null>(null)
  const [imageUploads, setImageUploads] = useState<
    Record<
      string,
      { uploadedName: string | null; error: string | null; uploading: boolean }
    >
  >({})
  const [templateSaveName, setTemplateSaveName] = useState("")
  const {
    templates: savedTemplates,
    saveTemplate,
    deleteTemplate,
  } = useSavedTemplates()
  const {
    workflows: savedWorkflows,
    saveWorkflow,
    deleteWorkflow,
  } = useSavedWorkflows()
  const [workflowSaveName, setWorkflowSaveName] = useState("")
  const [pendingSave, setPendingSave] = useState<{
    name: string
    type: "template" | "workflow"
  } | null>(null)

  const nextFreeName = (
    name: string,
    items: { name: string }[]
  ): string => {
    if (!items.some((x) => x.name === name)) return name
    let n = 2
    while (items.some((x) => x.name === `${name} (${n})`)) n++
    return `${name} (${n})`
  }

  // 파서 미리보기 필터
  const [previewFilter, setPreviewFilter] = useState("")
  const [parserError, setParserError] = useState<string | null>(null)
  const [axisValueFilter, setAxisValueFilter] = useState<
    Record<string, Record<string, boolean>>
  >({})
  const [collapsedAxes, setCollapsedAxes] = useState<Set<string>>(new Set())
  const [uncheckedItems, setUncheckedItems] = useState<Set<string>>(new Set())

  const toggleItemCheck = (key: string) => {
    setUncheckedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const checkAllItems = () => setUncheckedItems(new Set())
  const uncheckAllItems = () =>
    setUncheckedItems(new Set(fakeJobQueue.map(itemKey)))

  const toggleAxisCollapse = (axis: string) =>
    setCollapsedAxes((prev) => {
      const next = new Set(prev)
      if (next.has(axis)) next.delete(axis)
      else next.add(axis)
      return next
    })

  const parsedWorkflow = useMemo(() => {
    if (!workflowJson) return undefined
    try {
      return ComfyWorkflowSchema.safeParse(JSON.parse(workflowJson))
    } catch (error) {
      console.error("Workflow parsing error:", error)
      return undefined
    }
  }, [workflowJson])

  // 워크플로우 로드 시 nodeMappings 자동 감지 (비어있을 때만)
  useEffect(() => {
    if (!parsedWorkflow?.success || nodeMappings.length > 0) return
    const auto = buildAutoMappings(parsedWorkflow.data)
    if (auto.length > 0) setNodeMappings(auto)
  }, [parsedWorkflow, nodeMappings, setNodeMappings])

  const handleAutoMap = () => {
    if (!parsedWorkflow?.success) return
    setNodeMappings(buildAutoMappings(parsedWorkflow.data))
  }

  const availableNodeOptions = useMemo(() => {
    if (!parsedWorkflow?.success) return []
    const inUse = new Set(nodeMappings.map((m) => `${m.nodeId}.${m.inputKey}`))
    const opts: {
      nodeId: string
      title: string
      inputKey: string
      isNumeric: boolean
      isLoadImage: boolean
    }[] = []
    Object.entries(parsedWorkflow.data).forEach(([nodeId, node]) => {
      Object.entries(node.inputs).forEach(([inputKey, value]) => {
        if (
          !inUse.has(`${nodeId}.${inputKey}`) &&
          (typeof value === "string" || typeof value === "number")
        ) {
          opts.push({
            nodeId,
            title: node._meta?.title || node.class_type,
            inputKey,
            isNumeric: typeof value === "number",
            isLoadImage:
              node.class_type === "LoadImage" && inputKey === "image",
          })
        }
      })
    })
    return opts
  }, [parsedWorkflow, nodeMappings])

  const handleImageUpload = async (
    file: File,
    nodeId: string,
    inputKey: string
  ) => {
    const key = `${nodeId}.${inputKey}`
    setImageUploads((prev) => ({
      ...prev,
      [key]: { uploadedName: null, error: null, uploading: true },
    }))
    const workerUrl = workers.find((w) => w.alive)?.url
    if (!workerUrl) {
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploadedName: null,
          error: "업로드 가능한 ComfyUI 워커가 없습니다.",
          uploading: false,
        },
      }))
      return
    }
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res = await fetch(`${workerUrl}/upload/image`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setImageUploads((prev) => ({
        ...prev,
        [key]: { uploadedName: data.name, error: null, uploading: false },
      }))
    } catch (err) {
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploadedName: null,
          error: `업로드 실패: ${err instanceof Error ? err.message : String(err)}`,
          uploading: false,
        },
      }))
    }
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
        throw new Error(
          `HTTP ${response.status}: ${errorText || response.statusText}`
        )
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
    const imageNameMap: Record<string, string> = {}
    for (const m of nodeMappings) {
      if (m.sourceType === "image") {
        const name = imageUploads[`${m.nodeId}.${m.inputKey}`]?.uploadedName
        if (name) imageNameMap[`${m.nodeId}.${m.inputKey}`] = name
      }
    }
    const items = renderItems.map((item) => ({
      filename: item.filename,
      prompt: item.prompt,
      workflow: buildWorkflowForItem(
        workflowJson,
        item,
        nodeMappings,
        imageNameMap
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
    await submitJobs(applyAxisFilters(parserResult.items, axisValueFilter))
  }

  const handleRunSelected = async () => {
    if (!workflowJson || !isAliveBackend) return false
    const parserResult = await callParser()
    if (!parserResult) return false
    const selected = parserResult.items.filter(
      (item) => !uncheckedItems.has(itemKey(item))
    )
    return await submitJobs(selected)
  }


  // 파서 테스트 시트 검색 필터
  const filteredPreview = useMemo(() => {
    const needle = previewFilter.trim().toLowerCase()
    if (!needle) return fakeJobQueue
    return fakeJobQueue.filter(
      (it) =>
        it.filename.toLowerCase().includes(needle) ||
        it.prompt.toLowerCase().includes(needle)
    )
  }, [fakeJobQueue, previewFilter])

  const estimatedRunCount = useMemo(
    () =>
      fakeJobQueue.length > 0
        ? applyAxisFilters(fakeJobQueue, axisValueFilter).length
        : null,
    [fakeJobQueue, axisValueFilter]
  )

  const filteredByAxisSet = useMemo(() => {
    if (Object.keys(axisValueFilter).length === 0) return null
    return new Set(applyAxisFilters(fakeJobQueue, axisValueFilter).map(itemKey))
  }, [fakeJobQueue, axisValueFilter])

  const hasActiveFilter = Object.values(axisValueFilter).some((vals) =>
    Object.values(vals).some((v) => !v)
  )

  const axisFilteredItems = useMemo(
    () => applyAxisFilters(fakeJobQueue, axisValueFilter),
    [fakeJobQueue, axisValueFilter]
  )

  const axisExcludedItems = useMemo(() => {
    const includedSet = new Set(axisFilteredItems.map(itemKey))
    return fakeJobQueue.filter((item) => !includedSet.has(itemKey(item)))
  }, [fakeJobQueue, axisFilteredItems])

  const selectedCount = useMemo(
    () =>
      fakeJobQueue.length > 0
        ? fakeJobQueue.filter((item) => !uncheckedItems.has(itemKey(item)))
            .length
        : null,
    [fakeJobQueue, uncheckedItems]
  )

  // CEG 템플릿 변경 시 자동 파싱 (600ms debounce)
  useEffect(() => {
    if (!isAliveBackend || !cegTemplate.trim()) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setParserError(null)
      try {
        const res = await fetch(`${backendUrl}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: cegTemplate }),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as RenderItemsResponse
        setFakeJobQueue(data.items)
        setUncheckedItems(new Set())
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        setParserError(err instanceof Error ? err.message : String(err))
      }
    }, 600)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [cegTemplate, isAliveBackend, backendUrl])

  // 파서 결과에서 축 값 자동 감지 (새 값만 추가, 기존 설정 유지)
  useEffect(() => {
    if (fakeJobQueue.length === 0) return
    setAxisValueFilter((prev) => {
      const next = { ...prev }
      fakeJobQueue.forEach((item) => {
        Object.entries(item.meta).forEach(([key, value]) => {
          if (!next[key]) next[key] = {}
          if (next[key]![value] === undefined) next[key]![value] = true
        })
      })
      return next
    })
  }, [fakeJobQueue])

  const updateMapping = (id: string, patch: Partial<NodeMapping>) =>
    setNodeMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )

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

  useEffect(() => {
    if (!isAliveBackend) return
    fetch(`${backendUrl}/object_info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setObjectInfo(data)
      })
      .catch(() => {})
  }, [backendUrl, isAliveBackend])

  const getNodeInputSpec = (
    nodeId: string,
    inputKey: string
  ): ObjectInfoInputSpec | null => {
    if (!parsedWorkflow?.success || !objectInfo) return null
    const node = parsedWorkflow.data[nodeId]
    if (!node) return null
    const nodeInfo = objectInfo[node.class_type]
    if (!nodeInfo) return null
    return (
      nodeInfo.input.required?.[inputKey] ??
      nodeInfo.input.optional?.[inputKey] ??
      null
    )
  }

  const canRun = Boolean(workflowJson) && isAliveBackend && backendAlive

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <NavigationMenu>
            <NavigationMenuList>
              {NAV_TABS.map((tab) => (
                <NavigationMenuItem key={tab.id}>
                  <NavigationMenuLink
                    className={activeTab === tab.id ? "font-semibold" : ""}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
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
                      여러 ComfyUI 인스턴스를 추가하면 잡이 idle 워커에 자동
                      분배됩니다.
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
                    <SavedItemsManager
                      items={savedTemplates}
                      saveName={templateSaveName}
                      onSaveNameChange={setTemplateSaveName}
                      onSave={(name) => {
                        const trimmed = name.trim()
                        if (savedTemplates.some((t) => t.name === trimmed)) {
                          setPendingSave({ name: trimmed, type: "template" })
                          return
                        }
                        saveTemplate(trimmed, cegTemplate)
                        setTemplateSaveName("")
                      }}
                      onLoad={(t) => setCegTemplate(t.template)}
                      onDelete={deleteTemplate}
                      placeholder="탬플릿 이름"
                      saveDisabled={!cegTemplate.trim()}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>ComfyUI API 워크플로우</FieldLabel>
                    <SavedItemsManager
                      items={savedWorkflows}
                      saveName={workflowSaveName}
                      onSaveNameChange={setWorkflowSaveName}
                      onSave={(name) => {
                        const trimmed = name.trim()
                        if (savedWorkflows.some((w) => w.name === trimmed)) {
                          setPendingSave({ name: trimmed, type: "workflow" })
                          return
                        }
                        saveWorkflow(trimmed, workflowJson)
                        setWorkflowSaveName("")
                      }}
                      onLoad={(w) => setWorkflowJson(w.workflow)}
                      onDelete={deleteWorkflow}
                      placeholder="워크플로우 이름"
                      saveDisabled={!workflowJson.trim()}
                      extraHeader={
                        savedWorkflows.length > 0 ? (
                          <select
                            className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
                            value=""
                            onChange={(e) => {
                              const id = e.target.value
                              if (!id) return
                              const found = savedWorkflows.find(
                                (w) => w.id === id
                              )
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
                        ) : undefined
                      }
                    />
                    <CodeEditor
                      language="json"
                      placeholder="ComfyUI API 워크플로우 입력 칸"
                      value={workflowJson}
                      onChange={setWorkflowJson}
                      minHeight="100px"
                    />
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
                        실행{estimatedRunCount !== null ? ` (${estimatedRunCount})` : ""}
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-10"
                        onClick={() => setIsSelectionOpen(true)}
                        disabled={!canRun}
                      >
                        선택 실행
                      </Button>
                      {parserError && (
                        <span className="text-sm text-destructive">
                          {parserError}
                        </span>
                      )}
                      {fakeJobQueue.length > 0 && (
                        <Button
                          variant="outline"
                          className="h-10"
                          onClick={() => setIsSheetOpen(true)}
                        >
                          미리보기
                        </Button>
                      )}
                      {Object.keys(axisValueFilter).length > 0 && (
                        <Button
                          variant={hasActiveFilter ? "secondary" : "outline"}
                          className="h-10"
                          onClick={() => setIsAxisFilterOpen(true)}
                        >
                          축 필터{hasActiveFilter ? ` (${estimatedRunCount})` : ""}
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

              {parsedWorkflow?.success && (
                <div className="rounded-lg border bg-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">노드 매핑</h2>
                    <Button variant="outline" size="sm" onClick={handleAutoMap}>
                      자동 매핑
                    </Button>
                  </div>
                  {nodeMappings.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Node#</TableHead>
                          <TableHead>Input</TableHead>
                          <TableHead>소스</TableHead>
                          <TableHead>값 / 파일</TableHead>
                          <TableHead>랜덤</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {nodeMappings.map((m) => {
                          const node = parsedWorkflow.data[m.nodeId]
                          const spec = getNodeInputSpec(m.nodeId, m.inputKey)
                          const enumOptions = Array.isArray(spec?.[0])
                            ? (spec![0] as string[])
                            : null
                          const upload =
                            imageUploads[`${m.nodeId}.${m.inputKey}`]
                          return (
                            <TableRow key={m.id}>
                              <TableCell className="text-sm">
                                {node?._meta?.title || "Untitled"}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {m.nodeId}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {m.inputKey}
                              </TableCell>
                              <TableCell>
                                <select
                                  className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                                  value={m.sourceType}
                                  onChange={(e) =>
                                    updateMapping(m.id, {
                                      sourceType: e.target
                                        .value as MappingSourceType,
                                    })
                                  }
                                >
                                  <option value="prompt">프롬프트</option>
                                  <option value="filename">파일명</option>
                                  <option value="seed">시드</option>
                                  <option value="image">이미지</option>
                                  <option value="fixed">고정값</option>
                                </select>
                              </TableCell>
                              <TableCell>
                                {m.sourceType === "seed" && (
                                  <Input
                                    type="number"
                                    value={m.seedValue ?? 0}
                                    onChange={(e) =>
                                      updateMapping(m.id, {
                                        seedValue: Number(e.target.value),
                                      })
                                    }
                                    className="h-8 w-28"
                                  />
                                )}
                                {m.sourceType === "image" && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="text-sm"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f)
                                          handleImageUpload(
                                            f,
                                            m.nodeId,
                                            m.inputKey
                                          )
                                      }}
                                    />
                                    {upload?.uploading && (
                                      <span className="text-xs text-muted-foreground">
                                        업로드 중...
                                      </span>
                                    )}
                                    {upload?.uploadedName && (
                                      <span className="text-xs text-green-600">
                                        ✓ {upload.uploadedName}
                                      </span>
                                    )}
                                    {upload?.error && (
                                      <span className="text-xs text-destructive">
                                        {upload.error}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {m.sourceType === "fixed" &&
                                  (enumOptions ? (
                                    <select
                                      value={m.fixedValue ?? ""}
                                      onChange={(e) =>
                                        updateMapping(m.id, {
                                          fixedValue: e.target.value,
                                        })
                                      }
                                      className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                                    >
                                      <option value="">선택...</option>
                                      {enumOptions.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <Input
                                      value={m.fixedValue ?? ""}
                                      onChange={(e) =>
                                        updateMapping(m.id, {
                                          fixedValue: e.target.value,
                                        })
                                      }
                                      className="h-8 w-36"
                                      placeholder="값 입력"
                                    />
                                  ))}
                              </TableCell>
                              <TableCell>
                                {m.sourceType === "seed" && (
                                  <Checkbox
                                    checked={m.seedRandom ?? false}
                                    onCheckedChange={(checked) =>
                                      updateMapping(m.id, {
                                        seedRandom: checked === true,
                                      })
                                    }
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() =>
                                    setNodeMappings((prev) =>
                                      prev.filter((x) => x.id !== m.id)
                                    )
                                  }
                                >
                                  ×
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                  {availableNodeOptions.length > 0 && (
                    <select
                      className="mt-3 flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                      value=""
                      onChange={(e) => {
                        const index = Number(e.target.value)
                        const opt = availableNodeOptions[index]
                        if (!opt) return
                        const sourceType: MappingSourceType = opt.isLoadImage
                          ? "image"
                          : opt.isNumeric
                            ? "seed"
                            : "fixed"
                        setNodeMappings((prev) => [
                          ...prev,
                          {
                            id: crypto.randomUUID(),
                            nodeId: opt.nodeId,
                            inputKey: opt.inputKey,
                            sourceType,
                            ...(sourceType === "seed"
                              ? { seedValue: 0, seedRandom: true }
                              : {}),
                          },
                        ])
                      }}
                    >
                      <option value="">매핑 추가...</option>
                      {availableNodeOptions.map((opt, i) => (
                        <option key={i} value={i}>
                          [{opt.nodeId}] {opt.title} - {opt.inputKey}
                        </option>
                      ))}
                    </select>
                  )}
                  {!nodeMappings.some((m) => m.sourceType === "prompt") && (
                    <p className="mt-2 text-xs text-yellow-600">
                      ⚠ 프롬프트 주입 매핑이 설정되지 않았습니다.
                    </p>
                  )}
                  {!nodeMappings.some((m) => m.sourceType === "filename") && (
                    <p className="mt-1 text-xs text-yellow-600">
                      ⚠ 파일명 주입 매핑이 설정되지 않았습니다.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    워크플로우 JSON에 {"{{input}}"}, {"{{filename}}"},{" "}
                    {"{{image}}"}, DSL 변수명({"{{outfit}}"} 등)을 직접 써도
                    됩니다.
                  </p>
                </div>
              )}

            </section>
            <div className="relative">
              <section className="absolute inset-0 flex flex-col rounded-lg border bg-card p-6 shadow-sm">
                <h2 className="mb-4 shrink-0 text-lg font-semibold">결과</h2>

                <div className="min-h-0 flex-1 pr-2">
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

      <Dialog open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>파서 결과</DialogTitle>
            <DialogDescription>
              전체 {fakeJobQueue.length}개
              {previewFilter ? ` · 검색 ${filteredPreview.length}개` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="px-1">
            <Input
              type="search"
              placeholder="filename/prompt 검색..."
              value={previewFilter}
              onChange={(e) => setPreviewFilter(e.target.value)}
              className="h-8"
            />
          </div>
          <ScrollArea className="max-h-[50vh] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>FileName</TableHead>
                  <TableHead>Prompt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody id="rendered-items-table-body">
                {filteredPreview.map((item, index) => {
                  const key = itemKey(item)
                  const wouldRun =
                    !filteredByAxisSet || filteredByAxisSet.has(key)
                  return (
                    <TableRow
                      key={`fake-${key}-${index}`}
                      className={!wouldRun ? "opacity-40" : ""}
                    >
                      <TableCell className="font-mono text-xs">
                        {item.filename}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredPreview.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="text-center text-xs text-muted-foreground"
                    >
                      검색 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Sheet open={isAxisFilterOpen} onOpenChange={setIsAxisFilterOpen}>
        <SheetContent className="min-w-[65vw]">
          <SheetHeader>
            <SheetTitle>축 필터</SheetTitle>
            <SheetDescription>
              체크 해제된 값은 실행에서 제외됩니다.
              {estimatedRunCount !== null
                ? ` 현재 설정 기준 ${estimatedRunCount}개 실행 예정.`
                : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="flex gap-4 h-[65vh]">
            <div className="w-[35%] flex flex-col gap-2">
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAxisValueFilter((prev) => {
                      const allEnabled = Object.values(prev).every((vals) =>
                        Object.values(vals).every(Boolean)
                      )
                      return Object.fromEntries(
                        Object.entries(prev).map(([k, vals]) => [
                          k,
                          Object.fromEntries(
                            Object.keys(vals).map((v) => [v, !allEnabled])
                          ),
                        ])
                      )
                    })
                  }
                >
                  전체 {Object.values(axisValueFilter).every((vals) => Object.values(vals).every(Boolean)) ? "비활성화" : "활성화"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCollapsedAxes((prev) => {
                      const allCollapsed = prev.size === Object.keys(axisValueFilter).length
                      if (allCollapsed) return new Set()
                      return new Set(Object.keys(axisValueFilter))
                    })
                  }
                >
                  {collapsedAxes.size === Object.keys(axisValueFilter).length ? "모두 펴기" : "모두 접기"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAxisValueFilter((prev) =>
                      Object.fromEntries(
                        Object.entries(prev).map(([k, vals]) => [
                          k,
                          Object.fromEntries(Object.keys(vals).map((v) => [v, true])),
                        ])
                      )
                    )
                  }
                >
                  초기화
                </Button>
              </div>
              <ScrollArea className="flex-1 min-h-0 rounded-md border">
                {Object.entries(axisValueFilter).map(([axis, values]) => {
                  const enabledCount =
                    Object.values(values).filter(Boolean).length
                  const totalCount = Object.keys(values).length
                  const axisChecked: boolean | "indeterminate" =
                    enabledCount === 0
                      ? false
                      : enabledCount === totalCount
                        ? true
                        : "indeterminate"
                  const isCollapsed = collapsedAxes.has(axis)
                  return (
                    <div key={axis}>
                      <div
                        className="flex cursor-pointer items-center gap-2 bg-muted/50 px-3 py-1.5 select-none"
                        onClick={() => toggleAxisCollapse(axis)}
                      >
                        <span className="text-xs text-muted-foreground transition-transform w-3">
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        <Checkbox
                          checked={axisChecked}
                          onCheckedChange={() => {
                            const shouldEnable = enabledCount < totalCount
                            setAxisValueFilter((prev) => ({
                              ...prev,
                              [axis]: Object.fromEntries(
                                Object.keys(prev[axis] ?? {}).map((v) => [
                                  v,
                                  shouldEnable,
                                ])
                              ),
                            }))
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="font-mono text-sm font-semibold">
                          {axis}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {enabledCount}/{totalCount}
                        </span>
                      </div>
                      {!isCollapsed &&
                        Object.entries(values).map(([value, enabled]) => (
                        <div
                          key={value}
                          className="flex items-center gap-2 px-3 py-1 pl-9"
                        >
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              setAxisValueFilter((prev) => ({
                                ...prev,
                                [axis]: {
                                  ...prev[axis],
                                  [value]: checked === true,
                                },
                              }))
                            }
                          />
                          <span
                            className={`font-mono text-xs ${!enabled ? "text-muted-foreground line-through" : ""}`}
                          >
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </ScrollArea>
            </div>
            <div className="flex w-[65%] flex-col gap-2">
              <PreviewTable
                title="제외된 항목"
                items={axisExcludedItems}
                accent="text-destructive"
                className="max-h-[40%]"
                onItemClick={(item) => filterByItem(item, setAxisValueFilter)}
                showCheckboxes
                getItemChecked={(item) => !uncheckedItems.has(itemKey(item))}
                onToggleItem={(item) => toggleItemCheck(itemKey(item))}
              />
              <PreviewTable
                title="포함된 항목"
                items={axisFilteredItems}
                accent="text-green-600"
                summary={`전체 ${fakeJobQueue.length}개 중 ${axisFilteredItems.length}개 실행 예정`}
                onItemClick={(item) => filterByItem(item, setAxisValueFilter)}
                showCheckboxes
                getItemChecked={(item) => !uncheckedItems.has(itemKey(item))}
                onToggleItem={(item) => toggleItemCheck(itemKey(item))}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isSelectionOpen} onOpenChange={setIsSelectionOpen}>
        <SheetContent className="flex min-w-[30vw] flex-col">
          <SheetHeader>
            <SheetTitle>선택 실행</SheetTitle>
            <SheetDescription>
              전체 {fakeJobQueue.length}개 중 {selectedCount}개 선택됨
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center gap-2 px-4">
            <Input
              type="search"
              placeholder="filename/prompt 검색..."
              value={previewFilter}
              onChange={(e) => setPreviewFilter(e.target.value)}
              className="h-8 flex-1"
            />
            <Button variant="ghost" size="sm" onClick={checkAllItems}>
              전체 선택
            </Button>
            <Button variant="ghost" size="sm" onClick={uncheckAllItems}>
              전체 해제
            </Button>
          </div>
          <ScrollArea className="flex-1 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>FileName</TableHead>
                  <TableHead>Prompt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPreview.map((item, index) => {
                  const key = itemKey(item)
                  return (
                    <TableRow
                      key={`sel-${key}-${index}`}
                      className={!uncheckedItems.has(key) ? "" : "opacity-40"}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={!uncheckedItems.has(key)}
                          onCheckedChange={() => toggleItemCheck(key)}
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
                      검색 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <div className="flex justify-end px-4">
            <Button
              variant="default"
              onClick={async () => {
                const ok = await handleRunSelected()
                if (ok) setIsSelectionOpen(false)
              }}
              disabled={!canRun || selectedCount === 0}
            >
              실행 ({selectedCount})
            </Button>
          </div>
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

      <Dialog
        open={pendingSave !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSave(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이름 충돌</DialogTitle>
            <DialogDescription>
              "{pendingSave?.name}" 이름이 이미 존재합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingSave(null)}
            >
              취소
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!pendingSave) return
                const items =
                  pendingSave.type === "template"
                    ? savedTemplates
                    : savedWorkflows
                const newName = nextFreeName(pendingSave.name, items)
                if (pendingSave.type === "template") {
                  saveTemplate(newName, cegTemplate)
                  setTemplateSaveName("")
                } else {
                  saveWorkflow(newName, workflowJson)
                  setWorkflowSaveName("")
                }
                setPendingSave(null)
              }}
            >
              새로 저장 ({nextFreeName(pendingSave?.name ?? "", pendingSave?.type === "template" ? savedTemplates : savedWorkflows)})
            </Button>
            <Button
              variant="default"
              onClick={() => {
                if (!pendingSave) return
                if (pendingSave.type === "template") {
                  saveTemplate(pendingSave.name, cegTemplate)
                  setTemplateSaveName("")
                } else {
                  saveWorkflow(pendingSave.name, workflowJson)
                  setWorkflowSaveName("")
                }
                setPendingSave(null)
              }}
            >
              덮어쓰기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
