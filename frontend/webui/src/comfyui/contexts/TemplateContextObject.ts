import { createContext } from "react"

import type { TemplateContextValue } from "./TemplateContext"

export const TemplateContext = createContext<TemplateContextValue | null>(null)
