import { useContextRequired } from "@/lib/context"

import { TemplateContext } from "./TemplateContextObject"
import type { TemplateContextValue } from "./TemplateContext"

export function useTemplateContext(): TemplateContextValue {
  return useContextRequired(TemplateContext, "useTemplateContext")
}
