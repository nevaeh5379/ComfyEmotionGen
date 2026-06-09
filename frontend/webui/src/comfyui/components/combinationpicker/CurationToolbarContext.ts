import { createContext } from "react"

import type { CurationToolbarValue } from "./CurationToolbarTypes"

export const CurationToolbarContext = createContext<CurationToolbarValue | null>(null)
