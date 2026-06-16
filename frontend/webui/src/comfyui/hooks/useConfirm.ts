import { ConfirmContext, type ConfirmOptions } from "@/comfyui/contexts/ConfirmContext"
import { useContextRequired } from "@/lib/context"

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContextRequired(ConfirmContext, "useConfirm")
  return ctx.confirm
}
