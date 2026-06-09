import { useLocalStorage } from "../hooks/useLocalStorage"

export interface PanelFloatingState {
  isFloating: boolean
  setIsFloating: (v: boolean) => void
  pos: { x: number; y: number }
  setPos: (p: { x: number; y: number }) => void
  size: { w: number; h: number }
  setSize: (s: { w: number; h: number }) => void
}

export interface PanelDockedState extends PanelFloatingState {
  isDocked: boolean
  setIsDocked: (v: boolean) => void
  dockedSide: "start" | "end"
  setDockedSide: (s: "start" | "end") => void
}

interface PanelDefaults {
  pos: { x: number; y: number }
  size: { w: number; h: number }
}

export function usePanelState(
  name: string,
  defaults: PanelDefaults
): PanelFloatingState {
  const [isFloating, setIsFloating] = useLocalStorage<boolean>(
    `ceg_is${name}Floating`,
    false
  )
  const [pos, setPos] = useLocalStorage<{ x: number; y: number }>(
    `ceg_${name}FloatingPos`,
    defaults.pos
  )
  const [size, setSize] = useLocalStorage<{ w: number; h: number }>(
    `ceg_${name}FloatingSize`,
    defaults.size
  )
  return { isFloating, setIsFloating, pos, setPos, size, setSize }
}

export function useDockablePanel(
  name: string,
  defaults: PanelDefaults
): PanelDockedState {
  const floating = usePanelState(name, defaults)
  const [isDocked, setIsDocked] = useLocalStorage<boolean>(
    `ceg_is${name}Docked`,
    false
  )
  const [dockedSide, setDockedSide] = useLocalStorage<"start" | "end">(
    `ceg_${name}DockedSide`,
    "end"
  )
  return { ...floating, isDocked, setIsDocked, dockedSide, setDockedSide }
}
