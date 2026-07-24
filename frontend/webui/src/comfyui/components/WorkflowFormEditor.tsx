import { useState, useMemo, useEffect } from "react"
import { Search, Link2, AlertTriangle, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { ComfyWorkflow } from "../../lib/workflow"
import type { ObjectInfo, ObjectInfoInputSpec } from "../types/renderTypes"
import type { WorkerView } from "../types/Message"
import { useBackendUrl } from "../hooks/useBackendUrl"
import { WorkflowInput } from "./WorkflowInput"

interface WorkflowFormEditorProps {
  workflowJson: string
  onChangeWorkflowJson: (json: string) => void
  parsedWorkflowData: ComfyWorkflow | null
  objectInfo: ObjectInfo | null
  onBackToCode: () => void
  workers: WorkerView[]
  setObjectInfo: (info: ObjectInfo | null) => void
}

const getNodeInputSpec = (
  objectInfo: ObjectInfo | null,
  parsedWorkflowData: ComfyWorkflow,
  nodeId: string,
  inputKey: string
): ObjectInfoInputSpec | null => {
  if (!objectInfo) return null
  const node = parsedWorkflowData[nodeId]
  if (!node) return null
  const nodeInfo = objectInfo[node.class_type]
  if (!nodeInfo) return null
  return (
    nodeInfo.input.required?.[inputKey] ??
    nodeInfo.input.optional?.[inputKey] ??
    null
  )
}

const getInputTypeLabel = (
  objectInfo: ObjectInfo | null,
  parsedWorkflowData: ComfyWorkflow,
  nodeId: string,
  inputKey: string
): string => {
  const spec = getNodeInputSpec(
    objectInfo,
    parsedWorkflowData,
    nodeId,
    inputKey
  )
  if (!spec) return ""
  if (Array.isArray(spec[0])) return "COMBO"
  return spec[0]
}

const isLink = (val: unknown): boolean => {
  return (
    Array.isArray(val) &&
    val.length === 2 &&
    typeof val[0] === "string" &&
    typeof val[1] === "number"
  )
}

export function WorkflowFormEditor({
  workflowJson,
  onChangeWorkflowJson,
  parsedWorkflowData,
  objectInfo,
  onBackToCode,
  workers,
  setObjectInfo,
}: WorkflowFormEditorProps): React.ReactNode {
  const backendUrl = useBackendUrl()
  const [searchQuery, setSearchQuery] = useState("")
  const [hideReadOnly, setHideReadOnly] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Worker selection & fetching states
  const [selectedWorkerId, setSelectedWorkerId] = useState("auto")
  const [isFetchingInfo, setIsFetchingInfo] = useState(false)

  const hasAliveWorker = useMemo(() => workers.some((w) => w.alive), [workers])

  // Handle value editing
  const handleValueChange = (
    nodeId: string,
    inputKey: string,
    newValue: unknown
  ): void => {
    try {
      const parsed = JSON.parse(workflowJson) as Record<
        string,
        { inputs: Record<string, unknown> }
      >
      const inputs = parsed[nodeId]?.inputs
      if (inputs !== undefined) {
        inputs[inputKey] = newValue
        onChangeWorkflowJson(JSON.stringify(parsed, null, 2))
      }
    } catch {
      // ignore parse errors
    }
  }

  // Fetch object_info for a specific worker
  const handleWorkerChange = async (workerId: string): Promise<void> => {
    setSelectedWorkerId(workerId)
    setIsFetchingInfo(true)
    try {
      const url =
        workerId === "auto"
          ? `${backendUrl}/object_info`
          : `${backendUrl}/object_info?worker_id=${workerId}`

      const res = await fetch(url)
      if (res.ok) {
        const data = (await res.json()) as ObjectInfo
        setObjectInfo(data)
      }
    } finally {
      setIsFetchingInfo(false)
    }
  }

  // Filter nodes based on search query and read-only preference
  const filteredNodes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return Object.entries(parsedWorkflowData ?? {}).filter(([nodeId, node]) => {
      // Find editable inputs (excluding links)
      const literalInputs = Object.entries(node.inputs).filter(
        ([_, val]) => !isLink(val)
      )

      // Apply "Hide ReadOnly" filter
      if (hideReadOnly && literalInputs.length === 0) {
        return false
      }

      // Apply search query filter
      if (q !== "") {
        const title = (node._meta?.title ?? "").toLowerCase()
        const classType = node.class_type.toLowerCase()
        const matchesQuery =
          nodeId.includes(q) || title.includes(q) || classType.includes(q)
        if (!matchesQuery) return false
      }

      return true
    })
  }, [parsedWorkflowData, searchQuery, hideReadOnly])

  const activeNodeId = useMemo(() => {
    if (
      selectedNodeId !== null &&
      filteredNodes.some(([id]) => id === selectedNodeId)
    ) {
      return selectedNodeId
    }
    const firstNode = filteredNodes[0]
    return firstNode !== undefined ? firstNode[0] : null
  }, [selectedNodeId, filteredNodes])

  // Reset selected node if it falls out of activeNodeId
  useEffect(() => {
    if (activeNodeId !== null && activeNodeId !== selectedNodeId) {
      const timer = setTimeout(() => {
        setSelectedNodeId(activeNodeId)
      }, 0)
      return (): void => {
        clearTimeout(timer)
      }
    }
    return undefined
  }, [activeNodeId, selectedNodeId])

  // Error State: If workflow data is invalid
  if (!parsedWorkflowData) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center bg-background p-8 text-center text-muted-foreground">
        <AlertTriangle className="mb-3 h-8 w-8 animate-pulse text-amber-500" />
        <span className="text-sm font-bold text-foreground">
          유효하지 않은 워크플로우 JSON
        </span>
        <span className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground/80">
          속성 편집 모드를 표시하려면 워크플로우 코드를 올바른 JSON 형식으로
          입력하거나 파일에서 불러와 주세요.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="mt-5"
          onClick={onBackToCode}
        >
          코드 편집기로 이동
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background select-text">
      {/* Search, Filters, and Worker Selector Header */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-muted/10 p-3">
        <div className="flex flex-col items-stretch justify-between gap-2.5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="노드 이름, 타입, ID 검색..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
              }}
              className="h-9 pr-8 pl-9 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("")
                }}
                className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-4 select-none">
            {/* Worker Selection Dropdown */}
            {workers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Label
                  htmlFor="worker-select"
                  className="text-[10px] font-bold text-muted-foreground"
                >
                  기준 워커:
                </Label>
                <Select
                  value={selectedWorkerId}
                  onValueChange={(v) => {
                    void handleWorkerChange(v)
                  }}
                >
                  <SelectTrigger
                    id="worker-select"
                    className="h-8 w-36 bg-background text-[10px] shadow-xs"
                  >
                    <SelectValue placeholder="자동 선택..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-[11px]">
                      자동 선택 (기본)
                    </SelectItem>
                    {workers.map((w) => (
                      <SelectItem
                        key={w.id}
                        value={w.id}
                        className="text-[11px]"
                        disabled={!w.alive}
                      >
                        {w.id} ({w.url.replace(/^https?:\/\//, "")}){" "}
                        {!w.alive && "(오프라인)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <Switch
                id="hide-readonly"
                checked={hideReadOnly}
                onCheckedChange={setHideReadOnly}
              />
              <Label
                htmlFor="hide-readonly"
                className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                수정 가능한 노드만 보기
              </Label>
            </div>
          </div>
        </div>
      </div>

      {/* Disconnected Worker Warning Banner */}
      {!hasAliveWorker && (
        <div className="mx-3 mt-3 flex shrink-0 items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-extrabold">연결된 ComfyUI 워커가 없습니다.</p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground/90">
              워커가 정상적으로 활성화되어 백엔드에 연결되지 않으면 노드 입력
              항목 정보(object_info)를 가져올 수 없어 드롭다운 리스트 및 상세
              타입 정보가 표시되지 않습니다. 워커 상태를 점검해 주세요.
            </p>
          </div>
        </div>
      )}

      {/* Master-Detail Split Layout Body */}
      <div className="mt-2 flex min-h-0 flex-1 divide-x divide-line">
        {/* Left Panel: Nodes Sidebar */}
        <div className="flex min-h-0 w-56 shrink-0 flex-col bg-panel/30">
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {filteredNodes.length > 0 ? (
              filteredNodes.map(([nodeId, node]) => {
                const allInputs = Object.entries(node.inputs)
                const literalInputs = allInputs.filter(
                  ([_, val]) => !isLink(val)
                )
                const editCount = literalInputs.length
                const isActive = activeNodeId === nodeId

                return (
                  <button
                    key={nodeId}
                    onClick={() => {
                      setSelectedNodeId(nodeId)
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-lg border border-transparent px-3 py-2.5 text-left text-xs transition-all select-none",
                      isActive
                        ? "border-primary/20 bg-primary/10 font-bold text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate leading-tight font-semibold">
                        {node._meta?.title ?? node.class_type}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                        #{nodeId} · {node.class_type}
                      </div>
                    </div>
                    {editCount > 0 && (
                      <span
                        className={cn(
                          "ml-2 shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px]",
                          isActive
                            ? "bg-primary font-black text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {editCount}
                      </span>
                    )}
                  </button>
                )
              })
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground/80 italic">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Selected Node Inputs Form */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-card">
          {activeNodeId !== null &&
          parsedWorkflowData[activeNodeId] !== undefined ? (
            ((): React.JSX.Element => {
              const node = parsedWorkflowData[activeNodeId]
              const allInputs = Object.entries(node.inputs)
              const literalInputs = allInputs.filter(([_, val]) => !isLink(val))
              const linkInputs = allInputs.filter(([_, val]) => isLink(val))

              return (
                <div className="space-y-5 p-4.5">
                  {/* Node Info Header */}
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div>
                      <h3 className="text-xs font-black text-foreground">
                        {node._meta?.title ?? node.class_type}
                      </h3>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        Node ID: {activeNodeId} · Class Type: {node.class_type}
                      </p>
                    </div>
                    {isFetchingInfo && (
                      <span className="animate-pulse text-[10px] font-bold text-primary">
                        오브젝트 정보 조회 중...
                      </span>
                    )}
                  </div>

                  {/* Warning: Node has no editable inputs */}
                  {literalInputs.length === 0 && (
                    <div className="rounded-lg border border-line bg-muted/40 p-4 text-center text-xs text-muted-foreground">
                      이 노드에는 직접 편집 가능한 값(상수)이 없습니다.
                    </div>
                  )}

                  {/* Editable Inputs Form */}
                  {literalInputs.length > 0 && (
                    <div className="space-y-4">
                      {literalInputs.map(([inputKey, val]) => (
                        <div
                          key={inputKey}
                          className="grid grid-cols-1 gap-1.5 py-0.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-muted-foreground/90">
                              {inputKey}
                            </span>
                            <span className="rounded-sm bg-muted/40 px-1 py-0.5 font-mono text-[9px] text-muted-foreground/45">
                              {getInputTypeLabel(
                                objectInfo,
                                parsedWorkflowData,
                                activeNodeId,
                                inputKey
                              )}
                            </span>
                          </div>
                          <WorkflowInput
                            nodeId={activeNodeId}
                            inputKey={inputKey}
                            value={
                              val as
                                | string
                                | number
                                | boolean
                                | string[]
                                | Record<string, string | number | boolean>
                            }
                            spec={getNodeInputSpec(
                              objectInfo,
                              parsedWorkflowData,
                              activeNodeId,
                              inputKey
                            )}
                            onSave={(newVal) => {
                              handleValueChange(activeNodeId, inputKey, newVal)
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Connection Links */}
                  {linkInputs.length > 0 && (
                    <div className="border-t border-line/60 pt-4">
                      <span className="mb-2.5 block text-xs font-bold text-muted-foreground/80">
                        입력 연결 (Connections)
                      </span>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {linkInputs.map(([inputKey, linkVal]) => {
                          const linkArr = linkVal as [string, number]
                          const targetId = linkArr[0]
                          const targetNode = parsedWorkflowData[targetId]
                          const targetTitle =
                            targetNode?._meta?.title ??
                            targetNode?.class_type ??
                            "Unknown"

                          return (
                            <div
                              key={inputKey}
                              className="flex items-center gap-2 rounded-lg border border-line bg-muted/50 px-3 py-2 font-mono text-[10px] text-muted-foreground"
                            >
                              <Link2 className="size-3.5 shrink-0 text-muted-foreground/60" />
                              <div className="min-w-0 flex-1">
                                <span className="block truncate font-bold text-muted-foreground/95">
                                  {inputKey}
                                </span>
                                <span className="mt-0.5 block truncate text-[9px] text-muted-foreground/75">
                                  ← #{targetId} ({targetTitle})
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertTriangle className="mb-2 h-6 w-6 text-muted-foreground/50" />
              <span className="text-xs font-semibold">
                노드가 없거나 선택되지 않았습니다.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
