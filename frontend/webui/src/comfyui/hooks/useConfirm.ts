import { ConfirmContext, type ConfirmContextValue } from "@/comfyui/contexts/ConfirmContext"
import { useContextRequired } from "@/lib/context"

export function useConfirm(): ConfirmContextValue["confirm"] {
  const ctx = useContextRequired(ConfirmContext, "useConfirm")
  return ctx.confirm
}
