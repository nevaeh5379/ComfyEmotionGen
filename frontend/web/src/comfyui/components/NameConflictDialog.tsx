import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface NameConflictDialogProps {
  pendingSave: { name: string; type: "template" | "workflow" | "nodeMapping" } | null
  onClose: () => void
  newName: string
  onSaveNew: () => void
  onOverwrite: () => void
}

export const NameConflictDialog = ({
  pendingSave,
  onClose,
  newName,
  onSaveNew,
  onOverwrite,
}: NameConflictDialogProps) => (
  <Dialog
    open={pendingSave !== null}
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>이름 충돌</DialogTitle>
        <DialogDescription>
          "{pendingSave?.name}" 이름이 이미 존재합니다.
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button variant="secondary" onClick={onSaveNew}>
          새로 저장 ({newName})
        </Button>
        <Button variant="default" onClick={onOverwrite}>
          덮어쓰기
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)
