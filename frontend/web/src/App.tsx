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
import { useEffect, useRef, useState } from "react"
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
interface RenderItemsResponse {
  count: number
  items: RenderItem[]
}
interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
}
export function App() {
  const workflowRef = useRef<HTMLTextAreaElement>(null)
  const dslTemplateRef = useRef<HTMLTextAreaElement>(null)
  const [jobQueue, setJobQueue] = useState<RenderItem[]>([])
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [currentJob, setCurrentJob] = useState<RenderItem | null>(null)
  const { isConnected, clientId, lastStatus } = useWebSocket()
  const [isAliveBackend, setIsAliveBackend] = useState<Boolean>(false);
  const handleRun = () => {}
  const parser = async (): Promise<RenderItemsResponse | undefined> => {
    try {
      const template = dslTemplateRef.current?.value || ""
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
      const prompt = JSON.parse(workflowRef.current?.value || "{}")
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
    if (fakeJobQueue.length > 0) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>FileName</TableHead>
              <TableHead>Prompt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody id="rendered-items-table-body">
            {fakeJobQueue.map((item, index) => (
              <TableRow key={index}>
                <TableCell>{item.filename}</TableCell>
                <TableCell>{item.prompt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )
    } else {
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
  }

  const renderComfyUIStatus = () => {
  const statusColor = isConnected ? "bg-green-500" : "bg-red-500";
  const pingColor = isConnected ? "bg-green-400" : "bg-red-400";
  
  const statusIcon = (
    <span className="relative flex h-3 w-3">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusColor}`}></span>
      <span className={`relative inline-flex h-3 w-3 rounded-full ${pingColor}`}></span>
    </span>
  );

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="w-fit cursor-help"> 
          <Item className="flex items-center gap-2 border-none bg-transparent p-2">
            {statusIcon}
            <ItemContent>
              <ItemTitle className="text-sm font-semibold">ComfyUI 서버</ItemTitle>
            </ItemContent>
          </Item>
        </div>
      </HoverCardTrigger>
      
      <HoverCardContent side="right" align="start" sideOffset={10} className="w-48">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">{isConnected ? "✅ 연결 성공" : "❌ 연결 안됨"}</p>
          <p className="text-xs text-muted-foreground">
            {isConnected ? "서버가 응답하고 있습니다." : "ComfyUI 서버 상태를 확인해주세요."}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const checkHealthBackend = async (): Promise<Boolean> => {
  try {
    const response = await fetch("http://localhost:8000/health");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("Backend health check response:", data);
    return data["status"] === "ok";
  } catch (error) {
    console.error("Error occurred during backend health check:", error);
    return false;
  }
};
const renderBackendStatus = () => {
  const statusColor = isAliveBackend ? "bg-green-500" : "bg-red-500";
  const pingColor = isAliveBackend ? "bg-green-400" : "bg-red-400";
  
  const statusIcon = (
    <span className="relative flex h-3 w-3">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusColor}`}></span>
      <span className={`relative inline-flex h-3 w-3 rounded-full ${pingColor}`}></span>
    </span>
  );

  useEffect(() => {
    checkHealthBackend().then((isHealthy) => {
      setIsAliveBackend(isHealthy);
    });

    const timer = setInterval(async () => {
      setIsAliveBackend(await checkHealthBackend());
    }, 5000);

    return () => clearInterval(timer);
  }, []);
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="w-fit cursor-help"> 
          <Item className="flex items-center gap-2 border-none bg-transparent p-2">
            {statusIcon}
            <ItemContent>
              <ItemTitle className="text-sm font-semibold">백앤드 서버</ItemTitle>
            </ItemContent>
          </Item>
        </div>
      </HoverCardTrigger>
      
      <HoverCardContent side="right" align="start" sideOffset={10} className="w-48">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">{isAliveBackend ? "✅ 연결 성공" : "❌ 연결 안됨"}</p>
          <p className="text-xs text-muted-foreground">
            {isAliveBackend ? "서버가 응답하고 있습니다." : "백앤드 서버 상태를 확인해주세요."}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
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
                  ref={dslTemplateRef}
                />
              </Field>
              <Field>
                <FieldLabel>ComfyUI API 워크플로우 입력</FieldLabel>
                <Textarea
                  placeholder="ComfyUI API 워크플로우 입력 칸"
                  ref={workflowRef}
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
