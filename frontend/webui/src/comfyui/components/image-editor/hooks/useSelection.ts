/**
 * 선택 영역 관리 — 사각/타원/라소/매직완드.
 * 선택 영역은 이미지 픽셀 좌표계 기준.
 */

import { useCallback, useState } from "react"
import type { Selection, SelectionType } from "../types"

interface SelectionController {
  selection: Selection | null
  setRectSelection: (
    type: SelectionType,
    rect: { x: number; y: number; w: number; h: number }
  ) => void
  setMaskSelection: (
    type: SelectionType,
    maskCanvas: HTMLCanvasElement
  ) => void
  clearSelection: () => void
}

export function useSelection(): SelectionController {
  const [selection, setSelection] = useState<Selection | null>(null)

  const setRectSelection = useCallback(
    (
      type: SelectionType,
      rect: { x: number; y: number; w: number; h: number }
    ): void => {
      setSelection({ type, rect })
    },
    []
  )

  const setMaskSelection = useCallback(
    (type: SelectionType, maskCanvas: HTMLCanvasElement): void => {
      setSelection({ type, maskCanvas })
    },
    []
  )

  const clearSelection = useCallback((): void => {
    setSelection(null)
  }, [])

  return {
    selection,
    setRectSelection,
    setMaskSelection,
    clearSelection,
  }
}
