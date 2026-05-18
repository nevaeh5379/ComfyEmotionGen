import { Dices, Plus, Trash2, Wand2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CollapseSection } from "@/components/ceg/CollapseSection"
import { SaveInputBar } from "./SavedItemsManager"
import type {
  ComfyWorkflow,
  NodeMapping,
  MappingSourceType,
} from "../../lib/workflow"
import type { ObjectInfo, ObjectInfoInputSpec } from "../types/renderTypes"
import type { SavedWorkflow } from "../hooks/useSavedWorkflows"

interface ImageUploadState {
  uploadedName: string | null
  error: string | null
  uploading: boolean
}

interface NodeMappingSectionProps {
  nodeMappings: NodeMapping[]
  setNodeMappings: React.Dispatch<React.SetStateAction<NodeMapping[]>>
  updateMapping: (id: string, patch: Partial<NodeMapping>) => void
  handleAutoMap: () => void
  handleImageUpload: (file: File, nodeId: string, inputKey: string) => void
  imageUploads: Record<string, ImageUploadState>
  availableNodeOptions: {
    nodeId: string
    title: string
    inputKey: string
    isNumeric: boolean
    isLoadImage: boolean
  }[]
  parsedWorkflowData: ComfyWorkflow
  objectInfo: ObjectInfo | null
  activeWorkflowId: string | null
  savedNodeMappings: {
    id: string
    name: string
    mappings: NodeMapping[]
    savedAt: number
  }[]
  activeNodeMappingPresetId: string | null
  nodeMappingResetKey: number
  savedWorkflows: SavedWorkflow[]
  pendingSaveType: "nodeMapping" | null
  onSaveNodeMapping: (name: string) => boolean
  onLoadNodeMapping: (m: { id: string; mappings: NodeMapping[] }) => void
  onDeleteNodeMapping: (presetId: string) => void
  onUpdateNodeMapping: () => void
  onPendingNameConflict: (name: string) => void
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

const SOURCE_LABELS: Record<MappingSourceType, string> = {
  prompt: "프롬프트",
  filename: "파일명",
  seed: "시드",
  image: "이미지",
  fixed: "고정값",
}

export const NodeMappingSection = ({
  nodeMappings,
  setNodeMappings,
  updateMapping,
  handleAutoMap,
  handleImageUpload,
  imageUploads,
  availableNodeOptions,
  parsedWorkflowData,
  objectInfo,
  activeWorkflowId,
  savedNodeMappings,
  activeNodeMappingPresetId,
  nodeMappingResetKey,
  onSaveNodeMapping,
  onLoadNodeMapping,
  onDeleteNodeMapping,
  onUpdateNodeMapping,
}: NodeMappingSectionProps) => {
  const [open, setOpen] = useState(true)
  const hasPromptMapping = nodeMappings.some((m) => m.sourceType === "prompt")
  const hasFilenameMapping = nodeMappings.some(
    (m) => m.sourceType === "filename"
  )
  const showWarnings =
    nodeMappings.length > 0 && (!hasPromptMapping || !hasFilenameMapping)
  const activeMappingName = savedNodeMappings.find(
    (p) => p.id === activeNodeMappingPresetId
  )?.name

  return (
    <CollapseSection
      open={open}
      onToggle={() => setOpen((o) => !o)}
      title="노드 매핑"
      className="border-t"
      meta={
        nodeMappings.length > 0 ? `${nodeMappings.length}개 매핑` : undefined
      }
    >
      <div className="pb-3">
        {/* ── 경고 ────────────────────────────── */}
        {showWarnings && (
          <div className="flex flex-col gap-1 px-3.5 pb-2">
            {!hasPromptMapping && (
              <span className="inline-flex items-center gap-1 text-[11px] text-yellow-600">
                <span>⚠</span> 프롬프트 주입 매핑이 설정되지 않았습니다.
              </span>
            )}
            {!hasFilenameMapping && (
              <span className="inline-flex items-center gap-1 text-[11px] text-yellow-600">
                <span>⚠</span> 파일명 주입 매핑이 설정되지 않았습니다.
              </span>
            )}
          </div>
        )}

        {/* ── 매핑 테이블 ──────────────────────── */}
        {(nodeMappings.length > 0 || availableNodeOptions.length > 0) && (
          <div className="border-y border-line">
            {nodeMappings.length > 0 && (
              <div className="overflow-x-auto">
                <Table className="min-w-[480px] text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-7 w-28 px-2 text-[10px]">노드</TableHead>
                      <TableHead className="h-7 w-20 px-1 text-[10px]">소스</TableHead>
                      <TableHead className="h-7 px-1 text-[10px]">값</TableHead>
                      <TableHead className="h-7 w-14 px-1 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              onClick={handleAutoMap}
                            >
                              <Wand2 className="size-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">자동 매핑</TooltipContent>
                        </Tooltip>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nodeMappings.map((m) => {
                      const node = parsedWorkflowData[m.nodeId]
                      const spec = getNodeInputSpec(
                        objectInfo,
                        parsedWorkflowData,
                        m.nodeId,
                        m.inputKey
                      )
                      const enumOptions = Array.isArray(spec?.[0])
                        ? (spec![0] as string[])
                        : null
                      const upload = imageUploads[`${m.nodeId}.${m.inputKey}`]
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="px-2 py-2">
                            <div className="text-[11px] font-medium leading-tight">
                              {node?._meta?.title || "Untitled"}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground/60">
                              #{m.nodeId} · {m.inputKey}
                            </div>
                          </TableCell>
                          <TableCell className="px-1 py-2">
                            <Select
                              value={m.sourceType}
                              onValueChange={(val) =>
                                updateMapping(m.id, {
                                  sourceType: val as MappingSourceType,
                                })
                              }
                            >
                              <SelectTrigger className="h-7 w-20 text-[11px] font-medium md:w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(
                                  Object.keys(
                                    SOURCE_LABELS
                                  ) as MappingSourceType[]
                                ).map((src) => (
                                  <SelectItem key={src} value={src}>
                                    {SOURCE_LABELS[src]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="px-1 py-2">
                            {m.sourceType === "seed" && (
                              <InputGroup className="h-7 w-32">
                                <InputGroupInput
                                  type="number"
                                  value={m.seedValue ?? 0}
                                  onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>
                                  ) =>
                                    updateMapping(m.id, {
                                      seedValue: Number(e.target.value),
                                    })
                                  }
                                  disabled={m.seedRandom}
                                  className="text-[11px]"
                                />
                                <InputGroupAddon align="inline-end">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <InputGroupButton
                                        onClick={() =>
                                          updateMapping(m.id, {
                                            seedRandom: !m.seedRandom,
                                          })
                                        }
                                        className={
                                          m.seedRandom
                                            ? "text-foreground"
                                            : "text-muted-foreground"
                                        }
                                        size="icon-xs"
                                      >
                                        <Dices className="size-3.5" />
                                      </InputGroupButton>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {m.seedRandom ? "랜덤 — 클릭하여 고정" : "고정 — 클릭하여 랜덤"}
                                    </TooltipContent>
                                  </Tooltip>
                                </InputGroupAddon>
                              </InputGroup>
                            )}
                            {m.sourceType === "image" && (
                              <div className="flex items-center gap-2">
                                <label className="inline-flex h-7 cursor-pointer items-center rounded-md border border-line bg-panel px-2.5 text-[11px] font-medium hover:bg-accent active:bg-accent/80">
                                  파일 선택
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
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
                                </label>
                                {upload?.uploading && (
                                  <span className="animate-pulse text-[10px] text-muted-foreground">
                                    업로드 중...
                                  </span>
                                )}
                                {upload?.uploadedName && (
                                  <span className="text-[10px] font-medium text-green-600">
                                    완료
                                  </span>
                                )}
                              </div>
                            )}
                            {m.sourceType === "fixed" &&
                              (enumOptions ? (
                                <Select
                                  value={m.fixedValue ?? ""}
                                  onValueChange={(val) =>
                                    updateMapping(m.id, { fixedValue: val })
                                  }
                                >
                                  <SelectTrigger className="h-7 w-28 text-[11px]">
                                    <SelectValue placeholder="선택..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {enumOptions.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  value={m.fixedValue ?? ""}
                                  onChange={(e) =>
                                    updateMapping(m.id, {
                                      fixedValue: e.target.value,
                                    })
                                  }
                                  className="h-7 w-28 text-[11px]"
                                  placeholder="값 입력"
                                />
                              ))}
                          </TableCell>
                          <TableCell className="px-1 py-2 text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground/50 hover:text-destructive"
                                  onClick={() =>
                                    setNodeMappings((prev) =>
                                      prev.filter((x) => x.id !== m.id)
                                    )
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left">매핑 삭제</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {availableNodeOptions.length > 0 && (
              <div className={nodeMappings.length > 0 ? "border-t border-line" : undefined}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-start gap-1.5 rounded-none px-3 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-3 shrink-0" />
                      매핑 추가...
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
                    {availableNodeOptions.map((opt, i) => (
                      <DropdownMenuItem
                        key={i}
                        className="gap-2 text-[11px]"
                        onSelect={() => {
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
                        <span className="font-mono text-muted-foreground">[{opt.nodeId}]</span>
                        <span>{opt.title}</span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">{opt.inputKey}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        )}

        {/* ── 저장 바 ──────────────────────────── */}
        <div className="flex items-center justify-end px-3.5 pt-2">
          {activeWorkflowId ? (
            <SaveInputBar
              key={nodeMappingResetKey}
              onSave={onSaveNodeMapping}
              placeholder="노드 매핑 이름"
              saveDisabled={nodeMappings.length === 0}
              activeName={activeMappingName}
              items={savedNodeMappings}
              onLoad={onLoadNodeMapping}
              onDelete={onDeleteNodeMapping}
              activeItemId={activeNodeMappingPresetId ?? undefined}
              onUpdate={onUpdateNodeMapping}
            />
          ) : (
            <p className="text-[11px] text-muted-foreground">
              워크플로우를 저장하거나 불러온 뒤 매핑을 저장할 수 있습니다.
            </p>
          )}
        </div>
      </div>
    </CollapseSection>
  )
}
