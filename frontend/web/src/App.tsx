import { useEffect, useMemo, useState } from "react"
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

import { useBackend } from "./comfyui/WebSocketProvider"
import type { JobView, WorkerView } from "./comfyui/Message"
import { ComfyWorkflowSchema, type ComfyWorkflow } from "./lib/workflow"

const DEFAULT_BACKEND_URL = "http://localhost:8000"
const HEALTH_CHECK_INTERVAL_MS = 5000
const MAX_RANDOM_SEED = 1_000_000_000

const STORAGE_KEYS = {
  workflow: "workflow",
  dslTemplate: "dslTemplate",
  backendUrl: "backendUrl",
} as const

const JOB_STATUS_LABEL: Record<JobView["status"], string> = {
  pending: "대기 중",
  queued: "큐 대기 중",
  running: "진행 중...",
  done: "완료",
  error: "실패",
  cancelled: "취소됨",
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
              백엔드에 등록된 워커가 없습니다 (COMFYUI_WORKERS 환경변수 확인).
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

const parseWorkflow = (json: string): ComfyWorkflow => {
  const parsed = ComfyWorkflowSchema.safeParse(JSON.parse(json))
  if (!parsed.success) {
    console.error("Workflow validation error:", parsed.error)
    throw new Error("Invalid workflow format")
  }
  return parsed.data
}

const buildWorkflowForItem = (
  workflowJson: string,
  item: RenderItem,
  seeds: Map<string, number>
): ComfyWorkflow => {
  const workflow = parseWorkflow(workflowJson)
  seeds.forEach((seed, nodeId) => {
    workflow[nodeId]!.inputs["seed"] = seed
  })
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
  const [backendUrl, setBackendUrl] = useLocalStorageState(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  const [workflowJson, setWorkflowJson] = useLocalStorageState(
    STORAGE_KEYS.workflow
  )
  const [dslTemplate, setDslTemplate] = useLocalStorageState(
    STORAGE_KEYS.dslTemplate
  )

  const { isConnected: backendAlive, jobs, workers } = useBackend()

  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [isAliveBackend, setIsAliveBackend] = useState(false)
  const [isSeedRandom, setIsSeedRandom] = useState<Record<string, boolean>>({})

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

  // 잡별 진행률을 위한 가장 최근 활성 잡
  const activeJob = useMemo<JobView | undefined>(
    () =>
      [...jobs]
        .reverse()
        .find((j) => j.status === "running" || j.status === "queued"),
    [jobs]
  )

  // 가장 최근 done 잡의 이미지를 미리보기로 사용
  const lastImages = useMemo<string[]>(() => {
    const lastDone = [...jobs]
      .reverse()
      .find((j) => j.status === "done" && j.imageUrls.length > 0)
    if (!lastDone) return []
    return lastDone.imageUrls.map((path) =>
      path.startsWith("http") ? path : `${backendUrl}${path}`
    )
  }, [jobs, backendUrl])

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
    if (!workflowJson || !isAliveBackend) return
    const parserResult = await callParser()
    if (!parserResult) return

    // 시드는 한 배치 안에서 동일하게 (기존 동작 유지)
    const seeds = generateSeedsFor(parseWorkflow(workflowJson))

    const items = parserResult.items.map((item) => ({
      filename: item.filename,
      prompt: item.prompt,
      workflow: buildWorkflowForItem(workflowJson, item, seeds),
    }))

    try {
      const res = await fetch(`${backendUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (error) {
      console.error("Failed to submit jobs:", error)
    }
  }

  const handleParser = async () => {
    const data = await callParser()
    if (data) setFakeJobQueue(data.items)
  }

  const handleCancel = async (jobId: string) => {
    try {
      await fetch(`${backendUrl}/jobs/${jobId}`, { method: "DELETE" })
    } catch (error) {
      console.error("Failed to cancel job:", error)
    }
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

  const renderJobsTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>FileName</TableHead>
          <TableHead>Prompt</TableHead>
          <TableHead>Worker</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((j) => (
          <TableRow key={j.id}>
            <TableCell className="font-mono text-xs">{j.filename}</TableCell>
            <TableCell className="max-w-xs truncate">{j.prompt}</TableCell>
            <TableCell className="font-mono text-xs">
              {j.workerId ?? "—"}
            </TableCell>
            <TableCell>
              {j.status === "error"
                ? `${JOB_STATUS_LABEL.error}: ${j.error ?? ""}`
                : JOB_STATUS_LABEL[j.status]}
            </TableCell>
            <TableCell>
              {(j.status === "pending" ||
                j.status === "queued" ||
                j.status === "running") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCancel(j.id)}
                >
                  취소
                </Button>
              )}
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
                  {activeJob
                    ? `${activeJob.filename} · ${activeJob.currentNodeName || "—"}`
                    : "대기 중"}
                </span>
                <span className="ml-auto tabular-nums">
                  {Math.round(activeJob?.progressPercent ?? 0)}%
                </span>
              </FieldLabel>
              <Progress
                value={activeJob?.progressPercent ?? 0}
                className="w-full"
              />
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

  const canRun = Boolean(workflowJson) && isAliveBackend && backendAlive

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
                  <FieldDescription>
                    ComfyUI 서버 URL은 백엔드 환경변수
                    (<code>COMFYUI_WORKERS</code>)에서 관리합니다.
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
