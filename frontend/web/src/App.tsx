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
import { useWebSocket } from "./WebSocketProvider"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { set } from "zod"
import { i } from "node_modules/vite/dist/node/chunks/moduleRunnerTransport"
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
}
export function App() {
  const [workflow, setWorkflow] = useState<string>(() => {
    const saved = localStorage.getItem("workflow")
    return saved || ""
  })
  const [dslTemplate, setDslTemplate] = useState<string>(() => {
    const saved = localStorage.getItem("dslTemplate")
    return saved || ""
  });

   const [jobs, setJobs] = useState<Job[]>([])
  const { subscribe, isConnected, clientId } = useWebSocket()
  const [lastImages, setLastImages] = useState<string[]>([])
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [isAliveBackend, setIsAliveBackend] = useState<Boolean>(false)

  useEffect(() => {
    localStorage.setItem("workflow", workflow)
  }, [workflow]);
  useEffect(() => {
    localStorage.setItem("dslTemplate", dslTemplate)
  }, [dslTemplate]);

  const handleRun = async () => {
    if (!workflow || !isConnected || !isAliveBackend) return
    const parserResult = await parser()
    if (!parserResult) return
    const newJobs: Job[] = parserResult.items.map((item) => 
      {
        const promptId = crypto.randomUUID()
   return   {id: promptId,
      item,
      status: "pending",
      promptId,}
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

  const handleParser = async () => {
    await parser().then((data) => {
      if (data) {
        setFakeJobQueue(data.items)
      }
    })
  }

  const handleComfyUITest = async () => {
    try {
      const prompt = JSON.parse(workflow || "{}")
      const response = await fetch("http://localhost:8188/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
        }),
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      console.log("Response from ComfyUI API:", data)
    } catch (error) {
      console.error("Error occurred while fetching ComfyUI API:", error)
    }
  }

  const renderContent = () => {
    const hasFakeQueue = fakeJobQueue.length > 0
    //파서 결과 혹은 현재 작업이 없을 경우
    if (jobs.length === 0 && fakeJobQueue.length === 0){
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
          {lastImages.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                {lastImages.map((url, index) => (
                  <img key={index} src={url} alt={`Generated ${index}`} className="w-full h-auto rounded" />
                ))}
              </div>
            )}
         <Table>
        <TableHeader>
          <TableRow>
            <TableHead>FileName</TableHead>
            <TableHead>Prompt</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((j) => (
            <TableRow key={j.id}>
              <TableCell>{j.item.filename}</TableCell>
              <TableCell>{j.item.prompt}</TableCell>
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
      </Table> </>)}
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
  return subscribe((msg) => {
    if (msg.type === "executed" && msg.output?.images) {
      const images = msg.output.images as Array<{
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
      
      setLastImages(urls)
      // job에 이미지 URL 저장
      setJobs((prev) =>
        prev.map((j) =>
          j.promptId === msg.promptId ? { ...j, imageUrls: urls } : j
        )
      )
    }
  })
}, [subscribe])

useEffect(() => {
  const hasInFlight = jobs.some(
    (j) => j.status === "queued" || j.status === "running"
  )
  if (hasInFlight) return

  const nextPending = jobs.find((j) => j.status === "pending")
  if (!nextPending) return

  const submit = async () => {
    // 바로 queued로 (UI상 "큐에 넣는 중")
    setJobs((prev) =>
      prev.map((j) =>
        j.id === nextPending.id ? { ...j, status: "queued" } : j
      )
    )

    try {
      const parsedWorkflow = JSON.parse(
        workflow
          .replace("{input}", nextPending.item.prompt)
          .replace("{filename}", nextPending.item.filename)
      )
      const res = await fetch("http://localhost:8188/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: parsedWorkflow,
          client_id: clientId,
          prompt_id: nextPending.promptId,  // ★ 핵심! 미리 정한 id 전달
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // 응답의 prompt_id가 우리가 보낸 것과 같은지 sanity check만 해도 됨
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
}, [jobs, workflow, clientId])

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
            ? { ...j, status: "error", error: `interrupted at ${msg.nodeType}` }
            : j
        )
      )
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
                  value={workflow}
                  onChange={(e) => setWorkflow(e.target.value)}
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
                  <Button onClick={handleComfyUITest}>
                    ComfyUI 테스트 버튼
                  </Button>
                  <Button onClick={handleParser}>파서 테스트</Button>
                </div>
              </Field>
            </FieldGroup>
          </div>
          <div>{renderContent()}</div>
        </div>
      </main>
    </>
  )
}

export default App
