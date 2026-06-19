import { ConfirmContext } from "@/comfyui/contexts/ConfirmContext"
import { useContextRequired } from "@/lib/context"

export function useConfirm(): ReturnType<
  typeof useContextRequired<ConfirmContext>
>["confirm"] {
  const ctx = useContextRequired(ConfirmContext, "useConfirm")
  return ctx.confirm
}
