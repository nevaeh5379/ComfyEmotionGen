import { useContext } from "react"

import { CurationToolbarContext } from "./CurationToolbarContext"
import type { CurationToolbarValue } from "./CurationToolbarTypes"

export function useCurationToolbar(): CurationToolbarValue {
  const ctx = useContext(CurationToolbarContext)
  if (!ctx) {
    throw new Error("useCurationToolbar must be used within CurationToolbarProvider")
  }
  return ctx
}
