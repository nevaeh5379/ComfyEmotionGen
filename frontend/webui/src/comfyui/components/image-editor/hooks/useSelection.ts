/**
 * 선택 영역 관리 — 사각/타원/라소/매직완드.
 * 선택 영역은 이미지 픽셀 좌표계 기준.
 */

import { useCallback, useState } from "react"
import type { Selection, SelectionType } from "../types"

export function useSelection() {
  const [selection, setSelection] = useState<Selection | null>(null)

  const setRectSelection = useCallback(
    (
      type: SelectionType,
      rect: { x: number; y: number; w: number; h: number }
    ) => {
      setSelection({ type, rect })
    },
    []
  )

  const setMaskSelection = useCallback(
    (type: SelectionType, maskCanvas: HTMLCanvasElement) => {
      setSelection({ type, maskCanvas })
    },
    []
  )

  const clearSelection = useCallback(() => { setSelection(null); }, [])

  return {
    selection,
    setRectSelection,
    setMaskSelection,
    clearSelection,
  }
}
