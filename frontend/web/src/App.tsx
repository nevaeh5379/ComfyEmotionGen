import { useEffect, useMemo, useRef, useState } from "react"
import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
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
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

import { useWebSocket } from "./comfyui/WebSocketProvider"
import { ComfyWorkflowSchema, type ComfyWorkflow } from "./lib/workflow"

const DEFAULT_BACKEND_URL = "http://localhost:8000"
const DEFAULT_COMFYUI_URL = "http://localhost:8188"
const HEALTH_CHECK_INTERVAL_MS = 5000
const MAX_RANDOM_SEED = 1_000_000_000

const STORAGE_KEYS = {
  workflow: "workflow",
  dslTemplate: "dslTemplate",
  backendUrl: "backendUrl",
  comfyUrl: "comfyUrl",
} as const

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  pending: "대기 중",
  queued: "큐 대기 중",
  running: "진행 중...",
  done: "완료",
  error: "실패",
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

type JobStatus = "pending" | "queued" | "running" | "done" | "error"

interface Job {
  id: string
  item: RenderItem
  status: JobStatus
  promptId: string
  error?: string
  seed: Map<string, number>
  workflow: ComfyWorkflow
}

interface ProgressState {
  nodePercent: number
  currentNodeName: string
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
        className="w-48"
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

const useLocalStorageState = (key: string, defaultValue = "") => {
  const [value, setValue] = useState<string>(
    () => localStorage.getItem(key) ?? defaultValue
  )
  useEffect(() => {
    localStorage.setItem(key, value)
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

export function App() {
  const [backendUrl, setBackendUrl] = useLocalStorageState(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  const [comfyUrl, setComfyUrl] = useLocalStorageState(
    STORAGE_KEYS.comfyUrl,
    DEFAULT_COMFYUI_URL
  )
  const [workflowJson, setWorkflowJson] = useLocalStorageState(
    STORAGE_KEYS.workflow
  )
  const [dslTemplate, setDslTemplate] = useLocalStorageState(
    STORAGE_KEYS.dslTemplate
  )

  const { subscribe, isConnected, clientId } = useWebSocket()

  const [jobs, setJobs] = useState<Job[]>([])
  const [lastImages, setLastImages] = useState<string[]>([])
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [isAliveBackend, setIsAliveBackend] = useState(false)
  const [isSeedRandom, setIsSeedRandom] = useState<Record<string, boolean>>({})
  const [progressState, setProgressState] = useState<ProgressState>({
    nodePercent: 0,
    currentNodeName: "",
  })
  const [batchCount, setBatchCount] = useState(1)
  const [isPaused, setIsPaused] = useState(false)

  const jobsRef = useRef<Job[]>([])
  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  const parsedWorkflow = useMemo(() => {
    if (!workflowJson) return undefined
    try {
      return ComfyWorkflowSchema.safeParse(JSON.parse(workflowJson))
    } catch (error) {
      console.error("Workflow parsing error:", error)
      return undefined
    }
  }, [workflowJson])

  const seedNodes = useMemo(() => {
    if (!parsedWorkflow?.success) return []
    return Object.entries(parsedWorkflow.data).filter(
      ([, node]) => node.inputs["seed"] !== undefined
    )
  }, [parsedWorkflow])

  const generateSeeds = (workflow: ComfyWorkflow): Map<string, number> => {
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
        body: JSON.stringify({ template: dslTemplate || "" }),
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return (await response.json()) as RenderItemsResponse
    } catch (error) {
      console.error("Error occurred while fetching parser API:", error)
      return undefined
    }
  }

  const handleRun = async () => {
    if (!workflowJson || !isConnected || !isAliveBackend) return
    const parserResult = await callParser()
    if (!parserResult) return

    const newJobs: Job[] = []

    for (let batch = 0; batch < batchCount; batch++) {
      const seeds = generateSeeds(parseWorkflow(workflowJson))

      parserResult.items.forEach((item) => {
        const tempWorkflow = parseWorkflow(workflowJson)
        const promptId = crypto.randomUUID()

        seeds.forEach((seed, nodeId) => {
          tempWorkflow[nodeId]!.inputs["seed"] = seed
        })

        Object.entries(tempWorkflow).forEach(([nodeId, node]) => {
          Object.entries(node.inputs).forEach(([inputKey, inputValue]) => {
            if (typeof inputValue === "string") {
              tempWorkflow[nodeId]!.inputs[inputKey] = inputValue
                .replace("{input}", item.prompt)
                .replace("{filename}", item.filename)
            }
          })
        })

        newJobs.push({
          id: promptId,
          promptId,
          item,
          status: "pending",
          seed: seeds,
          workflow: tempWorkflow,
        })
      })
    }

    setJobs((prev) => [...prev, ...newJobs])
    setIsPaused(false)
  }

  const handleParser = async () => {
    const data = await callParser()
    if (data) setFakeJobQueue(data.items)
  }

  const handleCancelAll = async () => {
    // ComfyUI에 interrupt 요청
    try {
      await fetch(`${comfyUrl}/interrupt`, { method: "POST" })
    } catch (error) {
      console.error("Interrupt request failed:", error)
    }
    // 모든 pending/queued/running job을 error로 표시하고, pending은 제거
    setJobs((prev) =>
      prev
        .filter((j) => j.status !== "pending")
        .map((j) =>
          j.status === "queued" || j.status === "running"
            ? { ...j, status: "error", error: "사용자에 의해 취소됨" }
            : j
        )
    )
    setIsPaused(false)
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
        return data["status"] === "ok"
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

  // 잡 큐 디스패처
  useEffect(() => {
    if (isPaused) return

    const hasInFlight = jobs.some(
      (j) => j.status === "queued" || j.status === "running"
    )
    if (hasInFlight) return

    const nextPending = jobs.find((j) => j.status === "pending")
    if (!nextPending) return

    const submit = async () => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === nextPending.id ? { ...j, status: "queued" } : j
        )
      )

      try {
        const res = await fetch(`${comfyUrl}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: nextPending.workflow,
            client_id: clientId,
            prompt_id: nextPending.promptId,
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (error) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === nextPending.id
              ? { ...j, status: "error", error: String(error) }
              : j
          )
        )
      }
    }

    submit()
  }, [jobs, clientId, comfyUrl, isPaused])

  /**
   * execution_start: comfyUI에서 실행될 때
   * execution_success: 노드 전부 성공
   * executed: SaveImage 등으로 끝났을 때 (SaveImageWebsocket는 바이너리 메시지로 옴)
   */
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "execution_start") {
        setJobs((prev) =>
          prev.map((j) =>
            j.promptId === msg.promptId ? { ...j, status: "running" } : j
          )
        )
      } else if (msg.type === "execution_success") {
        setJobs((prev) =>
          prev.map((j) =>
            j.promptId === msg.promptId ? { ...j, status: "done" } : j
          )
        )
      } else if (msg.type === "execution_interrupted") {
        setJobs((prev) =>
          prev.map((j) =>
            j.promptId === msg.promptId
              ? {
                  ...j,
                  status: "error",
                  error: `interrupted at ${msg.nodeType}`,
                }
              : j
          )
        )
      } else if (msg.type === "executed") {
        const images = msg.output?.images as Array<{
          filename: string
          subfolder: string
          type: string
        }>
        const urls = images.map((img) => {
          const params = new URLSearchParams({
            filename: img.filename,
            subfolder: img.subfolder,
            type: img.type,
          })
          return `${comfyUrl}/view?${params}`
        })
        const job = jobsRef.current.find((j) => j.promptId === msg.promptId)
        if (!job) {
          throw Error("Job not found")
        }
        setLastImages(urls)
      } else if (msg.type === "progress") {
        const percent = (msg.value / msg.max) * 100
        setProgressState({
          nodePercent: percent,
          currentNodeName:
            jobsRef.current.find((j) => j.promptId === msg.promptId)
              ?.workflow[msg.node]?._meta?.title ?? "",
        })
      }
    })
  }, [subscribe, comfyUrl])

  const renderJobsTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>FileName</TableHead>
          <TableHead>Prompt</TableHead>
          <TableHead>Seeds</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((j) => (
          <TableRow key={j.id}>
            <TableCell className="font-mono text-xs">{j.item.filename}</TableCell>
            <TableCell className="max-w-xs truncate">{j.item.prompt}</TableCell>
            <TableCell>
              {Array.from(j.seed.entries()).map(([nodeId, seed]) => (
                <div key={nodeId} className="font-mono text-xs">
                  {nodeId}: {seed}
                </div>
              ))}
            </TableCell>
            <TableCell>
              {j.status === "error"
                ? `${JOB_STATUS_LABEL.error}: ${j.error}`
                : JOB_STATUS_LABEL[j.status]}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  const renderContent = () => {
    const hasJobs = jobs.length > 0
    const hasFakeQueue = fakeJobQueue.length > 0

    if (!hasJobs && !hasFakeQueue) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>아무 것도 없어요!</EmptyTitle>
            <EmptyDescription>
              파서 테스트 혹은 에셋 생성을 하실 수 있어요.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }

    return (
      <div className="flex flex-col gap-4">
        {hasJobs && (
          <>
            <Field>
              <FieldLabel>
                <span className="truncate">
                  노드: {progressState.currentNodeName || "—"}
                </span>
                <span className="ml-auto tabular-nums">
                  {Math.round(progressState.nodePercent)}%
                </span>
              </FieldLabel>
              <Progress value={progressState.nodePercent} className="w-full" />
            </Field>

            {lastImages.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {lastImages.map((url, index) => (
                  <img
                    key={index}
                    src={url}
                    alt={`Generated ${index}`}
                    className="h-auto w-full rounded-md border"
                  />
                ))}
              </div>
            )}

            {renderJobsTable()}
          </>
        )}

        {hasFakeQueue && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>FileName</TableHead>
                <TableHead>Prompt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody id="rendered-items-table-body">
              {fakeJobQueue.map((item, index) => (
                <TableRow key={`fake-${index}`}>
                  <TableCell className="font-mono text-xs">
                    {item.filename}
                  </TableCell>
                  <TableCell>{item.prompt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    )
  }

  const canRun = Boolean(workflowJson) && isConnected && isAliveBackend

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink href="/">메인</NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink>파서</NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          <div className="flex items-center gap-1">
            <ServerStatus
              name="ComfyUI 서버"
              isConnected={isConnected}
              okHint="서버가 응답하고 있습니다."
              failHint="ComfyUI 서버 상태를 확인해주세요."
            />
            <ServerStatus
              name="백엔드 서버"
              isConnected={isAliveBackend}
              okHint="서버가 응답하고 있습니다."
              failHint="백엔드 서버 상태를 확인해주세요."
            />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl p-6">
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
                  />
                </Field>
                <Field>
                  <FieldLabel>ComfyUI API 서버 URL</FieldLabel>
                  <Input
                    type="url"
                    placeholder={DEFAULT_COMFYUI_URL}
                    value={comfyUrl}
                    onChange={(e) => setComfyUrl(e.target.value)}
                  />
                  <FieldDescription>
                    ComfyUI에서 cors 정책 허용해야 합니다.
                    <br />
                    예시: python .\main.py --enable-cors-header *
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">DSL & 워크플로우</h2>
              <FieldGroup>
                <Field>
                  <FieldLabel>DSL 탬플릿</FieldLabel>
                  <Textarea
                    placeholder="DSL 탬플릿 입력 칸"
                    value={dslTemplate}
                    onChange={(e) => setDslTemplate(e.target.value)}
                    className="min-h-32 font-mono text-sm"
                  />
                </Field>
                <Field>
                  <FieldLabel>ComfyUI API 워크플로우</FieldLabel>
                  <Textarea
                    placeholder="ComfyUI API 워크플로우 입력 칸"
                    value={workflowJson}
                    onChange={(e) => setWorkflowJson(e.target.value)}
                    className="min-h-32 font-mono text-sm"
                  />
                </Field>
                <Field orientation="horizontal">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-10 items-stretch overflow-hidden rounded-md border bg-background">
                      <input
                        type="number"
                        className="h-full w-24 bg-transparent px-3 outline-none"
                        placeholder="1"
                        min={1}
                        value={batchCount}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10)
                          if (!isNaN(v) && v >= 1) setBatchCount(v)
                        }}
                      />
                      <div className="flex w-8 flex-col border-l">
                        <Button
                          variant="ghost"
                          className="flex-1"
                          aria-label="Increase"
                          onClick={() => setBatchCount((n) => n + 1)}
                        >
                          <PlusIcon className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1"
                          aria-label="Decrease"
                          onClick={() => setBatchCount((n) => Math.max(1, n - 1))}
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
                      variant="outline"
                      className="h-10"
                      onClick={() => setIsPaused((p) => !p)}
                      disabled={!isConnected}
                    >
                      {isPaused ? "재개" : "일시정지"}
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-10"
                      onClick={handleCancelAll}
                      disabled={!isConnected}
                    >
                      전부 취소
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-10"
                      onClick={handleParser}
                      disabled={!isAliveBackend}
                    >
                      파서 테스트
                    </Button>
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

          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">결과</h2>
            {renderContent()}
          </section>
        </div>
      </main>
    </div>
  )
}

export default App
