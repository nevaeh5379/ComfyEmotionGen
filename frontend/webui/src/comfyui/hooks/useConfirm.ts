import { ConfirmContext } from "@/comfyui/contexts/ConfirmContext"
import { useContextRequired } from "@/lib/context"

export function useConfirm() {
  const ctx = useContextRequired(ConfirmContext, "useConfirm")
  return ctx.confirm
}
