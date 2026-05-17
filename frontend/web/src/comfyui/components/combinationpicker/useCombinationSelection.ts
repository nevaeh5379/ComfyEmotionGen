import { useState, useCallback } from "react"

export function useCombinationSelection(visibleFilenames: string[]) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(
    new Set()
  )
  const [lastSelected, setLastSelected] = useState<string | null>(null)

  const toggleSelect = useCallback(
    (filename: string, event?: React.MouseEvent | React.KeyboardEvent) => {
      const isShift = event?.shiftKey
      const isCtrl = event?.ctrlKey || event?.metaKey

      setSelectedFilenames((prev) => {
        const next = new Set(prev)

        if (isShift && lastSelected && visibleFilenames.includes(lastSelected)) {
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
                // If in selection mode but no modifiers, clear and select this one?
                // Actually, standard behavior is usually toggle in selection mode.
                next.has(filename) ? next.delete(filename) : next.add(filename)
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
