import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import {
  Circle,
  CircleSlash,
  Dot,
  Grid,
  MinusIcon,
  PlusIcon,
  X,
  XCircle,
} from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@/components/ui/button-group"
import { use, useEffect, useRef, useState, type JSX } from "react"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "./components/ui/input"
import { useWebSocket } from "./comfyui/WebSocketProvider"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { ComfyWorkflowSchema, type ComfyWorkflow } from "./lib/workflow"
import { Checkbox } from "@/components/ui/checkbox"
import { set } from "zod"
import { Progress } from "@/components/ui/progress"
interface RenderItemsResponse {
  count: number
  items: RenderItem[]
}
interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
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
  nodeParsent: number,
  currentNodeName: string,
}
export function App() {
  const [workflowJson, setWorkflowJson] = useState<string>(() => {
    const saved = localStorage.getItem("workflow")
    return saved || ""
  })
  const [dslTemplate, setDslTemplate] = useState<string>(() => {
    const saved = localStorage.getItem("dslTemplate")
    return saved || ""
  })
  /**
   * seed 별 구분 해야할 것 같음
   */

  const [jobs, setJobs] = useState<Job[]>([])
  const { subscribe, isConnected, clientId } = useWebSocket()
  const [lastImages, setLastImages] = useState<string[]>([])
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [isAliveBackend, setIsAliveBackend] = useState<Boolean>(false)
  const [isSeedRandom, setIsSeedRandom] = useState<Record<string, boolean>>({})
  // const [nodeParsent, setNodeParsent] = useState<Number>(0);
  // const [currentNode, setCurrentNode] = useState<string>("")
  const [progressState, setProgressState] = useState<ProgressState>({
    nodeParsent: 0,
    currentNodeName: "",
  })
  const jobsRef = useRef<Job[]>([])
  useEffect(() => {
  jobsRef.current = jobs
}, [jobs])
  function parseWorkflow(workflowJson: string): ComfyWorkflow {
    try {
      const workflow = JSON.parse(workflowJson)
      const validation = ComfyWorkflowSchema.safeParse(workflow)
      if (!validation.success) {
        console.error("Workflow validation error:", validation.error)
        throw new Error("Invalid workflow format")
      }
      return validation.data
    } catch (error) {
      console.error("Workflow parsing error:", error)
      throw new Error("Failed to parse workflow")
    }
  }

  useEffect(() => {
    localStorage.setItem("workflow", workflowJson)
  }, [workflowJson])
  useEffect(() => {
    localStorage.setItem("dslTemplate", dslTemplate)
  }, [dslTemplate])

  const genereateRandomSeeds = (workflow: ComfyWorkflow): Map<string, number> => {
    const seeds = new Map<string, number>();
    Object.entries(workflow).forEach(([nodeId, node]) => {
      if (node.inputs["seed"] === undefined) return;

      isSeedRandom[nodeId] = isSeedRandom[nodeId] ?? false
      if (isSeedRandom[nodeId]) {
        seeds.set(nodeId, Math.floor(Math.random() * 1000000000))
      } else {
        seeds.set(nodeId, Number(node.inputs["seed"]))
      }
    })
    return seeds
  }
  const handleRun = async () => {
    if (!workflowJson || !isConnected || !isAliveBackend) return
    const parserResult = await parser()
    if (!parserResult) return
    const workflow = parseWorkflow(workflowJson)
    const seeds = genereateRandomSeeds(workflow)
    
    const newJobs: Job[] = parserResult.items.map((item): Job => {
      const tempWorkflow = parseWorkflow(workflowJson)
      const promptId = crypto.randomUUID()
      seeds.forEach((seed, nodeId) => {
        tempWorkflow[nodeId]!.inputs["seed"] = seed
      })
      Object.entries(tempWorkflow).forEach(([nodeId, node]) => {
        Object.entries(node.inputs).forEach(([inputKey, inputValue]) => {
          if (typeof inputValue === "string") {
            tempWorkflow[nodeId]!.inputs[inputKey] = inputValue.replace("{input}", item.prompt).replace("{filename}", item.filename)
          }
        })
        
      })

      
      return {
        id: promptId,
        promptId : promptId,
        item: item,
        status: "pending",
        seed: seeds,
        workflow: tempWorkflow
      }
    })
    setJobs((prev) => [...prev, ...newJobs])
  }
  const parser = async (): Promise<RenderItemsResponse | undefined> => {
    try {
      const template = dslTemplate || ""
      const response = await fetch("http://localhost:8000/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template: template,
        }),
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: RenderItemsResponse = await response.json()
      return data
    } catch (error) {
      console.error("Error occurred while fetching parser API:", error)
      return undefined
    }
  }

  /*
  미리보기용
  */
  const handleParser = async () => {
    await parser().then((data) => {
      if (data) {
        setFakeJobQueue(data.items)
      }
    })
  }

  const renderContent = () => {
    const hasFakeQueue = fakeJobQueue.length > 0
    //파서 결과 혹은 현재 작업이 없을 경우
    if (jobs.length === 0 && fakeJobQueue.length === 0) {
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
        {/* 작업이 있을 경우 */}
        {jobs.length > 0 && (
          <>
            <Field>
                  <FieldLabel>
                    <span>노드: {progressState.currentNodeName}</span>
                    <span  className="ml-auto">{Number(progressState.nodeParsent)}%</span>

                  </FieldLabel>
                  <Progress value={Number(progressState.nodeParsent)} className="w-full" />
                </Field>
            {lastImages.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                {lastImages.map((url, index) => (
                  <img
                    key={index}
                    src={url}
                    alt={`Generated ${index}`}
                    className="h-auto w-full rounded"
                  />
                ))}
              </div>
            )}
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
                    <TableCell>{j.item.filename}</TableCell>
                    <TableCell>{j.item.prompt}</TableCell>
                    <TableCell>
                      {Array.from(j.seed.entries()).map(([nodeId, seed]) => (
                        <div key={nodeId}>
                          {nodeId}: {seed}
                        </div>
                      ))}

                    </TableCell>
                    <TableCell>
                      {j.status === "pending" && "대기 중"}
                      {j.status === "queued" && "큐 대기 중"}
                      {j.status === "running" && "진행 중..."}
                      {j.status === "done" && "완료"}
                      {j.status === "error" && `실패: ${j.error}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {/* 파서 테스트 결과가 있을 경우 */}
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
                  <TableCell>{item.filename}</TableCell>
                  <TableCell>{item.prompt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    )
  }

  const renderComfyUIStatus = () => {
    const statusColor = isConnected ? "bg-green-500" : "bg-red-500"
    const pingColor = isConnected ? "bg-green-400" : "bg-red-400"

    const statusIcon = (
      <span className="relative flex h-3 w-3">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusColor}`}
        ></span>
        <span
          className={`relative inline-flex h-3 w-3 rounded-full ${pingColor}`}
        ></span>
      </span>
    )

    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <div className="w-fit cursor-help">
            <Item className="flex items-center gap-2 border-none bg-transparent p-2">
              {statusIcon}
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">
                  ComfyUI 서버
                </ItemTitle>
              </ItemContent>
            </Item>
          </div>
        </HoverCardTrigger>

        <HoverCardContent
          side="right"
          align="start"
          sideOffset={10}
          className="w-48"
        >
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold">
              {isConnected ? "✅ 연결 성공" : "❌ 연결 안됨"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isConnected
                ? "서버가 응답하고 있습니다."
                : "ComfyUI 서버 상태를 확인해주세요."}
            </p>
          </div>
        </HoverCardContent>
      </HoverCard>
    )
  }

  /*
  나중에 백앤드 서버에 웹소켓 api 구현해야 할듯?
  */
  const checkHealthBackend = async (): Promise<Boolean> => {
    try {
      const response = await fetch("http://localhost:8000/health")
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      console.log("Backend health check response:", data)
      return data["status"] === "ok"
    } catch (error) {
      console.error("Error occurred during backend health check:", error)
      return false
    }
  }

  useEffect(() => {
    checkHealthBackend().then((isHealthy) => {
      setIsAliveBackend(isHealthy)
    })

    const timer = setInterval(async () => {
      setIsAliveBackend(await checkHealthBackend())
    }, 5000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
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
        const res = await fetch("http://localhost:8188/prompt", {
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
  }, [jobs, workflowJson, clientId])

  /**
   * 상태 확인용 (리팩토링 필요)
   * execution_start comfyUI에서 실행될 때 이벤트
   * execution_success 노드 전부 성공했을 때 발생하는 이벤트
   * executed 노드는 SaveImageWebsocket로 끝나지 않고 SaveImage 등 끝날 때 발생하는 이벤트. 만약 SaveImageWebsocket로 끝날 경우 웹소켓으로 이미지 바이너리 메시지가 옴
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
          return `http://localhost:8188/view?${params}`
        })
        // 발견되지 않을 경우 오류로 표시 (완성 되기전에 대기열이 삭제되었다는 소리인데 나중에 삭제 기능으로 인해 발생할 수 있음 나중에 로직 생각해야할듯)
        const job = jobsRef.current.find((j) => j.promptId === msg.promptId)
        if (!job) {
          throw Error("Job not found")
        }

        setLastImages(urls)
        // 굳이 필요없는듯?
        // setJobs((prev) =>
        //   prev.map((j) =>
        //     j.promptId === msg.promptId ? { ...j, imageUrls: urls } : j
        //   )
        // )
      } else if (msg.type === "progress") {
        const percent = (msg.value / msg.max) * 100
        setProgressState({
          nodeParsent: percent,
          currentNodeName: jobsRef.current.find((j) => j.promptId === msg.promptId)?.workflow[msg.node]?._meta?.title || "",
        })
      }
    })
  }, [subscribe])

  const renderBackendStatus = () => {
    const statusColor = isAliveBackend ? "bg-green-500" : "bg-red-500"
    const pingColor = isAliveBackend ? "bg-green-400" : "bg-red-400"

    const statusIcon = (
      <span className="relative flex h-3 w-3">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusColor}`}
        ></span>
        <span
          className={`relative inline-flex h-3 w-3 rounded-full ${pingColor}`}
        ></span>
      </span>
    )

    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <div className="w-fit cursor-help">
            <Item className="flex items-center gap-2 border-none bg-transparent p-2">
              {statusIcon}
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">
                  백앤드 서버
                </ItemTitle>
              </ItemContent>
            </Item>
          </div>
        </HoverCardTrigger>

        <HoverCardContent
          side="right"
          align="start"
          sideOffset={10}
          className="w-48"
        >
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold">
              {isAliveBackend ? "✅ 연결 성공" : "❌ 연결 안됨"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAliveBackend
                ? "서버가 응답하고 있습니다."
                : "백앤드 서버 상태를 확인해주세요."}
            </p>
          </div>
        </HoverCardContent>
      </HoverCard>
    )
  }
  return (
    <>
      <nav>
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
      </nav>
      <main>
        {/* 사용자 설정 UI */}
        <div className="grid grid-cols-2">
          <div>
            {renderComfyUIStatus()}
            {renderBackendStatus()}
            <FieldGroup>
              <Field>
                <FieldLabel>백앤드 서버 URL 입력</FieldLabel>
                <Input type="url" placeholder="http://127.0.0.1:8000"></Input>
              </Field>
              <Field>
                <FieldLabel>ComfyUI API 서버 URL 입력</FieldLabel>
                <Input type="url" placeholder="http://127.0.0.1:8188"></Input>
                <FieldDescription>
                  comfyUI에서 cors 정책 허용해야 합니다.
                  <br />
                  예시: python .\main.py --enable-cors-header *
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>DSL 탬플릿 입력</FieldLabel>
                <Textarea
                  placeholder="DSL 탬플릿 입력 칸"
                  value={dslTemplate}
                  onChange={(e) => setDslTemplate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>ComfyUI API 워크플로우 입력</FieldLabel>
                <Textarea
                  placeholder="ComfyUI API 워크플로우 입력 칸"
                  value={workflowJson}
                  onChange={(e) => setWorkflowJson(e.target.value)}
                />
              </Field>
              <Field orientation="horizontal">
                <div className="flex items-center gap-2">
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
                  >
                    실행
                  </Button>
                  <Button onClick={handleParser}>파서 테스트</Button>
                </div>
              </Field>
            </FieldGroup>

            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>number</TableHead>
                    <TableHead>seed 값</TableHead>
                    <TableHead>랜덤 여부</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflowJson &&
                    (() => {
                      const workflow = ComfyWorkflowSchema.safeParse(
                        JSON.parse(workflowJson)
                      )
                      if (!workflow.success) {
                        return (
                          <>
                            <p>workflow 파싱 오류: {workflow.error.message}</p>
                          </>
                        )
                      }

                      return Object.entries(workflow.data)
                        .filter(([nodeId, node]) => {
                          return node.inputs["seed"] !== undefined
                        })
                        .map(([nodeId, node]) => (
                          <>
                            <TableRow key={nodeId}>
                              <TableCell>
                                {node._meta?.title || "Untitled"}
                              </TableCell>
                              <TableCell>{nodeId}</TableCell>
                              <TableCell>
                                <Input
                                  value={String(node.inputs["seed"])}
                                  onChange={(e) => {
                                    const workflow =
                                      ComfyWorkflowSchema.safeParse(
                                        JSON.parse(workflowJson)
                                      )
                                    if (!workflow.success) {
                                      console.error(
                                        "Workflow parsing error:",
                                        workflow.error
                                      )
                                      return
                                    }

                                    workflow.data[nodeId]!.inputs["seed"] =
                                      Number(e.target.value)

                                    setWorkflowJson(
                                      JSON.stringify(workflow.data)
                                    )
                                    return
                                  }}
                                ></Input>
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
                          </>
                        ))
                    })()}
                </TableBody>
              </Table>
            </div>
          </div>
          <div>{renderContent()}</div>
        </div>
      </main>
    </>
  )
}

export default App
