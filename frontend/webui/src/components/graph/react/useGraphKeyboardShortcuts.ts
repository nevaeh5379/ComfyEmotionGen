import { useEffect } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"

function isTextEditingTarget(element: Element | null): boolean {
  if (element === null) return false
  const tag = element.tagName.toLowerCase()
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    element.hasAttribute("contenteditable")
  )
}

export function useGraphKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isTextEditingTarget(document.activeElement)) return

      if (event.key === "Delete" || event.key === "Backspace") {
        const selectedNodeIds = useReactGraphStore.getState().selectedNodeIds
        if (selectedNodeIds.size > 0) {
          useReactGraphStore.getState().removeNodes(Array.from(selectedNodeIds))
          event.preventDefault()
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (event.shiftKey) {
          useReactGraphStore.getState().redo()
        } else {
          useReactGraphStore.getState().undo()
        }
        event.preventDefault()
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        useReactGraphStore.getState().redo()
        event.preventDefault()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return (): void => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])
}
