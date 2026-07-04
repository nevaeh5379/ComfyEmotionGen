/**
 * 캔버스 히스토리 (undo/redo) — 30단계 스냅샷.
 * 각 스냅샷은 대상 캔버스의 ImageData.
 */

import { useCallback, useRef, useState } from "react"
import { HISTORY_MAX } from "../types"

export function useCanvasHistory() {
  const historyRef = useRef<ImageData[]>([])
  const futureRef = useRef<ImageData[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const pushHistory = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
    historyRef.current.push(snapshot)
    if (historyRef.current.length > HISTORY_MAX) {
      historyRef.current.shift()
    }
    futureRef.current = []
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(false)
  }, [])

  const undo = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    if (historyRef.current.length === 0) return
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const previous = historyRef.current.pop()
    if (!previous) return
    futureRef.current.push(current)
    ctx.putImageData(previous, 0, 0)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const redo = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    if (futureRef.current.length === 0) return
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const next = futureRef.current.pop()
    if (!next) return
    historyRef.current.push(current)
    ctx.putImageData(next, 0, 0)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const resetHistory = useCallback(() => {
    historyRef.current = []
    futureRef.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  return { pushHistory, undo, redo, resetHistory, canUndo, canRedo }
}