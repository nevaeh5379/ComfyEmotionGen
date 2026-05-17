import { Dices } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
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
import { CollapseSection } from "@/components/ceg/CollapseSection"
import { SaveInputBar } from "./SavedItemsManager"
import type {
  ComfyWorkflow,
  NodeMapping,
  MappingSourceType,
} from "../lib/workflow"
import type { ObjectInfo, ObjectInfoInputSpec } from "./renderTypes"
import type { SavedWorkflow } from "./useSavedWorkflows"

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
      <div className="space-y-2 px-3.5 pb-3">
        <div className="flex flex-col gap-0.5">
          {showWarnings && !hasPromptMapping && (
            <span className="text-xs text-yellow-600">
              ⚠ 프롬프트 주입 매핑이 설정되지 않았습니다.
            </span>
          )}
          {showWarnings && !hasFilenameMapping && (
            <span className="text-xs text-yellow-600">
              ⚠ 파일명 주입 매핑이 설정되지 않았습니다.
            </span>
          )}
        </div>
        {/* ── 매핑 테이블 ──────────────────────── */}
        {(nodeMappings.length > 0 || availableNodeOptions.length > 0) && (
          <div>
            {nodeMappings.length > 0 && (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">노드</TableHead>
                    <TableHead className="w-20">소스</TableHead>
                    <TableHead>값</TableHead>
                    <TableHead className="w-16 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={handleAutoMap}
                      >
                        자동
                      </Button>
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
                        <TableCell>
                          <div className="text-xs font-medium">
                            {node?._meta?.title || "Untitled"}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            #{m.nodeId} · {m.inputKey}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={m.sourceType}
                            onValueChange={(val) =>
                              updateMapping(m.id, {
                                sourceType: val as MappingSourceType,
                              })
                            }
                          >
                            <SelectTrigger className="h-6 w-24 text-xs">
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
                        <TableCell>
                          {m.sourceType === "seed" && (
                            <InputGroup className="w-32">
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
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  onClick={() =>
                                    updateMapping(m.id, {
                                      seedRandom: !m.seedRandom,
                                    })
                                  }
                                  title={
                                    m.seedRandom
                                      ? "랜덤 (클릭하여 고정)"
                                      : "고정 (클릭하여 랜덤)"
                                  }
                                  className={
                                    m.seedRandom
                                      ? "text-foreground"
                                      : "text-muted-foreground"
                                  }
                                  size="icon-xs"
                                >
                                  <Dices className="size-4" />
                                </InputGroupButton>
                              </InputGroupAddon>
                            </InputGroup>
                          )}
                          {m.sourceType === "image" && (
                            <div className="flex items-center gap-2">
                              <label className="inline-flex h-6 cursor-pointer items-center rounded-[3px] border border-line bg-panel px-2 text-[11px] hover:bg-accent hover:text-accent-foreground">
                                파일 선택
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0]
                                    if (f)
                                      handleImageUpload(f, m.nodeId, m.inputKey)
                                  }}
                                />
                              </label>
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
                              <Select
                                value={m.fixedValue ?? ""}
                                onValueChange={(val) =>
                                  updateMapping(m.id, { fixedValue: val })
                                }
                              >
                                <SelectTrigger className="h-6 w-28 text-xs">
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
                                className="h-6 w-28 text-xs"
                                placeholder="값 입력"
                              />
                            ))}
                        </TableCell>
                        <TableCell className="text-right">
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
              <div className="border-t border-line">
                <Select
                  value=""
                  onValueChange={(val) => {
                    const index = Number(val)
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
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent text-xs shadow-none focus:ring-0">
                    <SelectValue placeholder="+ 매핑 추가..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableNodeOptions.map((opt, i) => (
                      <SelectItem key={i} value={String(i)}>
                        [{opt.nodeId}] {opt.title} · {opt.inputKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-end border-t border-line px-3 py-1.5">
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
