import { createContext } from "react"
import { useContextRequired } from "@/lib/context"
import type {
  PanelFloatingState,
  PanelDockedState,
} from "../hooks/usePanelState"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { PanelFloatingState as FloatingState }
export type { PanelDockedState as DockableState }

export interface PanelLayoutValue {
  composition: PanelFloatingState
  jobManager: PanelFloatingState
  gallery: PanelDockedState
  stats: PanelDockedState
  curation: PanelDockedState
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const PanelLayoutContext = createContext<PanelLayoutValue | null>(null)

export function usePanelLayout(): PanelLayoutValue {
  return useContextRequired(PanelLayoutContext, "usePanelLayout")
}
