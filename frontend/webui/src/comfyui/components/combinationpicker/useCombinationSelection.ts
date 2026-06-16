import type React from "react"
import { useState, useCallback } from "react"

export function useCombinationSelection(
  visibleFilenames: string[]
): {
  selectionMode: boolean
  setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>
  selectedFilenames: Set<string>
  setSelectedFilenames: React.Dispatch<React.SetStateAction<Set<string>>>
  toggleSelect: (filename: string, event?: React.MouseEvent | React.KeyboardEvent) => void
  exitSelectionMode: () => void
} {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(
    new Set()
  )
  const [lastSelected, setLastSelected] = useState<string | null>(null)

  const toggleSelect = useCallback(
    (filename: string, event?: React.MouseEvent | React.KeyboardEvent) => {
      const isShift = event?.shiftKey === true
      const isCtrl = event?.ctrlKey === true || event?.metaKey === true

      setSelectedFilenames((prev) => {
        const next = new Set(prev)

        if (
          isShift &&
          lastSelected !== null &&
          visibleFilenames.includes(lastSelected)
        ) {
          const startIdx = visibleFilenames.indexOf(lastSelected)
          const endIdx = visibleFilenames.indexOf(filename)
          const range = visibleFilenames.slice(
            Math.min(startIdx, endIdx),
            Math.max(startIdx, endIdx) + 1
          )
          range.forEach((f) => next.add(f))
        } else if (isCtrl) {
          if (next.has(filename)) {
            next.delete(filename)
          } else {
            next.add(filename)
          }
        } else {
          // Toggle or start selection
          if (next.has(filename)) {
            next.delete(filename)
          } else {
            if (!selectionMode) {
              // If not in selection mode, just start it
              next.add(filename)
            } else {
              // In selection mode: toggle this item
              next.add(filename)
            }
          }
        }

        if (next.size > 0) {
          setSelectionMode(true)
          setLastSelected(filename)
        } else {
          setSelectionMode(false)
          setLastSelected(null)
        }
        return next
      })
    },
    [visibleFilenames, lastSelected, selectionMode]
  )

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedFilenames(new Set())
    setLastSelected(null)
  }, [])

  return {
    selectionMode,
    setSelectionMode,
    selectedFilenames,
    setSelectedFilenames,
    toggleSelect,
    exitSelectionMode,
  }
}
