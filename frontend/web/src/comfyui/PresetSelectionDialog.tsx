import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { SavedWorkflow } from "./useSavedWorkflows"
import type { NodeMapping } from "../lib/workflow"

interface PresetSelectionDialogProps {
  pendingWorkflow: SavedWorkflow | null
  onClose: () => void
  onSelectPreset: (mappings: NodeMapping[], presetId: string) => void
  onStartWithoutMapping: () => void
}

export const PresetSelectionDialog = ({
  pendingWorkflow,
  onClose,
  onSelectPreset,
  onStartWithoutMapping,
}: PresetSelectionDialogProps) => (
  <Dialog
    open={pendingWorkflow !== null}
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>노드 매핑 프리셋 선택</DialogTitle>
        <DialogDescription>
          사용할 노드 매핑 프리셋을 선택하세요.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        {pendingWorkflow?.mappingPresets.map((preset) => (
          <Button
            key={preset.id}
            variant="outline"
            className="justify-start"
            onClick={() => onSelectPreset(preset.mappings, preset.id)}
          >
            {preset.name}
            <span className="ml-auto text-xs text-muted-foreground">
              {new Date(preset.savedAt).toLocaleDateString()}
            </span>
          </Button>
        ))}
        <Button variant="ghost" onClick={onStartWithoutMapping}>
          매핑 없이 시작
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)
