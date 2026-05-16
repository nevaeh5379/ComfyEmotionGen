import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SavedItemsManager } from "./SavedItemsManager"
import type { ComfyWorkflow, NodeMapping, MappingSourceType } from "../lib/workflow"
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
  savedNodeMappings: { id: string; name: string; mappings: NodeMapping[]; savedAt: number }[]
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
}: NodeMappingSectionProps) => (
  <div className="border-t pt-4">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold">노드 매핑</h2>
      <Button variant="outline" size="sm" onClick={handleAutoMap}>
        자동 매핑
      </Button>
    </div>
    <div className="mb-4">
      {activeWorkflowId ? (
        <SavedItemsManager
          key={nodeMappingResetKey}
          items={savedNodeMappings}
          onSave={onSaveNodeMapping}
          onLoad={onLoadNodeMapping}
          onDelete={onDeleteNodeMapping}
          placeholder="노드 매핑 이름"
          saveDisabled={nodeMappings.length === 0}
          activeItemId={activeNodeMappingPresetId ?? undefined}
          onUpdate={onUpdateNodeMapping}
        />
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          노드 매핑을 저장하려면 먼저 워크플로우를 저장하거나 불러오세요.
        </p>
      )}
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
                <TableCell className="text-sm">
                  {node?._meta?.title || "Untitled"}
                </TableCell>
                <TableCell className="font-mono text-sm">{m.nodeId}</TableCell>
                <TableCell className="font-mono text-xs">
                  {m.inputKey}
                </TableCell>
                <TableCell>
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    value={m.sourceType}
                    onChange={(e) =>
                      updateMapping(m.id, {
                        sourceType: e.target.value as MappingSourceType,
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
                          if (f) handleImageUpload(f, m.nodeId, m.inputKey)
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
                          updateMapping(m.id, { fixedValue: e.target.value })
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
                          updateMapping(m.id, { fixedValue: e.target.value })
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
      워크플로우 JSON에 {"{{input}}"}, {"{{filename}}"}, {"{{image}}"},
      DSL 변수명({"{{outfit}}"} 등)을 직접 써도 됩니다.
    </p>
  </div>
)
